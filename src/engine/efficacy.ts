// Scorecard efficacy analysis: audits the scorecard rather than the agent. For each criterion,
// compares downstream outcomes already held in CRM / ticketing (repeat contact within 7 days,
// escalation, CSAT) between calls that passed and calls that failed it. Criteria with no
// measurable link to any outcome are candidates for retirement.

import type { Call, Criterion, ProcessedCall } from './types';

const lf = (() => {
  const cache = [0];
  return (n: number) => {
    for (let i = cache.length; i <= n; i++) cache[i] = cache[i - 1] + Math.log(i);
    return cache[n];
  };
})();

const fmtP = (p: number) => (p < 0.001 ? '< 0.001' : `= ${p.toFixed(3)}`);

/** Two-sided Fisher exact test for a 2x2 table [[a,b],[c,d]]. */
export function fisherExact(a: number, b: number, c: number, d: number) {
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const n = r1 + r2;
  const p = (x: number) => Math.exp(lf(r1) + lf(r2) + lf(c1) + lf(n - c1) - lf(n) - lf(x) - lf(r1 - x) - lf(c1 - x) - lf(r2 - c1 + x));
  const pObs = p(a);
  let total = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) {
    const px = p(x);
    if (px <= pObs * (1 + 1e-7)) total += px;
  }
  return Math.min(1, total);
}

/** Complementary error function (Abramowitz–Stegun 7.1.26). */
function erfc(x: number) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

/**
 * Cochran–Mantel–Haenszel test across strata (here: agents). Removes the confounding where a
 * weak agent both fails a criterion and generates repeat contacts for unrelated reasons.
 * Each stratum is [failWithOutcome, failWithout, passWithOutcome, passWithout].
 */
export function cmh(strata: [number, number, number, number][]) {
  let sa = 0;
  let se = 0;
  let sv = 0;
  let num = 0;
  let den = 0;
  for (const [a, b, c, d] of strata) {
    const n = a + b + c + d;
    if (n < 2 || a + b === 0 || c + d === 0) continue;
    sa += a;
    se += ((a + b) * (a + c)) / n;
    sv += ((a + b) * (c + d) * (a + c) * (b + d)) / (n * n * (n - 1));
    num += (a * d) / n;
    den += (b * c) / n;
  }
  if (sv <= 0) return { p: null as number | null, or: null as number | null };
  const stat = Math.max(0, Math.abs(sa - se) - 0.5) ** 2 / sv;
  return { p: erfc(Math.sqrt(stat / 2)), or: den > 0 ? num / den : null };
}

function welchP(x: number[], y: number[]) {
  if (x.length < 5 || y.length < 5) return null;
  const m = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const vr = (v: number[], mu: number) => v.reduce((a, b) => a + (b - mu) ** 2, 0) / (v.length - 1);
  const mx = m(x);
  const my = m(y);
  const se = Math.sqrt(vr(x, mx) / x.length + vr(y, my) / y.length);
  if (!se) return null;
  return erfc(Math.abs(mx - my) / se / Math.SQRT2);
}

export interface EfficacyRow {
  criterionId: string;
  criterionText: string;
  nPass: number;
  nFail: number;
  repeatPass: number | null;
  repeatFail: number | null;
  riskDiff: number | null;
  relRisk: number | null;
  pRepeat: number | null;
  escalPass: number | null;
  escalFail: number | null;
  pEscal: number | null;
  orAdjusted: number | null;
  csatPass: number | null;
  csatFail: number | null;
  pCsat: number | null;
  verdict: 'predictive' | 'no-link' | 'inconclusive' | 'regulatory';
  note: string;
}

