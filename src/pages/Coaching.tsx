import { ArrowRight, BookOpen, CheckCircle2, Star } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { buildCoaching, coachingEffect, MODULES, strengthsFor } from '../engine/coaching';
import { fmtTime } from '../engine/text';
import { AS_OF, useStore } from '../state/store';
import { fmtDate, PageHeader, pct, SeverityTag } from '../ui/kit';

export default function Coaching() {
  const s = useStore();
  const policy = s.policy();
  const items = useMemo(() => buildCoaching(s.calls, s.processed, policy.criteria, AS_OF, s.assignments), [s.calls, s.processed, policy, s.assignments]);
  const byAgent = items.reduce<Record<string, typeof items>>((a, i) => ((a[i.agentName] ??= []).push(i), a), {});
  const best = useMemo(() => {
    const ids = s.calls.filter((c) => (s.processed[c.id]?.score ?? 0) >= 95).map((c) => c.id);
    const all = strengthsFor(ids, s.processed);
    // up to three examples per behaviour so the library is not dominated by one criterion
    return ['Q-EMP', 'Q-DIS', 'Q-HRD'].flatMap((id) => all.filter((x) => x.criterionId === id).slice(0, 3)).slice(0, 6);
  }, [s.calls, s.processed]);

  return (
    <div>
      <PageHeader title="Coaching" lede="Recurring, evidenced weaknesses from the last 30 days, turned into one coaching item each: issue, evidence the agent can replay, probable root cause, action, a short module, and a follow-up measurement window. Built only from criteria that have earned reliability in the call’s language, so measurement error never becomes coaching. At most two items per agent, highest risk first." />

      <section className="mb-6">
        <h2 className="h2 mb-2">Follow-ups in progress</h2>
        <div className="grid md:grid-cols-2 gap-3">
          {s.assignments.map((a) => {
            const e = coachingEffect(s.calls, s.processed, a.agentId, a.criterionId, a.date);
            const agent = s.calls.find((c) => c.agentId === a.agentId)?.agentName ?? a.agentId;
            const improved = e.before.failRate != null && e.after.failRate != null && e.after.failRate < e.before.failRate;
            return (
              <div key={`${a.agentId}${a.criterionId}`} className="panel p-4">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{agent}</span>
                  <span className="font-mono text-[11px] text-faint">{a.criterionId}</span>
                  <span className="ml-auto text-[12px] text-muted">assigned {fmtDate(a.date)}</span>
                </div>
                <div className="text-[13px] text-muted">{a.module}</div>
                <div className="flex items-center gap-4 mt-2">
                  <div><div className="label">Fail rate before</div><div className="text-[18px] font-semibold">{pct(e.before.failRate)}</div><div className="text-[11px] text-muted">{e.before.n} calls</div></div>
                  <ArrowRight size={16} className="text-faint" />
                  <div><div className="label">Since assignment</div><div className={`text-[18px] font-semibold ${improved ? 'text-pass' : ''}`}>{e.after.n ? pct(e.after.failRate) : '—'}</div><div className="text-[11px] text-muted">{e.after.n} calls{e.after.n < 20 ? ` · ${20 - e.after.n} to go` : ''}</div></div>
                  {improved && <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-pass"><CheckCircle2 size={14} />Improving</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-5">
        {Object.entries(byAgent).map(([agent, list]) => (
          <div key={agent}>
            <h2 className="h2 mb-2">{agent}</h2>
            <div className="grid xl:grid-cols-2 gap-3">
              {list.map((it) => {
                const crit = policy.criteria.find((c) => c.id === it.criterionId)!;
                const assigned = s.assignments.some((a) => a.agentId === it.agentId && a.criterionId === it.criterionId);
                return (
                  <div key={it.criterionId} className="panel p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[11px] text-faint">{it.criterionId}</span>
                      <SeverityTag s={crit.severity} />
                      <span className="ml-auto text-[12px] text-muted">{it.occurrences.length} of {it.applicable} applicable calls ({pct(it.failRate)})</span>
                    </div>
                    <ol className="space-y-2.5 text-[13px] mt-2">
                      <Step n={1} k="Issue">{it.criterionText}</Step>
                      <Step n={2} k="Evidence">
                        <div className="flex flex-wrap gap-1.5 mt-0.5">
                          {it.occurrences.slice(0, 6).map((o) => (
                            <Link key={o.callId} to={`/calls/${o.callId}`} className="rounded border border-line px-1.5 py-0.5 text-[12px] hover:border-cobalt/60" title={o.rationale}>
                              {fmtDate(o.date)} · {o.callId.slice(-4)}{o.evidence[0] ? ` @ ${fmtTime(o.evidence[o.evidence.length - 1].start)}` : ''}
                            </Link>
                          ))}
                          {it.occurrences.length > 6 && <span className="text-[12px] text-muted">+{it.occurrences.length - 6} more</span>}
                        </div>
                      </Step>
                      <Step n={3} k={`Probable root cause · ${it.rootCause.type}`}>{it.rootCause.text}</Step>
                      <Step n={4} k="Recommended action">{it.action}</Step>
                      <Step n={5} k="Micro-learning">
                        <span className="inline-flex items-center gap-1.5"><BookOpen size={13} className="text-cobalt" />{it.module.title} · {it.module.minutes} min</span>
                      </Step>
                      <Step n={6} k="Follow-up">{it.followUp}</Step>
                    </ol>
                    <div className="mt-3 flex justify-end">
                      {assigned ? (
                        <span className="text-[12px] font-medium text-pass inline-flex items-center gap-1"><CheckCircle2 size={13} />Assigned in LMS</span>
                      ) : (
                        <button className="btn-primary" onClick={() => void s.assign({ agentId: it.agentId, criterionId: it.criterionId, date: AS_OF.slice(0, 10), module: `${it.module.title} (${it.module.minutes} min)` })}>Assign module</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-6">
        <h2 className="h2 mb-2 inline-flex items-center gap-2"><Star size={15} className="text-advisory" />Best-practice library</h2>
        <p className="text-[13px] text-muted mb-2">Moments from top-scoring calls where the agent handled a hard moment well. Used as positive examples in new-hire training.</p>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {best.map((b) => (
            <Link key={b.callId + b.criterionId} to={`/calls/${b.callId}`} className="panel p-3 hover:border-cobalt/60">
              <div className="text-[12px] text-muted">{b.callId} · {MODULES[b.criterionId]?.title ?? b.criterionId}</div>
              <div className="text-[13px] mt-1">“{b.evidence[0]?.quote}”</div>
              <div className="text-[12px] text-muted mt-1">{b.text}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function Step({ n, k, children }: { n: number; k: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[22px_1fr] gap-2">
      <span className="w-5 h-5 rounded-full bg-cobaltsoft text-cobalt text-[11px] font-semibold flex items-center justify-center">{n}</span>
      <div>
        <div className="text-[11px] font-medium text-muted">{k}</div>
        <div>{children}</div>
      </div>
    </li>
  );
}
