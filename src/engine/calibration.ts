// The Calibration Ledger: continuously measured agreement between VERIS verdicts and
// senior human reviewers, per criterion and per language. Agreement is reported as raw
// agreement plus Cohen's kappa with a 95% interval. The ledger is load-bearing: its
// status decides whether a criterion may publish automatically (see router.ts).

import type { Lang, QueueId, Reliability, Verdict } from './types';

export interface LabelPair {
  callId: string;
  criterionId: string;
  lang: Lang;
  queue: QueueId;
  date: string;
  engine: Verdict;
  reviewer: Verdict;
  source: 'blind-sample' | 'review' | 'contest';
}

export interface Thresholds {
  minN: number;
  kappa: number;
  agreement: number;
  minConfidence: number;
  driftWindowDays: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { minN: 25, kappa: 0.75, agreement: 0.9, minConfidence: 0.7, driftWindowDays: 14 };

export interface AgreementStats {
  n: number;
  agreement: number | null;
  kappa: number | null;
  ci: [number, number] | null;
  confusion: { pp: number; pf: number; fp: number; ff: number }; // engine-reviewer
  applicabilityDisagreements: number;
}

export function agreementStats(pairs: LabelPair[]): AgreementStats {
  const conf = { pp: 0, pf: 0, fp: 0, ff: 0 };
  let applicability = 0;
  for (const p of pairs) {
    if (p.engine === 'na' || p.reviewer === 'na') {
      if (p.engine !== p.reviewer) applicability++;
      continue;
    }
    const k = `${p.engine[0]}${p.reviewer[0]}` as 'pp' | 'pf' | 'fp' | 'ff';
    conf[k]++;
  }
  const n = conf.pp + conf.pf + conf.fp + conf.ff;
  if (!n) return { n, agreement: null, kappa: null, ci: null, confusion: conf, applicabilityDisagreements: applicability };
  const po = (conf.pp + conf.ff) / n;
  const ePass = (conf.pp + conf.pf) / n;
  const rPass = (conf.pp + conf.fp) / n;
  const pe = ePass * rPass + (1 - ePass) * (1 - rPass);
  let kappa: number;
  if (pe >= 1) kappa = po === 1 ? 1 : 0;
  else kappa = (po - pe) / (1 - pe);
  const se = pe >= 1 ? 0 : Math.sqrt((po * (1 - po)) / (n * (1 - pe) ** 2));
  const ci: [number, number] = [Math.max(-1, kappa - 1.96 * se), Math.min(1, kappa + 1.96 * se)];
  return { n, agreement: po, kappa, ci, confusion: conf, applicabilityDisagreements: applicability };
}

export interface LedgerRow {
  key: string;
  criterionId: string;
  lang: Lang;
  stats: AgreementStats;
  baseline: AgreementStats;
  recent: AgreementStats;
  status: Reliability['status'];
  drift: boolean;
  reason: string;
  weekly: { week: string; kappa: number | null; n: number }[];
}

export const ledgerKey = (criterionId: string, lang: Lang) => `${criterionId}|${lang === 'hi' ? 'hi-en' : lang}`;

function weekOf(d: string) {
  const dt = new Date(d);
  const day = (dt.getUTCDay() + 6) % 7; // Monday start
  dt.setUTCDate(dt.getUTCDate() - day);
  return dt.toISOString().slice(0, 10);
}

export function buildLedger(pairs: LabelPair[], criterionIds: string[], th: Thresholds, asOf: string): Record<string, LedgerRow> {
  const out: Record<string, LedgerRow> = {};
  const cutoff = new Date(new Date(asOf).getTime() - th.driftWindowDays * 864e5).toISOString();
  const weeks = [...new Set(pairs.map((p) => weekOf(p.date)))].sort();
  for (const cid of criterionIds) {
    for (const lang of ['en', 'hi-en'] as Lang[]) {
      const key = ledgerKey(cid, lang);
      const ps = pairs.filter((p) => p.criterionId === cid && ledgerKey(p.criterionId, p.lang) === key);
      const stats = agreementStats(ps);
      const recent = agreementStats(ps.filter((p) => p.date >= cutoff));
      // Drift is judged against the criterion's own history: a criterion that had earned automation
      // before the recent window and whose recent agreement falls clearly below threshold reverts.
      const baseline = agreementStats(ps.filter((p) => p.date < cutoff));
      const qualifies = (st: AgreementStats) => st.n >= th.minN && (st.kappa ?? 0) >= th.kappa && (st.agreement ?? 0) >= th.agreement;
      let status: Reliability['status'];
      let reason: string;
      let drift = false;
      const reviewerFails = stats.confusion.pf + stats.confusion.ff;
      const reviewerPasses = stats.confusion.pp + stats.confusion.fp;
      if (stats.n < th.minN) {
        status = 'insufficient';
        reason = `Only ${stats.n} reviewer-labelled pairs; ${th.minN} needed before automation can be considered.`;
      } else if (reviewerFails < 5 || reviewerPasses < 5) {
        // κ is unstable when one outcome is rare: a criterion cannot earn automation for an event it has barely seen
        status = 'insufficient';
        reason = `Only ${Math.min(reviewerFails, reviewerPasses)} reviewer-labelled ${reviewerFails < reviewerPasses ? 'FAIL' : 'PASS'} example(s) in ${stats.n} pairs. Rare outcomes need at least 5 labelled examples on each side before agreement can be trusted.`;
      } else if (qualifies(baseline) && recent.n >= 25 && (recent.agreement ?? 1) < th.agreement - 0.03 && (recent.kappa ?? 0) < th.kappa - 0.1) {
        status = 'advisory';
        drift = true;
        reason = `Drift: κ was ${baseline.kappa!.toFixed(2)} before the last ${th.driftWindowDays} days and is ${recent.kappa!.toFixed(2)} within them (n=${recent.n}, ${(recent.agreement! * 100).toFixed(0)}% agreement). Reverted to advisory automatically; flagged for policy review.`;
      } else if (qualifies(stats)) {
        status = 'auto';
        reason = `κ ${stats.kappa!.toFixed(2)} and ${(stats.agreement! * 100).toFixed(0)}% agreement clear the thresholds (κ ≥ ${th.kappa}, ≥ ${(th.agreement * 100).toFixed(0)}%).`;
      } else {
        status = 'advisory';
        reason = `κ ${stats.kappa?.toFixed(2) ?? '—'} / ${stats.agreement != null ? (stats.agreement * 100).toFixed(0) : '—'}% agreement is below threshold (κ ≥ ${th.kappa}, ≥ ${(th.agreement * 100).toFixed(0)}%). Verdicts are computed but need human confirmation.`;
      }
      const weekly = weeks.map((w) => {
        const s = agreementStats(ps.filter((p) => weekOf(p.date) === w));
        return { week: w, kappa: s.kappa, n: s.n };
      });
      out[key] = { key, criterionId: cid, lang, stats, baseline, recent, status, drift, reason, weekly };
    }
  }
  return out;
}

export function reliabilityFor(ledger: Record<string, LedgerRow>, criterionId: string, lang: Lang): Reliability {
  const key = ledgerKey(criterionId, lang);
  const row = ledger[key];
  if (!row) return { key, n: 0, agreement: null, kappa: null, status: 'insufficient' };
  return { key, n: row.stats.n, agreement: row.stats.agreement, kappa: row.stats.kappa, status: row.status };
}
