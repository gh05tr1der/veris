// Risk & reliability routing. Combines (1) the evidence gate result, (2) business severity,
// (3) the criterion's *measured* reliability in this language from the Calibration Ledger,
// and (4) instance confidence. Only findings that pass every check publish automatically.

import type { Thresholds } from './calibration';
import type { Finding, Reliability, RoutingDecision, Severity, Verdict } from './types';

const SEV_WEIGHT: Record<Severity, number> = { critical: 100, high: 70, medium: 40, low: 15 };

export function route(
  f: { verdict: Verdict; severity: Severity; confidence: number; gate: Finding['gate'] },
  rel: Reliability,
  th: Thresholds,
  langLabel: string,
): Finding['routing'] {
  const reasons: string[] = [];
  let decision: RoutingDecision;
  const relText = rel.kappa != null ? `κ ${rel.kappa.toFixed(2)}, n=${rel.n}` : `n=${rel.n}`;
  if (f.gate === 'failed') {
    decision = 'suppressed';
    reasons.push('Evidence could not be verified verbatim in the transcript. Verdict withheld and escalated to a reviewer.');
  } else if (f.verdict === 'na') {
    decision = 'auto_publish';
    reasons.push('Not applicable to this interaction.');
  } else if (f.verdict === 'fail' && (f.severity === 'high' || f.severity === 'critical')) {
    decision = 'human_review';
    reasons.push(`${f.severity === 'critical' ? 'Critical' : 'High'}-severity finding: mandatory human review, regardless of confidence.`);
    if (rel.status === 'auto') reasons.push(`Criterion reliability in ${langLabel}: ${relText} (meets threshold).`);
  } else if (rel.status !== 'auto') {
    decision = 'advisory';
    reasons.push(
      rel.status === 'insufficient'
        ? `Advisory: criterion has not yet earned reliability in ${langLabel} (${relText}; ${th.minN} labelled pairs needed). Human confirmation required.`
        : `Advisory: measured agreement in ${langLabel} is below threshold (${relText}; needs κ ≥ ${th.kappa}). Human confirmation required.`,
    );
  } else if (f.confidence < th.minConfidence) {
    decision = 'human_review';
    reasons.push(`Instance confidence ${f.confidence.toFixed(2)} is below ${th.minConfidence}.`);
  } else {
    decision = 'auto_publish';
    reasons.push(`Reliable in ${langLabel} (${relText}), confidence ${f.confidence.toFixed(2)}, ${f.severity} severity.`);
  }
  const priority = Math.round(
    (f.verdict === 'fail' ? SEV_WEIGHT[f.severity] : SEV_WEIGHT[f.severity] * 0.3) + (1 - f.confidence) * 30 + (decision === 'suppressed' ? 50 : 0),
  );
  return { decision, reasons, priority };
}

export const DECISION_LABEL: Record<RoutingDecision, string> = {
  auto_publish: 'Auto-published',
  advisory: 'Advisory',
  human_review: 'Human review',
  suppressed: 'Suppressed',
};
