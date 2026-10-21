// Policy-as-code regression testing. Before a policy change is published it is replayed
// against the golden set — calls already scored by senior reviewers — and the drift is shown:
// verdict flips per criterion, score movement per call, and agreement with reviewers before
// and after. Quality standards stop changing silently.

import { agreementStats, DEFAULT_THRESHOLDS, type LabelPair } from './calibration';
import { processCallSync } from './pipeline';
import type { Call, PolicyVersion, RegressionSummary, Verdict } from './types';

export interface RegressionResult {
  summary: RegressionSummary;
  perCriterion: {
    criterionId: string;
    status: 'added' | 'removed' | 'changed' | 'unchanged';
    flips: number;
    flipExamples: { callId: string; before: Verdict; after: Verdict; reviewer?: Verdict }[];
    agreementBefore: number | null;
    agreementAfter: number | null;
    labelled: number;
  }[];
  perCall: { callId: string; before: number | null; after: number | null }[];
}

export function replay(golden: Call[], baseline: PolicyVersion, candidate: PolicyVersion): RegressionResult {
  const ctx = { ledger: {}, thresholds: DEFAULT_THRESHOLDS };
  const runs = golden.map((c) => ({ c, a: processCallSync(c, baseline, ctx), b: processCallSync(c, candidate, ctx) }));
  const ids = [...new Set([...baseline.criteria.map((c) => c.id), ...candidate.criteria.map((c) => c.id)])];
  const pairsBefore: LabelPair[] = [];
  const pairsAfter: LabelPair[] = [];
  const perCriterion = ids.map((id) => {
    const inA = baseline.criteria.find((c) => c.id === id);
    const inB = candidate.criteria.find((c) => c.id === id);
    const status: RegressionResult['perCriterion'][number]['status'] = !inA ? 'added' : !inB ? 'removed' : JSON.stringify([inA.spec, inA.queues, inA.severity, inA.weight]) !== JSON.stringify([inB.spec, inB.queues, inB.severity, inB.weight]) ? 'changed' : 'unchanged';
    const flipExamples: RegressionResult['perCriterion'][number]['flipExamples'] = [];
    const pb: LabelPair[] = [];
    const pa: LabelPair[] = [];
    for (const { c, a, b } of runs) {
      const fa = a.findings.find((f) => f.criterionId === id);
      const fb = b.findings.find((f) => f.criterionId === id);
      const reviewer = c.reviewerLabels?.[id];
      if (fa && fb && fa.verdict !== fb.verdict) flipExamples.push({ callId: c.id, before: fa.verdict, after: fb.verdict, reviewer });
      const mk = (v: Verdict): LabelPair => ({ callId: c.id, criterionId: id, lang: a.language, queue: c.queue, date: c.date, engine: v, reviewer: reviewer!, source: 'blind-sample' });
      if (reviewer && fa) pb.push(mk(fa.verdict));
      if (reviewer && fb) pa.push(mk(fb.verdict));
    }
    pairsBefore.push(...pb);
    pairsAfter.push(...pa);
    return {
      criterionId: id,
      status,
      flips: flipExamples.length,
      flipExamples: flipExamples.slice(0, 6),
      agreementBefore: agreementStats(pb).agreement,
      agreementAfter: agreementStats(pa).agreement,
      labelled: Math.max(pb.length, pa.length),
    };
  });
  const perCall = runs.map(({ c, a, b }) => ({ callId: c.id, before: a.score, after: b.score }));
  const drifts = perCall.filter((x) => x.before != null && x.after != null).map((x) => x.after! - x.before!);
  return {
    summary: {
      goldenCalls: golden.length,
      verdictFlips: perCriterion.reduce((a, b) => a + b.flips, 0),
      meanScoreDrift: drifts.length ? +(drifts.reduce((a, b) => a + b, 0) / drifts.length).toFixed(1) : 0,
      agreementBefore: agreementStats(pairsBefore).agreement,
      agreementAfter: agreementStats(pairsAfter).agreement,
    },
    perCriterion,
    perCall,
  };
}
