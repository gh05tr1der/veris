import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '../src/engine/calibration';
import { discover } from '../src/engine/discovery';
import { processCallSync } from '../src/engine/pipeline';
import { AS_OF, generateCorpus } from '../src/data/corpus';
import { heroCalls } from '../src/data/heroCalls';
import { CURRENT_POLICY } from '../src/data/policy';

const calls = [...generateCorpus(), ...heroCalls()];
const docs = calls.map((c) => ({ id: c.id, date: c.date, text: processCallSync(c, CURRENT_POLICY, { ledger: {}, thresholds: DEFAULT_THRESHOLDS }).transcript.filter((u) => u.speaker === 'customer').map((u) => u.text).join(' ') }));

describe('emerging-issue discovery on the demo corpus', () => {
  it('flags the seeded cancellation-charge dispute rise, and only that', () => {
    const em = discover(docs, CURRENT_POLICY.criteria, AS_OF).clusters.filter((c) => c.emerging);
    expect(em).toHaveLength(1);
    expect(em[0].terms.join(' ')).toMatch(/deduction|cancellation charge/);
    expect(em[0].covered?.criterionId).toBe('Q-DIS');
  });

  it('is not reshuffled by calls uploaded after the reporting period', () => {
    const extra = { id: 'UPL-1', date: '2026-10-23T10:00:00Z', text: 'I sold my car and I want to cancel the motor policy. Why am I only hearing about this now?' };
    const a = discover(docs, CURRENT_POLICY.criteria, AS_OF).clusters.map((c) => c.size);
    const b = discover([...docs, extra], CURRENT_POLICY.criteria, AS_OF).clusters.map((c) => c.size);
    expect(b).toEqual(a);
  });
});
