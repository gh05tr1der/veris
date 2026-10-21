// One criterion finding: verdict, rationale, verified evidence (click to hear it), measured
// reliability, routing reasons, and reviewer actions.
import { ChevronDown, ChevronRight, Play, ShieldX } from 'lucide-react';
import { specSummary } from '../../engine/compiler';
import { fmtTime } from '../../engine/text';
import type { Criterion, Finding, Verdict } from '../../engine/types';
import { type Decision } from '../../state/store';
import { cx, fmtDateTime, kfmt, pct, RoutingBadge, SeverityTag, StatusChip, VerdictBadge } from '../kit';

export function FindingCard({ f, criterion, open, onToggle, onPlay, decision, onDecide, draft, langLabel, agentView, onContest }: {
  f: Finding;
  criterion?: Criterion;
  open: boolean;
  onToggle: () => void;
  onPlay: (a: number, b: number) => void;
  decision?: Decision;
  onDecide?: (v: Verdict) => void;
  draft?: boolean;
  langLabel: string;
  agentView?: boolean;
  onContest?: () => void;
}) {
  const shown: Verdict = decision ? decision.verdict : f.verdict;
  const suppressed = f.routing.decision === 'suppressed';
  return (
    <div className={cx('rounded-lg border bg-panel', open ? 'border-cobalt/50 shadow-sm' : 'border-line', draft && 'ring-2 ring-cobalt/30')}>
      <button className="w-full flex items-start gap-3 px-3 py-2.5 text-left" onClick={onToggle} aria-expanded={open}>
        <span className="mt-0.5 text-faint">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] text-faint">{f.criterionId}</span>
            {draft && <span className="rounded bg-cobalt text-panel text-[10px] font-semibold px-1.5 py-0.5">Draft · not published</span>}
            <SeverityTag s={f.severity} />
          </div>
          <div className="text-[13px] font-medium leading-snug mt-0.5">{f.criterionText}</div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {suppressed && !decision ? <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold bg-failsoft text-fail"><ShieldX size={12} />Withheld</span> : <VerdictBadge v={shown} />}
          {decision ? <span className="text-[11px] text-review font-medium">{decision.verdict === decision.engineVerdict ? 'Reviewer confirmed' : 'Reviewer overrode'}</span> : <RoutingBadge d={f.routing.decision} />}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-line space-y-3">
          {suppressed ? (
            <div className="rounded-md bg-failsoft text-fail px-3 py-2 text-[13px]">
              <b>Verdict withheld by the evidence gate.</b> The evaluator proposed <b>{f.verdict.toUpperCase()}</b>, but none of its cited quotes exist verbatim in the transcript. The finding is escalated to a reviewer instead of being published.
            </div>
          ) : (
            <p className="text-[13px] leading-relaxed">{f.rationale}</p>
          )}

          {f.evidence.length > 0 && (
            <div>
              <div className="label mb-1">Evidence · verified verbatim and bound to the recording</div>
              <div className="space-y-1.5">
                {f.evidence.map((e, i) => (
                  <button key={i} className="w-full text-left flex gap-2.5 rounded-md border border-line hover:border-cobalt/60 hover:bg-cobaltsoft/40 px-2.5 py-2 group" onClick={() => onPlay(e.start, e.end)}>
                    <span className="shrink-0 inline-flex items-center gap-1 rounded bg-cobalt text-panel text-[11px] font-semibold px-1.5 h-5 tabular-nums group-hover:brightness-110">
                      <Play size={10} fill="currentColor" />
                      {fmtTime(e.start)}
                    </span>
                    <span className="min-w-0">
                      <span className={cx('text-[11px] font-semibold mr-1.5', e.speaker === 'agent' ? 'text-agent' : 'text-customer')}>{e.speaker === 'agent' ? 'Agent' : 'Customer'}{e.role ? ` · ${e.role}` : ''}</span>
                      <span className="text-[13px]">“{e.quote}”</span>
                      <span className="block text-[11px] text-faint mt-0.5">{e.utteranceId} · {fmtTime(e.start)}–{fmtTime(e.end)} · {e.match === 'exact' ? 'exact match' : 'normalised match'} · lowest ASR word confidence {e.minConf.toFixed(2)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {f.evidence.length === 0 && f.gate === 'not-required' && f.verdict !== 'na' && <div className="text-[12px] text-muted">No span to cite: the criterion passes because nothing prohibited was found across the call.</div>}

          {f.rejectedEvidence.length > 0 && (
            <div>
              <div className="label mb-1 text-fail">Rejected by the evidence gate</div>
              {f.rejectedEvidence.map((e, i) => (
                <div key={i} className="rounded-md border border-fail/40 bg-failsoft/50 px-2.5 py-1.5 text-[13px] mb-1">
                  <span className="line-through decoration-fail/60">“{e.quote}”</span>
                  <span className="block text-[11px] text-fail mt-0.5">Cited {e.utteranceId || 'no utterance'} · not found verbatim anywhere in the redacted transcript</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-md bg-sunk px-3 py-2">
              <div className="label">Measured reliability · {langLabel}</div>
              <div className="flex items-baseline gap-3 mt-0.5">
                <span className="text-[18px] font-semibold">κ {kfmt(f.reliability.kappa)}</span>
                <span className="text-[12px] text-muted">{pct(f.reliability.agreement)} agreement · n = {f.reliability.n}</span>
              </div>
              <div className="mt-1"><StatusChip status={f.reliability.status} /></div>
            </div>
            <div className="rounded-md bg-sunk px-3 py-2">
              <div className="label">This instance</div>
              <div className="text-[18px] font-semibold mt-0.5">{(f.confidence * 100).toFixed(0)}% <span className="text-[12px] font-normal text-muted">confidence</span></div>
              <div className="text-[11px] text-muted mt-0.5">
                {f.engine === 'llm' ? `LLM · ${f.model}` : 'Deterministic engine'}
                {criterion && ` · ${specSummary(criterion.spec)}`}
              </div>
            </div>
          </div>

          <div>
            <div className="label mb-1">Routing decision</div>
            <ul className="text-[13px] space-y-0.5">
              {f.routing.reasons.map((r, i) => (
                <li key={i} className="flex gap-2"><span className="text-faint">·</span>{r}</li>
              ))}
            </ul>
          </div>

          {decision && (
            <div className="rounded-md border border-review/30 bg-reviewsoft px-3 py-2 text-[13px]">
              <b>{decision.reviewer}</b> {decision.verdict === decision.engineVerdict ? 'confirmed' : 'overrode'} this finding ({decision.engineVerdict.toUpperCase()} → {decision.verdict.toUpperCase()}) on {fmtDateTime(decision.ts)}{decision.source === 'contest' ? ' after an agent contest' : ''}.{decision.note ? ` “${decision.note}”` : ''} Recorded in the Calibration Ledger.
            </div>
          )}

          {!agentView && onDecide && !decision && !draft && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="label mr-1">Reviewer ruling</span>
              {f.verdict !== 'na' && !suppressed && <button className="btn" onClick={() => onDecide(f.verdict)}>Confirm {f.verdict.toUpperCase()}</button>}
              {(['pass', 'fail', 'na'] as Verdict[]).filter((v) => v !== f.verdict || suppressed).map((v) => (
                <button key={v} className="btn" onClick={() => onDecide(v)}>Rule {v === 'na' ? 'N/A' : v.toUpperCase()}</button>
              ))}
            </div>
          )}
          {agentView && onContest && f.verdict === 'fail' && (
            <div className="pt-1"><button className="btn" onClick={onContest}>Contest this finding</button></div>
          )}
        </div>
      )}
    </div>
  );
}
