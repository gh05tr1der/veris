# VERIS architecture and engine notes

This document maps the nine-layer architecture in the VERIS submission to the prototype, then explains the main algorithms.

## Layer map

| # | Layer | Zone | Prototype implementation | Status |
|---|---|---|---|---|
| 1 | Data sources | — | `src/data/heroCalls.ts` (5 stereo recordings), `src/data/corpus.ts` (seeded 324-call corpus with CRM outcomes and a blind reviewer sample), uploads | Simulated |
| 2 | Integration & ingestion | — | `pages/Upload.tsx`; per-call job + stage log in `engine/pipeline.ts` | Implemented |
| 3 | Speech intelligence | Raw | `engine/audio.ts` (decode, channel-energy VAD, waveform, diarization check), `engine/asr.ts` (OpenAI-compatible ASR with word timestamps, transcript import), `engine/lid.ts`, `engine/acoustics.ts` | Implemented (ASR via adapter) |
| 4 | Privacy & pre-processing | Raw → analysis | `engine/pii.ts`, `engine/prepare.ts` | Implemented |
| 5 | AI intelligence | Analysis | `engine/compiler.ts`, `engine/lexicon.ts`, `engine/evaluate.ts`, `engine/llm.ts` | Implemented |
| 6 | Evidence & governance | Analysis | `engine/evidence.ts`, `engine/calibration.ts`, `engine/router.ts`, `engine/regression.ts`, `engine/audit.ts` | Implemented |
| 7 | Analytics & coaching | Analysis | `engine/coaching.ts`, `engine/discovery.ts`, `engine/efficacy.ts` | Implemented |
| 8 | Experience | — | `src/pages/*` | Implemented |
| 9 | Enterprise integration | — | LMS assignment and audit export are represented in the UI | Roadmap |

The engine (`src/engine`) has no framework dependency: the same code runs in the browser, in Node (`scripts/*.ts`) and in the tests.

## Pipeline

`processCall` in `engine/pipeline.ts` runs, and logs with timings:

1. **Ingest** — job record for the call.
2. **Speech-to-text** — word-level transcript with per-word confidence (synthesiser timings for the demo recordings, ASR for uploads).
3. **Diarization** — stereo channel separation (agent left, customer right). In the browser, `audio.ts` re-derives speech activity per channel and reports how much of each transcript turn has energy on its speaker's channel.
4. **Language identification** — per utterance: Devanagari share plus romanised-Hindi vs English function-word lexicons; ambiguous Latin-script tokens (to, me, the) count as English; ≥2 Hindi tokens make an utterance code-mixed. A call is routed as Hinglish when ≥20% of its turns are Hindi or code-mixed.
5. **Acoustics** — silences ≥3 s, holds ≥10 s, overtalk, interruptions (agent starts ≥0.5 s into a customer turn, overlaps ≥0.5 s, and the customer stops within 2.5 s), talk share, speaking rate.
6. **Redaction** — see below. Everything after this point sees only redacted text.
7. **Segmentation** — rule-based phases: opening, verification, discovery, disclosure, resolution, closing.
8. **Policy retrieval** — active version, criteria scoped to the queue.
9. **Evaluation** — each criterion independently: deterministic spec, or the LLM tier for semantic criteria (hybrid) or for all criteria.
10. **Evidence gate** — verify and time-bind every quote.
11. **Reliability lookup** — Calibration Ledger for criterion × call language.
12. **Routing** — auto-publish, advisory, human review, or suppressed.
13. **Summary and insight**.

## Privacy boundary

`pii.ts` detects, in priority order: email; card numbers (13–19 digits, **Luhn-validated**); Aadhaar (12 digits, **Verhoeff-validated**); PAN (`AAAAA9999A`); Indian mobile numbers; dates of birth (day–month–year with a year before 2010, so “due on 5 October” is untouched); policy ids; account numbers; spoken digit strings. Each hit becomes a typed placeholder (`[CARD]`, `[DOB]`…). Redaction records both raw and redacted offsets so `toRawOffset` can map any span in redacted text back to the raw text — and through the raw words to audio time. That is how evidence quoted from redacted text still plays the right three seconds of audio. Raw-zone views in the UI are written to the audit log.

## Policy compiler

`compile(text)` turns a plain-English criterion into one of seven executable spec kinds:

| Spec | Example criterion | Semantics |
|---|---|---|
| `acoustic` | “Did the agent interrupt the customer?” | metric from diarized timings (`interruptions ≤ 0`, longest silence, talk share) |
| `factors` | “…two-factor identity verification before discussing account details?” | count distinct verification factors requested before the first account-detail disclosure |
| `conditional` | “When the customer expresses frustration…, did the agent acknowledge it with empathy?” | trigger in customer speech → required agent response within 2 agent turns; N/A without a trigger |
| `sequence` | “…disclose applicable charges before confirming the cancellation?” | first event must precede the first occurrence of the second; *late* vs *missing* are distinguished; N/A if the second never occurs |
| `absence` | “…avoid threats, coercion or disclosing the debt to third parties?” | any occurrence fails; fault concepts are always absence checks |
| `presence` | “…offer further assistance before closing the call?” | concept must occur, optionally within the opening or closing window |
| `semantic` | “…explain how the pro-rata refund was calculated accurately?” | nothing resolved deterministically → LLM-only |

Noun phrases are resolved onto concepts in `lexicon.ts` by keyword cues; weak cues (“explain”, “cancel”) can break ties but never resolve a concept on their own. The compile notes shown in the UI are the compiler's own trace.

