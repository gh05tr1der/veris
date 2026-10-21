import { Link } from 'react-router-dom';
import { PageHeader } from '../ui/kit';

type Status = 'Implemented' | 'Implemented (adapter)' | 'Simulated' | 'Roadmap';
const LAYERS: { n: number; name: string; zone?: 'raw' | 'analysis'; what: string; here: string; files: string; status: Status }[] = [
  { n: 1, name: 'Data sources', what: 'CCaaS recordings and streams, CRM and ticketing, WFM/HRMS, policy repository, SOPs.', here: 'Five stereo demo recordings plus a seeded six-week corpus of 324 calls with CRM outcomes; your own uploads.', files: 'src/data/*', status: 'Simulated' },
  { n: 2, name: 'Integration & ingestion', what: 'Connector framework, event bus, batch backfill, live media.', here: 'Job creation per call; upload of audio or transcripts in the browser.', files: 'pages/Upload.tsx · engine/pipeline.ts', status: 'Implemented' },
  { n: 3, name: 'Speech intelligence', zone: 'raw', what: 'ASR with word timestamps, diarization, utterance-level language ID, acoustic analytics.', here: 'Stereo channel-energy diarization and waveform decoded in the browser; ASR via any OpenAI-compatible endpoint; code-mix language ID per utterance; silence, overtalk, interruptions, talk share.', files: 'engine/audio.ts · asr.ts · lid.ts · acoustics.ts', status: 'Implemented (adapter)' },
  { n: 4, name: 'Privacy & pre-processing', zone: 'raw', what: 'PII/PHI detection and redaction; the only path from raw zone to analysis zone; phase segmentation.', here: 'Card numbers (Luhn-validated), Aadhaar (Verhoeff), PAN, phone, email, DOB, policy and account numbers, spoken digit strings. Redacted text carries a time map back to the audio. Raw-zone views are logged.', files: 'engine/pii.ts · prepare.ts', status: 'Implemented' },
  { n: 5, name: 'AI intelligence', zone: 'analysis', what: 'Policy compiler, semantic QA engine, compliance engine, RAG, model router.', here: 'Plain English → executable spec compiler; deterministic evaluator (presence, prohibition, sequence, verification factors, conditionals, acoustic); optional LLM tier (Claude or any OpenAI-compatible model, incl. self-hosted) with small/large model routing.', files: 'engine/compiler.ts · lexicon.ts · evaluate.ts · llm.ts', status: 'Implemented' },
  { n: 6, name: 'Evidence & governance', zone: 'analysis', what: 'Evidence gate, Calibration Ledger, policy registry with golden-set regression, risk router, audit log, drift monitoring.', here: 'Verbatim quote verification and timestamp binding; Cohen’s κ per criterion × language with drift reversion; reliability-driven routing; regression replay; SHA-256 hash-chained audit log.', files: 'engine/evidence.ts · calibration.ts · router.ts · regression.ts · audit.ts', status: 'Implemented' },
  { n: 7, name: 'Analytics & coaching', zone: 'analysis', what: 'Coaching engine, root cause, emerging-issue discovery, scorecard efficacy.', here: 'Issue → evidence → root cause → action → module → follow-up; TF-IDF + k-means discovery with growth flags; agent-stratified (CMH) outcome tests per criterion.', files: 'engine/coaching.ts · discovery.ts · efficacy.ts', status: 'Implemented' },
  { n: 8, name: 'Experience', what: 'Agent, supervisor, QA, compliance and management consoles.', here: 'This application: call audit, review queue, ledger, policy studio, coaching, agent portal, insights, audit log.', files: 'src/pages/*', status: 'Implemented' },
  { n: 9, name: 'Enterprise integration', what: 'CRM write-back, LMS, WFM, BI export, SSO/SCIM.', here: 'LMS assignment and audit export are represented in the UI; connectors are roadmap items.', files: '—', status: 'Roadmap' },
];

const tone: Record<Status, string> = { Implemented: 'text-pass', 'Implemented (adapter)': 'text-pass', Simulated: 'text-advisory', Roadmap: 'text-muted' };

