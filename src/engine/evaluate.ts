// Deterministic evaluation of compiled specs against an analysis-zone transcript.
// Each criterion is evaluated independently and returns a verdict, rationale, a
// confidence and *candidate* evidence quotes. Candidates are not trusted: the evidence
// gate (evidence.ts) verifies every quote verbatim before a verdict may be published.

import { CONCEPT_BY_ID, FACTORS } from './lexicon';
import { fmtTime, sentenceAt, sentences } from './text';
import type { Acoustics, AnalysedUtterance, Criterion, EvidenceCandidate, RawFinding, Speaker } from './types';

interface Hit {
  u: AnalysedUtterance;
  pos: number;
  quote: string;
  t: number; // time of the cited sentence
}

export function findConcept(t: AnalysedUtterance[], conceptId: string, speaker?: Speaker, filter?: (u: AnalysedUtterance) => boolean): Hit[] {
  const c = CONCEPT_BY_ID[conceptId];
  if (!c) return [];
  const out: Hit[] = [];
  for (const u of t) {
    if (speaker && u.speaker !== speaker) continue;
    if (filter && !filter(u)) continue;
    let first: { pos: number } | null = null;
    for (const p of c.patterns) {
      const m = new RegExp(p.source, p.flags.replace('g', '')).exec(u.text);
      if (m && (!first || m.index < first.pos)) first = { pos: m.index };
    }
    if (first) {
      const sen = sentenceAt(u.text, first.pos);
      out.push({ u, pos: first.pos, quote: sen.text, t: u.timeOf(sen.start, sen.end).start });
    }
  }
  return out;
}

const firstSentence = (u: AnalysedUtterance) => sentences(u.text)[0]?.text ?? u.text;
const lastSentence = (u: AnalysedUtterance) => {
  const s = sentences(u.text);
  return s[s.length - 1]?.text ?? u.text;
};
const ev = (h: { u: AnalysedUtterance; quote: string }, role?: string): EvidenceCandidate => ({ utteranceId: h.u.id, quote: h.quote, role });
const at = (u: AnalysedUtterance) => fmtTime(u.start);
const langPenalty = (us: AnalysedUtterance[]) => (us.some((u) => u.lang !== 'en') ? 0.93 : 1);
const order = (h: Hit) => h.u.index * 10000 + h.pos;

