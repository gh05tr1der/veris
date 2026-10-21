// The VERIS processing pipeline (document §4): ingest → speech intelligence → privacy →
// evaluation → evidence gate → reliability lookup → routing → insight. Each stage is timed
// and logged so the UI can show exactly what happened to a call.

import { computeAcoustics, sentimentTrajectory } from './acoustics';
import { type LedgerRow, reliabilityFor, type Thresholds } from './calibration';
import { evaluateDeterministic, findConcept } from './evaluate';
import { gate } from './evidence';
import { callLanguage, LANG_LABEL } from './lid';
import { llmEvaluate, type LlmConfig } from './llm';
import { analyseUtterances, PHASE_LABEL } from './prepare';
import { route } from './router';
import { sentences } from './text';
import type { AnalysedUtterance, Call, CallSummary, Criterion, Finding, PolicyVersion, ProcessedCall, RawFinding, StageLog } from './types';

export interface PipelineContext {
  ledger: Record<string, LedgerRow>;
  thresholds: Thresholds;
  llm?: LlmConfig | null;
  llmForAll?: boolean;
  /** extra raw findings to inject (used by the evidence-gate test in the UI) */
  inject?: RawFinding[];
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const QUEUE_NAME: Record<string, string> = {
  INS: 'Motor Insurance Servicing',
  CRD: 'Cards & Disputes',
  COL: 'Collections',
};

export function applicable(policy: PolicyVersion, call: Pick<Call, 'queue'>) {
  return policy.criteria.filter((c) => c.queues === 'all' || c.queues.includes(call.queue));
}

export function processCallSync(call: Call, policy: PolicyVersion, ctx: PipelineContext): ProcessedCall {
  return runCore(call, policy, ctx, null);
}

export async function processCall(call: Call, policy: PolicyVersion, ctx: PipelineContext): Promise<ProcessedCall> {
  const criteria = applicable(policy, call);
  const semantic = criteria.filter((c) => ctx.llmForAll || c.spec.kind === 'semantic');
  if (!ctx.llm || !semantic.length) return runCore(call, policy, ctx, null);
  // analyse once to build the redacted transcript the model will see
  const t0 = now();
  const transcript = analyseUtterances(call.utterances);
  const out = await llmEvaluate(ctx.llm, semantic, transcript, { queue: QUEUE_NAME[call.queue], client: call.client });
  return runCore(call, policy, ctx, { ...out, ms: now() - t0, ids: new Set(semantic.map((c) => c.id)) });
}

function runCore(
  call: Call,
  policy: PolicyVersion,
  ctx: PipelineContext,
  llm: null | { findings: RawFinding[]; summary?: CallSummary; choice: { model: string; tier: string; reasons: string[] }; ms: number; ids: Set<string> },
): ProcessedCall {
  const stages: StageLog[] = [];
  const log = (stage: string, layer: string, detail: string, t: number) => stages.push({ stage, layer, detail, ms: +(now() - t).toFixed(2) });

  let t = now();
  log('Ingest & secure landing', 'L2 Integration', `Job ${call.id} created · ${call.utterances.length} utterances · ${Math.round(call.duration)} s · ${call.audioUrl ? 'stereo recording' : 'transcript feed'}`, t);

  t = now();
  const words = call.utterances.reduce((a, u) => a + u.words.length, 0);
  const meanConf = call.utterances.flatMap((u) => u.words.map((w) => w.c));
  log('Speech-to-text', 'L3 Speech', `${words} words with word-level timestamps · mean ASR confidence ${(meanConf.reduce((a, b) => a + b, 0) / Math.max(1, meanConf.length)).toFixed(2)}`, t);
  log('Speaker diarization', 'L3 Speech', call.audioUrl ? 'Stereo channel separation: agent = left, customer = right' : 'Speaker turns from recorder channel metadata', now());

  t = now();
  const transcript = analyseUtterances(call.utterances);
  const lang = callLanguage(transcript.map((u) => u.lang));
  const langCounts = transcript.reduce<Record<string, number>>((a, u) => ((a[u.lang] = (a[u.lang] ?? 0) + 1), a), {});
  log('Language identification', 'L3 Speech', `Utterance-level: ${Object.entries(langCounts).map(([k, v]) => `${v} ${k}`).join(' · ')} → routed as ${LANG_LABEL[lang]}`, t);

  t = now();
  const acoustics = computeAcoustics(call.utterances);
  log('Acoustic analytics', 'L3 Speech', `Talk share ${(acoustics.agentTalkShare * 100).toFixed(0)}% agent · ${acoustics.interruptions.length} interruption(s) · longest silence ${acoustics.longestSilence ? (acoustics.longestSilence.end - acoustics.longestSilence.start).toFixed(1) : 0} s`, t);

  const redactions = transcript.flatMap((u) => u.redactions);
  const byType = redactions.reduce<Record<string, number>>((a, r) => ((a[r.type] = (a[r.type] ?? 0) + 1), a), {});
  log('PII detection & redaction', 'L4 Privacy', redactions.length ? `${redactions.length} entities masked (${Object.entries(byType).map(([k, v]) => `${k}×${v}`).join(', ')}) · only redacted text crosses into the analysis zone` : 'No PII detected · transcript released to analysis zone', now());

  const phases = [...new Set(transcript.map((u) => u.phase))];
  log('Conversation segmentation', 'L4 Privacy', `Phases: ${phases.map((p) => PHASE_LABEL[p]).join(' → ')}`, now());

  const criteria = applicable(policy, call);
  log('Policy retrieval', 'L5 AI', `${policy.name} v${policy.version} · ${criteria.length} criteria apply to ${QUEUE_NAME[call.queue]}`, now());

  t = now();
  const sentiment = sentimentTrajectory(transcript);
  const raw: RawFinding[] = [];
  let det = 0;
  let semanticPending = 0;
  for (const c of criteria) {
    if (llm?.ids.has(c.id)) {
      const f = llm.findings.find((x) => x.criterionId === c.id);
      raw.push(f ?? { criterionId: c.id, verdict: 'fail', rationale: 'Model returned no verdict for this criterion.', confidence: 0, evidence: [], engine: 'llm', model: llm.choice.model });
      continue;
    }
    const f = evaluateDeterministic(c, transcript, acoustics);
    if (f) {
      raw.push(f);
      det++;
    } else {
      semanticPending++;
      raw.push({ criterionId: c.id, verdict: 'na', rationale: 'Semantic criterion: requires the LLM evaluator, which is not configured. Routed to a human reviewer.', confidence: 0, evidence: [], engine: 'deterministic' });
    }
  }
  for (const inj of ctx.inject ?? []) {
    const i = raw.findIndex((r) => r.criterionId === inj.criterionId);
    if (i >= 0) raw[i] = inj;
  }
  log(
    'Semantic & compliance evaluation',
    'L5 AI',
    `${det} deterministic${llm ? ` · ${llm.ids.size} by ${llm.choice.model} (${llm.choice.tier} tier: ${llm.choice.reasons.join(', ')}; ${Math.round(llm.ms)} ms)` : ''}${semanticPending ? ` · ${semanticPending} semantic pending (no LLM configured)` : ''} · criteria evaluated independently`,
    t,
  );

  t = now();
  const findings: Finding[] = [];
  let verified = 0;
  let rejected = 0;
  for (const r of raw) {
    const c = criteria.find((x) => x.id === r.criterionId)!;
    const g = gate(r, transcript);
    verified += g.evidence.length;
    rejected += g.rejected.length;
    const rel = reliabilityFor(ctx.ledger, c.id, lang);
    const pendingSemantic = c.spec.kind === 'semantic' && r.engine === 'deterministic';
    const routing = pendingSemantic
      ? { decision: 'human_review' as const, reasons: ['Semantic criterion with no LLM evaluator configured: a reviewer answers it.'], priority: 35 }
      : route({ verdict: r.verdict, severity: c.severity, confidence: g.confidence, gate: g.gate }, rel, ctx.thresholds, LANG_LABEL[lang]);
    findings.push({
      criterionId: c.id,
      criterionText: c.text,
      severity: c.severity,
      category: c.category,
      verdict: r.verdict,
      rationale: r.rationale,
      confidence: g.confidence,
      engine: r.engine,
      model: r.model,
      evidence: g.evidence,
      rejectedEvidence: g.rejected,
      gate: g.gate,
      reliability: rel,
      routing,
      late: r.late,
    });
  }
  const suppressed = findings.filter((f) => f.routing.decision === 'suppressed').length;
  log('Evidence binding & verification', 'L6 Governance', `${verified} quote(s) verified verbatim and bound to audio timestamps · ${rejected} rejected · ${suppressed} verdict(s) suppressed`, t);

  const counts = findings.reduce<Record<string, number>>((a, f) => ((a[f.routing.decision] = (a[f.routing.decision] ?? 0) + 1), a), {});
  log('Reliability lookup', 'L6 Governance', `Calibration Ledger consulted for ${findings.length} criterion × ${LANG_LABEL[lang]} pairs`, now());
  log('Risk routing', 'L6 Governance', `${counts.auto_publish ?? 0} auto-published · ${counts.human_review ?? 0} human review · ${counts.advisory ?? 0} advisory · ${counts.suppressed ?? 0} suppressed`, now());

  const scored = findings.filter((f) => f.verdict !== 'na' && f.routing.decision !== 'suppressed');
  const wsum = scored.reduce((a, f) => a + weightOf(criteria, f.criterionId), 0);
  const score = wsum ? Math.round((100 * scored.filter((f) => f.verdict === 'pass').reduce((a, f) => a + weightOf(criteria, f.criterionId), 0)) / wsum) : null;
  const autoFail = findings.some((f) => f.severity === 'critical' && f.verdict === 'fail');

  t = now();
  const summary = llm?.summary ?? summarise(transcript, findings);
  summary.flags = findings.filter((f) => f.verdict === 'fail' && (f.severity === 'high' || f.severity === 'critical')).map((f) => f.criterionText);
  log('Summary & insight', 'L7 Analytics', 'Call summary, sentiment trajectory and coaching signals generated', t);

  return {
    callId: call.id,
    policyVersion: policy.version,
    transcript,
    language: lang,
    redactionCount: redactions.length,
    acoustics,
    sentiment,
    findings,
    score,
    autoFail,
    status: findings.every((f) => f.routing.decision === 'auto_publish') ? 'published' : 'in_review',
    summary,
    stages,
    engineMode: llm ? 'hybrid-llm' : 'deterministic',
  };
}

const weightOf = (criteria: Criterion[], id: string) => criteria.find((c) => c.id === id)?.weight ?? 1;

const INTENTS: [RegExp, string][] = [
  [/\b(cancel|cancellation)\b/i, 'Policy cancellation'],
  [/\b(charged twice|duplicate|double charge)/i, 'Duplicate charge dispute'],
  [/\b(transaction (hua|that i)|maine nahi kiya|didn't make|did not make|fraud|unauthori[sz]ed)/i, 'Unauthorised transaction'],
  [/\b(overdue|emi|outstanding|loan)\b/i, 'Overdue loan repayment'],
  [/\b(claim)\b/i, 'Claim status'],
  [/\b(refund)\b/i, 'Refund query'],
  [/\b(renew|renewal)\b/i, 'Renewal'],
  [/\b(limit|statement|bill)\b/i, 'Card billing query'],
  [/\b(address|update|change my)\b/i, 'Profile update'],
];

export function intentOf(t: AnalysedUtterance[]) {
  const text = t.map((u) => u.text).join(' ');
  return INTENTS.find(([re]) => re.test(text))?.[1] ?? 'General enquiry';
}

function summarise(t: AnalysedUtterance[], findings: Finding[]): CallSummary {
  const intent = intentOf(t);
  const firstCustomer = t.find((u) => u.speaker === 'customer' && u.text.split(' ').length > 3);
  const resolution = [...findConcept(t, 'transaction_confirm', 'agent'), ...findConcept(t, 'next_steps', 'agent')]
    .sort((a, b) => a.u.index - b.u.index)
    .slice(0, 2)
    .map((h) => h.quote);
  const lastCustomer = [...t].reverse().find((u) => u.speaker === 'customer');
  const escalation = t.some((u) => u.speaker === 'customer' && /\b(supervisor|manager|escalate|complaint)\b/i.test(u.text));
  const fails = findings.filter((f) => f.verdict === 'fail').length;
  return {
    reason: `${intent}${firstCustomer ? ` — customer: “${sentences(firstCustomer.text).slice(0, 2).map((s) => s.text).join(' ')}”` : ''}`,
    resolution: resolution.length ? resolution.join(' ') : 'No explicit resolution statement detected.',
    outcome: `${escalation ? 'Customer asked for escalation. ' : ''}Closing customer turn: “${lastCustomer ? sentences(lastCustomer.text)[0]?.text ?? lastCustomer.text : '—'}” · ${fails} criterion failure${fails === 1 ? '' : 's'}.`,
    flags: [],
  };
}
