// The call audit workspace: recording, transcript, evidence-gated scorecard, routing,
// analytics, coaching signals and the pipeline log for one interaction.
import { ArrowLeft, FlaskConical, Loader2, Play, Plus, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { compile } from '../engine/compiler';
import { buildCoaching, strengthsFor } from '../engine/coaching';
import { LANG_LABEL } from '../engine/lid';
import { QUEUE_NAME } from '../engine/pipeline';
import { fmtClock, fmtTime } from '../engine/text';
import type { Criterion, Finding, PolicyVersion, ProcessedCall, RawFinding } from '../engine/types';
import { HERO_META } from '../data/heroCalls';
import { AS_OF, decisionFor, processedFor, useStore } from '../state/store';
import { Transcript } from '../ui/call/Transcript';
import { usePlayer, Waveform } from '../ui/call/Player';
import { FindingCard } from '../ui/call/FindingCard';
import { CriterionEditor, type EditorValue, newCriterionId } from '../ui/CriterionEditor';
import { LineChart } from '../ui/charts';
import { cx, Empty, fmtDateTime, LangTag, Modal, ScoreDial, Tabs } from '../ui/kit';

type Tab = 'scorecard' | 'summary' | 'analytics' | 'pipeline';

const ORDER = { suppressed: 0, human_review: 1, advisory: 2, auto_publish: 3 } as const;

export default function CallAudit() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const s = useStore();
  const call = s.calls.find((c) => c.id === id);
  const base = call ? processedFor(s, call.id) : undefined;
  const [preview, setPreview] = useState<{ p: ProcessedCall; draftIds: string[]; note: string } | null>(null);
  const p = preview?.p ?? base;
  const [tab, setTab] = useState<Tab>('scorecard');
  const [open, setOpen] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);
  const [running, setRunning] = useState(false);
  const [stagesShown, setStagesShown] = useState(99);
  const [addOpen, setAddOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const api = usePlayer(call?.audioUrl, call?.duration ?? 60, p?.transcript ?? []);
  const meta = HERO_META.find((h) => h.id === id);
  const policy = s.policy();

  useEffect(() => {
    setPreview(null);
    setOpen(null);
    setRaw(false);
  }, [id]);

  const criteriaWeight = new Map([...policy.criteria, ...(s.draft ?? [])].map((c) => [c.id, c.weight]));
  const findings = useMemo(() => {
    if (!p) return [];
    // most consequential first: routing group, then failures, then criterion weight, then confidence
    const weight = (f: Finding) => criteriaWeight.get(f.criterionId) ?? 1;
    const rank = (f: Finding) => (f.verdict === 'na' ? 9 : ORDER[f.routing.decision] * 2 + (f.verdict === 'fail' ? 0 : 1));
    return [...p.findings].sort((a, b) => rank(a) - rank(b) || weight(b) - weight(a) || b.confidence - a.confidence);
  }, [p, s.draft, policy]);

  if (!call || !p) return <Empty title="Interaction not found">Choose one from <Link className="text-cobalt" to="/calls">Interactions</Link>.</Empty>;

  const counts = p.findings.reduce<Record<string, number>>((a, f) => ((a[f.routing.decision] = (a[f.routing.decision] ?? 0) + 1), a), {});
  const langLabel = LANG_LABEL[p.language];
  const criteriaById = new Map<string, Criterion>([...policy.criteria, ...(s.draft ?? [])].map((c) => [c.id, c]));

  const rerun = async () => {
    setErr(null);
    setRunning(true);
    setPreview(null);
    setTab('pipeline');
    setStagesShown(0);
    try {
      const out = s.engineMode === 'deterministic' ? null : await s.runLive(call.id);
      const n = (out ?? p).stages.length;
      for (let i = 1; i <= n; i++) {
        await new Promise((r) => setTimeout(r, 140));
        setStagesShown(i);
      }
    } catch (e) {
      setErr((e as Error).message);
      setStagesShown(99);
    }
    setRunning(false);
  };

  const toggleRaw = () => {
    if (!raw) void s.log('raw.access', call.id, 'Unredacted transcript viewed in the raw zone (restricted role).', s.reviewer);
    setRaw(!raw);
  };

  const playFinding = (f: Finding) => {
    const e = f.evidence[f.evidence.length > 1 && f.late ? 1 : 0] ?? f.evidence[0];
    if (e) api.playRange(e.start, e.end);
  };

  const coaching = buildCoaching(s.calls, s.processed, policy.criteria, AS_OF, s.assignments).filter((c) => c.agentId === call.agentId);
  const strengths = strengthsFor([call.id], { [call.id]: p });

  return (
    <div>
      <div className="flex items-center gap-2 text-[12px] text-muted mb-2">
        <button className="btn-ghost !px-1" onClick={() => nav(-1)}><ArrowLeft size={14} />Back</button>
        <span>/</span>
        <Link to="/calls" className="hover:text-ink">Interactions</Link>
        <span>/</span>
        <span className="text-ink font-medium">{call.id}</span>
      </div>

      <div className="flex flex-wrap items-start gap-4 mb-4">
        <ScoreDial score={p.score} autoFail={p.autoFail} />
        <div className="min-w-0 flex-1">
          <h1 className="h1">{meta?.title ?? `${QUEUE_NAME[call.queue]} call`}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted mt-1">
            <span>{call.client}</span>
            <span>{QUEUE_NAME[call.queue]}</span>
            <span>Agent <b className="text-ink font-medium">{call.agentName}</b></span>
            <span>{fmtDateTime(call.date)}</span>
            <span>{fmtClock(call.duration)}</span>
            <LangTag l={p.language} />
            <span className={cx('font-medium', p.status === 'published' ? 'text-pass' : 'text-review')}>{p.status === 'published' ? 'Published' : 'Partly in review'}</span>
            {p.autoFail && <span className="inline-flex items-center gap-1 font-semibold text-fail"><ShieldAlert size={13} />Critical compliance failure</span>}
          </div>
          {meta && <p className="text-[13px] text-muted mt-1.5 max-w-[80ch]">{meta.blurb}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => setAddOpen(true)}><Plus size={14} />Add a criterion</button>
          <button className="btn" onClick={() => setGateOpen(true)}><FlaskConical size={14} />Test the evidence gate</button>
          <button className="btn-primary" onClick={rerun} disabled={running}>
            {running ? <Loader2 size={14} className="animate-spin" /> : s.engineMode === 'deterministic' ? <RefreshCw size={14} /> : <Sparkles size={14} />}
            {running ? 'Evaluating…' : s.engineMode === 'deterministic' ? 'Re-run pipeline' : 'Re-run with LLM'}
          </button>
        </div>
      </div>

      {err && <div className="rounded-md border border-fail/40 bg-failsoft text-fail px-3 py-2 mb-3 text-[13px]">{err} <Link to="/settings" className="underline">Open settings</Link></div>}
      {preview && (
        <div className="rounded-md border border-cobalt/40 bg-cobaltsoft px-3 py-2 mb-3 text-[13px] flex flex-wrap items-center gap-2">
          <span><b>Preview.</b> {preview.note}</span>
          <span className="ml-auto flex gap-2">
            {preview.draftIds.length > 0 && <Link className="btn" to="/policy">Regression-test and publish in Policy studio</Link>}
            <button className="btn" onClick={() => setPreview(null)}>Discard preview</button>
          </span>
        </div>
      )}

      <Waveform api={api} transcript={p.transcript} findings={p.findings.filter((f) => f.verdict !== 'na')} selected={open} onSelect={(cid) => { setOpen(cid); setTab('scorecard'); const f = p.findings.find((x) => x.criterionId === cid); if (f) playFinding(f); }} />

      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-4 mt-4">
        <Transcript call={call} transcript={p.transcript} findings={p.findings} selected={open} api={api} raw={raw} onToggleRaw={toggleRaw} />
        <div className="min-w-0">
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            items={[
              { id: 'scorecard', label: `Scorecard (${p.findings.length})` },
              { id: 'summary', label: 'Summary & coaching' },
              { id: 'analytics', label: 'Conversation analytics' },
              { id: 'pipeline', label: 'Pipeline log' },
            ]}
          />
          <div className="pt-3">
            {tab === 'scorecard' && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-3 text-[12px] text-muted mb-1">
                  <span><b className="text-ink">{counts.auto_publish ?? 0}</b> auto-published</span>
                  <span><b className="text-review">{counts.human_review ?? 0}</b> human review</span>
                  <span><b className="text-advisory">{counts.advisory ?? 0}</b> advisory</span>
                  <span><b className="text-fail">{counts.suppressed ?? 0}</b> suppressed</span>
                  <span className="ml-auto">{preview?.draftIds.length ? `Draft based on v${policy.version}` : `Policy v${p.policyVersion}`} · evaluated in {langLabel}</span>
                </div>
                {findings.map((f) => (
                  <FindingCard
                    key={f.criterionId}
                    f={f}
                    criterion={criteriaById.get(f.criterionId)}
                    open={open === f.criterionId}
                    onToggle={() => setOpen(open === f.criterionId ? null : f.criterionId)}
                    onPlay={(a, b) => api.playRange(a, b)}
                    decision={decisionFor(s.decisions, call.id, f.criterionId)}
                    onDecide={(v) => void s.decide(call.id, f.criterionId, v)}
                    draft={preview?.draftIds.includes(f.criterionId)}
                    langLabel={langLabel}
                  />
                ))}
              </div>
            )}
            {tab === 'summary' && <SummaryTab p={p} coaching={coaching} strengths={strengths} onPlay={api.playRange} />}
            {tab === 'analytics' && <AnalyticsTab p={p} api={api} />}
            {tab === 'pipeline' && <PipelineTab p={p} shown={stagesShown} running={running} />}
          </div>
        </div>
      </div>

      <AddCriterionModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onRun={async (c) => {
          const draftCriteria = [...(s.draft ?? policy.criteria).filter((x) => x.id !== c.id), c];
          s.set('draft', draftCriteria);
          const draft: PolicyVersion = { ...policy, version: policy.version + 1, criteria: draftCriteria };
          let out: ProcessedCall;
          try {
            out = c.spec.kind === 'semantic' && s.engineMode !== 'deterministic' ? await s.runLive(call.id, undefined, draft) : s.previewDraft(call.id, draft);
          } catch (e) {
            setErr((e as Error).message);
            out = s.previewDraft(call.id, draft);
          }
          setPreview({ p: out, draftIds: [c.id], note: `Draft criterion ${c.id} evaluated on this call. Nothing is published until it passes a golden-set regression in the Policy studio. New criteria start in advisory mode.` });
          setTab('scorecard');
          setOpen(c.id);
          setAddOpen(false);
          void s.log('policy.draft.preview', `${call.id} · ${c.id}`, `Draft criterion previewed on one call: “${c.text}”`, s.reviewer);
        }}
      />
      <GateTestModal
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        p={base!}
        onRun={(inj) => {
          const out = s.previewDraft(call.id, policy, [inj]);
          setPreview({ p: out, draftIds: [], note: `A simulated model response for ${inj.criterionId} cited a quote that was never said. The gate rejected it and withheld the verdict.` });
          setTab('scorecard');
          setOpen(inj.criterionId);
          setGateOpen(false);
          void s.log('gate.test', `${call.id} · ${inj.criterionId}`, `Fabricated evidence injected for testing: “${inj.evidence[0].quote}”. Result: suppressed and escalated.`, s.reviewer);
        }}
      />
    </div>
  );
}

