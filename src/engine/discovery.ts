// Emerging-issue discovery: unsupervised clustering of what customers say, so the system can
// surface recurring problems nobody wrote a QA question about. TF-IDF over the redacted
// customer side of each call, cosine k-means (k chosen by silhouette), weekly trend per
// cluster, and a coverage check against the active scorecard.

import { rng, tokenize } from './text';
import type { Criterion } from './types';

const STOP = new Set(
  `the a an and or but if of to in on at for with from by is are was were be been am i you he she it we they me my your our
  this that these those there here what which who how why when where do does did have has had will would can could should
  may might just so very too also not no yes okay ok please thank thanks hi hello sir madam maam want need know got get
  one two three last next week month today now been about some any all its it's i'm don't didn't can't im dont didnt cant
  hai hain ho hoon main mein me mera meri mere aap aapka aapki aapke kya nahi haan ji theek toh bhi aur ke ki ka ko se pe
  par tak liye yeh woh abhi kuch bahut kar karna kiya raha rahi gaya gayi diya hua hui hue tha thi bas wahi maine hum
  rupees rupee time call calling really already still just only like that's yeah well
  speaking boliye bol mobile itna shukriya mujhe apni karni dijiye bataiye sakta sakti baar aage cannot without people samajh gaya`.split(/\s+/),
);

// redaction placeholders and vehicle/brand names carry no issue signal
const PII_TOKENS = new Set('dob phone pan email policy_id aadhaar account digits hyundai creta maruti swift tata nexon honda city mahindra xuv700 kia seltos baleno'.split(' '));

export interface Doc {
  id: string;
  date: string;
  text: string;
}

export interface Cluster {
  id: number;
  terms: string[];
  label: string;
  size: number;
  callIds: string[];
  examples: { callId: string; text: string }[];
  weekly: { week: string; count: number }[];
  growth: number | null; // last 3 weeks vs previous 3
  pGrowth: number;
  emerging: boolean;
  covered: { criterionId: string; term: string } | null;
}

function vectorize(docs: Doc[]) {
  const toks = docs.map((d) => {
    const uni = tokenize(d.text).filter((t) => t.length > 2 && !STOP.has(t) && !/^\d/.test(t) && !PII_TOKENS.has(t));
    // adjacent content-word bigrams separate e.g. "cancellation charge" from "charged twice"
    return [...uni, ...uni.slice(1).map((t, i) => `${uni[i]} ${t}`)];
  });
  const df = new Map<string, number>();
  toks.forEach((ts) => new Set(ts).forEach((t) => df.set(t, (df.get(t) ?? 0) + 1)));
  const vocab = [...df.entries()].filter(([, n]) => n >= 3 && n <= docs.length * 0.5).map(([t]) => t);
  const index = new Map(vocab.map((t, i) => [t, i]));
  const idf = vocab.map((t) => Math.log((1 + docs.length) / (1 + df.get(t)!)) + 1);
  const vecs = toks.map((ts) => {
    const v = new Float64Array(vocab.length);
    ts.forEach((t) => {
      const i = index.get(t);
      if (i !== undefined) v[i] += 1;
    });
    let norm = 0;
    for (let i = 0; i < v.length; i++) {
      v[i] = v[i] ? (1 + Math.log(v[i])) * idf[i] : 0;
      norm += v[i] * v[i];
    }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= norm;
    return v;
  });
  return { vocab, vecs };
}

