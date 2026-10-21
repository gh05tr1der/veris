// Core domain types for the VERIS engine. The engine is framework-free TypeScript:
// every module here runs identically in the browser, in Node, and in the test suite.

export type Speaker = 'agent' | 'customer';
export type Lang = 'en' | 'hi' | 'hi-en';
export type Phase = 'opening' | 'verification' | 'discovery' | 'resolution' | 'disclosure' | 'closing';
export type Verdict = 'pass' | 'fail' | 'na';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type QueueId = 'INS' | 'CRD' | 'COL';

export interface Word {
  w: string; // token exactly as it appears in the utterance text
  s: number; // start, seconds from call start
  e: number; // end, seconds
  c: number; // ASR confidence 0..1
}

export interface Utterance {
  id: string; // U01, U02 ...
  speaker: Speaker;
  start: number;
  end: number;
  text: string; // raw-zone text (may contain PII)
  words: Word[];
}

export interface Outcome {
  repeatContact7d: boolean;
  escalated: boolean;
  ticketReopened: boolean;
  csat: number | null; // 1-5 or null when no survey response
}

export interface Call {
  id: string;
  client: string;
  queue: QueueId;
  agentId: string;
  agentName: string;
  date: string; // ISO date-time
  duration: number;
  audioUrl?: string;
  utterances: Utterance[];
  outcome: Outcome;
  /** Senior-reviewer verdicts from the rotating blind sample (absent for unsampled calls). */
  reviewerLabels?: Record<string, Verdict>;
  /** True for calls in the curated golden set used for policy regression testing. */
  golden?: boolean;
  source: 'demo-recording' | 'synthetic-corpus' | 'upload';
}

// ---------- Privacy ----------
export type PiiType = 'CARD' | 'AADHAAR' | 'PAN' | 'EMAIL' | 'PHONE' | 'DOB' | 'POLICY_ID' | 'ACCOUNT' | 'DIGITS';
export interface Redaction {
  type: PiiType;
  /** char range in the raw text */
  start: number;
  end: number;
  /** char range of the placeholder in the redacted text */
  rStart: number;
  rEnd: number;
}

/** Analysis-zone utterance: redacted, language-tagged, phase-tagged. Never carries raw PII. */
export interface AnalysedUtterance {
  id: string;
  index: number;
  speaker: Speaker;
  start: number;
  end: number;
  text: string; // REDACTED text
  lang: Lang;
  langScores: { hi: number; en: number };
  phase: Phase;
  redactions: Redaction[];
  /** maps redacted-text char offsets back to time via the raw word timings */
  timeOf: (rStart: number, rEnd: number) => { start: number; end: number; minConf: number };
}

// ---------- Policy ----------
export type Category = 'compliance' | 'process' | 'soft-skill' | 'resolution';

export type Spec =
  | { kind: 'presence'; concept: string; speaker: Speaker; window?: 'opening' | 'closing' | 'any' }
  | { kind: 'absence'; concept: string; speaker: Speaker }
  | { kind: 'sequence'; first: string; then: string; speaker: Speaker }
  | { kind: 'factors'; min: number; before: string }
  | { kind: 'conditional'; trigger: string; response: string; withinTurns: number }
  | { kind: 'acoustic'; metric: 'interruptions' | 'longest_silence' | 'agent_talk_share'; op: '<=' | '>='; value: number }
  | { kind: 'semantic'; question: string };

export interface Criterion {
  id: string;
  text: string; // plain-English criterion as written by the QA owner
  severity: Severity;
  category: Category;
  queues: QueueId[] | 'all';
  weight: number;
  spec: Spec;
  compiledBy: 'compiler' | 'manual';
  compileNotes: string[];
}

export interface PolicyVersion {
  version: number;
  name: string;
  criteria: Criterion[];
  publishedAt: string;
  author: string;
  note: string;
  regression?: RegressionSummary;
}

// ---------- Evaluation ----------
export interface EvidenceCandidate {
  utteranceId: string;
  quote: string;
  role?: string; // e.g. "confirmation", "disclosure"
}

export interface Evidence extends EvidenceCandidate {
  speaker: Speaker;
  start: number;
  end: number;
  match: 'exact' | 'normalized';
  minConf: number;
}

export interface RawFinding {
  criterionId: string;
  verdict: Verdict;
  rationale: string;
  confidence: number;
  evidence: EvidenceCandidate[];
  engine: 'deterministic' | 'llm';
  model?: string;
  late?: boolean; // sequence criteria: element present but in the wrong order
}

export type RoutingDecision = 'auto_publish' | 'advisory' | 'human_review' | 'suppressed';

export interface Reliability {
  key: string;
  n: number;
  agreement: number | null;
  kappa: number | null;
  status: 'auto' | 'advisory' | 'insufficient';
}

export interface Finding {
  criterionId: string;
  criterionText: string;
  severity: Severity;
  category: Category;
  verdict: Verdict;
  rationale: string;
  confidence: number;
  engine: 'deterministic' | 'llm';
  model?: string;
  evidence: Evidence[];
  rejectedEvidence: EvidenceCandidate[];
  gate: 'verified' | 'failed' | 'not-required';
  reliability: Reliability;
  routing: { decision: RoutingDecision; reasons: string[]; priority: number };
  late?: boolean;
}

export interface Acoustics {
  agentTalk: number;
  customerTalk: number;
  agentTalkShare: number;
  silenceTotal: number;
  longestSilence: { start: number; end: number } | null;
  holds: { start: number; end: number }[];
  overtalk: { start: number; end: number }[];
  interruptions: { at: number; agentUtt: string; customerUtt: string; overlap: number }[];
  wpm: { agent: number; customer: number };
}

export interface SentimentPoint {
  t: number;
  utteranceId: string;
  score: number; // -1..1 smoothed
  raw: number;
}

export interface StageLog {
  stage: string;
  layer: string;
  detail: string;
  ms: number;
}

export interface ProcessedCall {
  callId: string;
  policyVersion: number;
  transcript: AnalysedUtterance[];
  language: Lang;
  redactionCount: number;
  acoustics: Acoustics;
  sentiment: SentimentPoint[];
  findings: Finding[];
  score: number | null;
  autoFail: boolean;
  status: 'published' | 'in_review';
  summary: CallSummary;
  stages: StageLog[];
  engineMode: 'deterministic' | 'hybrid-llm';
}

export interface CallSummary {
  reason: string;
  resolution: string;
  outcome: string;
  flags: string[];
}

export interface RegressionSummary {
  goldenCalls: number;
  verdictFlips: number;
  meanScoreDrift: number;
  agreementBefore: number | null;
  agreementAfter: number | null;
}
