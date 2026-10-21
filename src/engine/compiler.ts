// Policy compiler: plain-English QA criterion -> versioned, executable evaluation spec.
//
// The compiler recognises a small set of structural templates (sequence, conditional,
// prohibition, presence, verification-factor count, acoustic metric) and resolves the
// noun phrases inside them onto concepts in the lexicon. Anything it cannot resolve
// compiles to a `semantic` spec, which only the LLM evaluator can execute — the criterion
// is still versioned and regression-tested, it just cannot run in deterministic mode.

import { CONCEPTS, CONCEPT_BY_ID } from './lexicon';
import type { Category, Severity, Spec, Speaker } from './types';

export interface CompileResult {
  spec: Spec;
  notes: string[];
  suggestedSeverity: Severity;
  suggestedCategory: Category;
  executable: 'deterministic' | 'llm-only';
}

const FAULT_CONCEPTS = new Set(['prohibited_pressure', 'misselling_claim']);
const NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, single: 1, dual: 2, double: 2 };

function resolve(clause: string, speaker?: Speaker) {
  const c = clause.toLowerCase();
  let best: { id: string; score: number; hits: string[] } | null = null;
  for (const concept of CONCEPTS) {
    if (speaker && concept.speaker !== speaker) continue;
    const hits = concept.keywords.filter((k) => c.includes(k.replace(/^~/, '')));
    // weak cues can tip a choice between concepts but never resolve one on their own
    if (!hits.some((k) => !k.startsWith('~'))) continue;
    const score = hits.reduce((a, k) => a + (k.startsWith('~') ? 1 : k.length), 0);
    if (!best || score > best.score) best = { id: concept.id, score, hits: hits.map((h) => h.replace(/^~/, '')) };
  }
  return best;
}

const describe = (id: string) => `${id} (${CONCEPT_BY_ID[id].label.toLowerCase()})`;