const dot = (a: Float64Array, b: Float64Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

function kmeans(vecs: Float64Array[], k: number, seed: number) {
  const r = rng(seed);
  const dim = vecs[0].length;
  // k-means++ initialisation on cosine distance
  const cents: Float64Array[] = [Float64Array.from(vecs[Math.floor(r.next() * vecs.length)])];
  while (cents.length < k) {
    const d = vecs.map((v) => Math.max(0, 1 - Math.max(...cents.map((c) => dot(v, c)))) ** 2);
    const tot = d.reduce((a, b) => a + b, 0);
    let x = r.next() * tot;
    let pick = 0;
    for (; pick < d.length - 1; pick++) if ((x -= d[pick]) <= 0) break;
    cents.push(Float64Array.from(vecs[pick]));
  }
  let assign = new Array(vecs.length).fill(0);
  for (let iter = 0; iter < 30; iter++) {
    const next = vecs.map((v) => {
      let best = 0;
      let bs = -Infinity;
      cents.forEach((c, j) => {
        const s = dot(v, c);
        if (s > bs) {
          bs = s;
          best = j;
        }
      });
      return best;
    });
    const changed = next.some((a, i) => a !== assign[i]);
    assign = next;
    for (let j = 0; j < k; j++) {
      const c = new Float64Array(dim);
      let n = 0;
      vecs.forEach((v, i) => {
        if (assign[i] === j) {
          n++;
          for (let q = 0; q < dim; q++) c[q] += v[q];
        }
      });
      let norm = 0;
      for (let q = 0; q < dim; q++) norm += c[q] * c[q];
      norm = Math.sqrt(norm) || 1;
      for (let q = 0; q < dim; q++) c[q] /= norm;
      if (n) cents[j] = c;
    }
    if (!changed && iter > 0) break;
  }
  return { assign, cents };
}

function silhouette(vecs: Float64Array[], assign: number[], k: number) {
  // cosine-distance silhouette on a deterministic subsample for speed
  const idx = vecs.map((_, i) => i).filter((i) => i % 2 === 0);
  let total = 0;
  for (const i of idx) {
    const dists = new Array(k).fill(0);
    const counts = new Array(k).fill(0);
    for (const j of idx) {
      if (i === j) continue;
      dists[assign[j]] += 1 - dot(vecs[i], vecs[j]);
      counts[assign[j]]++;
    }
    const a = counts[assign[i]] ? dists[assign[i]] / counts[assign[i]] : 0;
    let b = Infinity;
    for (let c = 0; c < k; c++) if (c !== assign[i] && counts[c]) b = Math.min(b, dists[c] / counts[c]);
    total += b === Infinity ? 0 : (b - a) / Math.max(a, b);
  }
  return total / idx.length;
}


/** P(X >= k) for X ~ Binomial(n, 0.5) */
export function binomTail(n: number, k: number) {
  if (n === 0) return 1;
  let lf = 0;
  const logf = [0];
  for (let i = 1; i <= n; i++) logf[i] = (lf += Math.log(i));
  let p = 0;
  for (let x = k; x <= n; x++) p += Math.exp(logf[n] - logf[x] - logf[n - x] - n * Math.LN2);
  return Math.min(1, p);
}

function centroid(vecs: Float64Array[], idx: number[]) {
  const c = new Float64Array(vecs[0].length);
  for (const i of idx) for (let q = 0; q < c.length; q++) c[q] += vecs[i][q];
  let n = 0;
  for (let q = 0; q < c.length; q++) n += c[q] * c[q];
  n = Math.sqrt(n) || 1;
  for (let q = 0; q < c.length; q++) c[q] /= n;
  return c;
}

function mergeClose(vecs: Float64Array[], assign: number[], cents: Float64Array[], threshold: number) {
  let groups = cents.map((_, j) => assign.map((a, i) => (a === j ? i : -1)).filter((i) => i >= 0)).filter((g) => g.length);
  let cs = groups.map((g) => centroid(vecs, g));
  for (;;) {
    let best: [number, number, number] | null = null;
    for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) {
      const sim = dot(cs[a], cs[b]);
      if (sim >= threshold && (!best || sim > best[2])) best = [a, b, sim];
    }
    if (!best) break;
    const [a, b] = best;
    groups[a] = [...groups[a], ...groups[b]];
    groups = groups.filter((_, i) => i !== b);
    cs = groups.map((g) => centroid(vecs, g));
  }
  const out = new Array(vecs.length).fill(0);
  groups.forEach((g, j) => g.forEach((i) => (out[i] = j)));
  return { assign: out, cents: cs };
}