## Evidence gate

`gate()` accepts a quote only if it is found in the cited utterance (or, failing that, elsewhere in the transcript) **exactly**, or after case/punctuation/whitespace normalisation. Found quotes are bound to the start/end time of the words they cover and inherit the lowest ASR word confidence, which lowers instance confidence. A pass or fail with no verified evidence is **suppressed**. Absence passes (nothing prohibited found) need no span. Quotes of raw PII cannot verify, because the analysis-zone text contains only placeholders.

## Calibration Ledger

Pairs of (VERIS verdict, reviewer verdict) come from the rotating blind sample, reviewer rulings in the queue, and contest outcomes. For each criterion × language:

- raw agreement, Cohen's κ = (pₒ − pₑ)/(1 − pₑ), and a 95% interval from the large-sample standard error;
- N/A disagreements are excluded from κ and reported as applicability disagreements;
- **status**: *insufficient* if n < 25 or either outcome has < 5 reviewer-labelled examples (κ is unstable for rare events); *auto* if κ ≥ 0.75 and agreement ≥ 90%; otherwise *advisory*;
- **drift**: if the criterion qualified on data before the last 14 days, and within those days (n ≥ 25) agreement < 87% and κ < 0.65, it reverts to advisory and is flagged.

Thresholds are adjustable in Settings; the rule that high and critical failures always reach a human is not.

## Routing

In order: unevidenced → **suppressed**; N/A → published; failed high/critical → **human review**; criterion not reliable in this language → **advisory**; instance confidence < 0.7 → **human review**; otherwise **auto-publish**. The review queue lists mandatory reviews, suppressed verdicts, advisory failures and open contests for the current week, ordered by a risk score (severity, confidence, suppression).

## Golden-set regression

`replay(golden, baseline, candidate)` evaluates both policy versions on the 40 golden calls and reports verdict flips per criterion (with examples), per-call score movement, and agreement with reviewer labels before and after. New criteria have no golden labels, so they start advisory. Publishing requires a fresh regression and a change note.

## Coaching

Over the last 30 days per agent, a criterion becomes a coaching item when failures are ≥ 3 and ≥ 25% of applicable calls (≥ 85% for low-severity criteria), counting only findings on criteria that are **auto** in that language — measurement error must not become coaching. Root cause is inferred from the spec: sequence failures that are mostly *late* are a process-understanding gap, missing ones a knowledge gap; conditionals are recognition gaps; prohibitions are conduct issues for the team leader and compliance. At most two items per agent, ranked by severity² × occurrences × fail rate. Assignments show before/after fail rates.

## Emerging-issue discovery

Customer-side redacted text per call → TF-IDF (unigrams + adjacent bigrams; Hindi/English stop-words, placeholders and vehicle names removed; min df 3, max df 50%) → cosine k-means with k-means++ seeding, k in 6–11 chosen by silhouette → clusters with centroid similarity ≥ 0.3 merged → six rolling 7-day windows ending at the as-of date. A cluster is **emerging** when its last three weeks are at least double the three before, have ≥ 12 calls, and a one-sided binomial test gives p < 0.001. Each cluster is checked against criterion wording to say whether the scorecard covers it.

## Scorecard efficacy

For each criterion, calls that passed vs failed are compared on repeat contact within 7 days, escalation and CSAT. Repeat contact and escalation use the **Cochran–Mantel–Haenszel** test stratified by agent (with the Mantel–Haenszel common odds ratio), so a weak agent who fails a criterion and also generates repeat contacts for other reasons does not make that criterion look predictive. CSAT is centred on each agent's mean and compared with Welch's test. α = 0.01 per test. Compliance criteria are labelled *regulatory control* regardless of outcome association. A non-compliance criterion with ≥ 20 passes and failures and all p > 0.2 is reported as *no measurable link — review*.

## Audit log

Each entry stores `prevHash` and `hash = SHA-256([seq, ts, actor, action, subject, detail, prevHash])`. `verifyChain` recomputes every hash and reports the first broken link. *Simulate tampering* edits a scratch copy so the stored log is never altered.

## LLM tier

`llm.ts` builds one batched prompt per call with numbered criteria and the redacted transcript (utterance ids and timestamps), and requires JSON with verdict, rationale, confidence and verbatim quotes per criterion. Unknown criterion ids are ignored (schema guardrail). Model routing uses the large tier for long, code-mixed, critical or semantic evaluations and the small tier otherwise. Anthropic is called with the Messages API; any OpenAI-compatible endpoint works for self-hosted open-weight models. Output is untrusted until it passes the evidence gate.

## Synthetic corpus

`generateCorpus()` (seeded, deterministic) produces ~324 calls from 7 Sept to 20 Oct 2026 across three queues and twelve agents with individual behaviour profiles. Calls are assembled from conversation moves whose ground truth is known; a share of phrasings are paraphrases the lexicon does not cover, and some over-match it (e.g. a dismissive “I understand, but…”). Senior-reviewer labels exist for a risk-stratified blind sample (90% of cancellations, 75% of collections, 45% of others) with criterion-specific human noise (0.5–7%). CRM outcomes are drawn from the ground truth through a logistic model in which some criteria matter and others (the brand tagline) do not. Seeded scenarios: one agent coached on 28 Sept improves afterwards; a new closing script from 6 Oct uses timeline phrasing the lexicon misses (drift); cancellation-charge disputes rise over the last three weeks (emerging issue).