export function evaluateDeterministic(c: Criterion, t: AnalysedUtterance[], ac: Acoustics): RawFinding | null {
  const spec = c.spec;
  const base = { criterionId: c.id, engine: 'deterministic' as const };
  const agent = t.filter((u) => u.speaker === 'agent');
  if (!agent.length) return { ...base, verdict: 'na', rationale: 'No agent speech in this interaction.', confidence: 1, evidence: [] };

  switch (spec.kind) {
    case 'presence': {
      const label = CONCEPT_BY_ID[spec.concept].label.toLowerCase();
      const windowFilter =
        spec.window === 'opening'
          ? (u: AnalysedUtterance) => u.phase === 'opening' || agent.slice(0, 2).includes(u)
          : spec.window === 'closing'
            ? (u: AnalysedUtterance) => u.phase === 'closing' || agent.slice(-3).includes(u)
            : undefined;
      const hits = findConcept(t, spec.concept, spec.speaker, windowFilter);
      if (hits.length) {
        return { ...base, verdict: 'pass', rationale: `Agent ${label} at ${fmtTime(hits[0].t)}.`, confidence: 0.92 * langPenalty([hits[0].u]), evidence: [ev(hits[0])] };
      }
      const atOpening = spec.window === 'opening' || (spec.window !== 'closing' && CONCEPT_BY_ID[spec.concept].anchor === 'opening');
      const anchor = atOpening ? agent[0] : agent[agent.length - 1];
      const anchorQuote = atOpening ? firstSentence(anchor) : lastSentence(anchor);
      const where = spec.window === 'opening' ? 'in the opening' : spec.window === 'closing' ? 'before the call closed' : 'anywhere in agent speech';
      return {
        ...base,
        verdict: 'fail',
        rationale: `No ${label} found ${where}. The ${atOpening ? 'opening' : 'closing'} statement at ${at(anchor)} is cited as the point where it was expected.`,
        confidence: 0.8 * langPenalty(agent),
        evidence: [{ utteranceId: anchor.id, quote: anchorQuote, role: 'expected here' }],
      };
    }

    case 'absence': {
      const label = CONCEPT_BY_ID[spec.concept].label.toLowerCase();
      const hits = findConcept(t, spec.concept, spec.speaker);
      if (!hits.length) return { ...base, verdict: 'pass', rationale: `No ${label} detected across ${agent.length} agent turns.`, confidence: 0.86 * langPenalty(agent), evidence: [] };
      return {
        ...base,
        verdict: 'fail',
        rationale: `${hits.length === 1 ? 'One instance' : `${hits.length} instances`} of ${label}, first at ${fmtTime(hits[0].t)}.`,
        confidence: 0.93 * langPenalty(hits.map((h) => h.u)),
        evidence: hits.slice(0, 3).map((h) => ev(h, 'prohibited statement')),
      };
    }

    case 'sequence': {
      const thens = findConcept(t, spec.then, 'agent');
      const firsts = findConcept(t, spec.first, 'agent');
      const fl = CONCEPT_BY_ID[spec.first].label.toLowerCase();
      const tl = CONCEPT_BY_ID[spec.then].label.toLowerCase();
      if (!thens.length) return { ...base, verdict: 'na', rationale: `Not applicable: no ${tl} occurred in this call.`, confidence: 0.85, evidence: [] };
      const then = thens[0];
      const prior = firsts.find((f) => order(f) < order(then));
      if (prior) {
        return {
          ...base,
          verdict: 'pass',
          rationale: `${cap(fl)} at ${fmtTime(prior.t)} preceded the ${tl} at ${fmtTime(then.t)}.`,
          confidence: 0.92 * langPenalty([prior.u, then.u]),
          evidence: [ev(prior, 'disclosure'), ev(then, 'confirmation')],
        };
      }
      const late = firsts.find((f) => order(f) > order(then));
      if (late) {
        const gap = late.t - then.t;
        return {
          ...base,
          verdict: 'fail',
          late: true,
          rationale: `The ${tl} came at ${fmtTime(then.t)}; the ${fl} followed at ${fmtTime(late.t)}, ${gap.toFixed(1)} s later. The element was present but in the wrong sequence.`,
          confidence: 0.94 * langPenalty([late.u, then.u]),
          evidence: [ev(then, 'confirmation'), ev(late, 'late disclosure')],
        };
      }
      return {
        ...base,
        verdict: 'fail',
        rationale: `The ${tl} at ${fmtTime(then.t)} was never preceded by any ${fl}.`,
        confidence: 0.83 * langPenalty([then.u]),
        evidence: [ev(then, 'confirmation')],
      };
    }

    case 'factors': {
      const details = findConcept(t, spec.before, 'agent');
      const cutoff = details.length ? details[0] : null;
      const window = agent.filter((u) => !cutoff || u.index < cutoff.u.index || (u === cutoff.u));
      const found = new Map<string, Hit>();
      for (const u of window) {
        const limit = cutoff && u === cutoff.u ? cutoff.pos : u.text.length;
        for (const f of FACTORS) {
          const m = new RegExp(f.pattern.source, 'i').exec(u.text.slice(0, limit));
          if (m && !found.has(f.type)) {
            // a "last four digits of your registered mobile" request is one factor, not two
            if (f.type === 'card4' && found.has('mobile')) continue;
            const sen = sentenceAt(u.text, m.index);
            found.set(f.type, { u, pos: m.index, quote: sen.text, t: u.timeOf(sen.start, sen.end).start });
          }
        }
      }
      const labels = [...found.keys()].map((k) => FACTORS.find((f) => f.type === k)!.label);
      const evidence = [...new Map([...found.values()].map((h) => [h.quote, ev(h, 'factor requested')])).values()];
      if (found.size >= spec.min) {
        return {
          ...base,
          verdict: 'pass',
          rationale: `${found.size} factors requested (${labels.join(', ')})${cutoff ? ` before account details at ${fmtTime(cutoff.t)}` : ''}.`,
          confidence: 0.93 * langPenalty(window),
          evidence,
        };
      }
      return {
        ...base,
        verdict: 'fail',
        rationale: `Only ${found.size} factor${found.size === 1 ? '' : 's'} requested${labels.length ? ` (${labels.join(', ')})` : ''} before account details were discussed${cutoff ? ` at ${fmtTime(cutoff.t)}` : ''}; policy requires ${spec.min}.`,
        confidence: 0.9 * langPenalty(window),
        evidence: [...evidence, ...(cutoff ? [ev(cutoff, 'details disclosed')] : [])],
      };
    }

    case 'conditional': {
      const triggers = findConcept(t, spec.trigger, 'customer');
      const tl = CONCEPT_BY_ID[spec.trigger].label.toLowerCase();
      const rl = CONCEPT_BY_ID[spec.response].label.toLowerCase();
      if (!triggers.length) return { ...base, verdict: 'na', rationale: `Not applicable: no ${tl} detected.`, confidence: 0.82, evidence: [] };
      const handled: { trig: Hit; resp: Hit }[] = [];
      const missed: { trig: Hit; next?: AnalysedUtterance }[] = [];
      for (const trig of triggers) {
        const following = agent.filter((u) => u.index > trig.u.index).slice(0, spec.withinTurns);
        const resp = findConcept(following, spec.response, 'agent')[0];
        if (resp) handled.push({ trig, resp });
        else missed.push({ trig, next: following[0] });
      }
      const pen = langPenalty(triggers.map((x) => x.u));
      if (!missed.length) {
        const h = handled[0];
        return {
          ...base,
          verdict: 'pass',
          rationale: `${cap(tl)} at ${fmtTime(h.trig.t)} was met with ${rl} at ${fmtTime(h.resp.t)}${handled.length > 1 ? ` (${handled.length} of ${handled.length} instances handled)` : ''}.`,
          confidence: 0.84 * pen,
          evidence: [ev(h.trig, 'trigger'), ev(h.resp, 'response')],
        };
      }
      const m = missed[0];
      const evidence: EvidenceCandidate[] = [ev(m.trig, 'trigger')];
      if (m.next) evidence.push({ utteranceId: m.next.id, quote: firstSentence(m.next), role: 'agent response' });
      const partial = handled.length ? ` A later instance at ${fmtTime(handled[0].trig.t)} was handled well at ${fmtTime(handled[0].resp.t)}.` : '';
      return {
        ...base,
        verdict: 'fail',
        rationale: `${cap(tl)} at ${fmtTime(m.trig.t)} was not met with ${rl} in the next ${spec.withinTurns} agent turns${m.next ? `; the agent replied “${firstSentence(m.next)}”` : '.'}${partial}`,
        confidence: 0.8 * pen,
        evidence,
      };
    }

    case 'acoustic': {
      if (spec.metric === 'interruptions') {
        if (ac.interruptions.length <= spec.value) return { ...base, verdict: 'pass', rationale: 'No agent interruptions detected in the diarized timeline.', confidence: 0.9, evidence: [] };
        const i = ac.interruptions[0];
        const a = t.find((u) => u.id === i.agentUtt)!;
        const cu = t.find((u) => u.id === i.customerUtt)!;
        return {
          ...base,
          verdict: 'fail',
          rationale: `Agent cut in at ${fmtTime(i.at)} while the customer was still speaking (${i.overlap.toFixed(1)} s of overlap); the customer stopped mid-sentence.${ac.interruptions.length > 1 ? ` ${ac.interruptions.length} interruptions in total.` : ''}`,
          confidence: 0.91,
          evidence: [
            { utteranceId: cu.id, quote: lastSentence(cu), role: 'customer cut off' },
            { utteranceId: a.id, quote: firstSentence(a), role: 'agent interruption' },
          ],
        };
      }
      if (spec.metric === 'longest_silence') {
        const ls = ac.longestSilence;
        if (!ls || ls.end - ls.start <= spec.value) return { ...base, verdict: 'pass', rationale: `Longest silence ${ls ? (ls.end - ls.start).toFixed(1) : '0'} s is within ${spec.value} s.`, confidence: 0.95, evidence: [] };
        const before = [...t].reverse().find((u) => u.end <= ls.start + 0.01)!;
        const after = t.find((u) => u.start >= ls.end - 0.01)!;
        return {
          ...base,
          verdict: 'fail',
          rationale: `${(ls.end - ls.start).toFixed(1)} s of silence from ${fmtTime(ls.start)} to ${fmtTime(ls.end)} exceeds ${spec.value} s.`,
          confidence: 0.95,
          evidence: [
            { utteranceId: before.id, quote: lastSentence(before), role: 'before silence' },
            { utteranceId: after.id, quote: firstSentence(after), role: 'after silence' },
          ],
        };
      }
      const share = ac.agentTalkShare;
      const longest = agent.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
      return share <= spec.value
        ? { ...base, verdict: 'pass', rationale: `Agent talk share ${(share * 100).toFixed(0)}% is within ${(spec.value * 100).toFixed(0)}%.`, confidence: 0.95, evidence: [] }
        : { ...base, verdict: 'fail', rationale: `Agent talk share ${(share * 100).toFixed(0)}% exceeds ${(spec.value * 100).toFixed(0)}%.`, confidence: 0.95, evidence: [{ utteranceId: longest.id, quote: firstSentence(longest), role: 'longest agent turn' }] };
    }

    case 'semantic':
      return null; // requires the LLM evaluator
  }
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
