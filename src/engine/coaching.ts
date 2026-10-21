// Coaching engine: converts recurring, evidenced weaknesses into a coaching item that follows
// a fixed chain — Issue → Evidence → Probable root cause → Recommended action → Assigned
// micro-learning → Follow-up measurement window. Strengths are surfaced alongside.

import { CONCEPT_BY_ID } from './lexicon';
import type { Call, Criterion, Evidence, ProcessedCall } from './types';

export interface CoachingItem {
  agentId: string;
  agentName: string;
  criterionId: string;
  criterionText: string;
  occurrences: { callId: string; date: string; evidence: Evidence[]; rationale: string }[];
  applicable: number;
  failRate: number;
  rootCause: { type: string; text: string };
  action: string;
  module: { title: string; minutes: number };
  followUp: string;
  priority: number;
}

export interface Strength {
  callId: string;
  criterionId: string;
  text: string;
  evidence: Evidence[];
}

export const MODULES: Record<string, { title: string; minutes: number; action: string }> = {
  'Q-DIS': { title: 'Disclosure sequencing: charges before confirmation', minutes: 6, action: 'Move the charge statement into the pre-confirmation step; practise the line “Before I process this, please note…”.' },
  'Q-VER': { title: 'Two-factor verification, every time', minutes: 5, action: 'Ask for the second factor before opening the account; never read details back after a single factor.' },
  'Q-REC': { title: 'The recording disclosure in the first breath', minutes: 3, action: 'Fold the recording line into the greeting script so it cannot be skipped.' },
  'Q-EMP': { title: 'Acknowledge before you act', minutes: 7, action: 'When the customer voices frustration, name it in one sentence before moving to the task.' },
  'Q-HRD': { title: 'Fair practice: hardship conversations', minutes: 9, action: 'On any hardship cue, offer the payment-plan or hardship-desk route before restating dues.' },
  'Q-PRH': { title: 'Fair-practice conduct (mandatory)', minutes: 12, action: 'Conduct breach: team leader and compliance review the calls with the agent; the module is mandatory before the next shift.' },
  'Q-NXT': { title: 'Close the loop: next steps and timelines', minutes: 5, action: 'End every resolution with what happens next, who does it, and by when.' },
  'Q-SUM': { title: 'Thirty-second summaries', minutes: 4, action: 'Recap the outcome in one sentence and check the customer agrees.' },
  'Q-FAA': { title: 'Open the door before closing', minutes: 3, action: 'Ask whether anything else is needed before the sign-off.' },
  'Q-GRT': { title: 'Greeting and self-introduction', minutes: 2, action: 'Introduce yourself by name in the opening line.' },
  'Q-DUE': { title: 'Stating dues clearly', minutes: 4, action: 'State the overdue amount, fees and total outstanding in one sentence.' },
  'Q-TAG': { title: 'Brand greeting', minutes: 2, action: 'Use the client greeting including the tagline.' },
  'Q-INT': { title: 'Let the customer finish', minutes: 4, action: 'Wait for a pause before speaking; use a short acknowledgement instead of cutting in.' },
};

function rootCause(c: Criterion, occ: { late?: boolean }[]): { type: string; text: string } {
  const s = c.spec;
  switch (s.kind) {
    case 'sequence': {
      const late = occ.filter((o) => o.late).length;
      const first = CONCEPT_BY_ID[s.first].label.toLowerCase();
      const then = CONCEPT_BY_ID[s.then].label.toLowerCase();
      return late >= occ.length / 2
        ? { type: 'Process-understanding gap', text: `The ${first} is being made, but after the ${then} (${late} of ${occ.length} occurrences). It is treated as a closing step rather than a pre-confirmation step — a sequencing gap, not a knowledge gap.` }
        : { type: 'Knowledge gap', text: `The ${first} is missing altogether before the ${then}. The agent may not know it applies.` };
    }
    case 'factors':
      return { type: 'Procedure gap', text: 'Account details are discussed after a single verification factor. The second factor is being skipped, most often under time pressure.' };
    case 'conditional':
      return { type: 'Recognition gap', text: `The agent misses the ${CONCEPT_BY_ID[s.trigger].label.toLowerCase()} and goes straight to the task.` };
    case 'absence':
      return { type: 'Conduct issue', text: 'Prohibited conduct. This is a compliance matter for the team leader and compliance, not only a learning need.' };
    case 'acoustic':
      return { type: 'Conversational habit', text: 'A recurring pattern in how the agent manages turns in the conversation.' };
    case 'presence':
      return { type: 'Habit gap', text: `The ${CONCEPT_BY_ID[s.concept].label.toLowerCase()} is habitually left out.` };
    default:
      return { type: 'Unclassified', text: 'Reviewer to assess the pattern.' };
  }
}