function SummaryTab({ p, coaching, strengths, onPlay }: { p: ProcessedCall; coaching: ReturnType<typeof buildCoaching>; strengths: ReturnType<typeof strengthsFor>; onPlay: (a: number, b: number) => void }) {
  return (
    <div className="space-y-4">
      <div className="panel p-4 space-y-2.5">
        <div className="h2">Call summary</div>
        <Row k="Reason" v={p.summary.reason} />
        <Row k="Resolution" v={p.summary.resolution} />
        <Row k="Outcome" v={p.summary.outcome} />
        {p.summary.flags.length > 0 && <Row k="Flags" v={<ul className="list-disc ml-4">{p.summary.flags.map((f) => <li key={f}>{f}</li>)}</ul>} />}
        <div className="text-[11px] text-faint">{p.engineMode === 'hybrid-llm' ? 'Summary written by the LLM tier from the redacted transcript.' : 'Extractive summary from the redacted transcript (deterministic mode).'}</div>
      </div>
      <div className="panel p-4">
        <div className="h2 mb-2">Coaching signals for this agent</div>
        {coaching.length === 0 && <p className="text-muted text-[13px]">No recurring pattern in the last 30 days that clears the coaching threshold.</p>}
        {coaching.map((c) => (
          <div key={c.criterionId} className="border-t border-line first:border-0 pt-3 first:pt-0 mt-3 first:mt-0">
            <div className="text-[13px] font-semibold">{c.criterionText}</div>
            <div className="text-[12px] text-muted">{c.occurrences.length} of {c.applicable} applicable calls in the last 30 days · {c.rootCause.type}</div>
            <p className="text-[13px] mt-1">{c.rootCause.text}</p>
            <p className="text-[13px] mt-1"><b>Recommended:</b> {c.module.title} ({c.module.minutes} min). {c.followUp}</p>
            <Link to="/coaching" className="text-[12px] text-cobalt">Open in Coaching</Link>
          </div>
        ))}
      </div>
      <div className="panel p-4">
        <div className="h2 mb-2">Strengths in this call</div>
        {strengths.length === 0 && <p className="text-muted text-[13px]">No stand-out handling of a triggered moment in this call.</p>}
        {strengths.map((st) => (
          <div key={st.criterionId} className="text-[13px] mb-2">
            <span className="text-pass font-semibold">{st.criterionId}</span> {st.text}{' '}
            {st.evidence[0] && <button className="text-cobalt text-[12px] inline-flex items-center gap-1" onClick={() => onPlay(st.evidence[0].start, st.evidence[0].end)}><Play size={10} />{fmtTime(st.evidence[0].start)}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-2 text-[13px]">
      <div className="text-muted">{k}</div>
      <div>{v}</div>
    </div>
  );
}

function AnalyticsTab({ p, api }: { p: ProcessedCall; api: ReturnType<typeof usePlayer> }) {
  const a = p.acoustics;
  const agreement = api.analysis ? diarAgreement(api, p) : null;
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <Metric k="Agent talk share" v={`${(a.agentTalkShare * 100).toFixed(0)}%`} sub={`${a.agentTalk.toFixed(0)} s agent · ${a.customerTalk.toFixed(0)} s customer`} />
        <Metric k="Longest silence" v={a.longestSilence ? `${(a.longestSilence.end - a.longestSilence.start).toFixed(1)} s` : '—'} sub={a.longestSilence ? `at ${fmtTime(a.longestSilence.start)} · ${a.holds.length} hold(s) ≥ 10 s` : 'No silence ≥ 3 s'} />
        <Metric k="Interruptions" v={String(a.interruptions.length)} sub={`${a.overtalk.length} overtalk span(s)`} />
        <Metric k="Speaking rate" v={`${a.wpm.agent.toFixed(0)} wpm`} sub={`customer ${a.wpm.customer.toFixed(0)} wpm`} />
        <Metric k="PII masked" v={String(p.redactionCount)} sub="before any evaluation" />
        <Metric k="Diarization check" v={agreement != null ? `${(agreement * 100).toFixed(0)}%` : '—'} sub={agreement != null ? 'turn time with energy on the speaker’s own channel' : api.hasAudio ? 'decoding recording…' : 'no recording'} />
      </div>
      {a.interruptions.length > 0 && (
        <div className="panel p-3">
          <div className="label mb-1">Interruptions</div>
          {a.interruptions.map((i) => (
            <button key={i.at} className="text-[13px] text-cobalt inline-flex items-center gap-1 mr-3" onClick={() => api.playRange(i.at - 2, i.at + 2)}>
              <Play size={10} /> {fmtTime(i.at)} · {i.overlap.toFixed(1)} s overlap
            </button>
          ))}
        </div>
      )}
      <div className="panel p-4">
        <div className="h2">Customer sentiment across the call</div>
        <p className="text-[12px] text-muted mb-2">Lexicon-based, code-mix aware, smoothed per customer turn. Hover for values.</p>
        {p.sentiment.length > 1 ? (
          <LineChart
            ariaLabel="Customer sentiment trajectory"
            labels={p.sentiment.map((x) => fmtTime(x.t))}
            series={[{ name: 'Customer sentiment', color: 'rgb(var(--s1))', values: p.sentiment.map((x) => x.score) }]}
            yMin={-1}
            yMax={1}
            yFmt={(v) => v.toFixed(1)}
            refLine={{ value: 0, label: 'neutral' }}
            height={180}
          />
        ) : (
          <p className="text-muted text-[13px]">Not enough customer turns to plot.</p>
        )}
      </div>
      <div className="panel p-4">
        <div className="h2 mb-2">Language by utterance</div>
        <div className="flex flex-wrap gap-1">
          {p.transcript.map((u) => (
            <span key={u.id} title={`${u.id} ${u.speaker}: hi ${u.langScores.hi} / en ${u.langScores.en}`} className={cx('rounded px-1.5 py-0.5 text-[11px] font-mono border', u.lang === 'en' ? 'border-line text-muted' : 'border-agent/50 text-agent bg-agent/5')}>
              {u.id}·{u.lang}
            </span>
          ))}
        </div>
        <p className="text-[12px] text-muted mt-2">Routed as <b>{LANG_LABEL[p.language]}</b>. Reliability is looked up for this language, never inferred from another.</p>
      </div>
    </div>
  );
}

function diarAgreement(api: ReturnType<typeof usePlayer>, p: ProcessedCall) {
  const a = api.analysis!;
  if (a.channels < 2) return null;
  let agree = 0;
  let total = 0;
  for (const u of p.transcript) {
    const segs = a.activity[u.speaker === 'agent' ? 0 : 1];
    let act = 0;
    for (const s of segs) act += Math.max(0, Math.min(u.end, s.end) - Math.max(u.start, s.start));
    agree += Math.min(u.end - u.start, act);
    total += u.end - u.start;
  }
  return total ? agree / total : null;
}

function Metric({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-md bg-sunk px-3 py-2">
      <div className="label">{k}</div>
      <div className="text-[18px] font-semibold">{v}</div>
      {sub && <div className="text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

function PipelineTab({ p, shown, running }: { p: ProcessedCall; shown: number; running: boolean }) {
  return (
    <div className="panel">
      <ol className="divide-y divide-line">
        {p.stages.slice(0, shown).map((st, i) => (
          <li key={i} className="flex gap-3 px-4 py-2.5 stage-in">
            <span className="shrink-0 w-6 h-6 rounded-full bg-cobaltsoft text-cobalt text-[11px] font-semibold flex items-center justify-center">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-semibold">{st.stage}</span>
                <span className="text-[11px] text-faint">{st.layer}</span>
                <span className="ml-auto text-[11px] text-faint tabular-nums">{st.ms < 1 ? '<1' : st.ms.toFixed(0)} ms</span>
              </div>
              <div className="text-[12px] text-muted">{st.detail}</div>
            </div>
          </li>
        ))}
        {running && shown < p.stages.length && (
          <li className="px-4 py-2.5 text-[12px] text-muted inline-flex items-center gap-2"><Loader2 size={13} className="animate-spin" />Running…</li>
        )}
      </ol>
    </div>
  );
}

function AddCriterionModal({ open, onClose, onRun }: { open: boolean; onClose: () => void; onRun: (c: Criterion) => void }) {
  const s = useStore();
  const [v, setV] = useState<EditorValue>({ text: 'Did the agent interrupt the customer?', severity: 'medium', queues: 'all', weight: 2 });
  const run = () => {
    const r = compile(v.text);
    const existing = (s.draft ?? s.policy().criteria).map((c) => c.id);
    const c: Criterion = { id: '', text: v.text.trim(), severity: v.severity, category: r.suggestedCategory, queues: v.queues, weight: v.weight, spec: r.spec, compiledBy: 'compiler', compileNotes: r.notes };
    c.id = newCriterionId(c, existing);
    onRun(c);
  };
  return (
    <Modal open={open} onClose={onClose} title="Add a criterion and run it on this call">
      <CriterionEditor value={v} onChange={setV} showExamples />
      <div className="flex items-center justify-between mt-4">
        <span className="text-[12px] text-muted">No code, no retraining. The criterion is compiled and evaluated now.</span>
        <button className="btn-primary" onClick={run} disabled={v.text.trim().length < 8}>Compile and run</button>
      </div>
    </Modal>
  );
}

function GateTestModal({ open, onClose, p, onRun }: { open: boolean; onClose: () => void; p: ProcessedCall; onRun: (f: RawFinding) => void }) {
  const candidates = p.findings.filter((f) => f.verdict === 'fail');
  const [cid, setCid] = useState<string>('');
  const [quote, setQuote] = useState('I have explained all applicable charges to you before processing anything.');
  const target = candidates.find((f) => f.criterionId === (cid || candidates[0]?.criterionId));
  const utt = target?.evidence[0]?.utteranceId ?? p.transcript.find((u) => u.speaker === 'agent')?.id ?? 'U01';
  return (
    <Modal open={open} onClose={onClose} title="Test the evidence gate">
      <p className="text-[13px] text-muted mb-3">
        Simulates an evaluator (for example an LLM) that returns a confident <b>PASS</b> for a failed criterion and cites a quote the agent never said. The gate checks the quote against the transcript before anything is published.
      </p>
      {candidates.length === 0 ? (
        <p className="text-[13px]">This call has no failed findings to contradict. Try VRS-INS-0412.</p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="label">Criterion to contradict</label>
            <select className="field mt-1" value={target?.criterionId} onChange={(e) => setCid(e.target.value)}>
              {candidates.map((f) => <option key={f.criterionId} value={f.criterionId}>{f.criterionId} · {f.criterionText}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Fabricated quote the model cites ({utt})</label>
            <textarea className="field mt-1" value={quote} onChange={(e) => setQuote(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <button
              className="btn-primary"
              onClick={() =>
                onRun({ criterionId: target!.criterionId, verdict: 'pass', rationale: 'The agent addressed this requirement clearly.', confidence: 0.97, evidence: [{ utteranceId: utt, quote }], engine: 'llm', model: 'simulated-model-response' })
              }
            >
              Inject and evaluate
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
