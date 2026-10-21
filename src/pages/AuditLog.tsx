import { Download, Link2, ShieldCheck, ShieldX } from 'lucide-react';
import { useState } from 'react';
import { type AuditEntry, verifyChain } from '../engine/audit';
import { useStore } from '../state/store';
import { fmtDateTime, PageHeader } from '../ui/kit';

export default function AuditLog() {
  const s = useStore();
  const [result, setResult] = useState<{ ok: boolean; brokenAt: number | null; tamper?: boolean } | null>(null);
  const log = [...s.audit].reverse();

  const verify = async () => setResult(await verifyChain(s.audit));
  const tamper = async () => {
    // edit a copy of the log in memory only: the stored log is never modified
    const copy: AuditEntry[] = s.audit.map((e) => ({ ...e }));
    const i = Math.max(0, Math.floor(copy.length / 2));
    copy[i] = { ...copy[i], detail: `${copy[i].detail} (edited after the fact)` };
    const r = await verifyChain(copy);
    setResult({ ...r, tamper: true });
  };
  const exportLog = () => {
    const blob = new Blob([JSON.stringify(s.audit, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'veris-audit-log.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <PageHeader
        title="Audit log"
        lede="Append-only record of every policy version, reviewer ruling, contest, raw-zone access, coaching assignment and test. Each entry carries the SHA-256 hash of the one before it, so any edit to history breaks the chain at a detectable point."
        actions={
          <>
            <button className="btn" onClick={tamper}>Simulate tampering</button>
            <button className="btn" onClick={exportLog}><Download size={14} />Export JSON</button>
            <button className="btn-primary" onClick={verify}><Link2 size={14} />Verify chain</button>
          </>
        }
      />
      {result && (
        <div className={`rounded-md px-3 py-2 mb-3 text-[13px] ${result.ok ? 'bg-passsoft text-pass' : 'bg-failsoft text-fail'}`}>
          {result.ok ? (
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={15} /><b>Chain intact.</b> All {s.audit.length} entries re-hashed and linked correctly.</span>
          ) : (
            <span className="inline-flex items-center gap-1.5"><ShieldX size={15} /><b>Chain broken at entry #{result.brokenAt}.</b> {result.tamper ? 'One historical entry was edited in a scratch copy; its hash no longer matches. The stored log is untouched.' : 'The stored log has been altered.'}</span>
          )}
        </div>
      )}
      <div className="panel overflow-x-auto">
        <table className="tbl w-full text-[13px]">
          <thead>
            <tr><th className="text-right">#</th><th>When</th><th>Actor</th><th>Action</th><th>Subject</th><th>Detail</th><th>Hash</th></tr>
          </thead>
          <tbody>
            {log.map((e) => (
              <tr key={e.seq}>
                <td className="text-right tabular-nums text-muted">{e.seq}</td>
                <td className="whitespace-nowrap text-muted">{fmtDateTime(e.ts)}</td>
                <td className="whitespace-nowrap">{e.actor}</td>
                <td><code className="font-mono text-[12px]">{e.action}</code></td>
                <td className="whitespace-nowrap">{e.subject}</td>
                <td className="max-w-[420px] text-[12px] text-muted">{e.detail}</td>
                <td><code className="font-mono text-[11px] text-faint" title={`prev ${e.prevHash}`}>{e.hash.slice(0, 12)}…</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
