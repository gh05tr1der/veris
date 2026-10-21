// Browser-side signal processing on the actual recording: decode, per-channel energy envelope,
// voice-activity segments per channel (stereo channel separation = diarization), overlap from
// audio, and agreement between audio activity and transcript speaker turns.

import type { Utterance } from './types';

export interface AudioAnalysis {
  sampleRate: number;
  duration: number;
  channels: number;
  envelope: Float32Array[]; // per channel, normalised 0..1, `bins` points
  bins: number;
  activity: { start: number; end: number }[][]; // per channel
  overlapSec: number;
}

const FRAME = 0.02;

export async function decode(buf: ArrayBuffer): Promise<AudioBuffer> {
  const Ctx = (globalThis as unknown as { OfflineAudioContext: typeof OfflineAudioContext }).OfflineAudioContext;
  const ctx = new Ctx(2, 16000, 16000);
  return ctx.decodeAudioData(buf.slice(0));
}

export function analyse(ab: AudioBuffer, bins = 1400): AudioAnalysis {
  const sr = ab.sampleRate;
  const frame = Math.round(sr * FRAME);
  const envelope: Float32Array[] = [];
  const activity: { start: number; end: number }[][] = [];
  const frames: Float32Array[] = [];
  for (let ch = 0; ch < ab.numberOfChannels; ch++) {
    const x = ab.getChannelData(ch);
    const nF = Math.floor(x.length / frame);
    const rms = new Float32Array(nF);
    for (let f = 0; f < nF; f++) {
      let s = 0;
      for (let i = f * frame; i < (f + 1) * frame; i++) s += x[i] * x[i];
      rms[f] = Math.sqrt(s / frame);
    }
    frames.push(rms);
    // adaptive threshold: noise floor (20th percentile) x 4, with an absolute minimum
    const sorted = Float32Array.from(rms).sort();
    const floor = sorted[Math.floor(sorted.length * 0.2)] ?? 0;
    const peak = sorted[Math.floor(sorted.length * 0.99)] ?? 1;
    const th = Math.max(floor * 4, peak * 0.06, 0.004);
    const segs: { start: number; end: number }[] = [];
    let open: number | null = null;
    let quiet = 0;
    for (let f = 0; f < nF; f++) {
      if (rms[f] > th) {
        if (open === null) open = f;
        quiet = 0;
      } else if (open !== null && ++quiet > 15) {
        const end = f - quiet + 1;
        if ((end - open) * FRAME >= 0.2) segs.push({ start: open * FRAME, end: end * FRAME });
        open = null;
        quiet = 0;
      }
    }
    if (open !== null) segs.push({ start: open * FRAME, end: nF * FRAME });
    activity.push(segs);
    const env = new Float32Array(bins);
    const per = nF / bins;
    for (let b = 0; b < bins; b++) {
      let m = 0;
      for (let f = Math.floor(b * per); f < Math.floor((b + 1) * per); f++) m = Math.max(m, rms[f] ?? 0);
      env[b] = Math.min(1, m / (peak || 1));
    }
    envelope.push(env);
  }
  let overlap = 0;
  if (activity.length === 2) for (const a of activity[0]) for (const b of activity[1]) overlap += Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  return { sampleRate: sr, duration: ab.duration, channels: ab.numberOfChannels, envelope, bins, activity, overlapSec: overlap };
}

/** Share of each transcript turn's duration where its speaker's channel is active (stereo only). */
export function diarizationAgreement(a: AudioAnalysis, utts: Utterance[]) {
  if (a.channels < 2) return null;
  let agree = 0;
  let total = 0;
  for (const u of utts) {
    const ch = u.speaker === 'agent' ? 0 : 1;
    const dur = u.end - u.start;
    let act = 0;
    for (const s of a.activity[ch]) act += Math.max(0, Math.min(u.end, s.end) - Math.max(u.start, s.start));
    agree += Math.min(dur, act);
    total += dur;
  }
  return total ? agree / total : null;
}

/** Speaker for a time window from channel energy (used to label ASR segments of an upload). */
export function speakerFor(a: AudioAnalysis, start: number, end: number): 'agent' | 'customer' | null {
  if (a.channels < 2) return null;
  const act = (ch: number) => a.activity[ch].reduce((s, x) => s + Math.max(0, Math.min(end, x.end) - Math.max(start, x.start)), 0);
  const l = act(0);
  const r = act(1);
  if (l === 0 && r === 0) return null;
  return l >= r ? 'agent' : 'customer';
}