export function compile(text: string): CompileResult {
  const t = text.trim();
  const lower = t.toLowerCase();
  const notes: string[] = [];
  const done = (spec: Spec, sev: Severity, cat: Category): CompileResult => ({
    spec,
    notes,
    suggestedSeverity: sev,
    suggestedCategory: cat,
    executable: spec.kind === 'semantic' ? 'llm-only' : 'deterministic',
  });

  // 1. Acoustic / conversational metrics
  if (/\binterrupt|talk(ed|s|ing)? over|cut (the customer |them )?off|spoke over/.test(lower)) {
    notes.push('Template: acoustic metric — interruptions, computed from diarized timings.');
    notes.push('Interpreted as a fault check: passes when the agent does not cut in while the customer is speaking.');
    return done({ kind: 'acoustic', metric: 'interruptions', op: '<=', value: 0 }, 'medium', 'soft-skill');
  }
  if (/\b(dead air|silence|on hold|hold time)\b/.test(lower)) {
    const n = Number(lower.match(/(\d+)\s*(seconds|secs|s)\b/)?.[1] ?? 30);
    notes.push(`Template: acoustic metric — longest silence must not exceed ${n}s.`);
    return done({ kind: 'acoustic', metric: 'longest_silence', op: '<=', value: n }, 'low', 'process');
  }
  if (/\b(talk share|talk ratio|dominat|talked too much|let the customer speak)\b/.test(lower)) {
    notes.push('Template: acoustic metric — agent share of talk time must not exceed 65%.');
    return done({ kind: 'acoustic', metric: 'agent_talk_share', op: '<=', value: 0.65 }, 'low', 'soft-skill');
  }

  // 2. Multi-factor identity verification before discussing details
  if (/\b(verif|authenticat|identity)/.test(lower) && /\b(two|2|three|3|dual|double|multi|factors?|pieces|forms)\b/.test(lower)) {
    const m = lower.match(/\b(two|three|dual|double|single|one|\d)\b/);
    const min = m ? NUM[m[1]] ?? Number(m[1]) : 2;
    notes.push(`Template: verification-factor count — at least ${min} distinct factors requested before account details are discussed.`);
    notes.push('Factors recognised: date of birth, registered mobile, PAN, OTP, registered address/email, card last four, maiden name.');
    return done({ kind: 'factors', min, before: 'account_details' }, 'high', 'compliance');
  }

  // 3. Conditional: "when the customer X, did the agent Y"
  const cond = lower.match(/\b(when|if|whenever|where)\b(.+?)(,|\bdid\b|\bthen\b|\bthe agent\b)(.+)/);
  if (cond && /customer/.test(cond[2])) {
    const trig = resolve(cond[2], 'customer');
    const resp = resolve(cond[4], 'agent');
    if (trig && resp) {
      notes.push('Template: conditional — trigger in customer speech, required agent response within 2 agent turns. Not applicable when the trigger never occurs.');
      notes.push(`Trigger resolved: “${trig.hits.join(', ')}” → ${describe(trig.id)}.`);
      notes.push(`Response resolved: “${resp.hits.join(', ')}” → ${describe(resp.id)}.`);
      return done({ kind: 'conditional', trigger: trig.id, response: resp.id, withinTurns: 2 }, resp.id === 'hardship_option' ? 'high' : 'medium', resp.id === 'hardship_option' ? 'compliance' : 'soft-skill');
    }
  }

  // 4. Sequence: "X before Y" / "Y only after X"
  const before = lower.match(/^(.*?)\b(before|prior to|ahead of)\b(.*)$/);
  const after = lower.match(/^(.*?)\b(only after|after)\b(.*)$/);
  const seq = before ? { first: before[1], then: before[3] } : after ? { first: after[3], then: after[1] } : null;
  if (seq) {
    const a = resolve(seq.first, 'agent');
    const b = resolve(seq.then, 'agent');
    if (a && b && a.id !== b.id) {
      notes.push(`Template: sequence — “${before ? before[2] : after![2]}” establishes order.`);
      notes.push(`First event: “${a.hits.join(', ')}” → ${describe(a.id)}.`);
      notes.push(`Then event: “${b.hits.join(', ')}” → ${describe(b.id)}.`);
      notes.push('Passes if the first event occurs before the first occurrence of the second; fails if late or absent; not applicable if the second event never occurs.');
      const compliance = a.id === 'charge_disclosure' || a.id === 'recording_disclosure';
      return done({ kind: 'sequence', first: a.id, then: b.id, speaker: 'agent' }, compliance ? 'high' : 'medium', compliance ? 'compliance' : 'process');
    }
  }

  // 5. Prohibitions (fault concepts are always absence checks)
  const target = resolve(lower, 'agent');
  const negated = /\b(did not|didn't|never|avoid|avoided|refrain|without|free of|no)\b/.test(lower);
  if (target && (FAULT_CONCEPTS.has(target.id) || (negated && !['further_assistance', 'next_steps'].includes(target.id)))) {
    notes.push(`Template: prohibition — the agent must not produce ${describe(target.id)}.`);
    notes.push(`Resolved from “${target.hits.join(', ')}”.`);
    return done({ kind: 'absence', concept: target.id, speaker: 'agent' }, FAULT_CONCEPTS.has(target.id) ? 'critical' : 'high', 'compliance');
  }

  // 6. Presence
  if (target) {
    const window = /\b(greet|opening|start of the call|beginning|at the start)/.test(lower)
      ? 'opening'
      : /\b(clos|end of the call|before ending|wrap|sign-?off)/.test(lower)
        ? 'closing'
        : 'any';
    notes.push(`Template: presence — the agent must produce ${describe(target.id)}${window !== 'any' ? ` in the ${window} phase` : ''}.`);
    notes.push(`Resolved from “${target.hits.join(', ')}”.`);
    const cat: Category = target.id === 'recording_disclosure' ? 'compliance' : target.id === 'next_steps' || target.id === 'summary_check' ? 'resolution' : target.id === 'empathy' ? 'soft-skill' : 'process';
    return done({ kind: 'presence', concept: target.id, speaker: 'agent', window }, target.id === 'recording_disclosure' ? 'high' : 'low', cat);
  }

  notes.push('No deterministic template matched. Compiled as a semantic criterion: it runs only with an LLM evaluator, and every verdict must still pass the evidence gate.');
  return done({ kind: 'semantic', question: t }, 'medium', 'process');
}

export function specSummary(spec: Spec): string {
  switch (spec.kind) {
    case 'presence':
      return `presence(${spec.concept}${spec.window && spec.window !== 'any' ? ` @${spec.window}` : ''})`;
    case 'absence':
      return `absence(${spec.concept})`;
    case 'sequence':
      return `sequence(${spec.first} → ${spec.then})`;
    case 'factors':
      return `factors(≥${spec.min} before ${spec.before})`;
    case 'conditional':
      return `when(${spec.trigger}) ⇒ ${spec.response} ≤${spec.withinTurns} turns`;
    case 'acoustic':
      return `${spec.metric} ${spec.op} ${spec.value}`;
    case 'semantic':
      return 'semantic(LLM)';
  }
}
