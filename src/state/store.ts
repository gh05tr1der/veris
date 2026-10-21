// Application state. User actions (reviews, contests, policy versions, coaching assignments,
// audit entries, settings) are the only persisted state; everything else — processed calls,
// the Calibration Ledger, routing — is derived from them by the engine on every change.

import { create } from 'zustand';
import { appendEntry, type AuditEntry } from '../engine/audit';
import { buildLedger, DEFAULT_THRESHOLDS, type LabelPair, type LedgerRow, type Thresholds } from '../engine/calibration';
import type { Assignment } from '../engine/coaching';
import { DEFAULT_LLM, type LlmConfig } from '../engine/llm';
import { DEFAULT_ASR, type AsrConfig } from '../engine/asr';
import { applicable, processCall, processCallSync } from '../engine/pipeline';
import type { Call, Criterion, PolicyVersion, ProcessedCall, RawFinding, Verdict } from '../engine/types';
import { AS_OF, generateCorpus } from '../data/corpus';
import { heroCalls } from '../data/heroCalls';
import { POLICY_HISTORY } from '../data/policy';

export interface Decision {
  id: string;
  callId: string;
  criterionId: string;
  engineVerdict: Verdict;
  verdict: Verdict;
  reviewer: string;
  ts: string;
  source: 'review' | 'contest';
  note?: string;
}

export interface Contest {
  id: string;
  callId: string;
  criterionId: string;
  agentId: string;
  agentName: string;
  reason: string;
  ts: string;
  status: 'open' | 'upheld' | 'rejected';
  ruling?: string;
  resolvedTs?: string;
}

export type EngineMode = 'deterministic' | 'hybrid' | 'llm-all';

interface Persisted {
  uploads: Call[];
  publishedPolicies: PolicyVersion[];
  activeVersion: number;
  thresholds: Thresholds;
  decisions: Decision[];
  contests: Contest[];
  assignments: Assignment[];
  audit: AuditEntry[];
  engineMode: EngineMode;
  llm: Omit<LlmConfig, 'apiKey'>;
  asr: Omit<AsrConfig, 'apiKey'>;
  theme: 'system' | 'light' | 'dark';
}

export interface State extends Persisted {
  ready: boolean;
  corpus: Call[];
  calls: Call[];
  policies: PolicyVersion[];
  processed: Record<string, ProcessedCall>;
  liveRuns: Record<string, ProcessedCall>;
  ledger: Record<string, LedgerRow>;
  pairs: LabelPair[];
  llmKey: string;
  asrKey: string;
  reviewer: string;
  toast: { text: string; id: number } | null;
  recomputeMs: number;
  /** working copy of the criteria being edited in the policy studio (not persisted) */
  draft: Criterion[] | null;

  init(): Promise<void>;
  recompute(): void;
  policy(): PolicyVersion;
  decide(callId: string, criterionId: string, verdict: Verdict, note?: string, source?: Decision['source']): Promise<void>;
  contest(callId: string, criterionId: string, reason: string): Promise<void>;
  resolveContest(id: string, uphold: boolean, ruling: string): Promise<void>;
  publishPolicy(criteria: Criterion[], note: string, regression: PolicyVersion['regression']): Promise<number>;
  activate(version: number): Promise<void>;
  assign(a: Assignment): Promise<void>;
  addUpload(call: Call): Promise<void>;
  runLive(callId: string, inject?: RawFinding[], draft?: PolicyVersion): Promise<ProcessedCall>;
  previewDraft(callId: string, draft: PolicyVersion, inject?: RawFinding[]): ProcessedCall;
  log(action: string, subject: string, detail: string, actor?: string): Promise<void>;
  set<K extends keyof State>(k: K, v: State[K]): void;
  notify(text: string): void;
  reset(): void;
}

const KEY = 'veris.state.v1';
const SEED_ASSIGNMENTS: Assignment[] = [{ agentId: 'A-103', criterionId: 'Q-VER', date: '2026-09-28', module: 'Two-factor verification, every time' }];