export function discover(docs: Doc[], criteria: Criterion[], asOf: string, opts: { kMin?: number; kMax?: number; seed?: number; windows?: number; mergeAt?: number } = {}): { clusters: Cluster[]; k: number; silhouette: number } {
  const { vocab, vecs } = vectorize(docs);
  let best = { k: 0, s: -Infinity, assign: [] as number[], cents: [] as Float64Array[] };
  for (let k = opts.kMin ?? 6; k <= (opts.kMax ?? 11); k++) {
    const { assign, cents } = kmeans(vecs, k, (opts.seed ?? 7) + k);
    const s = silhouette(vecs, assign, k);
    if (s > best.s) best = { k, s, assign, cents };
  }
  // merge clusters whose centroids are close: k-means with k chosen by silhouette tends to split
  // one theme across two clusters when vocabulary varies (paraphrases, code-mixing)
  const merged = mergeClose(vecs, best.assign, best.cents, opts.mergeAt ?? 0.3);
  best = { ...best, assign: merged.assign, cents: merged.cents, k: merged.cents.length };
  // rolling 7-day windows ending at asOf, oldest first, so the latest window is never partial
  const nW = opts.windows ?? 6;
  const end = new Date(asOf).getTime();
  const windowOf = (d: string) => Math.floor((end - new Date(d).getTime()) / (7 * 864e5));
  const weeks = Array.from({ length: nW }, (_, i) => new Date(end - (nW - i) * 7 * 864e5 + 864e5).toISOString().slice(0, 10));
  const critText = criteria.map((c) => ({ id: c.id, text: c.text.toLowerCase() }));
  const clusters: Cluster[] = best.cents.map((c, j) => {
    const members = docs.map((d, i) => ({ d, i })).filter((x) => best.assign[x.i] === j);
    const terms = [...c].map((w, i) => ({ w, t: vocab[i] })).sort((a, b) => b.w - a.w).slice(0, 6).map((x) => x.t);
    const weekly = weeks.map((w, i) => ({ week: w, count: members.filter((m) => windowOf(m.d.date) === nW - 1 - i).length }));
    const last3 = weekly.slice(-3).reduce((a, b) => a + b.count, 0);
    const prev3 = weekly.slice(-6, -3).reduce((a, b) => a + b.count, 0);
    const growth = prev3 ? (last3 - prev3) / prev3 : null;
    const examples = members
      .map((m) => ({ m, s: dot(vecs[m.i], c) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 3)
      .map(({ m }) => {
        // quote the sentence that carries the cluster's leading term, not the call's first line
        const sents = m.d.text.split(/(?<=[.?!])\s/);
        const lead = terms.find((t) => !t.includes(' ')) ?? '';
        return { callId: m.d.id, text: sents.find((x) => x.toLowerCase().includes(lead)) ?? sents[0] };
      });
    let covered: Cluster['covered'] = null;
    for (const t of terms.slice(0, 4).filter((x) => !x.includes(' ') && x.length >= 5)) {
      const hit = critText.find((ct) => new RegExp(`\\b${t}\\b`).test(ct.text));
      if (hit) {
        covered = { criterionId: hit.id, term: t };
        break;
      }
    }
    return {
      id: j,
      terms,
      label: terms.slice(0, 3).map((t, i) => (i === 0 ? t[0].toUpperCase() + t.slice(1) : t)).join(', '),
      size: members.length,
      callIds: members.map((m) => m.d.id),
      examples,
      weekly,
      growth,
      // one-sided binomial test: under a constant rate, each of the last+previous calls is equally
      // likely to fall in either three-week block
      emerging: growth !== null && growth >= 1 && last3 >= 12 && binomTail(last3 + prev3, last3) < 0.001,
      pGrowth: binomTail(last3 + prev3, last3),
      covered,
    };
  });
  return { clusters: clusters.filter((c) => c.size > 0).sort((a, b) => Number(b.emerging) - Number(a.emerging) || b.size - a.size), k: best.k, silhouette: best.s };
}
