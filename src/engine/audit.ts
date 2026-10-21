// Immutable, append-only audit log. Every entry carries the SHA-256 hash of the previous
// entry, so any later edit to the history breaks the chain at a detectable position.

export interface AuditEntry {
  seq: number;
  ts: string;
  actor: string;
  action: string;
  subject: string;
  detail: string;
  prevHash: string;
  hash: string;
}

const GENESIS = '0'.repeat(64);

async function sha256(text: string) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const payload = (e: Omit<AuditEntry, 'hash'>) => JSON.stringify([e.seq, e.ts, e.actor, e.action, e.subject, e.detail, e.prevHash]);

export async function appendEntry(log: AuditEntry[], e: { actor: string; action: string; subject: string; detail: string; ts?: string }): Promise<AuditEntry> {
  const prev = log[log.length - 1];
  const base = { seq: log.length + 1, ts: e.ts ?? new Date().toISOString(), actor: e.actor, action: e.action, subject: e.subject, detail: e.detail, prevHash: prev ? prev.hash : GENESIS };
  return { ...base, hash: await sha256(payload(base)) };
}

export async function verifyChain(log: AuditEntry[]): Promise<{ ok: boolean; brokenAt: number | null }> {
  let prev = GENESIS;
  for (const e of log) {
    if (e.prevHash !== prev) return { ok: false, brokenAt: e.seq };
    const h = await sha256(payload(e));
    if (h !== e.hash) return { ok: false, brokenAt: e.seq };
    prev = e.hash;
  }
  return { ok: true, brokenAt: null };
}