export default function HowItWorks() {
  return (
    <div className="max-w-[1100px]">
      <PageHeader title="How it works" lede="The nine-layer architecture from the VERIS assessment document, mapped to what this prototype actually runs. Everything executes in the browser; there is no backend." />
      <div className="panel overflow-hidden">
        {LAYERS.map((l, i) => (
          <div key={l.n}>
            {l.zone === 'analysis' && LAYERS[i - 1]?.zone === 'raw' && (
              <div className="bg-review/10 border-y border-review/30 px-4 py-1.5 text-[12px] text-review font-medium">
                Raw zone → analysis zone boundary · only redacted text crosses · no analysis component, including the LLM, can read raw data
              </div>
            )}
            <div className={`grid md:grid-cols-[200px_1fr_1fr] gap-3 px-4 py-3 border-b border-line ${l.zone === 'raw' ? 'bg-sunk/60' : ''}`}>
              <div>
                <div className="text-[11px] text-faint">Layer {l.n}{l.zone ? ` · ${l.zone} zone` : ''}</div>
                <div className="font-semibold">{l.name}</div>
                <div className={`text-[12px] font-medium ${tone[l.status]}`}>{l.status}</div>
              </div>
              <div className="text-[13px] text-muted">{l.what}</div>
              <div className="text-[13px]">
                {l.here}
                <div className="font-mono text-[11px] text-faint mt-1">{l.files}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <div className="panel p-5">
          <h2 className="h2 mb-2">What is real</h2>
          <ul className="text-[13px] space-y-1.5 list-disc ml-4">
            <li>Every number on screen is computed by the engine at load time: verdicts, κ, routing, coaching, clusters, efficacy tests and regression replays.</li>
            <li>The demo recordings are genuine stereo audio files. Word timestamps come from the speech synthesiser that produced them, and diarization is re-derived from channel energy in your browser.</li>
            <li>The evidence gate, redaction, compiler, ledger statistics and audit hash chain are production logic with unit tests (<code className="kbd">npm test</code>).</li>
            <li>With an API key, the LLM tier calls a real model on the redacted transcript, and its quotes go through the same gate.</li>
          </ul>
        </div>
        <div className="panel p-5">
          <h2 className="h2 mb-2">What is simulated, and why</h2>
          <ul className="text-[13px] space-y-1.5 list-disc ml-4">
            <li>The 324-call pilot corpus is generated from a seeded script so no real customer data is used. Its senior-reviewer labels come from the generator’s ground truth with a small human-disagreement rate.</li>
            <li>Phrasings deliberately include paraphrases the deterministic lexicon misses, so measured agreement is earned and uneven by criterion and language, as it would be in a pilot.</li>
            <li>Two scenarios are seeded so the governance features have something to find: a closing-script change on 6 October (drift on Q-NXT) and a rise in cancellation-charge disputes (emerging issue).</li>
            <li>The κ values therefore demonstrate the mechanism, not VERIS’s real-world accuracy. That figure can only be measured on a client’s own calls in the pilot.</li>
          </ul>
        </div>
      </div>

      <div className="panel p-5 mt-4">
        <h2 className="h2 mb-2">Three controls, layered</h2>
        <div className="grid md:grid-cols-3 gap-4 text-[13px]">
          <div><div className="font-semibold">Evidence grounding</div><p className="text-muted mt-1">Stops fabrication. A verdict whose quote cannot be found verbatim is withheld, never published. Try it with “Test the evidence gate” on any call.</p></div>
          <div><div className="font-semibold">Measured reliability</div><p className="text-muted mt-1">Stops overreach. A criterion acts alone only where it has shown agreement with senior reviewers, per language, and loses that right automatically on drift.</p></div>
          <div><div className="font-semibold">Human review</div><p className="text-muted mt-1">Stops consequence. High and critical failures always reach a person, and agents can contest anything that publishes.</p></div>
        </div>
        <p className="text-[13px] mt-4">A suggested five-minute walkthrough is in the repository’s <code className="kbd">docs/DEMO_SCRIPT.md</code>. Start at <Link className="text-cobalt" to="/calls/VRS-INS-0412">VRS-INS-0412</Link>.</p>
      </div>
    </div>
  );
}
