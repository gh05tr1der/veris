import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useStore } from './state/store';
import { Layout } from './ui/Layout';
import { Toast } from './ui/kit';
import Overview from './pages/Overview';
import Calls from './pages/Calls';
import CallAudit from './pages/CallAudit';
import ReviewQueue from './pages/ReviewQueue';
import Ledger from './pages/Ledger';
import PolicyStudio from './pages/PolicyStudio';
import Coaching from './pages/Coaching';
import AgentPortal from './pages/AgentPortal';
import Insights from './pages/Insights';
import AuditLog from './pages/AuditLog';
import Upload from './pages/Upload';
import Settings from './pages/Settings';
import HowItWorks from './pages/HowItWorks';

export default function App() {
  const ready = useStore((s) => s.ready);
  const init = useStore((s) => s.init);
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    // let the loading screen paint before the engine evaluates the corpus
    const t = setTimeout(() => void init(), 30);
    return () => clearTimeout(t);
  }, [init]);
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  if (!ready) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <Logo />
          <p className="text-muted mt-3">Evaluating the pilot corpus and building the Calibration Ledger…</p>
        </div>
      </div>
    );
  }
  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/calls" element={<Calls />} />
          <Route path="/calls/:id" element={<CallAudit />} />
          <Route path="/review" element={<ReviewQueue />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/policy" element={<PolicyStudio />} />
          <Route path="/coaching" element={<Coaching />} />
          <Route path="/agent" element={<AgentPortal />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/how" element={<HowItWorks />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <Toast />
    </>
  );
}

export function Logo({ small }: { small?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2">
      <svg width={small ? 24 : 34} height={small ? 24 : 34} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="7" fill="rgb(var(--cobalt))" />
        <path d="M8 9l8 15 8-15" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="9" r="2.2" fill="#7DD3C0" />
      </svg>
      <span className={small ? 'text-[16px] font-semibold tracking-[0.12em]' : 'text-[24px] font-semibold tracking-[0.14em]'}>VERIS</span>
    </div>
  );
}
