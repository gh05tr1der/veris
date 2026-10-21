// Prints the calibration ledger and demo-call findings from the command line.
// Usage: npx tsx scripts/engine-report.ts
import { buildLedger, DEFAULT_THRESHOLDS, type LabelPair } from '../src/engine/calibration';
import { processCallSync } from '../src/engine/pipeline';
import { CURRENT_POLICY } from '../src/data/policy';
import { AS_OF, generateCorpus } from '../src/data/corpus';
import { heroCalls } from '../src/data/heroCalls';
import { fmtTime } from '../src/engine/text';

const corpus = generateCorpus();
const ctx0 = { ledger: {}, thresholds: DEFAULT_THRESHOLDS };
const pairs: LabelPair[] = [];
for (const c of corpus) {
  if (!c.reviewerLabels) continue;
  const p = processCallSync(c, CURRENT_POLICY, ctx0);
  for (const f of p.findings) {
    const rv = c.reviewerLabels[f.criterionId];
    if (rv) pairs.push({ callId: c.id, criterionId: f.criterionId, lang: p.language, queue: c.queue, date: c.date, engine: f.verdict, reviewer: rv, source: 'blind-sample' });
  }
}
const ledger = buildLedger(pairs, CURRENT_POLICY.criteria.map((c) => c.id), DEFAULT_THRESHOLDS, AS_OF);
console.log('calls', corpus.length, 'labelled', corpus.filter((c) => c.reviewerLabels).length, 'golden', corpus.filter((c) => c.golden).length);
for (const row of Object.values(ledger)) {
  const s = row.stats;
  console.log(row.key.padEnd(12), String(s.n).padStart(4), s.agreement?.toFixed(2) ?? '  - ', s.kappa?.toFixed(2) ?? '  - ', row.status.padEnd(12), JSON.stringify(s.confusion), 'appl', s.applicabilityDisagreements, row.drift ? 'DRIFT' : '', 'base', row.baseline.kappa?.toFixed(2), 'recent', row.recent.n, row.recent.agreement?.toFixed(2), row.recent.kappa?.toFixed(2));
}
for (const c of heroCalls()) {
  const p = processCallSync(c, CURRENT_POLICY, { ledger, thresholds: DEFAULT_THRESHOLDS });
  console.log(`\n=== ${c.id} lang=${p.language} score=${p.score} autoFail=${p.autoFail} redactions=${p.redactionCount} interruptions=${p.acoustics.interruptions.length}`);
  console.log(p.transcript.map((u) => `${u.id}:${u.lang}:${u.phase}`).join(' '));
  for (const f of p.findings) {
    console.log(` ${f.criterionId} ${f.verdict.padEnd(4)} conf=${f.confidence} gate=${f.gate} ${f.routing.decision} | ${f.rationale}`);
    for (const e of f.evidence) console.log(`     [${fmtTime(e.start)}-${fmtTime(e.end)} ${e.speaker} ${e.match}] ${e.quote}`);
  }
}
