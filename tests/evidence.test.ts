import { describe, expect, it } from 'vitest';
import { gate, locate } from '../src/engine/evidence';
import { analyseUtterances } from '../src/engine/prepare';
import type { Utterance } from '../src/engine/types';

const utt = (id: string, speaker: 'agent' | 'customer', start: number, text: string): Utterance => {
  const toks = text.split(' ');
  return { id, speaker, start, end: start + toks.length * 0.4, text, words: toks.map((w, i) => ({ w, s: start + i * 0.4, e: start + i * 0.4 + 0.35, c: 0.95 })) };
};
const t = analyseUtterances([
  utt('U01', 'agent', 0, 'Thank you for calling, this is Rohan.'),
  utt('U02', 'agent', 10, "Alright, so I'll go ahead and process that cancellation for you now."),
  utt('U03', 'agent', 30, 'One more thing, there will be a cancellation charge of 850 rupees.'),
]);

describe('evidence gate', () => {
  it('locates exact and normalised quotes', () => {
    expect(locate('Hello, World! How are you?', 'World! How')?.match).toBe('exact');
    expect(locate('Hello, World! How are you?', 'world how are')?.match).toBe('normalized');
    expect(locate('Hello, World!', 'Goodbye')).toBeNull();
  });

  it('binds a verified quote to word-level timestamps', () => {
    const g = gate({ criterionId: 'Q-DIS', verdict: 'fail', rationale: '', confidence: 0.9, engine: 'llm', evidence: [{ utteranceId: 'U03', quote: 'a cancellation charge of 850 rupees' }] }, t);
    expect(g.gate).toBe('verified');
    expect(g.evidence[0].start).toBeCloseTo(32.4, 1);
    expect(g.evidence[0].speaker).toBe('agent');
  });

  it('rejects a fabricated quote and withholds the verdict', () => {
    const g = gate({ criterionId: 'Q-DIS', verdict: 'pass', rationale: '', confidence: 0.97, engine: 'llm', evidence: [{ utteranceId: 'U02', quote: 'I have explained all applicable charges to you.' }] }, t);
    expect(g.gate).toBe('failed');
    expect(g.evidence).toHaveLength(0);
    expect(g.rejected).toHaveLength(1);
  });

  it('treats a failure with no cited span as unevidenced', () => {
    expect(gate({ criterionId: 'X', verdict: 'fail', rationale: '', confidence: 0.9, engine: 'llm', evidence: [] }, t).gate).toBe('failed');
  });

  it('cannot be satisfied by quoting redacted PII', () => {
    const t2 = analyseUtterances([utt('U01', 'customer', 0, 'My card is 4539 1488 0343 6467 okay')]);
    const g = gate({ criterionId: 'X', verdict: 'fail', rationale: '', confidence: 0.9, engine: 'llm', evidence: [{ utteranceId: 'U01', quote: '4539 1488 0343 6467' }] }, t2);
    expect(g.gate).toBe('failed');
  });
});
