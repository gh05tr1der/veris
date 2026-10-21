// Small hand-built SVG charts: thin marks, recessive axes, hover tooltips, legend + direct labels.
import { useEffect, useMemo, useRef, useState } from 'react';
import { cx } from './kit';

export interface Series {
  name: string;
  color: string; // css colour, e.g. 'rgb(var(--s1))'
  values: (number | null)[];
}

export function LineChart({ series, labels, height = 220, yMin, yMax, yFmt = (v) => String(Math.round(v)), refLine, ariaLabel }: {
  series: Series[];
  labels: string[];
  height?: number;
  yMin?: number;
  yMax?: number;
  yFmt?: (v: number) => string;
  refLine?: { value: number; label: string };
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver((e) => setW(Math.max(320, Math.round(e[0].contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const H = height;
  const pad = { l: 36, r: series.length > 1 ? 92 : 16, t: 12, b: 24 };
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const lo = yMin ?? Math.min(...all, refLine?.value ?? Infinity);
  const hi = yMax ?? Math.max(...all, refLine?.value ?? -Infinity);
  const x = (i: number) => pad.l + ((W - pad.l - pad.r) * i) / Math.max(1, labels.length - 1);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - lo) / Math.max(1e-9, hi - lo));
  const ticks = useMemo(() => Array.from({ length: 4 }, (_, i) => lo + ((hi - lo) * i) / 3), [lo, hi]);
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (labels.length - 1));
    setHover(Math.max(0, Math.min(labels.length - 1, i)));
  };
  // direct end-labels, nudged apart so they never collide
  const ends = series
    .map((s) => {
      const li = s.values.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).pop();
      return li == null ? null : { name: s.name, x: x(li), y: y(s.values[li]!) };
    })
    .filter((e): e is { name: string; x: number; y: number } => e != null)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  return (
    <div className="relative" ref={box}>
      {series.length > 1 && (
        <div className="flex flex-wrap gap-3 mb-1 text-[12px] text-muted">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span className="w-3 h-[2px] rounded" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="rgb(var(--line))" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="rgb(var(--faint))">{yFmt(t)}</text>
          </g>
        ))}
        {refLine && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={y(refLine.value)} y2={y(refLine.value)} stroke="rgb(var(--muted))" strokeDasharray="4 4" strokeWidth={1} />
            <text x={pad.l + 4} y={y(refLine.value) - 4} fontSize={11} fill="rgb(var(--muted))">{refLine.label}</text>
          </g>
        )}
        {labels.map((l, i) => (i % Math.ceil(labels.length / 7) === 0 || i === labels.length - 1 ? <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="rgb(var(--faint))">{l}</text> : null))}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)] as const)).filter(Boolean) as (readonly [number, number])[];
          return (
            <g key={s.name}>
              <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

            </g>
          );
        })}
        {series.length > 1 && ends.map((e) => <text key={e.name} x={e.x + 8} y={e.y + 4} fontSize={11} fill="rgb(var(--muted))">{e.name.split(' ')[0]}</text>)}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="rgb(var(--muted))" strokeWidth={1} />
            {series.map((s) => (s.values[hover] == null ? null : <circle key={s.name} cx={x(hover)} cy={y(s.values[hover]!)} r={4} fill={s.color} stroke="rgb(var(--panel))" strokeWidth={2} />))}
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute top-6 rounded-md border border-line bg-panel px-2.5 py-1.5 text-[12px] shadow-md" style={{ left: `min(calc(${(x(hover) / W) * 100}% + 12px), calc(100% - 170px))` }}>
          <div className="font-medium mb-0.5">{labels[hover]}</div>
          {series.map((s) => (
            <div key={s.name} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
              <span className="text-muted">{s.name}</span>
              <span className="ml-auto pl-3 font-medium">{s.values[hover] == null ? '—' : yFmt(s.values[hover]!)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Weekly counts as thin bars, with a hover readout. */
export function WeekBars({ counts, labels, highlightFrom, width = 140, height = 36 }: { counts: number[]; labels: string[]; highlightFrom?: number; width?: number; height?: number }) {
  const [h, setH] = useState<number | null>(null);
  const max = Math.max(1, ...counts);
  const bw = width / counts.length;
  return (
    <div className="relative inline-block">
      <svg width={width} height={height} role="img" aria-label={`Weekly counts: ${counts.join(', ')}`}>
        {counts.map((c, i) => {
          const bh = Math.max(c ? 3 : 1, (c / max) * (height - 4));
          return (
            <rect
              key={i}
              x={i * bw + 1}
              y={height - bh}
              width={bw - 2}
              height={bh}
              rx={2}
              fill={highlightFrom != null && i >= highlightFrom ? 'rgb(var(--s2))' : 'rgb(var(--s1))'}
              opacity={h == null || h === i ? 1 : 0.45}
              onMouseEnter={() => setH(i)}
              onMouseLeave={() => setH(null)}
            />
          );
        })}
      </svg>
      {h != null && (
        <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded border border-line bg-panel px-2 py-0.5 text-[11px] shadow">
          Week of {labels[h]}: <b>{counts[h]}</b>
        </div>
      )}
    </div>
  );
}

/** κ over time with the automation threshold drawn in. */
export function KappaSpark({ points, threshold, width = 120, height = 32 }: { points: (number | null)[]; threshold: number; width?: number; height?: number }) {
  const vals = points.map((p) => (p == null ? null : Math.max(-0.2, p)));
  const x = (i: number) => 3 + ((width - 6) * i) / Math.max(1, vals.length - 1);
  const y = (v: number) => 3 + (height - 6) * (1 - (v + 0.2) / 1.2);
  const pts = vals.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean);
  return (
    <svg width={width} height={height} role="img" aria-label={`Weekly kappa: ${points.map((p) => (p == null ? 'n/a' : p.toFixed(2))).join(', ')}`}>
      <line x1={0} x2={width} y1={y(threshold)} y2={y(threshold)} stroke="rgb(var(--faint))" strokeDasharray="3 3" />
      <polyline points={pts.join(' ')} fill="none" stroke="rgb(var(--s1))" strokeWidth={2} strokeLinejoin="round" />
      {vals.map((v, i) => (v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={v < threshold ? 'rgb(var(--advisory))' : 'rgb(var(--s1))'} />))}
    </svg>
  );
}

export function Bar({ value, max = 1, tone = 's1', className }: { value: number; max?: number; tone?: string; className?: string }) {
  return (
    <div className={cx('h-1.5 rounded-full bg-sunk overflow-hidden', className)}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%`, background: `rgb(var(--${tone}))` }} />
    </div>
  );
}
