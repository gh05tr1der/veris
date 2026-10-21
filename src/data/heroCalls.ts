// The five demo recordings. Audio and word timings are produced by scripts/synthesize_audio.py
// (stereo: agent left, customer right). These calls are recent and have not been reviewed,
// so they carry no reviewer labels — exactly the situation VERIS is built for.

import timings from './generated/heroTimings.json';
import type { Call, QueueId, Speaker } from '../engine/types';

interface HeroMeta {
  id: string;
  queue: QueueId;
  client: string;
  agentId: string;
  agentName: string;
  date: string;
  title: string;
  blurb: string;
}

export const HERO_META: HeroMeta[] = [
  {
    id: 'VRS-INS-0412', queue: 'INS', client: 'Suraksha General Insurance', agentId: 'A-101', agentName: 'Rohan Mehta', date: '2026-10-20T11:42:00+05:30',
    title: 'Mid-term motor policy cancellation',
    blurb: 'Charge disclosed after the cancellation was confirmed; one-factor verification; an interruption. The headline demo call.',
  },
  {
    id: 'VRS-CRD-0907', queue: 'CRD', client: 'Unity Bank', agentId: 'A-201', agentName: 'Neha Sharma', date: '2026-10-20T10:05:00+05:30',
    title: 'Unauthorised card transaction (Hinglish)',
    blurb: 'Code-mixed Hindi–English call. Utterance-level language ID and per-language reliability.',
  },
  {
    id: 'VRS-COL-1131', queue: 'COL', client: 'Unity Bank', agentId: 'A-301', agentName: 'Vikram Singh', date: '2026-10-19T16:40:00+05:30',
    title: 'Overdue personal loan',
    blurb: 'Third-party disclosure threat and no hardship option. Critical severity, mandatory human review.',
  },
  {
    id: 'VRS-CRD-0951', queue: 'CRD', client: 'Unity Bank', agentId: 'A-202', agentName: 'Karthik Rao', date: '2026-10-20T09:20:00+05:30',
    title: 'Duplicate hotel charge',
    blurb: 'Customer reads out a full card number and PAN. Shows redaction before any evaluation.',
  },
  {
    id: 'VRS-INS-0388', queue: 'INS', client: 'Suraksha General Insurance', agentId: 'A-102', agentName: 'Ananya Iyer', date: '2026-10-19T15:10:00+05:30',
    title: 'Cancellation handled well',
    blurb: 'Charge disclosed before confirming, summary and closing. A best-practice example.',
  },
];

type T = Record<string, { duration: number; audio: string; utterances: { speaker: Speaker; start: number; end: number; text: string; words: { w: string; s: number; e: number; c: number }[] }[] }>;

export function heroCalls(): Call[] {
  const t = timings as T;
  return HERO_META.map((m) => {
    const rec = t[m.id];
    return {
      id: m.id,
      client: m.client,
      queue: m.queue,
      agentId: m.agentId,
      agentName: m.agentName,
      date: new Date(m.date).toISOString(),
      duration: rec.duration,
      audioUrl: rec.audio,
      utterances: rec.utterances.map((u, i) => ({ id: `U${String(i + 1).padStart(2, '0')}`, ...u })),
      outcome: { repeatContact7d: false, escalated: m.id === 'VRS-COL-1131', ticketReopened: false, csat: null },
      source: 'demo-recording',
    } satisfies Call;
  });
}
