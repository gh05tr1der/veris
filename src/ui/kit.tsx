// Shared presentational components. Status is always icon + label, never colour alone.
import { AlertTriangle, CheckCircle2, CircleSlash, Eye, ShieldAlert, ShieldCheck, UserCheck, X, XCircle } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import type { LedgerRow } from '../engine/calibration';
import type { Lang, RoutingDecision, Severity, Verdict } from '../engine/types';
import { useStore } from '../state/store';

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');

export function VerdictBadge({ v, size = 'sm' }: { v: Verdict; size?: 'sm' | 'lg' }) {
  const map = {
    pass: { cls: 'text-pass bg-passsoft', icon: CheckCircle2, label: 'Pass' },
    fail: { cls: 'text-fail bg-failsoft', icon: XCircle, label: 'Fail' },
    na: { cls: 'text-muted bg-sunk', icon: CircleSlash, label: 'N/A' },
  }[v];
  const I = map.icon;
  return (
    <span className={cx('inline-flex items-center gap-1 rounded font-semibold', map.cls, size === 'lg' ? 'px-2 py-1 text-[13px]' : 'px-1.5 py-0.5 text-[11px]')}>
      <I size={size === 'lg' ? 15 : 12} strokeWidth={2.4} />
      {map.label}
    </span>
  );
}

export const ROUTE_META: Record<RoutingDecision, { label: string; cls: string; icon: typeof Eye }> = {
  auto_publish: { label: 'Auto-published', cls: 'text-pass border-pass/30', icon: ShieldCheck },
  advisory: { label: 'Advisory', cls: 'text-advisory border-advisory/40 bg-advisorysoft', icon: AlertTriangle },
  human_review: { label: 'Human review', cls: 'text-review border-review/30 bg-reviewsoft', icon: UserCheck },
  suppressed: { label: 'Suppressed', cls: 'text-fail border-fail/40 bg-failsoft', icon: ShieldAlert },
};

export function RoutingBadge({ d }: { d: RoutingDecision }) {
  const m = ROUTE_META[d];
  const I = m.icon;
  return (
    <span className={cx('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap', m.cls)}>
      <I size={12} />
      {m.label}
    </span>
  );
}

export function SeverityTag({ s }: { s: Severity }) {
  const cls = { critical: 'text-fail', high: 'text-fail/80', medium: 'text-advisory', low: 'text-muted' }[s];
  const bars = { critical: 4, high: 3, medium: 2, low: 1 }[s];
  return (
    <span className={cx('inline-flex items-center gap-1 text-[11px] font-medium', cls)} title={`${s} severity`}>
      <span className="inline-flex items-end gap-[2px]" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cx('w-[3px] rounded-sm', i <= bars ? 'bg-current' : 'bg-line')} style={{ height: 3 + i * 2 }} />
        ))}
      </span>
      {s[0].toUpperCase() + s.slice(1)}
    </span>
  );
}

export function LangTag({ l }: { l: Lang }) {
  return <span className={cx('rounded px-1.5 py-0.5 text-[11px] font-medium border', l === 'en' ? 'border-line text-muted' : 'border-agent/40 text-agent')}>{l === 'en' ? 'English' : l === 'hi' ? 'Hindi' : 'Hinglish'}</span>;
}

export function StatusChip({ status }: { status: LedgerRow['status'] }) {
  if (status === 'auto') return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-pass"><ShieldCheck size={12} />Auto-publish</span>;
  if (status === 'advisory') return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-advisory"><AlertTriangle size={12} />Advisory</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted"><CircleSlash size={12} />Not yet earned</span>;
}

export function ScoreDial({ score, autoFail, size = 76 }: { score: number | null; autoFail?: boolean; size?: number }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const v = score ?? 0;
  const col = autoFail ? 'rgb(var(--fail))' : v >= 85 ? 'rgb(var(--pass))' : v >= 65 ? 'rgb(var(--advisory))' : 'rgb(var(--fail))';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`QA score ${score ?? 'not available'}`}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--line))" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${(c * v) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-semibold" style={{ fontSize: size * 0.26 }}>{score ?? '—'}</span>
        {size >= 64 && <span className="text-[10px] text-muted mt-0.5">/ 100</span>}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'pass' | 'fail' | 'advisory' }) {
  return (
    <div className="panel px-4 py-3">
      <div className="label">{label}</div>
      <div className={cx('text-[24px] font-semibold leading-tight mt-0.5', tone === 'pass' && 'text-pass', tone === 'fail' && 'text-fail', tone === 'advisory' && 'text-advisory')}>{value}</div>
      {sub && <div className="text-[12px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

export function PageHeader({ title, lede, actions }: { title: string; lede?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div className="max-w-[72ch]">
        <h1 className="h1">{title}</h1>
        {lede && <p className="text-muted mt-1">{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Drawer({ open, onClose, title, children, width = 560 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/25" onClick={onClose} />
      <div className="relative h-full bg-panel border-l border-line shadow-xl overflow-y-auto w-full stage-in" style={{ maxWidth: width }}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-panel px-5 py-3">
          <div className="h2">{title}</div>
          <button className="btn-ghost" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div className="relative panel w-full max-w-[620px] shadow-2xl stage-in">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <div className="h2">{title}</div>
          <button className="btn-ghost" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: ReactNode }[] }) {
  return (
    <div className="flex gap-1 border-b border-line overflow-x-auto" role="tablist">
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={cx('px-3 py-2 text-[13px] font-medium -mb-px border-b-2 whitespace-nowrap', value === it.id ? 'border-cobalt text-ink' : 'border-transparent text-muted hover:text-ink')}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Toast() {
  const toast = useStore((s) => s.toast);
  const set = useStore((s) => s.set);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => set('toast', null), 4200);
    return () => clearTimeout(t);
  }, [toast, set]);
  if (!toast) return null;
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-lg bg-ink text-paper px-4 py-2.5 text-[13px] shadow-xl stage-in" role="status" key={toast.id}>
      {toast.text}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="panel px-6 py-10 text-center">
      <div className="h2">{title}</div>
      {children && <div className="text-muted mt-1">{children}</div>}
    </div>
  );
}

export const pct = (x: number | null | undefined, d = 0) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
export const kfmt = (x: number | null | undefined) => (x == null ? '—' : x.toFixed(2));
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
