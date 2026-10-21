// Stereo call player: per-channel waveform (agent above, customer below), phase ribbon,
// evidence pins at their timestamps, click-to-seek, and range playback for evidence clips.
import { Pause, Play, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analyse, type AudioAnalysis, decode } from '../../engine/audio';
import { PHASE_LABEL } from '../../engine/prepare';
import { fmtClock, fmtTime } from '../../engine/text';
import type { AnalysedUtterance, Finding, Phase } from '../../engine/types';
import { cx } from '../kit';

export interface PlayerApi {
  time: number;
  playing: boolean;
  duration: number;
  hasAudio: boolean;
  analysis: AudioAnalysis | null;
  toggle(): void;
  seek(t: number): void;
  playRange(a: number, b: number): void;
}

export function usePlayer(url: string | undefined, fallbackDuration: number, transcript: AnalysedUtterance[]): PlayerApi & { el: HTMLAudioElement | null } {
  const ref = useRef<HTMLAudioElement | null>(null);
  const stopAt = useRef<number | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [analysis, setAnalysis] = useState<AudioAnalysis | null>(null);
  const speech = useRef<number | null>(null);

  useEffect(() => {
    setAnalysis(null);
    setTime(0);
    if (!url) return;
    const a = new Audio(url);
    a.preload = 'auto';
    ref.current = a;
    const onT = () => {
      setTime(a.currentTime);
      if (stopAt.current != null && a.currentTime >= stopAt.current) {
        a.pause();
        stopAt.current = null;
      }
    };
    const onP = () => setPlaying(!a.paused);
    a.addEventListener('timeupdate', onT);
    a.addEventListener('play', onP);
    a.addEventListener('pause', onP);
    let raf = 0;
    const tick = () => {
      if (!a.paused) onT();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    let cancelled = false;
    fetch(url)
      .then((r) => r.arrayBuffer())
      .then(decode)
      .then((ab) => !cancelled && setAnalysis(analyse(ab)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      a.pause();
      a.removeEventListener('timeupdate', onT);
      a.removeEventListener('play', onP);
      a.removeEventListener('pause', onP);
      ref.current = null;
    };
  }, [url]);

  // transcript-only calls: read the cited span aloud with the browser voice
  const speak = useCallback(
    (a: number, b: number) => {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const words = transcript.filter((u) => u.end > a && u.start < b);
      const text = words.map((u) => u.text.replace(/\[[A-Z_]+\]/g, 'redacted')).join(' ');
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-IN';
      u.onend = () => setPlaying(false);
      setPlaying(true);
      setTime(a);
      synth.speak(u);
      if (speech.current) clearTimeout(speech.current);
    },
    [transcript],
  );

  const duration = analysis?.duration ?? ref.current?.duration ?? fallbackDuration;
  return {
    el: ref.current,
    time,
    playing,
    duration: Number.isFinite(duration) && duration > 0 ? duration : fallbackDuration,
    hasAudio: !!url,
    analysis,
    toggle() {
      const a = ref.current;
      if (!a) {
        if (playing) {
          window.speechSynthesis?.cancel();
          setPlaying(false);
        } else speak(time, time + 30);
        return;
      }
      stopAt.current = null;
      if (a.paused) void a.play();
      else a.pause();
    },
    seek(t) {
      const a = ref.current;
      setTime(t);
      if (a) a.currentTime = t;
    },
    playRange(s, e) {
      const a = ref.current;
      if (!a) return speak(s, e);
      a.currentTime = Math.max(0, s - 0.35);
      stopAt.current = e + 0.4;
      setTime(a.currentTime);
      void a.play();
    },
  };
}

const PHASE_TONE: Record<Phase, string> = {
  opening: 'rgb(var(--faint) / 0.35)',
  verification: 'rgb(var(--review) / 0.35)',
  discovery: 'rgb(var(--s1) / 0.25)',
  resolution: 'rgb(var(--pass) / 0.35)',
  disclosure: 'rgb(var(--advisory) / 0.45)',
  closing: 'rgb(var(--faint) / 0.5)',
};

export function Waveform({ api, transcript, findings, selected, onSelect }: { api: PlayerApi; transcript: AnalysedUtterance[]; findings: Finding[]; selected: string | null; onSelect: (id: string) => void }) {
  const W = 1200;
  const H = 128;
  const mid = 58;
  const dur = api.duration || 1;
  const x = (t: number) => (t / dur) * W;
  const env = api.analysis?.envelope;
  const bars = useMemo(() => {
    if (env && env.length >= 2) return { L: env[0], R: env[1] };
    // no recording: synthesise lanes from diarized turn timings
    const n = 600;
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    for (const u of transcript) {
      for (let i = Math.floor((u.start / dur) * n); i < Math.min(n, Math.ceil((u.end / dur) * n)); i++) (u.speaker === 'agent' ? L : R)[i] = 0.35 + 0.25 * Math.abs(Math.sin(i * 1.7));
    }
    return { L, R };
  }, [env, transcript, dur]);
  const pins = findings.flatMap((f) => (f.evidence[0] ? [{ f, t: f.evidence[0].start }] : []));
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    api.seek(((e.clientX - r.left) / r.width) * dur);
  };
  const bw = W / bars.L.length;
  return (
    <div className="panel p-3">
      <div className="flex items-center gap-3 mb-2">
        <button className="btn-primary !px-2.5" onClick={api.toggle} aria-label={api.playing ? 'Pause' : 'Play'}>
          {api.playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <div className="font-medium tabular-nums text-[13px]">
          {fmtTime(api.time)} <span className="text-faint">/ {fmtClock(dur)}</span>
        </div>
        <div className="hidden md:flex items-center gap-3 text-[12px] text-muted ml-2">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-agent" />Agent · left channel</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-customer" />Customer · right channel</span>
        </div>
        <div className="ml-auto text-[12px] text-faint hidden lg:inline-flex items-center gap-1">
          {api.hasAudio ? (
            <>
              <Volume2 size={13} />
              {api.analysis ? 'Stereo recording · waveform decoded in your browser' : 'Decoding recording…'}
            </>
          ) : (
            'Transcript-only interaction · evidence is read aloud by the browser voice'
          )}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto cursor-pointer select-none" preserveAspectRatio="none" onClick={onClick} role="img" aria-label="Call waveform with evidence markers">
        {Array.from(bars.L).map((v, i) => (v > 0.01 ? <rect key={`l${i}`} x={i * bw} y={mid - 2 - v * 44} width={Math.max(0.6, bw - 0.6)} height={v * 44} fill="rgb(var(--agent))" opacity={x(api.time) > i * bw ? 1 : 0.55} /> : null))}
        {Array.from(bars.R).map((v, i) => (v > 0.01 ? <rect key={`r${i}`} x={i * bw} y={mid + 2} width={Math.max(0.6, bw - 0.6)} height={v * 44} fill="rgb(var(--customer))" opacity={x(api.time) > i * bw ? 1 : 0.55} /> : null))}
        <line x1={0} x2={W} y1={mid} y2={mid} stroke="rgb(var(--line))" />
        {/* phase ribbon */}
        {transcript.map((u, i) => {
          const end = transcript[i + 1]?.start ?? dur;
          return <rect key={u.id} x={x(u.start)} y={H - 10} width={Math.max(1, x(end) - x(u.start) - 1)} height={6} rx={2} fill={PHASE_TONE[u.phase]}><title>{PHASE_LABEL[u.phase]}</title></rect>;
        })}
        {pins.map(({ f, t }) => (
          <g key={f.criterionId} onClick={(e) => { e.stopPropagation(); onSelect(f.criterionId); }} className="cursor-pointer">
            <line x1={x(t)} x2={x(t)} y1={6} y2={H - 14} stroke={f.verdict === 'fail' ? 'rgb(var(--fail))' : 'rgb(var(--pass))'} strokeWidth={selected === f.criterionId ? 2.5 : 1} strokeDasharray={selected === f.criterionId ? undefined : '3 3'} />
            <circle cx={x(t)} cy={6} r={selected === f.criterionId ? 5 : 3.5} fill={f.verdict === 'fail' ? 'rgb(var(--fail))' : 'rgb(var(--pass))'} />
            <title>{`${f.criterionId} · ${f.verdict.toUpperCase()} at ${fmtTime(t)}`}</title>
          </g>
        ))}
        <line x1={x(api.time)} x2={x(api.time)} y1={0} y2={H} stroke="rgb(var(--ink))" strokeWidth={1.5} />
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-muted">
        {(Object.keys(PHASE_LABEL) as Phase[]).filter((p) => transcript.some((u) => u.phase === p)).map((p) => (
          <span key={p} className="inline-flex items-center gap-1"><span className="w-2.5 h-1.5 rounded-sm" style={{ background: PHASE_TONE[p] }} />{PHASE_LABEL[p]}</span>
        ))}
        <span className="inline-flex items-center gap-1 ml-auto"><span className={cx('w-2 h-2 rounded-full bg-fail')} />failed finding</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-pass" />passed finding</span>
      </div>
    </div>
  );
}
