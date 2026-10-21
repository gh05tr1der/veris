// PII / sensitive-data detection and redaction — the only path from the Raw Zone to the
// Analysis Zone. Detection combines pattern rules with validation (Luhn for card numbers,
// Verhoeff for Aadhaar) and conversational context (a date with a birth year said in the
// verification phase is a DOB). Everything downstream, including any LLM, sees only the
// redacted text produced here.

import type { PiiType, Redaction } from './types';

export function luhnValid(digits: string) {
  const d = digits.replace(/\D/g, '');
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = +d[i];
    if (dbl) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

const V_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const V_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
export function verhoeffValid(digits: string) {
  const d = digits.replace(/\D/g, '');
  if (d.length !== 12 || /^[01]/.test(d)) return false;
  let c = 0;
  d.split('')
    .reverse()
    .forEach((ch, i) => {
      c = V_D[c][V_P[i % 8][+ch]];
    });
  return c === 0;
}

const MONTHS = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const NUMWORD = '(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|double|triple)';

interface Rule {
  type: PiiType;
  re: RegExp;
  validate?: (m: string) => boolean;
}

const RULES: Rule[] = [
  { type: 'EMAIL', re: /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g },
  { type: 'CARD', re: /\b(?:\d[ -]?){12,18}\d\b/g, validate: (m) => luhnValid(m) },
  { type: 'AADHAAR', re: /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g, validate: (m) => verhoeffValid(m) },
  { type: 'PAN', re: /\b[A-Z]{5}\d{4}[A-Z]\b/g },
  { type: 'PHONE', re: /(?:\+91[ -]?)?\b[6-9]\d{4}[ -]?\d{5}\b/g },
  { type: 'DOB', re: new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTHS}\\s*,?\\s+(?:19[3-9]\\d|200\\d)\\b`, 'gi') },
  { type: 'DOB', re: /\b\d{1,2}[/-]\d{1,2}[/-](?:19[3-9]\d|200\d)\b/g },
  { type: 'POLICY_ID', re: /\b[A-Z]{2,3}\d{6,10}\b/g },
  { type: 'ACCOUNT', re: /\b\d{9,18}\b/g },
  { type: 'DIGITS', re: new RegExp(`\\b${NUMWORD}(?:[\\s,-]+${NUMWORD}){5,}\\b`, 'gi') },
];

export function detect(text: string): { type: PiiType; start: number; end: number }[] {
  const hits: { type: PiiType; start: number; end: number }[] = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text))) {
      const s = m.index;
      const e = s + m[0].length;
      if (rule.validate && !rule.validate(m[0])) continue;
      if (hits.some((h) => s < h.end && e > h.start)) continue; // earlier, stronger rule wins
      hits.push({ type: rule.type, start: s, end: e });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

export function redact(text: string): { text: string; redactions: Redaction[] } {
  const hits = detect(text);
  let out = '';
  let cur = 0;
  const redactions: Redaction[] = [];
  for (const h of hits) {
    out += text.slice(cur, h.start);
    const ph = `[${h.type}]`;
    redactions.push({ type: h.type, start: h.start, end: h.end, rStart: out.length, rEnd: out.length + ph.length });
    out += ph;
    cur = h.end;
  }
  out += text.slice(cur);
  return { text: out, redactions };
}

/** Map a char offset in redacted text back to the raw text (placeholders map to the whole span). */
export function toRawOffset(rPos: number, redactions: Redaction[], edge: 'start' | 'end') {
  let delta = 0;
  for (const r of redactions) {
    if (rPos < r.rStart) break;
    if (rPos < r.rEnd || (edge === 'end' && rPos === r.rEnd)) return edge === 'start' ? r.start : r.end;
    delta = r.end - r.rEnd;
  }
  return rPos + delta;
}
