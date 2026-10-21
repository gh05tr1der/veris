import { BookOpen, Gavel, ThumbsUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { LANG_LABEL } from '../engine/lid';
import { QUEUE_NAME } from '../engine/pipeline';
import { AGENTS } from '../data/corpus';
import { AS_OF, decisionFor, processedFor, useStore } from '../state/store';
import { usePlayer } from '../ui/call/Player';
import { FindingCard } from '../ui/call/FindingCard';
import { cx, fmtDate, fmtDateTime, kfmt, Modal, PageHeader, pct, StatusChip } from '../ui/kit';

export default function AgentPortal() {
  const s = useStore();
  const [agentId, setAgentId] = useState('A-101');
  const agent = AGENTS.find((a) => a.id === agentId)!;
  const from = new Date(new Date(AS_OF).getTime() - 30 * 864e5).toISOString();
  const mine = useMemo(() => s.calls.filter((c) => c.agentId === agentId && c.date >= from).sort((a, b) => b.date.localeCompare(a.date)), [s.calls, agentId, from]);
  const [callId, setCallId] = useState<string | null>(null);
  const call = mine.find((c) => c.id === callId) ?? mine[0];
  const p = call ? processedFor(s, call.id) : null;
  const api = usePlayer(call?.audioUrl, call?.duration ?? 60, p?.transcript ?? []);
  const [open, setOpen] = useState<string | null>(null);
  const [contestFor, setContestFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const avg = mine.reduce((a, c) => a + (processedFor(s, c.id).score ?? 0), 0) / Math.max(1, mine.length);
  const criteria = s.policy().criteria.filter((c) => c.queues === 'all' || c.queues.includes(agent.queue));
  const contests = s.contests.filter((c) => c.agentId === agentId);
  const learning = s.assignments.filter((a) => a.agentId === agentId);

  return (
    <div>
      <PageHeader
        title="Agent portal"
        lede="What an agent sees: their own scores with the evidence behind each one, the measured reliability of every criterion they are scored on, and the right to contest any finding."
        actions={
          <select className="field !w-auto" value={agentId} onChange={(e) => { setAgentId(e.target.value); setCallId(null); }} aria-label="View as agent">
            {AGENTS.map((a) => <option key={a.id} value={a.id}>Viewing as {a.name} ({QUEUE_NAME[a.queue]})</option>)}
          </select>
        }
      />
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <div className="panel px-4 py-3"><div className="label">Calls in the last 30 days</div><div className="text-[24px] font-semibold">{mine.length}</div></div>
        <div className="panel px-4 py-3"><div className="label">Average score</div><div className="text-[24px] font-semibold">{avg.toFixed(0)}</div></div>
        <div className="panel px-4 py-3">
          <div className="label">Assigned learning</div>
          {learning.length ? learning.map((l) => <div key={l.criterionId} className="text-[13px] inline-flex items-center gap-1.5 mt-1"><BookOpen size={13} className="text-cobalt" />{l.module}</div>) : <div className="text-[13px] text-muted mt-1">Nothing assigned.</div>}
        </div>
      </div>

      <div className="grid lg:grid-cols-[300px_minmax(0,1fr)] gap-4">
        <div className="panel max-h-[620px] overflow-y-auto">
          <div className="px-3 py-2 border-b border-line label">Your calls</div>
          {mine.map((c) => {
            const pc = processedFor(s, c.id);
            return (
              <button key={c.id} className={cx('w-full text-left px-3 py-2 border-b border-line hover:bg-sunk', call?.id === c.id && 'bg-cobaltsoft/60')} onClick={() => { setCallId(c.id); setOpen(null); }}>
                <div className="flex items-center">
                  <span className="text-[13px] font-medium">{c.id}</span>
                  <span className={cx('ml-auto font-semibold tabular-nums', (pc.score ?? 0) >= 85 ? 'text-pass' : (pc.score ?? 0) >= 65 ? 'text-advisory' : 'text-fail')}>{pc.score}</span>
                </div>
                <div className="text-[11px] text-muted">{fmtDateTime(c.date)} · {pc.findings.filter((f) => f.verdict === 'fail').length} to improve</div>
              </button>
            );
          })}
        </div>

        <div className="space-y-4 min-w-0">
          {call && p && (
            <div className="panel p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h2">{call.id}</div>
                <span className="text-[12px] text-muted">{fmtDateTime(call.date)} · {LANG_LABEL[p.language]}</span>
                <button className="btn ml-auto" onClick={api.toggle}>{api.playing ? 'Pause' : call.audioUrl ? 'Play recording' : 'Read aloud'}</button>
              </div>
              <div className="space-y-2">
                {p.findings.filter((f) => f.verdict !== 'na').sort((a, b) => (a.verdict === 'fail' ? -1 : 1) - (b.verdict === 'fail' ? -1 : 1)).map((f) => (
                  <FindingCard
                    key={f.criterionId}
                    f={f}
                    open={open === f.criterionId}
                    onToggle={() => setOpen(open === f.criterionId ? null : f.criterionId)}
                    onPlay={api.playRange}
                    decision={decisionFor(s.decisions, call.id, f.criterionId)}
                    langLabel={LANG_LABEL[p.language]}
                    agentView
                    onContest={contests.some((c) => c.callId === call.id && c.criterionId === f.criterionId) ? undefined : () => { setContestFor(f.criterionId); setReason(''); }}
                  />
                ))}
              </div>
              {p.findings.some((f) => f.verdict === 'pass' && f.evidence.length) && (
                <div className="mt-3 text-[13px] text-pass inline-flex items-center gap-1.5"><ThumbsUp size={14} />{p.findings.filter((f) => f.verdict === 'pass').length} criteria met on this call.</div>
              )}
            </div>
          )}

          <div className="panel p-4">
            <div className="h2 mb-1">How reliable is each criterion you are scored on?</div>
            <p className="text-[12px] text-muted mb-2">Agreement between VERIS and senior reviewers. Criteria marked advisory are always confirmed by a person before they count.</p>
            <table className="tbl w-full text-[13px]">
              <thead><tr><th>Criterion</th><th>English</th><th>Hinglish</th></tr></thead>
              <tbody>
                {criteria.map((c) => (
                  <tr key={c.id}>
                    <td>{c.text}</td>
                    {(['en', 'hi-en'] as const).map((l) => {
                      const r = s.ledger[`${c.id}|${l}`];
                      return <td key={l} className="whitespace-nowrap">κ {kfmt(r?.stats.kappa)} · {pct(r?.stats.agreement)}<div><StatusChip status={r?.status ?? 'insufficient'} /></div></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {contests.length > 0 && (
            <div className="panel p-4">
              <div className="h2 mb-2">Your contests</div>
              {contests.map((c) => (
                <div key={c.id} className="text-[13px] border-t border-line first:border-0 py-2">
                  <div className="flex items-center gap-2"><Gavel size={13} />{c.callId} · {c.criterionId}<span className={cx('ml-auto font-medium', c.status === 'open' ? 'text-review' : c.status === 'upheld' ? 'text-pass' : 'text-muted')}>{c.status === 'open' ? 'Awaiting ruling' : c.status === 'upheld' ? 'Upheld' : 'Not upheld'}</span></div>
                  <div className="text-muted">“{c.reason}” · {fmtDate(c.ts)}</div>
                  {c.ruling && <div className="mt-0.5">Ruling: {c.ruling}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={!!contestFor} onClose={() => setContestFor(null)} title={`Contest ${contestFor}`}>
        <p className="text-[13px] text-muted mb-2">Explain why the finding is wrong. A senior reviewer will listen to the cited moment and rule. Either way, the ruling becomes a labelled example that improves VERIS.</p>
        <textarea className="field min-h-[90px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. I disclosed the charge earlier in the call, before confirming." />
        <div className="flex justify-end mt-3">
          <button className="btn-primary" disabled={reason.trim().length < 8} onClick={async () => { await s.contest(call!.id, contestFor!, reason.trim()); setContestFor(null); }}>Submit contest</button>
        </div>
      </Modal>
    </div>
  );
}
