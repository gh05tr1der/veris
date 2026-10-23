import { CircleSlash, Scale, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { discover } from '../engine/discovery';
import { efficacy, type EfficacyRow } from '../engine/efficacy';
import { QUEUE_NAME } from '../engine/pipeline';
import type { QueueId } from '../engine/types';
import { AS_OF, useStore } from '../state/store';
import { Bar, LineChart, WeekBars } from '../ui/charts';
import { cx, fmtDate, PageHeader, pct } from '../ui/kit';

const W = 6;
const windowIdx = (d: string) => W - 1 - Math.floor((new Date(AS_OF).getTime() - new Date(d).getTime()) / (7 * 864e5));
const windowLabels = Array.from({ length: W }, (_, i) => fmtDate(new Date(new Date(AS_OF).getTime() - (W - i) * 7 * 864e5 + 864e5).toISOString()));

export default function Insights() {
  const s = useStore();
  const policy = s.policy();
  const corpus = useMemo(() => s.calls.filter((c) => c.source === 'synthetic-corpus'), [s.calls]);
  const trend = useMemo(() => {
    return (['INS', 'CRD', 'COL'] as QueueId[]).map((q, qi) => {
      const vals = Array.from({ length: W }, (_, w) => {
        const xs = corpus.filter((c) => c.queue === q && windowIdx(c.date) === w).map((c) => s.processed[c.id].score).filter((x): x is number => x != null);
        return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
      });
      return { name: QUEUE_NAME[q], color: `rgb(var(--s${qi + 1}))`, values: vals };
    });
  }, [corpus, s.processed]);
  const disc = useMemo(() => {
    const docs = s.calls.map((c) => ({ id: c.id, date: c.date, text: s.processed[c.id].transcript.filter((u) => u.speaker === 'customer').map((u) => u.text).join(' ') }));
    return discover(docs, policy.criteria, AS_OF);
  }, [s.calls, s.processed, policy]);
  const eff = useMemo(() => efficacy(corpus, s.processed, policy.criteria), [corpus, s.processed, policy]);
  const agents = useMemo(() => {
    const m = new Map<string, { name: string; queue: QueueId; n: number; score: number; crit: number }>();
    for (const c of corpus) {
      const p = s.processed[c.id];
      const r = m.get(c.agentId) ?? { name: c.agentName, queue: c.queue, n: 0, score: 0, crit: 0 };
      r.n++;
      r.score += p.score ?? 0;
      r.crit += p.findings.filter((f) => f.category === 'compliance' && f.verdict === 'fail').length;
      m.set(c.agentId, r);
    }
    return [...m.entries()].map(([id, r]) => ({ id, ...r, score: r.score / r.n, critRate: r.crit / r.n })).sort((a, b) => a.score - b.score);
  }, [corpus, s.processed]);

  return (
    <div>
      <PageHeader title="Insights" lede="What the full population of conversations says: quality trends, issues nobody wrote a QA question about, and whether each question on the scorecard predicts anything customers experience." />

      <section className="panel p-4 mb-5">
        <h2 className="h2">Average QA score by queue, weekly</h2>
        <p className="text-[12px] text-muted mb-2">Rolling 7-day windows ending {fmtDate(AS_OF)}. Hover for values.</p>
        <LineChart ariaLabel="Average QA score by queue per week" labels={windowLabels} series={trend} yMin={40} yMax={100} height={220} />
      </section>

      <section className="mb-5">
        <h2 className="h2 mb-1 inline-flex items-center gap-2"><TrendingUp size={16} className="text-customer" />Emerging issues</h2>
        <p className="text-[13px] text-muted mb-2">
          Unsupervised clustering of what customers said (TF-IDF with bigrams, cosine k-means, k = {disc.k} chosen by silhouette {disc.silhouette.toFixed(2)}). A cluster is flagged as emerging when its last three weeks clearly exceed the three before (one-sided binomial test, p &lt; 0.01).
        </p>
        <div className="panel overflow-x-auto">
          <table className="tbl w-full text-[13px]">
            <thead>
              <tr><th>Cluster (top terms)</th><th>Weekly volume</th><th className="text-right">Calls</th><th className="text-right">3-week growth</th><th>Example</th><th>Scorecard link</th></tr>
            </thead>
            <tbody>
              {disc.clusters.map((c) => (
                <tr key={c.id}>
                  <td className="max-w-[240px]">
                    <div className="font-medium">{c.label}</div>
                    <div className="text-[11px] text-muted">{c.terms.slice(3).join(' · ')}</div>
                    {c.emerging && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-customer mt-0.5"><TrendingUp size={11} />Emerging</span>}
                  </td>
                  <td><WeekBars counts={c.weekly.map((w) => w.count)} labels={c.weekly.map((w) => fmtDate(w.week))} highlightFrom={3} width={120} height={30} /></td>
                  <td className="text-right tabular-nums">{c.size}</td>
                  <td className={cx('text-right tabular-nums font-medium', (c.growth ?? 0) > 0.5 && 'text-customer')}>{c.growth == null ? '—' : `${c.growth >= 0 ? '+' : ''}${(c.growth * 100).toFixed(0)}%`}</td>
                  <td className="max-w-[320px] text-[12px]">
                    <Link className="text-cobalt" to={`/calls/${c.examples[0]?.callId}`}>{c.examples[0]?.callId}</Link> “{c.examples[0]?.text}”
                  </td>
                  <td className="text-[12px] text-muted max-w-[200px]">{c.covered ? <>Related to <b className="text-ink">{c.covered.criterionId}</b> via “{c.covered.term}”</> : 'No QA criterion covers this'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-4 text-[12px] text-muted mt-2">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[rgb(var(--s1))]" />earlier three weeks</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[rgb(var(--s2))]" />last three weeks</span>
        </div>
      </section>

      <section className="mb-5">
        <h2 className="h2 mb-1 inline-flex items-center gap-2"><Scale size={16} className="text-cobalt" />Scorecard efficacy</h2>
        <p className="text-[13px] text-muted mb-2 max-w-[100ch]">
          Audits the scorecard, not the agent. For each criterion, outcomes already in CRM (repeat contact within 7 days, escalation, CSAT) are compared between calls that passed and calls that failed it. Tests are stratified by agent (Cochran–Mantel–Haenszel; CSAT centred per agent) so a weak agent cannot make an unrelated criterion look predictive; α = 0.01 per test.
        </p>
        <div className="panel overflow-x-auto">
          <table className="tbl w-full text-[13px]">
            <thead>
              <tr><th>Criterion</th><th className="text-right">Pass / fail</th><th>Repeat contact (pass vs fail)</th><th className="text-right">Adj. odds ratio</th><th className="text-right">CSAT pass / fail</th><th>Finding</th></tr>
            </thead>
            <tbody>
              {eff.map((r) => (
                <tr key={r.criterionId}>
                  <td className="max-w-[300px]"><span className="font-mono text-[11px] text-faint mr-1.5">{r.criterionId}</span>{r.criterionText}</td>
                  <td className="text-right tabular-nums whitespace-nowrap">{r.nPass} / {r.nFail}</td>
                  <td className="min-w-[170px]">
                    <div className="flex items-center gap-2 text-[12px] tabular-nums"><span className="w-9">{pct(r.repeatPass)}</span><Bar value={r.repeatPass ?? 0} max={0.6} className="flex-1" /></div>
                    <div className="flex items-center gap-2 text-[12px] tabular-nums mt-1"><span className="w-9">{pct(r.repeatFail)}</span><Bar value={r.repeatFail ?? 0} max={0.6} tone="s2" className="flex-1" /></div>
                  </td>
                  <td className="text-right tabular-nums">{r.orAdjusted == null ? '—' : r.orAdjusted.toFixed(1)}</td>
                  <td className="text-right tabular-nums whitespace-nowrap">{r.csatPass?.toFixed(1) ?? '—'} / {r.csatFail?.toFixed(1) ?? '—'}</td>
                  <td className="max-w-[360px]"><EffVerdict r={r} /><div className="text-[12px] text-muted mt-0.5">{r.note}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-4 text-[12px] text-muted mt-2">
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-[rgb(var(--s1))]" />repeat-contact rate when passed</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-1.5 rounded bg-[rgb(var(--s2))]" />when failed</span>
        </div>
      </section>

      <section>
        <h2 className="h2 mb-2">Quality by agent (pilot period)</h2>
        <div className="panel overflow-x-auto">
          <table className="tbl w-full text-[13px]">
            <thead><tr><th>Agent</th><th>Queue</th><th className="text-right">Calls</th><th className="text-right">Avg score</th><th className="text-right">Compliance fails / call</th></tr></thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id}>
                  <td className="font-medium">{a.name}</td>
                  <td>{QUEUE_NAME[a.queue]}</td>
                  <td className="text-right tabular-nums">{a.n}</td>
                  <td className="text-right tabular-nums">{a.score.toFixed(0)}</td>
                  <td className="text-right tabular-nums">{a.critRate.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function EffVerdict({ r }: { r: EfficacyRow }) {
  const m = {
    predictive: { cls: 'text-pass', label: 'Predicts outcomes', icon: TrendingUp },
    'no-link': { cls: 'text-advisory', label: 'No measurable link · review', icon: CircleSlash },
    inconclusive: { cls: 'text-muted', label: 'Inconclusive', icon: CircleSlash },
    regulatory: { cls: 'text-cobalt', label: 'Regulatory control', icon: Scale },
  }[r.verdict];
  const I = m.icon;
  return <span className={cx('inline-flex items-center gap-1 text-[12px] font-semibold', m.cls)}><I size={12} />{m.label}</span>;
}
