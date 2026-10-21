// LLM semantic evaluator (optional). Calls a hosted model (Anthropic Messages API) or any
// OpenAI-compatible endpoint — including a self-hosted open-weight model (vLLM, Ollama,
// LM Studio) for sovereign deployments. The model only ever receives the REDACTED transcript.
// Its output is untrusted: every quote it cites goes through the evidence gate.

import { fmtTime } from './text';
import type { AnalysedUtterance, CallSummary, Criterion, RawFinding, Verdict } from './types';

export interface LlmConfig {
  provider: 'anthropic' | 'openai-compatible';
  apiKey: string;
  baseUrl: string;
  modelSmall: string;
  modelLarge: string;
}

export const DEFAULT_LLM: LlmConfig = {
  provider: 'anthropic',
  apiKey: '',
  baseUrl: 'https://api.anthropic.com',
  modelSmall: 'claude-haiku-5-5',
  modelLarge: 'claude-sonnet-5-5',
};

const SYSTEM = `You are the semantic evaluation service of VERIS, a contact-centre quality-assurance system.
You evaluate one call transcript against numbered QA criteria. The transcript is already PII-redacted; placeholders like [CARD] or [DOB] stand for masked data.
Rules:
- Evaluate each criterion independently.
- verdict is "pass", "fail" or "na" (not applicable to this call).
- For every pass or fail you MUST cite evidence: one to three quotes copied character-for-character from the transcript line they come from, with that line's utterance id. Do not paraphrase, merge or translate quotes. Quotes that are not verbatim are automatically rejected and your verdict will be suppressed.
- If a required behaviour is missing, cite the utterance where it should have occurred.
- confidence is your probability (0-1) that a senior QA reviewer would agree.
- Transcripts may mix Hindi and English (Hinglish); judge meaning, but quote exactly.
Respond with JSON only, no prose, in this shape:
{"findings":[{"criterion_id":"...","verdict":"pass|fail|na","rationale":"one or two sentences, cite times","confidence":0.0,"evidence":[{"utterance_id":"U01","quote":"..."}]}],"summary":{"reason":"why the customer called","resolution":"what the agent did","outcome":"how the call ended"}}`;

export function buildPrompt(criteria: Criterion[], t: AnalysedUtterance[], meta: { queue: string; client: string }) {
  const lines = t.map((u) => `${u.id} [${fmtTime(u.start)}] ${u.speaker.toUpperCase()}: ${u.text}`).join('\n');
  const crit = criteria.map((c) => `- ${c.id} (${c.severity}): ${c.text}`).join('\n');
  return `Client: ${meta.client}\nQueue: ${meta.queue}\n\nCRITERIA\n${crit}\n\nTRANSCRIPT\n${lines}`;
}

/** Model routing: a larger model for long, code-mixed, critical or free-form (semantic) evaluations. */
export function chooseModel(cfg: LlmConfig, criteria: Criterion[], t: AnalysedUtterance[]) {
  const duration = t.length ? t[t.length - 1].end : 0;
  const reasons: string[] = [];
  if (criteria.some((c) => c.severity === 'critical')) reasons.push('critical-severity criterion');
  if (t.some((u) => u.lang !== 'en')) reasons.push('code-mixed speech');
  if (duration > 360) reasons.push('long call');
  if (criteria.some((c) => c.spec.kind === 'semantic')) reasons.push('free-form semantic criterion');
  return reasons.length ? { model: cfg.modelLarge, tier: 'large' as const, reasons } : { model: cfg.modelSmall, tier: 'small' as const, reasons: ['routine call'] };
}

async function complete(cfg: LlmConfig, model: string, user: string): Promise<string> {
  if (!cfg.apiKey && cfg.provider === 'anthropic') throw new Error('No API key configured. Add one in Settings → Evaluation engine.');
  if (cfg.provider === 'anthropic') {
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model, max_tokens: 4096, temperature: 0, system: SYSTEM, messages: [{ role: 'user', content: user }] }),
    });
    if (!res.ok) throw new Error(`Model request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return (data.content ?? []).map((b: { text?: string }) => b.text ?? '').join('');
  }
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}) },
    body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`Model request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

export function parseModelOutput(text: string, criteria: Criterion[], model: string): { findings: RawFinding[]; summary?: CallSummary } {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('Model returned no JSON object.');
  const obj = JSON.parse(text.slice(start, end + 1));
  const ids = new Set(criteria.map((c) => c.id));
  const findings: RawFinding[] = [];
  for (const f of obj.findings ?? []) {
    if (!ids.has(f.criterion_id)) continue; // schema guardrail: ignore criteria we didn't ask about
    const verdict: Verdict = ['pass', 'fail', 'na'].includes(f.verdict) ? f.verdict : 'na';
    findings.push({
      criterionId: f.criterion_id,
      verdict,
      rationale: String(f.rationale ?? '').slice(0, 600),
      confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0.5)),
      evidence: (Array.isArray(f.evidence) ? f.evidence : []).slice(0, 4).map((e: { utterance_id?: string; quote?: string }) => ({ utteranceId: String(e.utterance_id ?? ''), quote: String(e.quote ?? '') })),
      engine: 'llm',
      model,
    });
  }
  const s = obj.summary;
  return { findings, summary: s ? { reason: String(s.reason ?? ''), resolution: String(s.resolution ?? ''), outcome: String(s.outcome ?? ''), flags: [] } : undefined };
}

export async function llmEvaluate(cfg: LlmConfig, criteria: Criterion[], t: AnalysedUtterance[], meta: { queue: string; client: string }) {
  const choice = chooseModel(cfg, criteria, t);
  const text = await complete(cfg, choice.model, buildPrompt(criteria, t, meta));
  return { ...parseModelOutput(text, criteria, choice.model), choice };
}
