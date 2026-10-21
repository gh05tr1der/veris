import { BookOpenCheck, ClipboardCheck, FileClock, Gauge, GraduationCap, Headphones, Inbox, LayoutDashboard, Lightbulb, Menu, Moon, Scale, Settings as Cog, Sun, Upload, UserRound, Workflow } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Logo } from '../App';
import { useStore } from '../state/store';
import { cx } from './kit';
import { reviewItems } from './selectors';

const NAV = [
  { group: 'Operate', items: [
    { to: '/', label: 'Overview', icon: LayoutDashboard },
    { to: '/calls', label: 'Interactions', icon: Headphones },
    { to: '/review', label: 'Review queue', icon: Inbox, badge: true },
    { to: '/upload', label: 'Upload a call', icon: Upload },
  ] },
  { group: 'Govern', items: [
    { to: '/ledger', label: 'Calibration ledger', icon: Scale },
    { to: '/policy', label: 'Policy studio', icon: ClipboardCheck },
    { to: '/audit', label: 'Audit log', icon: FileClock },
  ] },
  { group: 'Develop', items: [
    { to: '/coaching', label: 'Coaching', icon: GraduationCap },
    { to: '/agent', label: 'Agent portal', icon: UserRound },
  ] },
  { group: 'Understand', items: [
    { to: '/insights', label: 'Insights', icon: Lightbulb },
    { to: '/how', label: 'How it works', icon: Workflow },
  ] },
];

export function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const s = useStore();
  const policy = s.policy();
  const queue = reviewItems(s).length;
  const dark = s.theme === 'dark' || (s.theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const nav = (
    <nav className="flex flex-col gap-5 px-3 py-4" aria-label="Main">
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="px-2 mb-1 text-[11px] font-medium text-faint">{g.group}</div>
          {g.items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) => cx('flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px]', isActive ? 'bg-cobaltsoft text-cobalt font-medium' : 'text-muted hover:text-ink hover:bg-sunk')}
            >
              <it.icon size={16} />
              <span className="flex-1">{it.label}</span>
              {it.badge && queue > 0 && <span className="rounded-full bg-review text-panel text-[10px] font-semibold px-1.5 min-w-[18px] text-center">{queue}</span>}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
  return (
    <div className="min-h-full flex">
      <aside className="hidden lg:flex w-[232px] shrink-0 flex-col border-r border-line bg-panel sticky top-0 h-screen">
        <div className="px-5 pt-5 pb-1">
          <Logo small />
          <div className="text-[11px] text-faint mt-1 leading-snug">Verified Evidence &amp; Review Intelligence System</div>
        </div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <div className="px-5 py-3 border-t border-line text-[11px] text-faint leading-snug">
          Prototype for EXL × IIM Lucknow, Business Challenge #9. Synthetic data only.
        </div>
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[260px] bg-panel overflow-y-auto">
            <div className="px-5 pt-5"><Logo small /></div>
            {nav}
          </div>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-panel/95 backdrop-blur px-4 lg:px-6 h-12">
          <button className="btn-ghost lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
          <div className="lg:hidden"><Logo small /></div>
          <div className="hidden md:flex items-center gap-2 text-[12px] text-muted">
            <BookOpenCheck size={14} />
            <span>{policy.name} <b className="text-ink font-semibold">v{policy.version}</b></span>
            <span className="text-line">|</span>
            <Gauge size={14} />
            <span>Engine: <b className="text-ink font-semibold">{s.engineMode === 'deterministic' ? 'Deterministic' : s.engineMode === 'hybrid' ? 'Hybrid (LLM for semantic)' : 'LLM for all criteria'}</b></span>
            {s.engineMode !== 'deterministic' && !s.llmKey && s.llm.provider === 'anthropic' && <span className="text-advisory">· no API key set</span>}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden sm:inline text-[12px] text-muted">Signed in as {s.reviewer}</span>
            <button className="btn-ghost" onClick={() => s.set('theme', dark ? 'light' : 'dark')} aria-label="Toggle colour theme">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
            <NavLink to="/settings" className="btn-ghost" aria-label="Settings"><Cog size={16} /></NavLink>
          </div>
        </header>
        <main key={loc.pathname} className="flex-1 px-4 lg:px-8 py-6 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
