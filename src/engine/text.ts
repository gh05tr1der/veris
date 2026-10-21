// Small text and numeric helpers shared across the engine.

/** Deterministic PRNG (mulberry32) so the synthetic corpus and clustering are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(next() * arr.length)];
    },
    chance(p: number) {
      return next() < p;
    },
    range(lo: number, hi: number) {
      return lo + (hi - lo) * next();
    },
    int(lo: number, hi: number) {
      return Math.floor(lo + (hi - lo + 1) * next());
    },
    gauss(mu = 0, sd = 1) {
      const u = Math.max(1e-9, next());
      const v = next();
      return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
}
export type Rng = ReturnType<typeof rng>;

/** Split an utterance into sentences, keeping exact character offsets. */
export function sentences(text: string): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  const re = /[^.!?]+(?:[.!?]+|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (!m[0].trim()) continue;
    let s = m.index;
    let e = m.index + m[0].length;
    while (s < e && /\s/.test(text[s])) s++;
    while (e > s && /\s/.test(text[e - 1])) e--;
    // don't split on abbreviations like "Ms." / "Mr." / "Dr."
    if (out.length && /\b(Ms|Mr|Mrs|Dr|St)\.$/.test(out[out.length - 1].text)) {
      const prev = out.pop()!;
      out.push({ start: prev.start, end: e, text: text.slice(prev.start, e) });
      continue;
    }
    out.push({ start: s, end: e, text: text.slice(s, e) });
  }
  return out;
}

/** The sentence of `text` that contains character position `pos`. */
export function sentenceAt(text: string, pos: number) {
  return sentences(text).find((s) => pos >= s.start && pos < s.end) ?? { start: 0, end: text.length, text };
}

/** Normalise for tolerant comparison: lowercase, strip punctuation, collapse spaces. */
export function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/[“”"‘’'`]/g, "'")
    .replace(/[^\p{L}\p{N}'\[\]_ ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function fmtTime(sec: number) {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${r.toFixed(1).padStart(4, '0')}`;
}

export function fmtClock(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export const tokenize = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];

export function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}
