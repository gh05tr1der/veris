// The QA policy registry seed: three published versions of the voice QA standard.
// Criteria are authored in plain English and compiled by the policy compiler; severity,
// scope and weight are set by the QA owner.

import { compile } from '../engine/compiler';
import type { Category, Criterion, PolicyVersion, QueueId, Severity } from '../engine/types';

export const POLICY_NAME = 'Voice QA Standard';

export function makeCriterion(id: string, text: string, severity: Severity, queues: QueueId[] | 'all', weight: number, category?: Category): Criterion {
  const r = compile(text);
  return { id, text, severity, category: category ?? r.suggestedCategory, queues, weight, spec: r.spec, compiledBy: 'compiler', compileNotes: r.notes };
}

const V3: Criterion[] = [
  makeCriterion('Q-GRT', 'Did the agent greet the customer and identify themselves by name?', 'low', 'all', 1, 'process'),
  makeCriterion('Q-REC', 'Did the agent tell the customer that the call is recorded?', 'high', 'all', 2, 'compliance'),
  makeCriterion('Q-VER', 'Did the agent complete two-factor identity verification before discussing account details?', 'high', 'all', 3, 'compliance'),
  makeCriterion('Q-DIS', 'Did the agent disclose applicable charges before confirming the cancellation?', 'high', ['INS'], 3, 'compliance'),
  makeCriterion('Q-PRH', 'Did the agent avoid threats, coercion or disclosing the debt to third parties?', 'critical', 'all', 4, 'compliance'),
  makeCriterion('Q-HRD', 'When the customer reports financial hardship, did the agent offer a hardship option such as a payment plan or restructuring?', 'high', ['COL'], 3, 'compliance'),
  makeCriterion('Q-DUE', 'Did the agent clearly state the outstanding dues?', 'medium', ['COL'], 2, 'process'),
  makeCriterion('Q-EMP', 'When the customer expresses frustration or worry, did the agent acknowledge it with empathy?', 'medium', 'all', 2, 'soft-skill'),
  makeCriterion('Q-NXT', 'Did the agent explain next steps and timelines for resolution?', 'medium', 'all', 2, 'resolution'),
  makeCriterion('Q-SUM', "Did the agent summarise the outcome or check the customer's understanding?", 'low', 'all', 1, 'resolution'),
  makeCriterion('Q-FAA', 'Did the agent offer further assistance before closing the call?', 'low', 'all', 1, 'process'),
  makeCriterion('Q-TAG', 'Did the agent say the brand tagline in the greeting?', 'low', ['INS', 'CRD'], 1, 'process'),
];

const byId = (id: string) => V3.find((c) => c.id === id)!;

const V1: Criterion[] = [
  byId('Q-GRT'),
  byId('Q-REC'),
  makeCriterion('Q-VER', 'Did the agent verify at least one identity factor before discussing account details?', 'high', 'all', 3, 'compliance'),
  makeCriterion('Q-DIS', 'Did the agent mention the applicable charges?', 'high', ['INS'], 3, 'compliance'),
  byId('Q-PRH'),
  makeCriterion('Q-EMP', 'Did the agent show empathy?', 'medium', 'all', 2, 'soft-skill'),
  byId('Q-NXT'),
  byId('Q-FAA'),
];

const V2: Criterion[] = [
  byId('Q-GRT'),
  byId('Q-REC'),
  byId('Q-VER'),
  byId('Q-DIS'),
  byId('Q-PRH'),
  byId('Q-HRD'),
  byId('Q-DUE'),
  makeCriterion('Q-EMP', 'Did the agent show empathy?', 'medium', 'all', 2, 'soft-skill'),
  byId('Q-NXT'),
  byId('Q-SUM'),
  byId('Q-FAA'),
];

export const POLICY_HISTORY: PolicyVersion[] = [
  {
    version: 1,
    name: POLICY_NAME,
    criteria: V1,
    publishedAt: '2026-07-01T09:30:00Z',
    author: 'QA Governance (migrated)',
    note: 'Initial import of the legacy spreadsheet scorecard. Plain-English wording kept as-is.',
  },
  {
    version: 2,
    name: POLICY_NAME,
    criteria: V2,
    publishedAt: '2026-08-12T11:00:00Z',
    author: 'Meera Pillai, QA Design Lead',
    note: 'Charge disclosure changed from “mentioned” to “before confirming”; two-factor verification made explicit; collections fair-practice criteria added.',
  },
  {
    version: 3,
    name: POLICY_NAME,
    criteria: V3,
    publishedAt: '2026-09-22T10:15:00Z',
    author: 'Meera Pillai, QA Design Lead',
    note: 'Empathy rewritten as a conditional (only scored when the customer voices frustration or worry). Brand tagline added at client request.',
  },
];

export const CURRENT_POLICY = POLICY_HISTORY[POLICY_HISTORY.length - 1];
