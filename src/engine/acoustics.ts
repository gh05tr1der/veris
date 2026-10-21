// Deterministic conversational analytics computed from diarized timings — never by the LLM.
// Silence, holds, overtalk, interruptions, talk share and speaking rate.

import type { Acoustics, AnalysedUtterance, SentimentPoint, Utterance } from './types';

export function computeAcoustics(utts: Utterance[]): Acoustics {
  const agent = utts.filter((u) => u.speaker === 'agent');
  const cust = utts.filter((u) => u.speaker === 'customer');
  const dur = (xs: Utterance[]) => xs.reduce((a, u) => a + (u.end - u.start), 0);
  const agentTalk = dur(agent);
  const customerTalk = dur(cust);

  // silence: gaps where nobody speaks
  const spans = utts.map((u) => [u.start, u.end] as [number, number]).sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([...s]);
  }
  const gaps: { start: number; end: number }[] = [];
  for (let i = 1; i < merged.length; i++) gaps.push({ start: merged[i - 1][1], end: merged[i][0] });
  const silences = gaps.filter((g) => g.end - g.start >= 3);
  const silenceTotal = silences.reduce((a, g) => a + g.end - g.start, 0);
  const longestSilence = silences.length ? silences.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a)) : null;
  const holds = gaps.filter((g) => g.end - g.start >= 10);

  // overtalk + interruptions (agent starts while the customer is still talking, and the customer yields)
  const overtalk: { start: number; end: number }[] = [];
  const interruptions: Acoustics['interruptions'] = [];
  for (const a of agent) {
    for (const c of cust) {
      const s = Math.max(a.start, c.start);
      const e = Math.min(a.end, c.end);
      if (e - s > 0.25) {
        overtalk.push({ start: s, end: e });
        const agentCutIn = a.start > c.start + 0.5 && a.start < c.end;
        const customerYielded = c.end <= a.start + 2.5;
        if (agentCutIn && customerYielded && e - s >= 0.5) {
          interruptions.push({ at: a.start, agentUtt: a.id, customerUtt: c.id, overlap: +(e - s).toFixed(2) });
        }
      }
    }
  }
  const words = (xs: Utterance[]) => xs.reduce((a, u) => a + u.words.length, 0);
  return {
    agentTalk,
    customerTalk,
    agentTalkShare: agentTalk / Math.max(1e-6, agentTalk + customerTalk),
    silenceTotal,
    longestSilence,
    holds,
    overtalk,
    interruptions,
    wpm: {
      agent: agentTalk ? (words(agent) / agentTalk) * 60 : 0,
      customer: customerTalk ? (words(cust) / customerTalk) * 60 : 0,
    },
  };
}

// ---------- Sentiment (customer side, lexicon-based, code-mix aware) ----------
const POS = /\b(thank|thanks|great|perfect|clear|helpful|good|appreciate|wonderful|excellent|resolved|shukriya|dhanyavaad|accha|badhiya|theek hai)\b/gi;
const NEG = /\b(not fair|unfair|worried|frustrat\w*|harassment|angry|upset|problem|charged twice|wrong|terrible|ridiculous|waiting|on hold|cannot|can't|didn't tell|why am i|supervisor|complain\w*|pareshan|bakwas|nahi kiya|wasting)\b/gi;

export function utteranceSentiment(text: string) {
  const pos = (text.match(POS) ?? []).length;
  const neg = (text.match(NEG) ?? []).length;
  const raw = (pos - 1.3 * neg) / Math.max(1.5, pos + neg);
  return Math.max(-1, Math.min(1, raw));
}

export function sentimentTrajectory(t: AnalysedUtterance[]): SentimentPoint[] {
  const pts: SentimentPoint[] = [];
  let ema = 0.1;
  for (const u of t) {
    if (u.speaker !== 'customer') continue;
    const raw = utteranceSentiment(u.text);
    ema = 0.45 * ema + 0.55 * raw;
    pts.push({ t: (u.start + u.end) / 2, utteranceId: u.id, score: +ema.toFixed(3), raw: +raw.toFixed(3) });
  }
  return pts;
}
