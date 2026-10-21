import { describe, expect, it } from 'vitest';
import { compile } from '../src/engine/compiler';

describe('policy compiler: plain English → executable spec', () => {
  it('compiles an ordering requirement to a sequence spec', () => {
    const r = compile('Check whether the agent explained the cancellation fee before confirming the cancellation.');
    expect(r.spec).toEqual({ kind: 'sequence', first: 'charge_disclosure', then: 'transaction_confirm', speaker: 'agent' });
    expect(r.executable).toBe('deterministic');
  });

  it('compiles an interruption question to an acoustic fault check', () => {
    expect(compile('Did the agent interrupt the customer?').spec).toEqual({ kind: 'acoustic', metric: 'interruptions', op: '<=', value: 0 });
  });

  it('compiles multi-factor verification with the right minimum', () => {
    expect(compile('Did the agent complete two-factor identity verification before discussing account details?').spec).toMatchObject({ kind: 'factors', min: 2 });
    expect(compile('Did the agent verify at least one identity factor before discussing account details?').spec).toMatchObject({ kind: 'factors', min: 1 });
  });

  it('compiles conditionals with a customer trigger and an agent response', () => {
    expect(compile('When the customer expresses frustration or worry, did the agent acknowledge it with empathy?').spec).toEqual({ kind: 'conditional', trigger: 'frustration', response: 'empathy', withinTurns: 2 });
  });

  it('treats prohibited conduct as an absence check with critical severity', () => {
    const r = compile('Did the agent avoid threats, coercion or disclosing the debt to third parties?');
    expect(r.spec).toEqual({ kind: 'absence', concept: 'prohibited_pressure', speaker: 'agent' });
    expect(r.suggestedSeverity).toBe('critical');
  });

  it('scopes presence checks to the opening or closing when the wording says so', () => {
    expect(compile('Did the agent say the brand tagline in the greeting?').spec).toMatchObject({ kind: 'presence', concept: 'tagline', window: 'opening' });
    expect(compile('Did the agent offer further assistance before closing the call?').spec).toMatchObject({ kind: 'presence', concept: 'further_assistance', window: 'closing' });
  });

  it('falls back to a semantic (LLM-only) spec when nothing resolves', () => {
    const r = compile('Did the agent explain how the pro-rata refund was calculated accurately?');
    expect(r.spec.kind).toBe('semantic');
    expect(r.executable).toBe('llm-only');
  });
});
