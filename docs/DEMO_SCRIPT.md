# VERIS demo script (4–5 minutes)

Open the live demo (or `npm run dev`). If you have rehearsed before, use **Settings → Reset demo state** first so the policy is at v3 and the queue is clean.

---

### 0. Set-up (20 s) — *Overview*

> “Every platform now scores every call with AI. That stopped being a differentiator. The unsolved question is how far to trust those scores, when they drive coaching, pay and compliance attestations. VERIS is built around that question.”

Point at the coverage tile (100% evaluated vs ~60% blind-sampled by reviewers) and at *Findings with verified evidence: 100%*.

### 1. The call (30 s) — open **VRS-INS-0412**

> “A motor policy cancellation. The client's policy says: two-factor verification before discussing policy details, and the cancellation charge must be disclosed before confirming — not after.”

Press play for a few seconds: stereo recording, agent on the left channel, customer on the right, waveform decoded in the browser. The phase ribbon under the waveform shows opening → verification → … → closing.

### 2. The evidence moment (60 s) — expand **Q-DIS**

- Rationale: confirmation at 01:10.0, charge at 01:41.4 — **31.5 s later**.
- Click **01:41.4** → you hear “there will be a cancellation charge of 850 rupees…”.

> “The disclosure *was* made. A keyword system marks this a pass. What failed was the sequence.”

- Point at *Measured reliability · English* (κ, agreement, n) and the routing reason: *high severity → mandatory human review*.

> “The score didn't just publish itself. The routing decision comes from a measured reliability figure, not a guess.”

### 3. Adaptive policy (30 s) — **Add a criterion**

Leave the default text “Did the agent interrupt the customer?” → **Compile and run**.

- The compile preview shows the template (acoustic metric, from diarized timings).
- A new **Q-INT** finding appears at **01:04.9**, citing the customer being cut off and the agent's interruption.
- It is **advisory**: a new criterion has not earned reliability yet.

> “No code. No retraining. And it can't act alone until it has proven itself.”

Optional: the second chip, “Check whether the agent explained the cancellation fee before confirming the cancellation”, compiles to the same sequence spec as Q-DIS.

### 4. The hallucination gate (20 s) — **Test the evidence gate** → *Inject and evaluate*

A simulated model claims PASS with a quote the agent never said. The card shows **Withheld**, with the rejected quote struck through.

> “Fabricated evidence fails string verification, so a fabricated finding cannot reach an agent's record.”

### 5. Governance (45 s) — *Calibration ledger*

- κ per criterion **and per language**. Hinglish is tracked separately — some criteria are auto-publish in English but advisory in Hinglish.
- **Q-NXT (English): Drift detected.** A new closing script rolled out on 6 Oct; agreement dropped in the last 14 days and the criterion reverted to advisory on its own.

> “This is the Calibration Ledger. It turns trust from a claim into a number, and the number is load-bearing.”

### 6. Regression and the contest loop (30 s)

- *Policy studio*: the draft from step 3 is waiting. **Run regression** → verdict flips, score drift, reviewer agreement before/after on the 40-call golden set. Publish needs a change note and lands in the audit log.
- *Agent portal* (Rohan Mehta) → expand a failed finding → **Contest**. It appears in the *Review queue*; the ruling becomes a labelled example.

### 7. Insight and coaching (30 s)

- *Coaching → Rohan Mehta*: the Q-DIS pattern across his recent calls, root cause *process-understanding gap*, a 6-minute module, and a follow-up window. Farhan Qureshi's earlier assignment shows the before/after effect.
- *Insights → Emerging issues*: **cancellation-charge disputes** grew sharply over three weeks — nobody wrote a QA question for it — and the cluster links back to Q-DIS. *Scorecard efficacy* shows which criteria predict repeat contact and which (e.g. the brand tagline) show no measurable link.

### Close (10 s)

> “VERIS knows what it isn't good at yet, and it refuses to act alone on it. Competitors made QA automated. VERIS makes it accountable.”

---

## Likely questions — where to point

| Question | Show |
|---|---|
| How accurate is it? | Ledger: we report measured agreement per criterion and language; we don't quote a single number. Figures here are on a simulated pilot. |
| How do you stop hallucination? | Evidence gate test; `src/engine/evidence.ts`; unit tests in `tests/evidence.test.ts`. |
| What about PII? | *View raw zone* (and the audit entry it creates); VRS-CRD-0951 where the customer reads out a full card number and PAN. |
| Hinglish? | VRS-CRD-0907 → *Conversation analytics → Language by utterance*. |
| Why not just keywords? | Q-DIS on VRS-INS-0412: the keyword is present; the sequence is wrong. |
| Can we use our own model / keep data on-premise? | *Settings*: OpenAI-compatible endpoint (vLLM/Ollama) — the evaluator is interchangeable. |
