import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import type { LedgerRow } from '../engine/calibration';
import { specSummary } from '../engine/compiler';
import { useStore } from '../state/store';
import { KappaSpark } from '../ui/charts';
import { cx, Drawer, fmtDate, kfmt, PageHeader, pct, SeverityTag, StatusChip } from '../ui/kit';

export default function Ledger() {
  const s = useStore();
  const policy = s.policy();
  const th = s.thresholds;
  const [sel, setSel] = useState<LedgerRow | null>(null);
  const sources = s.pairs.reduce<Record<string, number>>((a, p) => ((a[p.source] = (a[p.source] ?? 0) + 1), a), {});
  return (
    <div>
      <PageHeader
        title="Calibration ledger"
        lede={
          <>
            How often VERIS agrees with senior human reviewers, measured per criterion and per language on a rotating blind sample. This number, not model confidence, decides whether a criterion may publish on its own. A criterion is promoted when <b>κ ≥ {th.kappa}</b>, <b>agreement ≥ {pct(th.agreement)}</b> and <b>n ≥ {th.minN}</b>; it reverts to advisory automatically if agreement in the last {th.driftWindowDays} days drops.
          </>
        }
      />
      <div className="flex flex-wrap gap-4 text-[12px] text-muted mb-3">
        <span><b className="text-ink">{s.pairs.length}</b> labelled pairs</span>
        <span>{sources['blind-sample'] ?? 0} from the blind sample</span>
        <span>{sources.review ?? 0} from reviewer rulings</span>
        <span>{sources.contest ?? 0} from agent contests</span>
      </div>
      <div className="panel overflow-x-auto">
        <table className="tbl w-full text-[13px]">
          <thead>
            <tr>
              <th>Criterion</th>
              <th>English</th>
              <th>Hinglish (code-mixed)</th>
            </tr>
          </thead>
          <tbody>
            {policy.criteria.map((c) => (
              <tr key={c.id}>
                <td className="max-w-[380px]">
                  <div className="flex items-center gap-2"><span className="font-mono text-[11px] text-faint">{c.id}</span><SeverityTag s={c.severity} /></div>
                  <div className="leading-snug mt-0.5">{c.text}</div>
                  <code className="text-[11px] text-faint font-mono">{specSummary(c.spec)}</code>
                </td>
                {(['en', 'hi-en'] as const).map((l) => {
                  const r = s.ledger[`${c.id}|${l}`];
                  return (
                    <td key={l} className="cursor-pointer min-w-[260px]" onClick={() => r && setSel(r)}>
                      {r && <Cell r={r} threshold={th.kappa} />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-muted mt-3 max-w-[90ch]">
        Cohen’s κ corrects raw agreement for the agreement expected by chance, so a criterion that almost always passes cannot look reliable just by saying “pass”. Pairs where either side ruled the criterion not applicable are excluded from κ and counted separately as applicability disagreements. Figures are computed live from the pilot corpus, whose reviewer labels are simulated (see How it works).
      </p>
      {sel && <LedgerDrawer r={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function Cell({ r, threshold }: { r: LedgerRow; threshold: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-[96px]">
        <div className="text-[17px] font-semibold leading-tight">κ {kfmt(r.stats.kappa)}</div>
        <div className="text-[11px] text-muted">{pct(r.stats.agreement)} · n = {r.stats.n}</div>
        <div className="mt-0.5"><StatusChip status={r.status} /></div>
      </div>
      <div>
        <KappaSpark points={r.weekly.map((w) => (w.n >= 3 ? w.kappa : null))} threshold={threshold} />
        {r.drift && <div className="text-[11px] text-advisory font-medium inline-flex items-center gap-1"><AlertTriangle size={11} />Drift detected</div>}
      </div>
    </div>
  );
}

function LedgerDrawer({ r, onClose }: { r: LedgerRow; onClose: () => void }) {
  const s = useStore();
  const c = s.policy().criteria.find((x) => x.id === r.criterionId)!;
  const m = r.stats.confusion;
  const pairs = s.pairs.filter((p) => p.criterionId === r.criterionId && `${p.criterionId}|${p.lang === 'hi' ? 'hi-en' : p.lang}` === r.key);
  const disagreements = pairs.filter((p) => p.engine !== p.reviewer && p.engine !== 'na' && p.reviewer !== 'na').slice(0, 8);
  return (
    <Drawer open onClose={onClose} title={`${r.criterionId} · ${r.lang === 'en' ? 'English' : 'Hinglish'}`}>
      <p className="text-[13px] mb-3">{c.text}</p>
      <div className={cx('rounded-md px-3 py-2 text-[13px] mb-4', r.status === 'auto' ? 'bg-passsoft' : r.status === 'advisory' ? 'bg-advisorysoft' : 'bg-sunk')}>
        <StatusChip status={r.status} />
        <div className="mt-1">{r.reason}</div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-md bg-sunk px-3 py-2"><div className="label">Cohen’s κ</div><div className="text-[18px] font-semibold">{kfmt(r.stats.kappa)}</div><div className="text-[11px] text-muted">95% CI {r.stats.ci ? `${r.stats.ci[0].toFixed(2)}–${r.stats.ci[1].toFixed(2)}` : '—'}</div></div>
        <div className="rounded-md bg-sunk px-3 py-2"><div className="label">Raw agreement</div><div className="text-[18px] font-semibold">{pct(r.stats.agreement, 1)}</div><div className="text-[11px] text-muted">n = {r.stats.n}</div></div>
        <div className="rounded-md bg-sunk px-3 py-2"><div className="label">Last {s.thresholds.driftWindowDays} days</div><div className="text-[18px] font-semibold">κ {kfmt(r.recent.kappa)}</div><div className="text-[11px] text-muted">{pct(r.recent.agreement)} · n = {r.recent.n}</div></div>
      </div>
      <div className="label mb-1">Agreement matrix</div>
      <table className="text-[13px] mb-4 border border-line rounded">
        <thead>
          <tr><th className="px-3 py-1.5 text-left text-muted font-medium" /><th className="px-3 py-1.5 text-muted font-medium">Reviewer PASS</th><th className="px-3 py-1.5 text-muted font-medium">Reviewer FAIL</th></tr>
        </thead>
        <tbody>
          <tr><td className="px-3 py-1.5 text-muted">VERIS PASS</td><td className="px-3 py-1.5 text-center font-semibold text-pass">{m.pp}</td><td className="px-3 py-1.5 text-center font-semibold text-fail">{m.pf}</td></tr>
          <tr><td className="px-3 py-1.5 text-muted">VERIS FAIL</td><td className="px-3 py-1.5 text-center font-semibold text-fail">{m.fp}</td><td className="px-3 py-1.5 text-center font-semibold text-pass">{m.ff}</td></tr>
        </tbody>
      </table>
      <div className="text-[12px] text-muted mb-4">{r.stats.applicabilityDisagreements} applicability disagreement(s): one side judged the criterion not applicable.</div>
      <div className="label mb-1">Weekly κ</div>
      <div className="flex flex-wrap gap-2 mb-4">
        {r.weekly.map((w) => (
          <div key={w.week} className="rounded border border-line px-2 py-1 text-center">
            <div className="text-[11px] text-muted">{fmtDate(w.week)}</div>
            <div className={cx('text-[13px] font-semibold', w.kappa != null && w.kappa < s.thresholds.kappa && 'text-advisory')}>{w.n >= 3 ? kfmt(w.kappa) : '—'}</div>
            <div className="text-[10px] text-faint">n {w.n}</div>
          </div>
        ))}
      </div>
      <div className="label mb-1">Recent disagreements</div>
      {disagreements.length === 0 && <p className="text-[13px] text-muted">None.</p>}
      <ul className="text-[13px] space-y-1">
        {disagreements.map((p) => (
          <li key={p.callId + p.source}>
            <a className="text-cobalt" href={`#/calls/${p.callId}`}>{p.callId}</a> · VERIS {p.engine.toUpperCase()}, reviewer {p.reviewer.toUpperCase()} <span className="text-muted">({p.source === 'blind-sample' ? 'blind sample' : p.source})</span>
          </li>
        ))}
      </ul>
    </Drawer>
  );
}
