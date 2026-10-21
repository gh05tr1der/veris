// Stage 2 (speech & conversation intelligence) and Stage 3 (privacy layer) on a transcript:
// language ID per utterance, PII redaction, time-mapping for evidence, and phase segmentation.

import { CONCEPT_BY_ID, FACTORS } from './lexicon';
import { identify } from './lid';
import { redact, toRawOffset } from './pii';
import type { AnalysedUtterance, Phase, Utterance } from './types';

export function analyseUtterances(utts: Utterance[]): AnalysedUtterance[] {
  const out = utts.map((u, index) => {
    const { text, redactions } = redact(u.text);
    const lid = identify(text.replace(/\[[A-Z_]+\]/g, ' '));
    // char ranges of each raw word
    const ranges: { s: number; e: number }[] = [];
    const re = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(u.text))) ranges.push({ s: m.index, e: m.index + m[0].length });
    const aligned = ranges.length === u.words.length;
    const timeOf = (rStart: number, rEnd: number) => {
      const a = toRawOffset(rStart, redactions, 'start');
      const b = toRawOffset(rEnd, redactions, 'end');
      if (aligned && u.words.length) {
        const idx = ranges.map((r, i) => (r.e > a && r.s < b ? i : -1)).filter((i) => i >= 0);
        if (idx.length) {
          const ws = idx.map((i) => u.words[i]);
          return { start: ws[0].s, end: ws[ws.length - 1].e, minConf: Math.min(...ws.map((w) => w.c)) };
        }
      }
      const L = Math.max(1, u.text.length);
      return { start: u.start + ((u.end - u.start) * a) / L, end: u.start + ((u.end - u.start) * b) / L, minConf: 0.9 };
    };
    return {
      id: u.id,
      index,
      speaker: u.speaker,
      start: u.start,
      end: u.end,
      text,
      lang: lid.lang,
      langScores: { hi: lid.hi, en: lid.en },
      phase: 'discovery' as Phase,
      redactions,
      timeOf,
    } satisfies AnalysedUtterance;
  });
  segmentPhases(out);
  return out;
}

const hits = (id: string, text: string) => CONCEPT_BY_ID[id].patterns.some((p) => p.test(text));

/** Rule-based phase segmentation so criteria evaluate against the right portion of the call. */
export function segmentPhases(t: AnalysedUtterance[]) {
  if (!t.length) return;
  const firstCustomer = t.findIndex((u) => u.speaker === 'customer');
  const lastAgents = t.map((u, i) => (u.speaker === 'agent' ? i : -1)).filter((i) => i >= 0);
  // closing = from the offer of further help / sign-off among the final turns
  let closingFrom = lastAgents.length ? lastAgents[lastAgents.length - 1] : t.length - 1;
  for (let i = Math.max(0, t.length - 5); i < t.length; i++) {
    if (t[i].speaker === 'agent' && (hits('further_assistance', t[i].text) || /\b(goodbye|good day|dhanyavaad|shubh ho|thank you for (calling|choosing|banking))\b/i.test(t[i].text))) {
      closingFrom = i;
      break;
    }
  }
  let verifying = false;
  t.forEach((u, i) => {
    let p: Phase = 'discovery';
    if (i <= Math.max(0, firstCustomer - 1) || i === 0) p = 'opening';
    else if (i >= closingFrom) p = 'closing';
    else if (u.speaker === 'agent' && FACTORS.some((f) => f.pattern.test(u.text))) {
      p = 'verification';
      verifying = true;
    } else if (verifying && u.speaker === 'customer') {
      p = 'verification';
      verifying = false;
    } else if (u.speaker === 'agent' && (hits('charge_disclosure', u.text) || hits('recording_disclosure', u.text) || hits('dues_disclosure', u.text))) p = 'disclosure';
    else if (u.speaker === 'agent' && (hits('next_steps', u.text) || hits('transaction_confirm', u.text))) p = 'resolution';
    else if (u.speaker === 'customer' && i > 0 && t[i - 1].phase === 'resolution') p = 'resolution';
    else verifying = false;
    u.phase = p;
  });
}

export const PHASE_LABEL: Record<Phase, string> = {
  opening: 'Opening',
  verification: 'Verification',
  discovery: 'Discovery',
  resolution: 'Resolution',
  disclosure: 'Disclosure',
  closing: 'Closing',
};
