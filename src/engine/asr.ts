// ASR adapters for uploaded recordings. VERIS treats ASR as an interchangeable component:
//  * OpenAI-compatible /audio/transcriptions (OpenAI Whisper, Groq, a self-hosted
//    faster-whisper server…) with word timestamps;
//  * transcript import, for centres whose recorder already produces transcripts.
// Speaker labels come from stereo channel energy when available.

import { type AudioAnalysis, speakerFor } from './audio';
import type { Speaker, Utterance, Word } from './types';

export interface AsrConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const DEFAULT_ASR: AsrConfig = { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'whisper-1' };

interface WSeg {
  start: number;
  end: number;
  text: string;
  avg_logprob?: number;
}
interface WWord {
  word: string;
  start: number;
  end: number;
}

export async function transcribe(cfg: AsrConfig, file: Blob, name: string, audio: AudioAnalysis | null): Promise<Utterance[]> {
  if (!cfg.apiKey) throw new Error('No ASR key configured. Add one in Settings → Speech-to-text, or import a transcript instead.');
  const fd = new FormData();
  fd.append('file', file, name);
  fd.append('model', cfg.model);
  fd.append('response_format', 'verbose_json');
  fd.append('timestamp_granularities[]', 'word');
  fd.append('timestamp_granularities[]', 'segment');
  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, { method: 'POST', headers: { authorization: `Bearer ${cfg.apiKey}` }, body: fd });
  if (!res.ok) throw new Error(`Transcription failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { segments?: WSeg[]; words?: WWord[] };
  return fromSegments(data.segments ?? [], data.words ?? [], audio);
}

export function fromSegments(segments: WSeg[], words: WWord[], audio: AudioAnalysis | null): Utterance[] {
  let lastSpeaker: Speaker = 'customer';
  const raw = segments.map((s, i) => {
    const conf = s.avg_logprob != null ? Math.exp(s.avg_logprob) : 0.9;
    // stereo: channel energy decides; mono: alternate on turn gaps (labelled as a fallback in the UI)
    let speaker = audio ? speakerFor(audio, s.start, s.end) : null;
    if (!speaker) speaker = i === 0 ? 'agent' : s.start - segments[i - 1].end > 0.6 ? (lastSpeaker === 'agent' ? 'customer' : 'agent') : lastSpeaker;
    lastSpeaker = speaker;
    const text = s.text.trim();
    const toks = text.split(/\s+/).filter(Boolean);
    const inSeg = words.filter((w) => w.start >= s.start - 0.05 && w.end <= s.end + 0.05);
    const ws: Word[] = toks.map((w, k) => {
      const src = inSeg[k];
      const st = src ? src.start : s.start + ((s.end - s.start) * k) / toks.length;
      const en = src ? src.end : s.start + ((s.end - s.start) * (k + 1)) / toks.length;
      return { w, s: st, e: en, c: +conf.toFixed(3) };
    });
    return { speaker, start: s.start, end: s.end, text, words: ws };
  });
  // merge consecutive segments of the same speaker into one turn
  const merged: Omit<Utterance, 'id'>[] = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && last.speaker === r.speaker && r.start - last.end < 1.0) {
      last.text = `${last.text} ${r.text}`;
      last.words = [...last.words, ...r.words];
      last.end = r.end;
    } else merged.push({ ...r });
  }
  return merged.map((u, i) => ({ id: `U${String(i + 1).padStart(2, '0')}`, ...u }));
}

/**
 * Import a transcript. Accepts VERIS JSON ({utterances:[{speaker,start,end,text}]}) or plain
 * text lines like "AGENT: …" / "CUSTOMER: …" (timings are then estimated from word counts).
 */
export function importTranscript(text: string): Utterance[] {
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) {
    const obj = JSON.parse(t);
    const list = Array.isArray(obj) ? obj : obj.utterances;
    return list.map((u: { speaker: string; start?: number; end?: number; text: string }, i: number) => withWords(i, u.speaker.toLowerCase().startsWith('a') ? 'agent' : 'customer', u.text, u.start, u.end));
  }
  let clock = 0.5;
  const out: Utterance[] = [];
  for (const line of t.split(/\n+/)) {
    const m = line.match(/^\s*(agent|customer|a|c|caller|rep)\s*[:\-]\s*(.+)$/i);
    if (!m) continue;
    const speaker: Speaker = /^(agent|a|rep)$/i.test(m[1]) ? 'agent' : 'customer';
    const dur = Math.max(0.8, m[2].split(/\s+/).length * 0.36);
    out.push(withWords(out.length, speaker, m[2].trim(), clock, clock + dur));
    clock += dur + 0.7;
  }
  if (!out.length) throw new Error('No turns found. Use lines starting with “Agent:” or “Customer:”, or VERIS JSON.');
  return out;
}

function withWords(i: number, speaker: Speaker, text: string, start = i * 5, end = start + Math.max(0.8, text.split(/\s+/).length * 0.36)): Utterance {
  const toks = text.split(/\s+/).filter(Boolean);
  const words = toks.map((w, k) => ({ w, s: start + ((end - start) * k) / toks.length, e: start + ((end - start) * (k + 0.9)) / toks.length, c: 0.9 }));
  return { id: `U${String(i + 1).padStart(2, '0')}`, speaker, start, end, text, words };
}
