import { FlaskConical, GitCommitHorizontal, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { compile, specSummary } from '../engine/compiler';
import { replay, type RegressionResult } from '../engine/regression';
import type { Criterion, PolicyVersion } from '../engine/types';
import { useStore } from '../state/store';
import { CriterionEditor, type EditorValue, newCriterionId } from '../ui/CriterionEditor';
import { cx, fmtDateTime, PageHeader, pct, SeverityTag } from '../ui/kit';

const sig = (cs: Criterion[]) => JSON.stringify(cs.map((c) => [c.id, c.text, c.severity, c.queues, c.weight, c.spec]));

export default function PolicyStudio() {
  const s = useStore();
  const active = s.policy();
  const draft = s.draft ?? active.criteria;
  const setDraft = (cs: Criterion[]) => s.set('draft', cs);
  const [selId, setSelId] = useState<string | 'new' | null>(draft[0]?.id ?? null);
  const sel = draft.find((c) => c.id === selId);
  const [ed, setEd] = useState<EditorValue>(() => (sel ? { text: sel.text, severity: sel.severity, queues: sel.queues, weight: sel.weight } : { text: '', severity: 'medium', queues: 'all', weight: 2 }));
  const [reg, setReg] = useState<{ sig: string; r: RegressionResult } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const golden = s.calls.filter((c) => c.golden);
  const changed = sig(draft) !== sig(active.criteria);
  const status = (c: Criterion) => {
    const a = active.criteria.find((x) => x.id === c.id);
    if (!a) return 'new';
    return sig([a]) === sig([c]) ? null : 'changed';
  };
  const removed = active.criteria.filter((a) => !draft.some((d) => d.id === a.id));

  const pick = (id: string | 'new') => {
    setSelId(id);
    const c = draft.find((x) => x.id === id);
    setEd(c ? { text: c.text, severity: c.severity, queues: c.queues, weight: c.weight } : { text: '', severity: 'medium', queues: 'all', weight: 2 });
  };

  const apply = () => {
    const r = compile(ed.text);
    const base = { text: ed.text.trim(), severity: ed.severity, queues: ed.queues, weight: ed.weight, category: r.suggestedCategory, spec: r.spec, compiledBy: 'compiler' as const, compileNotes: r.notes };
    if (selId === 'new' || !sel) {
      const c: Criterion = { id: '', ...base };
      c.id = newCriterionId(c, draft.map((x) => x.id));
      setDraft([...draft, c]);
      setSelId(c.id);
    } else {
      setDraft(draft.map((x) => (x.id === sel.id ? { ...x, ...base, category: x.category } : x)));
    }
  };

  const runRegression = () => {
    setBusy(true);
    setTimeout(() => {
      const candidate: PolicyVersion = { ...active, version: active.version + 1, criteria: draft };
      setReg({ sig: sig(draft), r: replay(golden, active, candidate) });
      setBusy(false);
    }, 20);
  };
  const regCurrent = reg && reg.sig === sig(draft);

  return (
    <div>
      <PageHeader
        title="Policy studio"
        lede="Quality criteria are written in plain English, compiled into versioned executable specs, and replayed against the golden set of reviewer-scored calls before they go live. Nothing changes silently."
        actions={
          <>
            {changed && <button className="btn" onClick={() => { s.set('draft', null); pick(active.criteria[0].id); setReg(null); }}><RotateCcw size={14} />Discard draft</button>}
            <button className="btn" onClick={() => pick('new')}><Plus size={14} />New criterion</button>
          </>
        }
      />
      <div className="grid lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-4">
        <div className="panel">
          <div className="px-4 py-2.5 border-b border-line flex items-center">
            <div className="h2">Draft based on v{active.version}</div>
            <span className="ml-auto text-[12px] text-muted">{draft.length} criteria</span>
          </div>
          <ul className="divide-y divide-line">
            {draft.map((c) => {
              const st = status(c);
              return (
                <li key={c.id}>
                  <button className={cx('w-full text-left px-4 py-2.5 hover:bg-sunk', selId === c.id && 'bg-cobaltsoft/60')} onClick={() => pick(c.id)}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-faint">{c.id}</span>
                      <SeverityTag s={c.severity} />
                      {st && <span className={cx('text-[10px] font-semibold rounded px-1.5', st === 'new' ? 'bg-cobalt text-panel' : 'bg-advisorysoft text-advisory')}>{st}</span>}
                      <code className="ml-auto text-[11px] text-faint font-mono truncate max-w-[45%]">{specSummary(c.spec)}</code>
                    </div>
                    <div className="text-[13px] leading-snug mt-0.5">{c.text}</div>
                    <div className="text-[11px] text-muted">{c.queues === 'all' ? 'All queues' : c.queues.join(', ')} · weight {c.weight} · {c.category}</div>
                  </button>
                </li>
              );
            })}
            {removed.map((c) => (
              <li key={c.id} className="px-4 py-2.5 opacity-60">
                <span className="font-mono text-[11px] text-faint mr-2">{c.id}</span>
                <span className="text-[10px] font-semibold rounded px-1.5 bg-failsoft text-fail mr-2">removed</span>
                <span className="line-through text-[13px]">{c.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          <div className="panel p-4">
            <div className="h2 mb-3">{selId === 'new' || !sel ? 'New criterion' : `Edit ${sel.id}`}</div>
            <CriterionEditor value={ed} onChange={setEd} showExamples={selId === 'new'} />
            <div className="flex gap-2 mt-3">
              <button className="btn-primary" onClick={apply} disabled={ed.text.trim().length < 8}>{selId === 'new' || !sel ? 'Add to draft' : 'Update draft'}</button>
              {sel && <button className="btn" onClick={() => { setDraft(draft.filter((x) => x.id !== sel.id)); pick(draft[0].id); }}><Trash2 size={14} />Remove from draft</button>}
            </div>
          </div>

          <div className="panel p-4">
            <div className="flex items-center gap-2">
              <FlaskConical size={16} className="text-cobalt" />
              <div className="h2">Golden-set regression</div>
              <span className="ml-auto text-[12px] text-muted">{golden.length} reviewer-scored calls</span>
            </div>
            <p className="text-[13px] text-muted mt-1 mb-3">Replays the draft and the active version on the same calls, then shows which verdicts flip, how scores move, and whether agreement with reviewers improves.</p>
            <button className="btn-primary" onClick={runRegression} disabled={!changed || busy}>{busy ? 'Replaying…' : changed ? 'Run regression' : 'No changes to test'}</button>
            {reg && <RegressionView r={reg.r} stale={!regCurrent} />}
            {regCurrent && (
              <div className="mt-4 border-t border-line pt-3">
                <label className="label" htmlFor="pub-note">Change note (kept in the version history and the audit log)</label>
                <input id="pub-note" className="field mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Added interruption check following floor-lead feedback" />
                <button
                  className="btn-primary mt-2"
                  disabled={!note.trim()}
                  onClick={async () => {
                    await s.publishPolicy(draft, note.trim(), reg!.r.summary);
                    s.set('draft', null);
                    setReg(null);
                    setNote('');
                  }}
                >
                  <GitCommitHorizontal size={14} />Publish as v{Math.max(...s.policies.map((p) => p.version)) + 1}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <History />
    </div>
  );
}

function RegressionView({ r, stale }: { r: RegressionResult; stale: boolean }) {
  const moved = r.perCall.filter((x) => x.before !== x.after).sort((a, b) => Math.abs((b.after ?? 0) - (b.before ?? 0)) - Math.abs((a.after ?? 0) - (a.before ?? 0)));
  return (
    <div className={cx('mt-4', stale && 'opacity-50')}>
      {stale && <div className="text-[12px] text-advisory mb-2">The draft changed since this run. Run the regression again before publishing.</div>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <Box k="Verdict flips" v={String(r.summary.verdictFlips)} />
        <Box k="Mean score drift" v={`${r.summary.meanScoreDrift >= 0 ? '+' : ''}${r.summary.meanScoreDrift}`} />
        <Box k="Agreement before" v={pct(r.summary.agreementBefore, 1)} />
        <Box k="Agreement after" v={pct(r.summary.agreementAfter, 1)} />
      </div>
      <table className="tbl w-full text-[13px]">
        <thead>
          <tr><th>Criterion</th><th>Change</th><th className="text-right">Flips</th><th className="text-right">Reviewer agreement</th></tr>
        </thead>
        <tbody>
          {r.perCriterion.filter((c) => c.status !== 'unchanged' || c.flips).map((c) => (
            <tr key={c.criterionId}>
              <td className="font-mono text-[12px]">{c.criterionId}</td>
              <td>{c.status}</td>
              <td className="text-right tabular-nums">{c.flips}</td>
              <td className="text-right tabular-nums">
                {c.labelled ? `${pct(c.agreementBefore)} → ${pct(c.agreementAfter)}` : <span className="text-muted">no golden labels yet: starts advisory</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {moved.length > 0 && (
        <div className="mt-3">
          <div className="label mb-1">Largest score movements</div>
          <div className="flex flex-wrap gap-1.5">
            {moved.slice(0, 10).map((m) => (
              <Link key={m.callId} to={`/calls/${m.callId}`} className="rounded border border-line px-2 py-0.5 text-[12px] hover:border-cobalt/50">
                {m.callId} <span className="tabular-nums text-muted">{m.before} → <b className="text-ink">{m.after}</b></span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Box({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-sunk px-3 py-2">
      <div className="label">{k}</div>
      <div className="text-[17px] font-semibold">{v}</div>
    </div>
  );
}

function History() {
  const s = useStore();
  const [cmp, setCmp] = useState<Record<number, RegressionResult>>({});
  const golden = useMemo(() => s.calls.filter((c) => c.golden), [s.calls]);
  return (
    <div className="mt-6">
      <h2 className="h2 mb-2">Version history</h2>
      <div className="panel divide-y divide-line">
        {[...s.policies].reverse().map((p) => {
          const prev = s.policies.find((x) => x.version === p.version - 1);
          const r = p.regression ?? (cmp[p.version] ? cmp[p.version].summary : null);
          return (
            <div key={p.version} className="px-4 py-3 flex flex-wrap gap-3 items-start">
              <div className="w-[70px]">
                <div className="text-[15px] font-semibold">v{p.version}</div>
                {p.version === s.activeVersion && <div className="text-[11px] font-semibold text-pass">Active</div>}
              </div>
              <div className="flex-1 min-w-[260px]">
                <div className="text-[13px]">{p.note}</div>
                <div className="text-[12px] text-muted">{p.author} · {fmtDateTime(p.publishedAt)} · {p.criteria.length} criteria</div>
                {r && <div className="text-[12px] text-muted mt-0.5">Golden-set replay vs v{p.version - 1}: {r.verdictFlips} verdict flips · mean drift {r.meanScoreDrift >= 0 ? '+' : ''}{r.meanScoreDrift} · reviewer agreement {pct(r.agreementBefore, 1)} → {pct(r.agreementAfter, 1)}</div>}
              </div>
              <div className="flex gap-2">
                {prev && !r && <button className="btn" onClick={() => setCmp({ ...cmp, [p.version]: replay(golden, prev, p) })}>Replay against v{prev.version}</button>}
                {p.version !== s.activeVersion && <button className="btn" onClick={() => void s.activate(p.version)}>Activate</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
