// Prints discovery clusters, scorecard efficacy and coaching items. Usage: npx tsx scripts/insights-report.ts
import { DEFAULT_THRESHOLDS } from '../src/engine/calibration';
import { processCallSync } from '../src/engine/pipeline';
import { discover } from '../src/engine/discovery';
import { efficacy } from '../src/engine/efficacy';
import { buildCoaching, coachingEffect } from '../src/engine/coaching';
import { replay } from '../src/engine/regression';
import { CURRENT_POLICY, POLICY_HISTORY } from '../src/data/policy';
import { AS_OF, generateCorpus } from '../src/data/corpus';
import { heroCalls } from '../src/data/heroCalls';

const calls = [...generateCorpus(), ...heroCalls()];
const processed = Object.fromEntries(calls.map((c) => [c.id, processCallSync(c, CURRENT_POLICY, { ledger: {}, thresholds: DEFAULT_THRESHOLDS })]));
const t0 = Date.now();
const docs = calls.map((c) => ({ id: c.id, date: c.date, text: processed[c.id].transcript.filter((u) => u.speaker === 'customer').map((u) => u.text).join(' ') }));
const d = discover(docs, CURRENT_POLICY.criteria, AS_OF);
console.log('discovery ms', Date.now() - t0, 'k', d.k, 'sil', d.silhouette.toFixed(3));
for (const c of d.clusters) console.log(c.size, c.emerging ? 'EMERGING' : '', c.growth?.toFixed(2), c.label, '|', c.terms.join(' '), '| covered:', c.covered?.criterionId, c.weekly.map((w) => w.count).join(','));
console.log('\nEFFICACY');
for (const r of efficacy(calls.filter((c) => c.source !== 'demo-recording'), processed, CURRENT_POLICY.criteria)) console.log(r.criterionId, r.verdict.padEnd(12), r.nPass, r.nFail, r.repeatPass?.toFixed(2), r.repeatFail?.toFixed(2), r.pRepeat?.toFixed(4), r.orAdjusted?.toFixed(2), r.pCsat?.toFixed(3), '|', r.note);
console.log('\nCOACHING');
for (const i of buildCoaching(calls, processed, CURRENT_POLICY.criteria, AS_OF, [{ agentId: 'A-103', criterionId: 'Q-VER', date: '2026-09-28', module: 'x' }])) console.log(i.agentName, i.criterionId, i.occurrences.length, '/', i.applicable, i.rootCause.type);
console.log(coachingEffect(calls, processed, 'A-103', 'Q-VER', '2026-09-28'));
const golden = calls.filter((c) => c.golden);
const rr = replay(golden, POLICY_HISTORY[1], POLICY_HISTORY[2]);
console.log('\nREGRESSION v2->v3', rr.summary, rr.perCriterion.filter((x) => x.status !== 'unchanged').map((x) => [x.criterionId, x.status, x.flips, x.agreementBefore?.toFixed(2), x.agreementAfter?.toFixed(2)]));
const r1 = replay(golden, POLICY_HISTORY[0], POLICY_HISTORY[1]);
console.log('REGRESSION v1->v2', r1.summary);
