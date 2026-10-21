import { Gavel } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LANG_LABEL } from '../engine/lid';
import { QUEUE_NAME } from '../engine/pipeline';
import { useStore } from '../state/store';
import { usePlayer } from '../ui/call/Player';
import { FindingCard } from '../ui/call/FindingCard';
import { cx, Drawer, Empty, fmtDateTime, PageHeader, RoutingBadge, VerdictBadge } from '../ui/kit';
import { QUEUE_WINDOW_DAYS, type ReviewItem, reviewItems } from '../ui/selectors';

type Filter = 'all' | 'human_review' | 'advisory' | 'suppressed' | 'contest';

export default function ReviewQueue() {
  const s = useStore();
  const items = reviewItems(s);
  const [filter, setFilter] = useState<Filter>('all');
  const [sel, setSel] = useState<ReviewItem | null>(null);
  const shown = items.filter((i) => filter === 'all' || (filter === 'contest' ? i.kind === 'contest' : i.kind === 'finding' && i.finding.routing.decision === filter));
  const count = (f: Filter) => items.filter((i) => (f === 'contest' ? i.kind === 'contest' : i.kind === 'finding' && i.finding.routing.decision === f)).length;
  const reviewedToday = s.decisions.length;

  return (
    <div>
      <PageHeader
        title="Review queue"
        lede={`Findings VERIS may not publish on its own for the last ${QUEUE_WINDOW_DAYS} days, ordered by risk rather than arrival. Each ruling is recorded as a labelled example and updates the Calibration Ledger immediately.`}
      />
      <div className="flex flex-wrap gap-2 mb-3">
        {([
          ['all', 'Everything', items.length],
          ['human_review', 'Mandatory review', count('human_review')],
          ['suppressed', 'Withheld by evidence gate', count('suppressed')],
          ['advisory', 'Advisory failures', count('advisory')],
          ['contest', 'Agent contests', count('contest')],
        ] as [Filter, string, number][]).map(([f, l, n]) => (
          <button key={f} className={cx('rounded-full border px-3 py-1 text-[13px]', filter === f ? 'border-cobalt bg-cobaltsoft text-cobalt font-medium' : 'border-line text-muted hover:text-ink')} onClick={() => setFilter(f)}>
            {l} <span className="tabular-nums">{n}</span>
          </button>
        ))}
        <span className="ml-auto text-[12px] text-muted self-center">{reviewedToday} ruling{reviewedToday === 1 ? '' : 's'} recorded this session</span>
      </div>
      {shown.length === 0 ? (
        <Empty title="Nothing waiting here">Every finding in this filter has a ruling. New findings arrive as calls are evaluated.</Empty>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="tbl w-full text-[13px]">
            <thead>
              <tr>
                <th className="text-right">Risk</th>
                <th>Proposed</th>
                <th>Criterion</th>
                <th>Interaction</th>
                <th>Why it is here</th>
                <th>Route</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 150).map((it) => (
                <tr key={it.key} className="cursor-pointer" onClick={() => setSel(it)}>
                  <td className="text-right tabular-nums font-semibold">{it.priority}</td>
                  <td><VerdictBadge v={it.finding.verdict} /></td>
                  <td className="max-w-[340px]"><span className="font-mono text-[11px] text-faint mr-1.5">{it.finding.criterionId}</span>{it.finding.criterionText}</td>
                  <td className="whitespace-nowrap">
                    <div className="font-medium">{it.call.id}</div>
                    <div className="text-[11px] text-muted">{it.call.agentName} · {QUEUE_NAME[it.call.queue]}</div>
                  </td>
                  <td className="text-[12px] text-muted max-w-[360px]">{it.reason}</td>
                  <td>{it.kind === 'contest' ? <span className="inline-flex items-center gap-1 text-[11px] font-medium text-review"><Gavel size={12} />Contest</span> : <RoutingBadge d={it.finding.routing.decision} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sel && <ReviewDrawer item={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function ReviewDrawer({ item, onClose }: { item: ReviewItem; onClose: () => void }) {
  const s = useStore();
  const api = usePlayer(item.call.audioUrl, item.call.duration, item.processed.transcript);
  const [ruling, setRuling] = useState('');
  const close = () => onClose();
  return (
    <Drawer open onClose={close} title={`${item.call.id} · ${item.finding.criterionId}`} width={640}>
      <div className="text-[12px] text-muted mb-3">
        {item.call.agentName} · {QUEUE_NAME[item.call.queue]} · {fmtDateTime(item.call.date)} · <Link className="text-cobalt" to={`/calls/${item.call.id}`}>Open full audit</Link>
      </div>
      {item.contest && (
        <div className="rounded-md border border-review/40 bg-reviewsoft p-3 mb-3">
          <div className="text-[13px]"><b>{item.contest.agentName}</b> contested this finding on {fmtDateTime(item.contest.ts)}:</div>
          <div className="text-[13px] mt-1">“{item.contest.reason}”</div>
          <textarea className="field mt-2" placeholder="Ruling, visible to the agent" value={ruling} onChange={(e) => setRuling(e.target.value)} />
          <div className="flex gap-2 mt-2">
            <button className="btn-primary" disabled={!ruling.trim()} onClick={async () => { await s.resolveContest(item.contest!.id, true, ruling.trim()); close(); }}>Uphold contest (flip verdict)</button>
            <button className="btn" disabled={!ruling.trim()} onClick={async () => { await s.resolveContest(item.contest!.id, false, ruling.trim()); close(); }}>Reject contest</button>
          </div>
        </div>
      )}
      <FindingCard
        f={item.finding}
        criterion={s.policy().criteria.find((c) => c.id === item.finding.criterionId)}
        open
        onToggle={() => undefined}
        onPlay={(a, b) => api.playRange(a, b)}
        onDecide={item.contest ? undefined : async (v) => { await s.decide(item.call.id, item.finding.criterionId, v); close(); }}
        langLabel={LANG_LABEL[item.processed.language]}
      />
      <div className="mt-4">
        <div className="label mb-1">Context</div>
        <div className="space-y-1.5 text-[13px] max-h-[320px] overflow-y-auto pr-1">
          {item.processed.transcript.map((u) => {
            const cited = item.finding.evidence.some((e) => e.utteranceId === u.id);
            return (
              <div key={u.id} className={cx('rounded px-2 py-1', cited && 'bg-cobaltsoft')}>
                <span className={cx('font-semibold text-[12px] mr-2', u.speaker === 'agent' ? 'text-agent' : 'text-customer')}>{u.speaker === 'agent' ? 'Agent' : 'Customer'}</span>
                {u.text}
              </div>
            );
          })}
        </div>
      </div>
    </Drawer>
  );
}