export function efficacy(calls: Call[], processed: Record<string, ProcessedCall>, criteria: Criterion[]): EfficacyRow[] {
  return criteria.map((cr) => {
    const pass: Call[] = [];
    const fail: Call[] = [];
    for (const c of calls) {
      const f = processed[c.id]?.findings.find((x) => x.criterionId === cr.id);
      if (!f || f.verdict === 'na' || f.routing.decision === 'suppressed') continue;
      (f.verdict === 'pass' ? pass : fail).push(c);
    }
    const rate = (xs: Call[], k: 'repeatContact7d' | 'escalated') => (xs.length ? xs.filter((c) => c.outcome[k]).length / xs.length : null);
    const strataFor = (k: 'repeatContact7d' | 'escalated') => {
      const agents = [...new Set([...pass, ...fail].map((c) => c.agentId))];
      return agents.map((a) => {
        const f = fail.filter((c) => c.agentId === a);
        const p = pass.filter((c) => c.agentId === a);
        const fo = f.filter((c) => c.outcome[k]).length;
        const po = p.filter((c) => c.outcome[k]).length;
        return [fo, f.length - fo, po, p.length - po] as [number, number, number, number];
      });
    };
    // CSAT centred on each agent's own mean, so agent-level differences do not masquerade as criterion effects
    const agentMean = new Map<string, number>();
    for (const a of new Set([...pass, ...fail].map((c) => c.agentId))) {
      const v = [...pass, ...fail].filter((c) => c.agentId === a && c.outcome.csat != null).map((c) => c.outcome.csat!);
      if (v.length) agentMean.set(a, v.reduce((x, y) => x + y, 0) / v.length);
    }
    const csatVals = (xs: Call[]) => xs.filter((c) => c.outcome.csat != null).map((c) => c.outcome.csat!);
    const csatResid = (xs: Call[]) => xs.filter((c) => c.outcome.csat != null).map((c) => c.outcome.csat! - (agentMean.get(c.agentId) ?? 0));
    const avg = (v: number[]) => (v.length >= 3 ? v.reduce((a, b) => a + b, 0) / v.length : null);
    const rp = rate(pass, 'repeatContact7d');
    const rf = rate(fail, 'repeatContact7d');
    const enough = pass.length >= 8 && fail.length >= 8;
    const rep = enough ? cmh(strataFor('repeatContact7d')) : { p: null, or: null };
    const esc = enough ? cmh(strataFor('escalated')) : { p: null, or: null };
    const pRepeat = rep.p;
    const pEscal = esc.p;
    const riskDiff = rp != null && rf != null ? rf - rp : null;
    const ef = rate(fail, 'escalated');
    const ep = rate(pass, 'escalated');
    const cp = avg(csatVals(pass));
    const cf = avg(csatVals(fail));
    const pCsat = enough ? welchP(csatResid(pass), csatResid(fail)) : null;
    let verdict: EfficacyRow['verdict'] = 'inconclusive';
    let note: string;
    // α = 0.01 per test: several outcomes are tested for every criterion
    const ALPHA = 0.01;
    const predictsRepeat = pRepeat != null && pRepeat < ALPHA && (rep.or ?? 0) > 1;
    const predictsEsc = pEscal != null && pEscal < ALPHA && (esc.or ?? 0) > 1;
    const predictsCsat = pCsat != null && pCsat < ALPHA && (cf ?? 5) < (cp ?? 0);
    const powered = pass.length >= 20 && fail.length >= 20;
    if (!enough) note = `Too few ${pass.length < 8 ? 'passes' : 'failures'} in the period to test (${pass.length} pass, ${fail.length} fail).`;
    else if (predictsRepeat || predictsEsc || predictsCsat) {
      verdict = 'predictive';
      const parts: string[] = [];
      if (predictsRepeat) parts.push(`repeat contact ${(rf! * 100).toFixed(0)}% vs ${(rp! * 100).toFixed(0)}% (agent-adjusted OR ${rep.or!.toFixed(1)}, p ${fmtP(pRepeat!)})`);
      if (predictsEsc) parts.push(`escalation ${(ef! * 100).toFixed(0)}% vs ${(ep! * 100).toFixed(0)}% (p ${fmtP(pEscal!)})`);
      if (predictsCsat) parts.push(`CSAT ${cf!.toFixed(1)} vs ${cp!.toFixed(1)} (p ${fmtP(pCsat!)})`);
      note = `When failed: ${parts.join('; ')}.`;
    } else if (cr.category === 'compliance') {
      verdict = 'regulatory';
      note = `Mandatory control: retained whatever its outcome association (repeat-contact p ${fmtP(pRepeat ?? 1)}). Efficacy is not the test for a regulatory criterion.`;
    } else if (powered && (pRepeat ?? 0) > 0.2 && (pEscal ?? 1) > 0.2 && (pCsat ?? 1) > 0.2) {
      verdict = 'no-link';
      note = `No measurable link to repeat contact, escalation or CSAT after adjusting for agent (repeat-contact p ${fmtP(pRepeat!)}). Candidate for retirement or redesign.`;
    } else note = powered ? `Direction suggests an effect, but the evidence is not conclusive (repeat-contact p ${fmtP(pRepeat ?? 1)}).` : `Underpowered (${fail.length} failures): keep measuring before drawing conclusions.`;
    return {
      criterionId: cr.id,
      criterionText: cr.text,
      nPass: pass.length,
      nFail: fail.length,
      repeatPass: rp,
      repeatFail: rf,
      riskDiff,
      relRisk: rp && rf != null ? rf / rp : null,
      pRepeat,
      escalPass: ep,
      escalFail: ef,
      pEscal,
      orAdjusted: rep.or,
      csatPass: cp,
      csatFail: cf,
      pCsat,
      verdict,
      note,
    };
  });
}
