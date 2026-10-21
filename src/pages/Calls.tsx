import { Headphones, Search, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QUEUE_NAME } from '../engine/pipeline';
import { fmtClock } from '../engine/text';
import type { QueueId } from '../engine/types';
import { processedFor, useStore } from '../state/store';
import { cx, fmtDateTime, LangTag, PageHeader } from '../ui/kit';

export default function Calls() {
  const s = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [queue, setQueue] = useState<'all' | QueueId>('all');
  const [lang, setLang] = useState<'all' | 'en' | 'hi-en'>('all');
  const [status, setStatus] = useState<'all' | 'published' | 'in_review' | 'critical'>('all');
  const [limit, setLimit] = useState(60);
  const rows = useMemo(() => {
    return [...s.calls]
      .sort((a, b) => (a.source === 'synthetic-corpus' ? 1 : 0) - (b.source === 'synthetic-corpus' ? 1 : 0) || b.date.localeCompare(a.date))
      .map((c) => ({ c, p: processedFor(s, c.id) }))
      .filter(({ c, p }) => {
        if (queue !== 'all' && c.queue !== queue) return false;
        if (lang !== 'all' && p.language !== lang) return false;
        if (status === 'critical' && !p.autoFail) return false;
        if ((status === 'published' || status === 'in_review') && p.status !== status) return false;
        if (q && !`${c.id} ${c.agentName} ${c.client}`.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      });
  }, [s.calls, s.processed, s.liveRuns, q, queue, lang, status]);

  return (
    <div>
      <PageHeader title="Interactions" lede={`All ${s.calls.length} interactions, each evaluated in full. Demo recordings and uploads are listed first.`} />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-faint" />
          <input className="field !pl-8 w-[240px]" placeholder="Call id, agent or client" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="field !w-auto" value={queue} onChange={(e) => setQueue(e.target.value as typeof queue)} aria-label="Queue">
          <option value="all">All queues</option>
          {(['INS', 'CRD', 'COL'] as QueueId[]).map((x) => <option key={x} value={x}>{QUEUE_NAME[x]}</option>)}
        </select>
        <select className="field !w-auto" value={lang} onChange={(e) => setLang(e.target.value as typeof lang)} aria-label="Language">
          <option value="all">All languages</option>
          <option value="en">English</option>
          <option value="hi-en">Hinglish</option>
        </select>
        <select className="field !w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
          <option value="all">Any status</option>
          <option value="published">Fully published</option>
          <option value="in_review">Partly in review</option>
          <option value="critical">Critical compliance failure</option>
        </select>
        <span className="text-[12px] text-muted ml-auto">{rows.length} shown</span>
      </div>
      <div className="panel overflow-x-auto">
        <table className="tbl w-full text-[13px]">
          <thead>
            <tr>
              <th>Interaction</th>
              <th>When</th>
              <th>Queue</th>
              <th>Agent</th>
              <th>Language</th>
              <th className="text-right">Length</th>
              <th className="text-right">Score</th>
              <th className="text-right">Failed</th>
              <th>Status</th>
              <th>Human label</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map(({ c, p }) => (
              <tr key={c.id} className="cursor-pointer" onClick={() => nav(`/calls/${c.id}`)}>
                <td className="font-medium whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    {c.audioUrl && <Headphones size={13} className="text-cobalt" aria-label="Has recording" />}
                    {c.id}
                  </span>
                  {c.source !== 'synthetic-corpus' && <span className="ml-2 text-[11px] text-cobalt">{c.source === 'upload' ? 'upload' : 'demo'}</span>}
                </td>
                <td className="whitespace-nowrap text-muted">{fmtDateTime(c.date)}</td>
                <td className="whitespace-nowrap">{QUEUE_NAME[c.queue]}</td>
                <td className="whitespace-nowrap">{c.agentName}</td>
                <td><LangTag l={p.language} /></td>
                <td className="text-right tabular-nums text-muted">{fmtClock(c.duration)}</td>
                <td className={cx('text-right tabular-nums font-semibold', (p.score ?? 0) >= 85 ? 'text-pass' : (p.score ?? 0) >= 65 ? 'text-advisory' : 'text-fail')}>{p.score ?? '—'}</td>
                <td className="text-right tabular-nums">
                  {p.findings.filter((f) => f.verdict === 'fail').length}
                  {p.autoFail && <ShieldAlert size={13} className="inline ml-1 text-fail" aria-label="Critical failure" />}
                </td>
                <td className={cx('whitespace-nowrap text-[12px] font-medium', p.status === 'published' ? 'text-pass' : 'text-review')}>{p.status === 'published' ? 'Published' : 'In review'}</td>
                <td className="text-[12px] text-muted">{c.reviewerLabels ? (c.golden ? 'Blind sample · golden set' : 'Blind sample') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <div className="text-center mt-3">
          <button className="btn" onClick={() => setLimit(limit + 100)}>Show {Math.min(100, rows.length - limit)} more</button>
        </div>
      )}
    </div>
  );
}