function load(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(s: State) {
  const p: Persisted = {
    // object URLs for uploaded recordings do not survive a reload
    uploads: s.uploads.map((u) => (u.audioUrl?.startsWith('blob:') ? { ...u, audioUrl: undefined } : u)),
    publishedPolicies: s.publishedPolicies,
    activeVersion: s.activeVersion,
    thresholds: s.thresholds,
    decisions: s.decisions,
    contests: s.contests,
    assignments: s.assignments,
    audit: s.audit,
    engineMode: s.engineMode,
    llm: { provider: s.llm.provider, baseUrl: s.llm.baseUrl, modelSmall: s.llm.modelSmall, modelLarge: s.llm.modelLarge },
    asr: { baseUrl: s.asr.baseUrl, model: s.asr.model },
    theme: s.theme,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable (private mode): state lives for this session only */
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);

export const useStore = create<State>((set, get) => ({
  ready: false,
  corpus: [],
  calls: [],
  uploads: [],
  publishedPolicies: [],
  policies: POLICY_HISTORY,
  activeVersion: POLICY_HISTORY[POLICY_HISTORY.length - 1].version,
  thresholds: DEFAULT_THRESHOLDS,
  decisions: [],
  contests: [],
  assignments: SEED_ASSIGNMENTS,
  audit: [],
  engineMode: 'deterministic',
  llm: { ...DEFAULT_LLM },
  asr: { ...DEFAULT_ASR },
  llmKey: '',
  asrKey: '',
  theme: 'system',
  processed: {},
  liveRuns: {},
  ledger: {},
  pairs: [],
  reviewer: 'Meera Pillai (Senior QA)',
  toast: null,
  recomputeMs: 0,
  draft: null,

  async init() {
    const saved = load();
    const corpus = [...generateCorpus(), ...heroCalls()];
    set({
      corpus,
      ...saved,
      llm: { ...DEFAULT_LLM, ...(saved.llm ?? {}) },
      asr: { ...DEFAULT_ASR, ...(saved.asr ?? {}) },
      assignments: saved.assignments ?? SEED_ASSIGNMENTS,
      policies: [...POLICY_HISTORY, ...(saved.publishedPolicies ?? [])],
    });
    get().recompute();
    if (!get().audit.length) {
      // seed the log with the history that produced the current state
      const seed: { ts: string; actor: string; action: string; subject: string; detail: string }[] = [
        ...POLICY_HISTORY.map((p) => ({ ts: p.publishedAt, actor: p.author, action: 'policy.publish', subject: `${p.name} v${p.version}`, detail: p.note })),
        { ts: '2026-09-28T09:00:00Z', actor: 'Kavya Rao (Team leader, INS)', action: 'coaching.assign', subject: 'A-103 Farhan Qureshi · Q-VER', detail: 'Two-factor verification, every time (5 min). Follow-up across next 20 calls.' },
        { ts: '2026-10-06T08:00:00Z', actor: 'Client change log', action: 'script.change', subject: 'Servicing closing script', detail: 'New closing script rolled out on English servicing floors.' },
        { ts: AS_OF, actor: 'VERIS', action: 'corpus.ingest', subject: `${get().calls.length} interactions`, detail: 'Pilot corpus evaluated against the active policy; Calibration Ledger rebuilt from the blind reviewer sample.' },
      ];
      let log: AuditEntry[] = [];
      for (const e of seed.sort((a, b) => a.ts.localeCompare(b.ts))) log = [...log, await appendEntry(log, e)];
      set({ audit: log });
      save(get());
    }
    set({ ready: true });
  },

  policy() {
    const s = get();
    return s.policies.find((p) => p.version === s.activeVersion) ?? s.policies[s.policies.length - 1];
  },

  recompute() {
    const t0 = performance.now();
    const s = get();
    const policy = s.policy();
    const calls = [...s.corpus, ...s.uploads];
    const ids = policy.criteria.map((c) => c.id);
    const empty = { ledger: {}, thresholds: s.thresholds };
    // Pass 1: raw engine verdicts on every call that has a human label (blind sample or decision)
    const decided = new Set(s.decisions.map((d) => d.callId));
    const pairs: LabelPair[] = [];
    for (const c of calls) {
      if (!c.reviewerLabels && !decided.has(c.id)) continue;
      const p = processCallSync(c, policy, empty);
      for (const f of p.findings) {
        const blind = c.reviewerLabels?.[f.criterionId];
        if (blind) pairs.push({ callId: c.id, criterionId: f.criterionId, lang: p.language, queue: c.queue, date: c.date, engine: f.verdict, reviewer: blind, source: 'blind-sample' });
        const d = [...s.decisions].reverse().find((x) => x.callId === c.id && x.criterionId === f.criterionId);
        if (d && !blind) pairs.push({ callId: c.id, criterionId: f.criterionId, lang: p.language, queue: c.queue, date: d.ts, engine: f.verdict, reviewer: d.verdict, source: d.source });
      }
    }
    const ledger = buildLedger(pairs, ids, s.thresholds, AS_OF);
    // Pass 2: route every call with measured reliability
    const ctx = { ledger, thresholds: s.thresholds };
    const processed: Record<string, ProcessedCall> = {};
    for (const c of calls) processed[c.id] = processCallSync(c, policy, ctx);
    set({ calls, pairs, ledger, processed, recomputeMs: Math.round(performance.now() - t0) });
  },

  previewDraft(callId, draft, inject) {
    const s = get();
    const call = s.calls.find((c) => c.id === callId)!;
    return processCallSync(call, draft, { ledger: s.ledger, thresholds: s.thresholds, inject });
  },

  async runLive(callId, inject, draft) {
    const s = get();
    const call = s.calls.find((c) => c.id === callId)!;
    const policy = draft ?? s.policy();
    const useLlm = s.engineMode !== 'deterministic';
    const llm = useLlm ? { ...s.llm, apiKey: s.llmKey } : null;
    const p = await processCall(call, policy, { ledger: s.ledger, thresholds: s.thresholds, llm, llmForAll: s.engineMode === 'llm-all', inject });
    if (!draft) set({ liveRuns: { ...get().liveRuns, [callId]: p } });
    if (p.engineMode === 'hybrid-llm') {
      const n = applicable(policy, call).filter((c) => s.engineMode === 'llm-all' || c.spec.kind === 'semantic').length;
      await get().log('evaluation.llm', callId, `${n} criteria evaluated by the LLM tier on redacted text; every quote passed through the evidence gate.`);
    }
    return p;
  },

  async decide(callId, criterionId, verdict, note, source = 'review') {
    const s = get();
    const before = s.ledger;
    const engineVerdict = (s.liveRuns[callId] ?? s.processed[callId])?.findings.find((f) => f.criterionId === criterionId)?.verdict ?? 'na';
    const d: Decision = { id: uid(), callId, criterionId, engineVerdict, verdict, reviewer: s.reviewer, ts: new Date().toISOString(), source, note };
    set({ decisions: [...s.decisions, d] });
    get().recompute();
    const lang = get().processed[callId]?.language ?? 'en';
    const key = `${criterionId}|${lang === 'hi' ? 'hi-en' : lang}`;
    const k0 = before[key]?.stats.kappa;
    const k1 = get().ledger[key]?.stats.kappa;
    await get().log(
      verdict === engineVerdict ? 'review.confirm' : 'review.override',
      `${callId} · ${criterionId}`,
      `${verdict === engineVerdict ? 'Confirmed' : 'Overrode'} engine verdict ${engineVerdict.toUpperCase()}${verdict !== engineVerdict ? ` → ${verdict.toUpperCase()}` : ''}. Written to the Calibration Ledger as a labelled example.${note ? ` Note: ${note}` : ''}`,
      s.reviewer,
    );
    get().notify(`Ledger updated · ${criterionId} (${lang === 'en' ? 'English' : 'Hinglish'}) κ ${k0 != null ? k0.toFixed(2) : '—'} → ${k1 != null ? k1.toFixed(2) : '—'}`);
  },

  async contest(callId, criterionId, reason) {
    const s = get();
    const call = s.calls.find((c) => c.id === callId)!;
    const c: Contest = { id: uid(), callId, criterionId, agentId: call.agentId, agentName: call.agentName, reason, ts: new Date().toISOString(), status: 'open' };
    set({ contests: [...s.contests, c] });
    await get().log('contest.open', `${callId} · ${criterionId}`, `Agent contested the finding: “${reason}”`, `${call.agentName} (agent)`);
    get().notify('Contest submitted. A senior reviewer will adjudicate it.');
  },

  async resolveContest(id, uphold, ruling) {
    const s = get();
    const c = s.contests.find((x) => x.id === id)!;
    const engine = (s.liveRuns[c.callId] ?? s.processed[c.callId]).findings.find((f) => f.criterionId === c.criterionId)!.verdict;
    const flipped: Verdict = engine === 'pass' ? 'fail' : 'pass';
    set({ contests: s.contests.map((x) => (x.id === id ? { ...x, status: uphold ? 'upheld' : 'rejected', ruling, resolvedTs: new Date().toISOString() } : x)) });
    await get().log('contest.resolve', `${c.callId} · ${c.criterionId}`, `Contest ${uphold ? 'upheld' : 'rejected'}: ${ruling}`, s.reviewer);
    await get().decide(c.callId, c.criterionId, uphold ? flipped : engine, ruling, 'contest');
  },

  async publishPolicy(criteria, note, regression) {
    const s = get();
    const version = Math.max(...s.policies.map((p) => p.version)) + 1;
    const pv: PolicyVersion = { version, name: s.policy().name, criteria, publishedAt: new Date().toISOString(), author: s.reviewer, note, regression };
    set({ publishedPolicies: [...s.publishedPolicies, pv], policies: [...s.policies, pv], activeVersion: version, liveRuns: {} });
    get().recompute();
    await get().log('policy.publish', `${pv.name} v${version}`, `${note}${regression ? ` Golden-set replay: ${regression.verdictFlips} verdict flips, mean score drift ${regression.meanScoreDrift >= 0 ? '+' : ''}${regression.meanScoreDrift}.` : ''}`, s.reviewer);
    get().notify(`Published v${version}. New criteria start in advisory mode until they earn reliability.`);
    return version;
  },

  async activate(version) {
    set({ activeVersion: version, liveRuns: {} });
    get().recompute();
    await get().log('policy.activate', `v${version}`, 'Active policy version changed; all interactions re-evaluated.', get().reviewer);
  },

  async assign(a) {
    set({ assignments: [...get().assignments.filter((x) => !(x.agentId === a.agentId && x.criterionId === a.criterionId)), a] });
    await get().log('coaching.assign', `${a.agentId} · ${a.criterionId}`, `${a.module}. Follow-up measurement across the next 20 applicable calls.`, 'Team leader');
    get().notify('Micro-learning assigned and queued for the LMS.');
  },

  async addUpload(call) {
    set({ uploads: [...get().uploads.filter((u) => u.id !== call.id), call] });
    get().recompute();
    await get().log('ingest.upload', call.id, `${call.utterances.length} turns ingested from upload; evaluated against v${get().activeVersion}.`, get().reviewer);
  },

  async log(action, subject, detail, actor = 'VERIS') {
    const s = get();
    const e = await appendEntry(s.audit, { actor, action, subject, detail });
    set({ audit: [...get().audit, e] });
    save(get());
  },

  set(k, v) {
    set({ [k]: v } as Partial<State>);
    save(get());
  },

  notify(text) {
    set({ toast: { text, id: Date.now() } });
  },

  reset() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    location.reload();
  },
}));

export function decisionFor(decisions: Decision[], callId: string, criterionId: string) {
  return [...decisions].reverse().find((d) => d.callId === callId && d.criterionId === criterionId);
}

export function processedFor(s: Pick<State, 'liveRuns' | 'processed'>, id: string) {
  return s.liveRuns[id] ?? s.processed[id];
}

export { AS_OF };
