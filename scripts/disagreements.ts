// Lists engine-vs-reviewer disagreements for one criterion. Usage: npx tsx scripts/disagreements.ts Q-VER [lang]
import { DEFAULT_THRESHOLDS } from '../src/engine/calibration';
import { processCallSync } from '../src/engine/pipeline';
import { CURRENT_POLICY } from '../src/data/policy';
import { generateCorpus } from '../src/data/corpus';
const [cid, lang] = process.argv.slice(2);
let shown = 0;
for (const c of generateCorpus()) {
  if (!c.reviewerLabels?.[cid]) continue;
  const p = processCallSync(c, CURRENT_POLICY, { ledger: {}, thresholds: DEFAULT_THRESHOLDS });
  if (lang && p.language !== lang) continue;
  const f = p.findings.find((x) => x.criterionId === cid)!;
  if (f.verdict === c.reviewerLabels[cid]) continue;
  if (shown++ > 8) break;
  console.log(`\n${c.id} ${p.language} engine=${f.verdict} reviewer=${c.reviewerLabels[cid]} :: ${f.rationale}`);
  for (const u of p.transcript) console.log(`  ${u.id} ${u.speaker[0]} ${u.lang} ${u.text}`);
}
