import { FileAudio, FileText, Loader2, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { importTranscript, transcribe } from '../engine/asr';
import { analyse, decode } from '../engine/audio';
import { QUEUE_NAME } from '../engine/pipeline';
import type { Call, QueueId, Utterance } from '../engine/types';
import { AGENTS } from '../data/corpus';
import { useStore } from '../state/store';
import { PageHeader } from '../ui/kit';

const SAMPLE = `Agent: Thank you for calling Suraksha General Insurance, this is Kabir. How can I help you today?
Customer: Hi, I sold my car and I want to cancel the motor policy.
Agent: For verification, could you confirm your date of birth and your registered mobile number?
Customer: It's 3 May 1990, and the mobile is 98450 11223.
Agent: Thank you. I can see the policy on your Tata Nexon.
Agent: I will now process the cancellation for you.
Customer: Okay.
Agent: Please note there is a cancellation charge of 850 rupees, deducted from the refund.
Customer: Why am I only hearing about this now? That is not fair.
Agent: Okay. Let me check.
Agent: Thank you for calling. Goodbye.`;

export default function Upload() {
  const s = useStore();
  const nav = useNavigate();
  const [audio, setAudio] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [queue, setQueue] = useState<QueueId>('INS');
  const [agentId, setAgentId] = useState('A-101');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setErr(null);
    try {
      let utts: Utterance[];
      let audioUrl: string | undefined;
      let duration = 0;
      if (audio) {
        setBusy('Decoding audio and separating channels…');
        const buf = await audio.arrayBuffer();
        const analysis = analyse(await decode(buf));
        duration = analysis.duration;
        audioUrl = URL.createObjectURL(audio);
        if (text.trim()) utts = importTranscript(text);
        else {
          setBusy('Transcribing with your ASR endpoint…');
          utts = await transcribe({ ...s.asr, apiKey: s.asrKey }, audio, audio.name, analysis);
        }
      } else {
        if (!text.trim()) throw new Error('Add a recording, a transcript, or both.');
        utts = importTranscript(text);
      }
      setBusy('Running the VERIS pipeline…');
      const agent = AGENTS.find((a) => a.id === agentId)!;
      const id = `UPL-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      const call: Call = {
        id,
        client: queue === 'INS' ? 'Suraksha General Insurance' : 'Unity Bank',
        queue,
        agentId,
        agentName: agent.name,
        date: new Date().toISOString(),
        duration: Math.max(duration, utts[utts.length - 1]?.end ?? 0) + 0.5,
        audioUrl,
        utterances: utts,
        outcome: { repeatContact7d: false, escalated: false, ticketReopened: false, csat: null },
        source: 'upload',
      };
      await s.addUpload(call);
      nav(`/calls/${id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="max-w-[860px]">
      <PageHeader title="Upload a call" lede="Bring your own interaction. Stereo recordings are diarized by channel in your browser. Transcription uses the speech-to-text endpoint set in Settings, or paste a transcript you already have." />
      <div className="panel p-5 space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="rounded-lg border-2 border-dashed border-line hover:border-cobalt/50 p-5 text-center cursor-pointer block">
            <FileAudio className="mx-auto text-cobalt" />
            <div className="text-[13px] font-medium mt-1">{audio ? audio.name : 'Choose a recording'}</div>
            <div className="text-[12px] text-muted">MP3, WAV or M4A · stereo preferred (agent left, customer right)</div>
            <input type="file" accept="audio/*" className="sr-only" onChange={(e) => setAudio(e.target.files?.[0] ?? null)} />
          </label>
          <div className="rounded-lg border border-line p-4">
            <FileText className="text-cobalt" size={20} />
            <div className="text-[13px] font-medium mt-1">Or provide a transcript</div>
            <div className="text-[12px] text-muted">Lines starting “Agent:” / “Customer:”, or VERIS JSON with timings. With a recording too, the transcript is used instead of ASR.</div>
            <button className="text-[12px] text-cobalt mt-1" onClick={() => setText(SAMPLE)}>Paste a sample transcript</button>
          </div>
        </div>
        <textarea className="field min-h-[180px] font-mono !text-[12px]" value={text} onChange={(e) => setText(e.target.value)} placeholder="Agent: Thank you for calling…" />
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Queue</label>
            <select className="field mt-1" value={queue} onChange={(e) => setQueue(e.target.value as QueueId)}>
              {(['INS', 'CRD', 'COL'] as QueueId[]).map((q) => <option key={q} value={q}>{QUEUE_NAME[q]}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Agent</label>
            <select className="field mt-1" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
              {AGENTS.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
        {err && <div className="rounded-md bg-failsoft text-fail px-3 py-2 text-[13px]">{err} {err.includes('Settings') && <Link to="/settings" className="underline">Open settings</Link>}</div>}
        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={run} disabled={!!busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}{busy ?? 'Evaluate this call'}</button>
          <span className="text-[12px] text-muted">Uploads stay in this browser. Recordings are not sent anywhere unless you configure an ASR endpoint.</span>
        </div>
      </div>
    </div>
  );
}
