// Plain-English criterion editor with a live compile preview.
import { Cpu, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { compile, specSummary } from '../engine/compiler';
import type { Criterion, QueueId, Severity } from '../engine/types';
import { cx } from './kit';

export const EXAMPLES = [
  'Did the agent interrupt the customer?',
  'Check whether the agent explained the cancellation fee before confirming the cancellation.',
  'Did the agent explain how the pro-rata refund was calculated accurately?',
  'When the customer reports financial hardship, did the agent offer a payment plan?',
];

export function newCriterionId(c: Pick<Criterion, 'spec'>, existing: string[]) {
  let base = 'Q-NEW';
  if (c.spec.kind === 'acoustic') base = c.spec.metric === 'interruptions' ? 'Q-INT' : c.spec.metric === 'longest_silence' ? 'Q-SIL' : 'Q-TLK';
  else if (c.spec.kind === 'semantic') base = 'Q-SEM';
  else if (c.spec.kind === 'sequence') base = 'Q-SEQ';
  let id = base;
  let i = 2;
  while (existing.includes(id)) id = `${base}${i++}`;
  return id;
}

export interface EditorValue {
  text: string;
  severity: Severity;
  queues: QueueId[] | 'all';
  weight: number;
}

export function CriterionEditor({ value, onChange, showExamples }: { value: EditorValue; onChange: (v: EditorValue) => void; showExamples?: boolean }) {
  const r = useMemo(() => (value.text.trim().length > 6 ? compile(value.text) : null), [value.text]);
  const queues: QueueId[] = ['INS', 'CRD', 'COL'];
  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor="crit-text">Criterion, in plain English</label>
        <textarea id="crit-text" className="field mt-1 min-h-[68px]" value={value.text} onChange={(e) => onChange({ ...value, text: e.target.value })} placeholder="e.g. Did the agent disclose the cancellation charge before confirming the cancellation?" />
        {showExamples && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {EXAMPLES.map((e) => (
              <button key={e} className="rounded-full border border-line px-2.5 py-0.5 text-[12px] text-muted hover:text-ink hover:border-cobalt/50" onClick={() => onChange({ ...value, text: e, severity: compile(e).suggestedSeverity })}>
                {e.length > 58 ? `${e.slice(0, 56)}…` : e}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label">Severity</label>
          <select className="field mt-1" value={value.severity} onChange={(e) => onChange({ ...value, severity: e.target.value as Severity })}>
            {(['low', 'medium', 'high', 'critical'] as Severity[]).map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Weight</label>
          <input type="number" min={1} max={5} className="field mt-1" value={value.weight} onChange={(e) => onChange({ ...value, weight: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })} />
        </div>
        <div>
          <span className="label">Queues</span>
          <div className="flex gap-1 mt-1">
            {queues.map((q) => {
              const on = value.queues === 'all' || value.queues.includes(q);
              return (
                <button
                  key={q}
                  className={cx('rounded border px-2 py-1 text-[12px] font-medium', on ? 'border-cobalt text-cobalt bg-cobaltsoft' : 'border-line text-muted')}
                  onClick={() => {
                    const cur = value.queues === 'all' ? queues : value.queues;
                    const next = on ? cur.filter((x) => x !== q) : [...cur, q];
                    onChange({ ...value, queues: next.length === 3 ? 'all' : next.length ? next : cur });
                  }}
                  aria-pressed={on}
                >
                  {q}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {r && (
        <div className="rounded-md border border-line bg-sunk/60 p-3">
          <div className="flex items-center gap-2 mb-1.5">
            {r.executable === 'deterministic' ? <Cpu size={14} className="text-pass" /> : <Sparkles size={14} className="text-advisory" />}
            <span className="text-[13px] font-semibold">{r.executable === 'deterministic' ? 'Compiles to a deterministic spec' : 'Semantic criterion: needs the LLM evaluator'}</span>
            <code className="ml-auto font-mono text-[11px] text-muted">{specSummary(r.spec)}</code>
          </div>
          <ul className="text-[12px] text-muted space-y-0.5">
            {r.notes.map((n, i) => <li key={i}>· {n}</li>)}
          </ul>
          <details className="mt-1.5">
            <summary className="text-[12px] text-cobalt cursor-pointer">Executable spec (JSON)</summary>
            <pre className="font-mono text-[11px] mt-1 p-2 rounded bg-panel border border-line overflow-x-auto">{JSON.stringify(r.spec, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
