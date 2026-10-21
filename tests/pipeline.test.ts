import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '../src/engine/calibration';
import { identify } from '../src/engine/lid';
import { processCallSync } from '../src/engine/pipeline';
import { verifyChain, appendEntry, type AuditEntry } from '../src/engine/audit';
import { fisherExact, cmh } from '../src/engine/efficacy';
import { binomTail } from '../src/engine/discovery';
import { heroCalls } from '../src/data/heroCalls';
import { CURRENT_POLICY } from '../src/data/policy';
import { generateCorpus } from '../src/data/corpus';

const ctx = { ledger: {}, thresholds: DEFAULT_THRESHOLDS };
const hero = (id: string) => processCallSync(heroCalls().find((c) => c.id === id)!, CURRENT_POLICY, ctx);
const f = (p: ReturnType<typeof hero>, id: string) => p.findings.find((x) => x.criterionId === id)!;

describe('demo call VRS-INS-0412 (the headline scenario)', () => {
  const p = hero('VRS-INS-0412');
  it('catches the charge disclosed after confirmation, with both moments evidenced', () => {
    const dis = f(p, 'Q-DIS');
    expect(dis.verdict).toBe('fail');
    expect(dis.late).toBe(true);
    expect(dis.evidence.map((e) => e.role)).toEqual(['confirmation', 'late disclosure']);
    expect(dis.evidence[1].start).toBeGreaterThan(dis.evidence[0].start + 25);
    expect(dis.routing.decision).toBe('human_review');
  });
  it('fails one-factor verification', () => expect(f(p, 'Q-VER').verdict).toBe('fail'));
  it('finds the interruption in the diarized timeline', () => expect(p.acoustics.interruptions).toHaveLength(1));
  it('redacts PII before evaluation', () => {
    expect(p.redactionCount).toBe(3);
    expect(p.transcript.some((u) => u.text.includes('gmail'))).toBe(false);
  });
  it('evidences every non-N/A verdict', () => {
    for (const x of p.findings) if (x.verdict === 'fail') expect(x.gate).toBe('verified');
  });
});

describe('other demo calls', () => {
  it('passes the well-handled cancellation (VRS-INS-0388)', () => expect(hero('VRS-INS-0388').score).toBe(100));
  it('flags the collections threat as a critical auto-fail (VRS-COL-1131)', () => {
    const p = hero('VRS-COL-1131');
    expect(p.autoFail).toBe(true);
    expect(f(p, 'Q-HRD').verdict).toBe('fail');
  });
  it('routes the Hinglish call as code-mixed (VRS-CRD-0907)', () => {
    const p = hero('VRS-CRD-0907');
    expect(p.language).toBe('hi-en');
    expect(f(p, 'Q-EMP').verdict).toBe('pass');
  });
});

describe('language identification', () => {
  it('tags code-mixed, Hindi and English utterances', () => {
    expect(identify('Main samajh sakti hoon, aap tension mat lijiye, hum abhi isko secure kar dete hain.').lang).not.toBe('en');
    expect(identify('Yes, that is the one. It is frustrating, because the hotel told me to call the bank.').lang).toBe('en');
  });
});

describe('corpus and statistics', () => {
  it('generates a reproducible corpus', () => {
    const a = generateCorpus();
    const b = generateCorpus();
    expect(a.length).toBe(b.length);
    expect(a[17].utterances[1].text).toBe(b[17].utterances[1].text);
    expect(a.filter((c) => c.golden).length).toBe(40);
  });
  it('computes Fisher and CMH tests', () => {
    expect(fisherExact(8, 2, 1, 5)).toBeCloseTo(0.035, 2);
    expect(cmh([[10, 5, 5, 10], [10, 5, 5, 10]]).p!).toBeLessThan(0.05);
    expect(binomTail(10, 10)).toBeCloseTo(1 / 1024, 6);
  });
});

describe('audit chain', () => {
  it('detects any edit to history', async () => {
    let log: AuditEntry[] = [];
    for (const a of ['one', 'two', 'three']) log = [...log, await appendEntry(log, { actor: 't', action: a, subject: 's', detail: 'd' })];
    expect((await verifyChain(log)).ok).toBe(true);
    log[1] = { ...log[1], detail: 'tampered' };
    expect(await verifyChain(log)).toEqual({ ok: false, brokenAt: 2 });
  });
});
