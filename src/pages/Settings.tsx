import { CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { type EngineMode, useStore } from '../state/store';
import { cx, PageHeader } from '../ui/kit';

let timer: ReturnType<typeof setTimeout> | null = null;

export default function Settings() {
  const s = useStore();
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const th = s.thresholds;
  const setTh = (k: keyof typeof th, v: number) => {
    s.set('thresholds', { ...th, [k]: v });
    // re-route after the slider settles rather than on every intermediate value
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => useStore.getState().recompute(), 250);
  };
  const testConnection = async () => {
    setBusy(true);
    setTest(null);
    try {
      const id = 'VRS-INS-0412';
      const p = await s.runLive(id);
      const n = p.findings.filter((f) => f.engine === 'llm').length;
      setTest({ ok: n > 0, text: n > 0 ? `Model responded and ${n} findings came back. ${p.findings.filter((f) => f.engine === 'llm' && f.gate === 'verified').length} passed the evidence gate. Open VRS-INS-0412 to see them.` : 'The engine ran but no criterion was routed to the model. Choose “LLM for all criteria” to test the connection.' });
    } catch (e) {
      setTest({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
  };
  const modes: { id: EngineMode; title: string; body: string }[] = [
    { id: 'deterministic', title: 'Deterministic', body: 'Compiled specs only. Runs offline, instantly, with no data leaving the browser. Semantic criteria go to a human reviewer.' },
    { id: 'hybrid', title: 'Hybrid', body: 'Deterministic first; criteria that compile only to a semantic spec are evaluated by the LLM on redacted text.' },
    { id: 'llm-all', title: 'LLM for all criteria', body: 'Every criterion is evaluated by the model. Every quote it cites still has to pass the evidence gate.' },
  ];
  return (
    <div className="max-w-[900px]">
      <PageHeader title="Settings" lede="Engine, model and speech-to-text configuration, and the reliability thresholds that govern automation." />

      <section className="panel p-5 mb-4">
        <h2 className="h2 mb-3">Evaluation engine</h2>
        <div className="grid md:grid-cols-3 gap-2 mb-4">
          {modes.map((m) => (
            <button key={m.id} className={cx('text-left rounded-lg border p-3', s.engineMode === m.id ? 'border-cobalt bg-cobaltsoft' : 'border-line hover:border-cobalt/40')} onClick={() => { s.set('engineMode', m.id); void s.log('settings.engine', m.title, 'Evaluation engine mode changed.', s.reviewer); }} aria-pressed={s.engineMode === m.id}>
              <div className="text-[13px] font-semibold">{m.title}</div>
              <div className="text-[12px] text-muted mt-0.5">{m.body}</div>
            </button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Provider</label>
            <select className="field mt-1" value={s.llm.provider} onChange={(e) => s.set('llm', { ...s.llm, provider: e.target.value as 'anthropic' | 'openai-compatible', baseUrl: e.target.value === 'anthropic' ? 'https://api.anthropic.com' : 'http://localhost:11434/v1' })}>
              <option value="anthropic">Anthropic Claude (hosted)</option>
              <option value="openai-compatible">OpenAI-compatible (vLLM, Ollama, LM Studio, other)</option>
            </select>
          </div>
          <div>
            <label className="label">Base URL</label>
            <input className="field mt-1" value={s.llm.baseUrl} onChange={(e) => s.set('llm', { ...s.llm, baseUrl: e.target.value })} />
          </div>
          <div>
            <label className="label">Routine-call model (small tier)</label>
            <input className="field mt-1" value={s.llm.modelSmall} onChange={(e) => s.set('llm', { ...s.llm, modelSmall: e.target.value })} />
          </div>
          <div>
            <label className="label">Complex-call model (large tier)</label>
            <input className="field mt-1" value={s.llm.modelLarge} onChange={(e) => s.set('llm', { ...s.llm, modelLarge: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">API key</label>
            <input type="password" className="field mt-1" value={s.llmKey} onChange={(e) => s.set('llmKey', e.target.value)} placeholder={s.llm.provider === 'anthropic' ? 'sk-ant-…' : 'optional for local servers'} autoComplete="off" />
            <div className="text-[12px] text-muted mt-1">Held in memory for this tab only; never stored or logged. Calls go straight from your browser to the provider with the redacted transcript. For production, route through a server-side proxy.</div>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <button className="btn" onClick={testConnection} disabled={busy || s.engineMode === 'deterministic'}>{busy && <Loader2 size={14} className="animate-spin" />}Test on VRS-INS-0412</button>
          {s.engineMode === 'deterministic' && <span className="text-[12px] text-muted">Choose Hybrid or LLM mode to test.</span>}
        </div>
        {test && <div className={cx('rounded-md px-3 py-2 mt-3 text-[13px]', test.ok ? 'bg-passsoft text-pass' : 'bg-failsoft text-fail')}>{test.ok && <CheckCircle2 size={14} className="inline mr-1" />}{test.text}</div>}
      </section>

      <section className="panel p-5 mb-4">
        <h2 className="h2 mb-1">Speech-to-text for uploads</h2>
        <p className="text-[12px] text-muted mb-3">Any OpenAI-compatible <code className="kbd">/audio/transcriptions</code> endpoint with word timestamps: OpenAI Whisper, Groq, or a self-hosted faster-whisper server.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <div><label className="label">Base URL</label><input className="field mt-1" value={s.asr.baseUrl} onChange={(e) => s.set('asr', { ...s.asr, baseUrl: e.target.value })} /></div>
          <div><label className="label">Model</label><input className="field mt-1" value={s.asr.model} onChange={(e) => s.set('asr', { ...s.asr, model: e.target.value })} /></div>
          <div><label className="label">API key</label><input type="password" className="field mt-1" value={s.asrKey} onChange={(e) => s.set('asrKey', e.target.value)} autoComplete="off" /></div>
        </div>
      </section>

      <section className="panel p-5 mb-4">
        <h2 className="h2 mb-1">Automation thresholds</h2>
        <p className="text-[12px] text-muted mb-3">Changing a threshold re-routes every finding immediately. Stricter thresholds send more work to reviewers.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Slider label="Minimum Cohen’s κ" v={th.kappa} min={0.5} max={0.95} step={0.05} fmt={(v) => v.toFixed(2)} on={(v) => setTh('kappa', v)} />
          <Slider label="Minimum raw agreement" v={th.agreement} min={0.7} max={0.99} step={0.01} fmt={(v) => `${(v * 100).toFixed(0)}%`} on={(v) => setTh('agreement', v)} />
          <Slider label="Minimum labelled pairs" v={th.minN} min={10} max={60} step={5} fmt={(v) => String(v)} on={(v) => setTh('minN', v)} />
          <Slider label="Minimum instance confidence" v={th.minConfidence} min={0.5} max={0.95} step={0.05} fmt={(v) => v.toFixed(2)} on={(v) => setTh('minConfidence', v)} />
        </div>
        <p className="text-[12px] text-muted mt-3">High and critical failures always go to a human. That rule is not a setting.</p>
      </section>

      <section className="panel p-5">
        <h2 className="h2 mb-1">Demo data</h2>
        <p className="text-[12px] text-muted mb-3">Reviews, contests, published policy versions and the audit log are kept in this browser. Reset to start the demo from a clean state.</p>
        {!confirmReset ? (
          <button className="btn" onClick={() => setConfirmReset(true)}><RotateCcw size={14} />Reset demo state</button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px]">Clear all reviews, contests, published versions and the audit log?</span>
            <button className="btn-primary" onClick={() => s.reset()}>Reset now</button>
            <button className="btn" onClick={() => setConfirmReset(false)}>Keep my data</button>
          </div>
        )}
      </section>
    </div>
  );
}

function Slider({ label, v, min, max, step, fmt, on }: { label: string; v: number; min: number; max: number; step: number; fmt: (v: number) => string; on: (v: number) => void }) {
  return (
    <label className="block">
      <div className="flex justify-between"><span className="label">{label}</span><span className="text-[13px] font-semibold tabular-nums">{fmt(v)}</span></div>
      <input type="range" className="w-full accent-[rgb(var(--cobalt))]" min={min} max={max} step={step} value={v} onChange={(e) => on(Number(e.target.value))} />
    </label>
  );
}
