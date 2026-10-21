import { AlertTriangle, ArrowRight, Headphones, ShieldCheck, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { discover } from '../engine/discovery';
import { QUEUE_NAME } from '../engine/pipeline';
import { fmtClock } from '../engine/text';
import { HERO_META } from '../data/heroCalls';
import { AS_OF, processedFor, useStore } from '../state/store';
import { WeekBars } from '../ui/charts';
import { fmtDate, pct, RoutingBadge, ScoreDial, Stat, VerdictBadge } from '../ui/kit';
import { kpis, reviewItems } from '../ui/selectors';

export default function Overview() {
  const s = useStore();
  const k = kpis(s);
  const queue = reviewItems(s);
  const rows = Object.values(s.ledger);
  const withData = rows.filter((r) => r.stats.n > 0);
  const auto = withData.filter((r) => r.status === 'auto').length;
  const drift = rows.filter((r) => r.drift);
  const emerging = useMemo(() => {
    const docs = s.calls.map((c) => ({ id: c.id, date: c.date, text: s.processed[c.id].transcript.filter((u) => u.speaker === 'customer').map((u) => u.text).join(' ') }));
    return discover(docs, s.policy().criteria, AS_OF).clusters.filter((c) => c.emerging);
  }, [s.calls, s.processed]);

  return (
    <div>
      <div className="mb-6 max-w-[78ch]">
        <h1 className="text-[28px] font-semibold tracking-tight leading-tight">Every call evaluated. Every score evidenced. Every criterion measured for how far it can be trusted.</h1>
        <p className="text-muted mt-2">
          {k.calls} interactions to {fmtDate(AS_OF)} across three client queues. VERIS scored all of them against policy v{s.activeVersion}; senior reviewers had sampled {pct(k.sampledShare)} blind. Their labels are what the Calibration Ledger measures against.
        </p>
      </div>

      <section className="mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="h2">Demo recordings</h2>
          <span className="text-[12px] text-muted">Start with the first call: it carries the full story.</span>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3">
          {HERO_META.map((h, i) => {
            const p = processedFor(s, h.id);
            const call = s.calls.find((c) => c.id === h.id)!;
            const fails = p.findings.filter((f) => f.verdict === 'fail');
            return (
              <Link key={h.id} to={`/calls/${h.id}`} className={`panel p-3 hover:border-cobalt/60 transition-colors flex flex-col ${i === 0 ? 'xl:col-span-1 ring-2 ring-cobalt/25' : ''}`}>
                <div className="flex items-start gap-3">
                  <ScoreDial score={p.score} autoFail={p.autoFail} size={54} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold leading-snug">{h.title}</div>
                    <div className="text-[12px] text-muted">{call.agentName} · {fmtClock(call.duration)}</div>
                  </div>
                </div>
                <div className="text-[12px] text-muted mt-2 flex-1">{h.blurb}</div>
                <div className="flex items-center gap-2 mt-2 text-[12px]">
                  <Headphones size={13} className="text-cobalt" />
                  <span className="text-cobalt font-medium">Open audit</span>
                  <span className="ml-auto text-muted">{fails.length} failed</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-6">
        <Stat label="Interaction coverage" value={pct(k.coverage)} sub={`vs ${pct(k.sampledShare)} by manual sampling`} tone="pass" />
        <Stat label="Findings with verified evidence" value={pct(k.evidenceRate, 1)} sub="unevidenced verdicts are withheld" />
        <Stat label="Auto-published findings" value={pct(k.autoRate)} sub="only where reliability is earned" />
        <Stat label="Average QA score" value={k.avgScore.toFixed(0)} sub="weighted, critical fails flagged" />
        <Stat label="Calls with a compliance failure" value={pct(k.callsWithCompliance)} sub={`examined on every call · ${k.autoFails} critical`} tone="fail" />
        <Stat label="Awaiting a reviewer" value={queue.length} sub="risk-ordered, this week" />
      </section>

      <section className="grid lg:grid-cols-3 gap-4">
        <div className="panel p-4">
          <div className="flex items-center gap-2 mb-1"><ShieldCheck size={16} className="text-pass" /><h2 className="h2">Calibration</h2></div>
          <p className="text-[13px] text-muted mb-3">{auto} of {withData.length} criterion × language pairs have earned automatic publishing. The rest are computed but need a human to confirm.</p>
          {drift.map((d) => (
            <div key={d.key} className="rounded-md border border-advisory/40 bg-advisorysoft px-3 py-2 text-[13px] mb-2">
              <span className="inline-flex items-center gap-1 font-semibold text-advisory"><AlertTriangle size={13} />Drift on {d.criterionId} ({d.lang === 'en' ? 'English' : 'Hinglish'})</span>
              <div className="text-[12px] mt-0.5">{d.reason}</div>
            </div>
          ))}
          <Link to="/ledger" className="text-[13px] text-cobalt inline-flex items-center gap-1">Open the ledger <ArrowRight size={13} /></Link>
        </div>

        <div className="panel p-4">
          <div className="flex items-center gap-2 mb-1"><TrendingUp size={16} className="text-customer" /><h2 className="h2">Emerging issues</h2></div>
          {emerging.length === 0 && <p className="text-[13px] text-muted">No cluster is growing fast enough to flag.</p>}
          {emerging.slice(0, 2).map((c) => (
            <div key={c.id} className="mb-3">
              <div className="text-[13px] font-semibold">{c.label}</div>
              <div className="flex items-center gap-3 mt-1">
                <WeekBars counts={c.weekly.map((w) => w.count)} labels={c.weekly.map((w) => fmtDate(w.week))} highlightFrom={3} />
                <div className="text-[12px] text-muted">
                  <b className="text-ink">{c.size}</b> calls<br />+{((c.growth ?? 0) * 100).toFixed(0)}% in the last 3 weeks
                </div>
              </div>
              <div className="text-[12px] text-muted mt-1">“{c.examples[0]?.text}”</div>
            </div>
          ))}
          <Link to="/insights" className="text-[13px] text-cobalt inline-flex items-center gap-1">See all clusters <ArrowRight size={13} /></Link>
        </div>

        <div className="panel p-4">
          <h2 className="h2 mb-2">Top of the review queue</h2>
          <ul className="space-y-2">
            {queue.slice(0, 5).map((it) => (
              <li key={it.key}>
                <Link to={`/calls/${it.call.id}`} className="block rounded-md hover:bg-sunk -mx-2 px-2 py-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-mono text-faint">{it.call.id}</span>
                    <VerdictBadge v={it.finding.verdict} />
                    <span className="ml-auto">{it.kind === 'contest' ? <span className="text-[11px] font-medium text-review">Contest</span> : <RoutingBadge d={it.finding.routing.decision} />}</span>
                  </div>
                  <div className="text-[13px] leading-snug mt-0.5">{it.finding.criterionText}</div>
                  <div className="text-[11px] text-muted">{it.call.agentName} · {QUEUE_NAME[it.call.queue]}</div>
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/review" className="text-[13px] text-cobalt inline-flex items-center gap-1 mt-2">Open the queue <ArrowRight size={13} /></Link>
        </div>
      </section>
    </div>
  );
}
