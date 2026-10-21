// Transcript view. Analysis-zone (redacted) text by default; the raw zone is shown only on an
// explicit, logged request. Evidence spans and the word under the playhead are highlighted.
import { Lock, LockOpen } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { PHASE_LABEL } from '../../engine/prepare';
import { toRawOffset } from '../../engine/pii';
import { fmtTime } from '../../engine/text';
import type { AnalysedUtterance, Call, Finding } from '../../engine/types';
import { cx, LangTag } from '../kit';
import type { PlayerApi } from './Player';

interface Range {
  s: number;
  e: number;
  cls: string;
}

function render(text: string, ranges: Range[], times: (s: number, e: number) => { start: number; end: number }, now: number, follow: boolean) {
  // tokenise, then group consecutive tokens that share a highlight into a single <mark>
  const toks: { word: string; ws: string; cls: string; now: boolean }[] = [];
  const re = /(\S+)(\s*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const s = m.index;
    const e = s + m[1].length;
    const cls = ranges.filter((r) => r.s < e && r.e > s).map((r) => r.cls).join(' ');
    const t = follow ? times(s, e) : null;
    toks.push({ word: m[1], ws: m[2], cls, now: t != null && now >= t.start && now < t.end + 0.05 });
  }
  const out: JSX.Element[] = [];
  for (let i = 0; i < toks.length; ) {
    const t = toks[i];
    if (!t.cls) {
      out.push(<span key={i} className={cx(t.now && 'word-now')}>{t.word}</span>, <span key={`w${i}`}>{t.ws}</span>);
      i++;
      continue;
    }
    let j = i;
    let inner = '';
    while (j < toks.length && toks[j].cls === t.cls) {
      inner += toks[j].word + (j + 1 < toks.length && toks[j + 1].cls === t.cls ? toks[j].ws : '');
      j++;
    }
    out.push(<mark key={i} className={t.cls}>{inner}</mark>, <span key={`w${i}`}>{toks[j - 1].ws}</span>);
    i = j;
  }
  return out;
}

export function Transcript({ call, transcript, findings, selected, api, raw, onToggleRaw }: { call: Call; transcript: AnalysedUtterance[]; findings: Finding[]; selected: string | null; api: PlayerApi; raw: boolean; onToggleRaw: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const evidence = useMemo(() => {
    const sel = findings.filter((f) => (selected ? f.criterionId === selected : true));
    return sel.flatMap((f) => f.evidence.map((e) => ({ ...e, fail: f.verdict === 'fail' })));
  }, [findings, selected]);
  const active = transcript.find((u) => api.time >= u.start && api.time < u.end + 0.3 && (api.playing || api.time > 0));
  useEffect(() => {
    if (!api.playing || !active || !box.current) return;
    const el = box.current.querySelector(`[data-utt="${active.id}"]`) as HTMLElement | null;
    if (el) {
      const top = el.offsetTop - box.current.offsetTop - 80;
      box.current.scrollTo({ top, behavior: 'smooth' });
    }
  }, [active?.id, api.playing]);
  useEffect(() => {
    if (!selected || !box.current) return;
    const ev = evidence[0];
    if (!ev) return;
    const el = box.current.querySelector(`[data-utt="${ev.utteranceId}"]`) as HTMLElement | null;
    if (el) box.current.scrollTo({ top: el.offsetTop - box.current.offsetTop - 60, behavior: 'smooth' });
  }, [selected]);

  return (
    <div className="panel flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div>
          <div className="h2">Transcript</div>
          <div className="text-[12px] text-muted">
            {raw ? 'Raw zone: unredacted, access logged' : `Analysis zone: ${transcript.reduce((a, u) => a + u.redactions.length, 0)} PII entities masked before evaluation`}
          </div>
        </div>
        <button className={cx('btn', raw && '!border-review !text-review')} onClick={onToggleRaw} title="Raw-zone access is restricted and every view is written to the audit log">
          {raw ? <LockOpen size={14} /> : <Lock size={14} />}
          {raw ? 'Hide raw text' : 'View raw zone'}
        </button>
      </div>
      <div ref={box} className="overflow-y-auto px-4 py-3 space-y-2.5 max-h-[640px]">
        {transcript.map((u, i) => {
          const rawU = call.utterances[i];
          const showPhase = i === 0 || transcript[i - 1].phase !== u.phase;
          const evs = evidence.filter((e) => e.utteranceId === u.id);
          let ranges: Range[];
          let text: string;
          let times: (s: number, e: number) => { start: number; end: number };
          if (raw) {
            text = rawU.text;
            ranges = [
              ...u.redactions.map((r) => ({ s: r.start, e: r.end, cls: 'pii' })),
              ...evs.filter((e) => u.text.includes(e.quote)).map((e) => {
                const at = u.text.indexOf(e.quote);
                return { s: toRawOffset(at, u.redactions, 'start'), e: toRawOffset(at + e.quote.length, u.redactions, 'end'), cls: cx('ev', e.fail && 'fail') };
              }),
            ];
            const wordRanges: { s: number; e: number }[] = [];
            const re = /\S+/g;
            let m: RegExpExecArray | null;
            while ((m = re.exec(rawU.text))) wordRanges.push({ s: m.index, e: m.index + m[0].length });
            times = (s, e) => {
              const idx = wordRanges.findIndex((w) => w.s <= s && w.e >= e);
              const w = rawU.words[idx];
              return w ? { start: w.s, end: w.e } : { start: -1, end: -1 };
            };
          } else {
            text = u.text;
            ranges = [...u.redactions.map((r) => ({ s: r.rStart, e: r.rEnd, cls: 'pii' })), ...evs.filter((e) => u.text.includes(e.quote)).map((e) => { const at = u.text.indexOf(e.quote); return { s: at, e: at + e.quote.length, cls: cx('ev', e.fail && 'fail') }; })];
            times = u.timeOf;
          }
          const isActive = active?.id === u.id;
          return (
            <div key={u.id} data-utt={u.id}>
              {showPhase && <div className="text-[11px] font-medium text-faint mt-3 mb-1.5 first:mt-0">{PHASE_LABEL[u.phase]}</div>}
              <div className={cx('flex gap-3 rounded-md px-2 py-1.5 -mx-2', isActive && 'bg-sunk', u.speaker === 'customer' && 'flex-row')}>
                <button className="shrink-0 w-[74px] text-left" onClick={() => api.playRange(u.start, u.end)} title="Play this turn">
                  <div className={cx('text-[12px] font-semibold', u.speaker === 'agent' ? 'text-agent' : 'text-customer')}>{u.speaker === 'agent' ? 'Agent' : 'Customer'}</div>
                  <div className="text-[11px] text-faint tabular-nums">{fmtTime(u.start)}</div>
                </button>
                <div className="min-w-0 flex-1 leading-relaxed">
                  {render(text, ranges, times, api.time, api.playing)}
                  {u.lang !== 'en' && (
                    <span className="ml-2 align-middle">
                      <LangTag l={u.lang} />
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
