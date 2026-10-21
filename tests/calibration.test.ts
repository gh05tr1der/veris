import { describe, expect, it } from 'vitest';
import { agreementStats, buildLedger, DEFAULT_THRESHOLDS, type LabelPair } from '../src/engine/calibration';
import { route } from '../src/engine/router';
import type { Verdict } from '../src/engine/types';

const pair = (engine: Verdict, reviewer: Verdict, date = '2026-09-10T10:00:00Z'): LabelPair => ({ callId: 'c', criterionId: 'Q-X', lang: 'en', queue: 'INS', date, engine, reviewer, source: 'blind-sample' });

describe('Calibration Ledger statistics', () => {
  it("computes Cohen's kappa", () => {
    // 20 pp, 5 pf, 10 fp, 15 ff → po = .7, pe = .5, κ = .4
    const ps = [...Array(20).fill(0).map(() => pair('pass', 'pass')), ...Array(5).fill(0).map(() => pair('pass', 'fail')), ...Array(10).fill(0).map(() => pair('fail', 'pass')), ...Array(15).fill(0).map(() => pair('fail', 'fail'))];
    const s = agreementStats(ps);
    expect(s.n).toBe(50);
    expect(s.agreement).toBeCloseTo(0.7);
    expect(s.kappa).toBeCloseTo(0.4);
  });

  it('excludes N/A pairs from κ and counts applicability disagreements', () => {
    const s = agreementStats([pair('na', 'pass'), pair('na', 'na'), pair('pass', 'pass')]);
    expect(s.n).toBe(1);
    expect(s.applicabilityDisagreements).toBe(1);
  });

  it('promotes, holds back, and reverts on drift', () => {
    const good = [...Array(20).fill(0).map(() => pair('pass', 'pass')), ...Array(12).fill(0).map(() => pair('fail', 'fail'))];
    let L = buildLedger(good, ['Q-X'], DEFAULT_THRESHOLDS, '2026-10-20T00:00:00Z');
    expect(L['Q-X|en'].status).toBe('auto');
    L = buildLedger(good.slice(0, 10), ['Q-X'], DEFAULT_THRESHOLDS, '2026-10-20T00:00:00Z');
    expect(L['Q-X|en'].status).toBe('insufficient');
    const recentBad = [...Array(15).fill(0).map(() => pair('pass', 'pass', '2026-10-15T00:00:00Z')), ...Array(12).fill(0).map(() => pair('fail', 'pass', '2026-10-16T00:00:00Z')), ...Array(5).fill(0).map(() => pair('fail', 'fail', '2026-10-16T00:00:00Z'))];
    L = buildLedger([...good, ...recentBad], ['Q-X'], DEFAULT_THRESHOLDS, '2026-10-20T00:00:00Z');
    expect(L['Q-X|en'].drift).toBe(true);
    expect(L['Q-X|en'].status).toBe('advisory');
  });

  it('never trusts a rare outcome with too few labelled examples', () => {
    const ps = [...Array(40).fill(0).map(() => pair('pass', 'pass')), pair('fail', 'fail'), pair('fail', 'fail')];
    expect(buildLedger(ps, ['Q-X'], DEFAULT_THRESHOLDS, '2026-10-20T00:00:00Z')['Q-X|en'].status).toBe('insufficient');
  });
});

describe('risk routing', () => {
  const auto = { key: 'k', n: 50, agreement: 0.95, kappa: 0.9, status: 'auto' as const };
  it('always sends high-severity failures to a human, even when reliable', () => {
    expect(route({ verdict: 'fail', severity: 'high', confidence: 0.99, gate: 'verified' }, auto, DEFAULT_THRESHOLDS, 'English').decision).toBe('human_review');
  });
  it('publishes only reliable, confident, low-severity findings', () => {
    expect(route({ verdict: 'fail', severity: 'low', confidence: 0.9, gate: 'verified' }, auto, DEFAULT_THRESHOLDS, 'English').decision).toBe('auto_publish');
    expect(route({ verdict: 'fail', severity: 'low', confidence: 0.9, gate: 'verified' }, { ...auto, status: 'advisory' }, DEFAULT_THRESHOLDS, 'English').decision).toBe('advisory');
    expect(route({ verdict: 'fail', severity: 'low', confidence: 0.5, gate: 'verified' }, auto, DEFAULT_THRESHOLDS, 'English').decision).toBe('human_review');
  });
  it('suppresses anything the evidence gate failed', () => {
    expect(route({ verdict: 'pass', severity: 'low', confidence: 0.99, gate: 'failed' }, auto, DEFAULT_THRESHOLDS, 'English').decision).toBe('suppressed');
  });
});
