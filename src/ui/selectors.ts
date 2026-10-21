// Derived views over the store used by several screens.
import type { Call, Finding, ProcessedCall } from '../engine/types';
import { AS_OF, decisionFor, processedFor, type Contest, type State } from '../state/store';

export interface ReviewItem {
  key: string;
  kind: 'finding' | 'contest';
  call: Call;
  processed: ProcessedCall;
  finding: Finding;
  contest?: Contest;
  priority: number;
  reason: string;
}

export const QUEUE_WINDOW_DAYS = 7;

/**
 * Work for human reviewers: mandatory reviews, suppressed (unevidenced) verdicts, advisory
 * failures and open agent contests, for the current week, ordered by risk not arrival.
 * Advisory passes publish with an advisory flag and are not queued: they cannot harm an agent.
 */
export function reviewItems(s: Pick<State, 'calls' | 'processed' | 'liveRuns' | 'decisions' | 'contests'>): ReviewItem[] {
  const from = new Date(new Date(AS_OF).getTime() - QUEUE_WINDOW_DAYS * 864e5).toISOString();
  const items: ReviewItem[] = [];
  for (const call of s.calls) {
    if (call.date < from && call.source === 'synthetic-corpus') continue;
    const p = processedFor(s, call.id);
    if (!p) continue;
    for (const f of p.findings) {
      if (decisionFor(s.decisions, call.id, f.criterionId)) continue;
      const d = f.routing.decision;
      if (d === 'human_review' || d === 'suppressed' || (d === 'advisory' && f.verdict === 'fail')) {
        items.push({ key: `${call.id}|${f.criterionId}`, kind: 'finding', call, processed: p, finding: f, priority: f.routing.priority, reason: f.routing.reasons[0] });
      }
    }
  }
  for (const c of s.contests.filter((x) => x.status === 'open')) {
    const call = s.calls.find((x) => x.id === c.callId);
    const p = call && processedFor(s, c.callId);
    const f = p?.findings.find((x) => x.criterionId === c.criterionId);
    if (call && p && f) items.push({ key: `contest|${c.id}`, kind: 'contest', call, processed: p, finding: f, contest: c, priority: 95, reason: `Agent contest: “${c.reason}”` });
  }
  return items.sort((a, b) => b.priority - a.priority || b.call.date.localeCompare(a.call.date));
}

export function finalVerdict(s: Pick<State, 'decisions'>, callId: string, f: Finding) {
  const d = decisionFor(s.decisions, callId, f.criterionId);
  return d ? d.verdict : f.verdict;
}

export function kpis(s: State) {
  const calls = s.calls;
  const procs = calls.map((c) => processedFor(s, c.id)).filter(Boolean);
  const findings = procs.flatMap((p) => p.findings);
  const scored = procs.filter((p) => p.score != null);
  const decided = findings.filter((f) => f.verdict !== 'na');
  const evidenced = decided.filter((f) => f.gate === 'verified' || (f.gate === 'not-required' && f.verdict === 'pass'));
  const published = decided.filter((f) => f.routing.decision === 'auto_publish');
  const complianceFails = findings.filter((f) => f.category === 'compliance' && f.verdict === 'fail').length;
  const reviewed = s.calls.filter((c) => c.reviewerLabels).length;
  return {
    calls: calls.length,
    coverage: procs.length / Math.max(1, calls.length),
    sampledShare: reviewed / Math.max(1, calls.length),
    avgScore: scored.reduce((a, p) => a + (p.score ?? 0), 0) / Math.max(1, scored.length),
    autoRate: published.length / Math.max(1, decided.length),
    evidenceRate: evidenced.length / Math.max(1, decided.length),
    compliancePer1000: (complianceFails / Math.max(1, calls.length)) * 1000,
    callsWithCompliance: procs.filter((p) => p.findings.some((f) => f.category === 'compliance' && f.verdict === 'fail')).length / Math.max(1, procs.length),
    autoFails: procs.filter((p) => p.autoFail).length,
    redactions: procs.reduce((a, p) => a + p.redactionCount, 0),
    contests: s.contests.length,
    contestsUpheld: s.contests.filter((c) => c.status === 'upheld').length,
  };
}

export const HERO_IDS = ['VRS-INS-0412', 'VRS-CRD-0907', 'VRS-COL-1131', 'VRS-CRD-0951', 'VRS-INS-0388'];
