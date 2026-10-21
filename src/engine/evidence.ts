// The evidence gate. A verdict may only be published if every cited quote can be found
// verbatim in the analysis-zone transcript, in the utterance it claims, and bound to an
// audio timestamp. Quotes that fail verification are rejected; a non-N/A verdict left
// with no verified evidence is suppressed and escalated — never published.

import { norm } from './text';
import type { AnalysedUtterance, Evidence, EvidenceCandidate, RawFinding } from './types';

/** Locate `quote` inside `text`: exact first, then whitespace/case/punctuation-tolerant. */
export function locate(text: string, quote: string): { start: number; end: number; match: 'exact' | 'normalized' } | null {
  const q = quote.trim().replace(/^["“'‘]|["”'’]$/g, '').trim();
  if (q.length < 4) return null;
  const i = text.indexOf(q);
  if (i >= 0) return { start: i, end: i + q.length, match: 'exact' };
  // tolerant match: build a normalised copy of text with an index map back to the original
  const map: number[] = [];
  let nt = '';
  let lastSpace = true;
  for (let k = 0; k < text.length; k++) {
    const ch = text[k];
    const n = norm(ch);
    if (!n) {
      if (!lastSpace) {
        nt += ' ';
        map.push(k);
        lastSpace = true;
      }
      continue;
    }
    nt += n;
    for (let j = 0; j < n.length; j++) map.push(k);
    lastSpace = false;
  }
  const nq = norm(q);
  if (nq.length < 4) return null;
  const j = nt.indexOf(nq);
  if (j < 0) return null;
  return { start: map[j], end: map[Math.min(map.length - 1, j + nq.length - 1)] + 1, match: 'normalized' };
}

export interface GateResult {
  evidence: Evidence[];
  rejected: EvidenceCandidate[];
  gate: 'verified' | 'failed' | 'not-required';
  confidence: number;
}

export function gate(raw: RawFinding, transcript: AnalysedUtterance[]): GateResult {
  const evidence: Evidence[] = [];
  const rejected: EvidenceCandidate[] = [];
  for (const cand of raw.evidence) {
    // The model may cite the wrong utterance id; we accept the quote only where it truly occurs,
    // preferring the cited utterance.
    const cited = transcript.find((u) => u.id === cand.utteranceId);
    const order = cited ? [cited, ...transcript.filter((u) => u !== cited)] : transcript;
    let placed: Evidence | null = null;
    for (const u of order) {
      const loc = locate(u.text, cand.quote);
      if (!loc) continue;
      const time = u.timeOf(loc.start, loc.end);
      placed = {
        utteranceId: u.id,
        quote: u.text.slice(loc.start, loc.end),
        role: cand.role,
        speaker: u.speaker,
        start: time.start,
        end: time.end,
        match: loc.match,
        minConf: time.minConf,
      };
      break;
    }
    if (placed) evidence.push(placed);
    else rejected.push(cand);
  }
  const needs = raw.verdict !== 'na' && raw.evidence.length > 0;
  const passWithoutSpan = raw.verdict === 'pass' && raw.evidence.length === 0;
  let g: GateResult['gate'];
  if (raw.verdict === 'na' || passWithoutSpan) g = 'not-required';
  else if (!needs) g = 'failed'; // a FAIL with no cited span at all is unevidenced by definition
  else g = evidence.length ? 'verified' : 'failed';
  // ASR uncertainty on the cited words lowers confidence; partially rejected evidence lowers it further
  const minConf = evidence.length ? Math.min(...evidence.map((e) => e.minConf)) : 1;
  let confidence = raw.confidence * (0.72 + 0.28 * minConf);
  if (rejected.length && evidence.length) confidence *= 0.85;
  return { evidence, rejected, gate: g, confidence: +Math.min(0.99, confidence).toFixed(3) };
}