export interface Assignment {
  agentId: string;
  criterionId: string;
  date: string;
  module: string;
}

const SEV = { critical: 4, high: 3, medium: 2, low: 1 } as const;

export function buildCoaching(calls: Call[], processed: Record<string, ProcessedCall>, criteria: Criterion[], asOf: string, assignments: Assignment[] = [], windowDays = 30, perAgent = 2): CoachingItem[] {
  const from = new Date(new Date(asOf).getTime() - windowDays * 864e5).toISOString();
  const items: CoachingItem[] = [];
  const agents = [...new Set(calls.map((c) => c.agentId))];
  for (const agentId of agents) {
    const mine = calls.filter((c) => c.agentId === agentId && c.date >= from && processed[c.id]);
    if (!mine.length) continue;
    const forAgent: CoachingItem[] = [];
    for (const crit of criteria) {
      // calls before an existing assignment for this pattern are already being coached
      const assigned = assignments.find((a) => a.agentId === agentId && a.criterionId === crit.id);
      const occ: (CoachingItem['occurrences'][number] & { late?: boolean })[] = [];
      let applicable = 0;
      for (const call of mine) {
        if (assigned && call.date < assigned.date) continue;
        const f = processed[call.id].findings.find((x) => x.criterionId === crit.id);
        if (!f || f.verdict === 'na' || f.routing.decision === 'suppressed') continue;
        // coach only on evidence we can stand behind: criteria that have earned reliability in this
        // language. Advisory or drifting criteria would turn measurement error into coaching.
        if (f.reliability.status !== 'auto') continue;
        applicable++;
        if (f.verdict === 'fail') occ.push({ callId: call.id, date: call.date, evidence: f.evidence, rationale: f.rationale, late: f.late });
      }
      const failRate = applicable ? occ.length / applicable : 0;
      // low-severity criteria only become coaching items when they are habitual
      const bar = crit.severity === 'low' ? 0.85 : 0.25;
      if (occ.length >= 3 && failRate >= bar) {
        const m = MODULES[crit.id] ?? { title: 'Reviewer-assigned module', minutes: 5, action: 'Team leader to agree an action.' };
        forAgent.push({
          agentId,
          agentName: mine[0].agentName,
          criterionId: crit.id,
          criterionText: crit.text,
          occurrences: occ.sort((a, b) => b.date.localeCompare(a.date)),
          applicable,
          failRate,
          rootCause: rootCause(crit, occ),
          action: m.action,
          module: { title: m.title, minutes: m.minutes },
          followUp: `Re-measure ${crit.id} across the agent's next 20 applicable calls.`,
          priority: +(SEV[crit.severity] ** 2 * occ.length * failRate).toFixed(2),
        });
      }
    }
    items.push(...forAgent.sort((a, b) => b.priority - a.priority).slice(0, perAgent));
  }
  return items.sort((a, b) => b.priority - a.priority);
}

export function strengthsFor(callIds: string[], processed: Record<string, ProcessedCall>): Strength[] {
  const out: Strength[] = [];
  for (const id of callIds) {
    const p = processed[id];
    if (!p) continue;
    for (const f of p.findings) {
      if (f.verdict === 'pass' && (f.criterionId === 'Q-EMP' || f.criterionId === 'Q-HRD' || f.criterionId === 'Q-DIS') && f.evidence.length) {
        const key = f.evidence.find((e) => e.role === 'response' || e.role === 'disclosure') ?? f.evidence[0];
        out.push({ callId: id, criterionId: f.criterionId, text: f.rationale, evidence: [key, ...f.evidence.filter((e) => e !== key)] });
      }
    }
  }
  return out;
}

/** Before/after comparison for a coaching assignment already delivered. */
export function coachingEffect(calls: Call[], processed: Record<string, ProcessedCall>, agentId: string, criterionId: string, date: string) {
  const rate = (xs: Call[]) => {
    let n = 0;
    let fail = 0;
    for (const c of xs) {
      const f = processed[c.id]?.findings.find((x) => x.criterionId === criterionId);
      if (!f || f.verdict === 'na') continue;
      n++;
      if (f.verdict === 'fail') fail++;
    }
    return { n, failRate: n ? fail / n : null };
  };
  const mine = calls.filter((c) => c.agentId === agentId);
  return { before: rate(mine.filter((c) => c.date < date)), after: rate(mine.filter((c) => c.date >= date)) };
}
