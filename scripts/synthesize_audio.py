#!/usr/bin/env python3
"""
Synthesise the VERIS demo call recordings.

Reads scripts/hero_calls.json and, for every call:
  * synthesises each utterance with eSpeak NG (via the espeakng-loader wheel),
    capturing the synthesiser's own WORD events so every transcript word gets a
    real start/end timestamp in the produced audio;
  * places agent speech on the LEFT channel and customer speech on the RIGHT
    channel (the stereo layout most call recorders use), honouring the
    scheduled start times so overlaps (interruptions) and holds are real;
  * applies a telephony band-pass and a low noise floor with ffmpeg;
  * writes public/audio/<id>.mp3 and src/data/generated/heroTimings.json.

Usage:  pip install espeakng-loader numpy  &&  python3 scripts/synthesize_audio.py
Requires ffmpeg on PATH.
"""
import ctypes, json, os, random, re, subprocess, sys, tempfile, wave
import numpy as np
import espeakng_loader

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR_OUT = 16000


class EspeakEvent(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_int),
        ("unique_identifier", ctypes.c_uint),
        ("text_position", ctypes.c_int),
        ("length", ctypes.c_int),
        ("audio_position", ctypes.c_int),
        ("sample", ctypes.c_int),
        ("user_data", ctypes.c_void_p),
        ("id", ctypes.c_char * 8),
    ]


SYNTH_CB = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.POINTER(EspeakEvent))


class Espeak:
    def __init__(self):
        self.lib = ctypes.cdll.LoadLibrary(espeakng_loader.get_library_path())
        data = espeakng_loader.get_data_path().encode()
        self.sr = self.lib.espeak_Initialize(1, 0, ctypes.c_char_p(data), 0)  # AUDIO_OUTPUT_RETRIEVAL
        if self.sr <= 0:
            raise RuntimeError("espeak init failed")
        self._chunks, self._words = [], []
        self._cb = SYNTH_CB(self._on_audio)
        self.lib.espeak_SetSynthCallback(self._cb)

    def _on_audio(self, wav, n, events):
        if n > 0:
            self._chunks.append(np.ctypeslib.as_array(wav, shape=(n,)).copy())
        i = 0
        while True:
            ev = events[i]
            if ev.type == 0:  # LIST_TERMINATED
                break
            if ev.type == 1:  # WORD
                self._words.append((ev.text_position, ev.length, ev.audio_position))
            i += 1
        return 0

    def say(self, text, voice, rate=158, pitch=50):
        self.lib.espeak_SetVoiceByName(voice.encode())
        self.lib.espeak_SetParameter(1, rate, 0)   # espeakRATE
        self.lib.espeak_SetParameter(3, pitch, 0)  # espeakPITCH
        self._chunks, self._words = [], []
        b = text.encode("utf-8")
        self.lib.espeak_Synth(ctypes.c_char_p(b), len(b) + 1, 0, 1, 0, 1, None, None)
        self.lib.espeak_Synchronize()
        audio = np.concatenate(self._chunks).astype(np.float32) / 32768.0 if self._chunks else np.zeros(1, np.float32)
        return audio, list(self._words)


WORD_RE = re.compile(r"\S+")


def word_timings(display, said, words, dur):
    """Map eSpeak WORD events (positions in `said`) onto the words of `display`."""
    disp = [(m.start(), m.group()) for m in WORD_RE.finditer(display)]
    starts = [w[2] / 1000.0 for w in words]
    if display == said and len(starts) >= len(disp) * 0.6:
        # Map each display word to the eSpeak event whose char position falls in it.
        out = []
        ev = sorted(words, key=lambda w: w[0])
        for i, (pos, tok) in enumerate(disp):
            hit = [w for w in ev if pos <= w[0] - 1 < pos + len(tok)]
            s = hit[0][2] / 1000.0 if hit else None
            out.append([tok, s])
        # fill gaps by interpolation
        known = [(i, s) for i, (_, s) in enumerate(out) if s is not None]
        for i, item in enumerate(out):
            if item[1] is None:
                prev = max([k for k in known if k[0] < i], default=(None, 0.0), key=lambda k: k[0])
                nxt = min([k for k in known if k[0] > i], default=(None, dur), key=lambda k: k[0])
                item[1] = prev[1] + (nxt[1] - prev[1]) * 0.5
        res = []
        for i, (tok, s) in enumerate(out):
            e = out[i + 1][1] if i + 1 < len(out) else dur
            res.append((tok, s, max(s + 0.08, e - 0.04)))
        return res
    # Different synthesis text: allocate time proportionally to word length.
    speech_start = starts[0] if starts else 0.05
    speech_end = dur - 0.05
    total = sum(len(t) + 2 for _, t in disp)
    t, res = speech_start, []
    for _, tok in disp:
        d = (speech_end - speech_start) * (len(tok) + 2) / total
        res.append((tok, t, t + d * 0.92))
        t += d
    return res


def trim(audio, thr=0.003):
    idx = np.where(np.abs(audio) > thr)[0]
    if len(idx) == 0:
        return audio, 0
    a, b = max(0, idx[0] - 200), min(len(audio), idx[-1] + 400)
    return audio[a:b], a


def resample(x, sr_in, sr_out):
    n = int(len(x) * sr_out / sr_in)
    return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)


def main():
    spec = json.load(open(os.path.join(ROOT, "scripts", "hero_calls.json")))
    tts = Espeak()
    rng = random.Random(7)
    os.makedirs(os.path.join(ROOT, "public", "audio"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "src", "data", "generated"), exist_ok=True)
    result = {}
    for call in spec["calls"]:
        rendered = []
        for u in call["utterances"]:
            said = u.get("say", u["text"])
            voice = call["voices"][u["s"]]
            audio, words = tts.say(said, voice, rate=150 if u["s"] == "customer" else 160)
            audio16 = resample(audio, tts.sr, SR_OUT)
            # word events are relative to untrimmed audio; trim leading silence and shift
            trimmed, offset = trim(audio16)
            shift = offset / SR_OUT
            dur = len(trimmed) / SR_OUT
            wt = word_timings(u["text"], said, [(p, l, a - shift * 1000) for p, l, a in words], dur)
            rendered.append((u, trimmed, dur, wt))
        # schedule
        t_prev_end, timeline = 0.0, []
        for u, audio, dur, wt in rendered:
            if "at" in u:
                start = u["at"]
            elif "endAt" in u:
                start = u["endAt"] - dur
            elif "overlap" in u:
                start = t_prev_end - u["overlap"]
            else:
                start = t_prev_end + u.get("gap", 0.6)
            if start < t_prev_end - 0.01 and not any(k in u for k in ("at", "endAt", "overlap")):
                start = t_prev_end + 0.3
            timeline.append((u, audio, start, dur, wt))
            t_prev_end = max(t_prev_end, start + dur) if "endAt" not in u else start + dur
        total = max(s + d for _, _, s, d, _ in timeline) + 1.0
        L = np.zeros(int(total * SR_OUT) + 1, np.float32)
        R = np.zeros_like(L)
        utts = []
        for i, (u, audio, start, dur, wt) in enumerate(timeline):
            a = int(start * SR_OUT)
            ch = L if u["s"] == "agent" else R
            ch[a:a + len(audio)] += audio * 0.8
            words = []
            for tok, ws, we in wt:
                base = 0.97 if u["s"] == "agent" else 0.93
                conf = max(0.55, min(0.995, rng.gauss(base, 0.035)))
                words.append({"w": tok, "s": round(start + ws, 3), "e": round(start + we, 3), "c": round(conf, 3)})
            utts.append({"speaker": u["s"], "start": round(start, 3), "end": round(start + dur, 3), "text": u["text"], "words": words})
            print(f"{call['id']} {i:2d} {u['s']:8s} {start:7.2f}-{start+dur:7.2f}  {u['text'][:60]}")
        stereo = np.stack([L, R], axis=1)
        stereo = stereo / max(1e-6, np.abs(stereo).max()) * 0.85
        with tempfile.TemporaryDirectory() as td:
            raw = os.path.join(td, "x.wav")
            with wave.open(raw, "wb") as w:
                w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR_OUT)
                w.writeframes((stereo * 32767).astype("<i2").tobytes())
            out = os.path.join(ROOT, "public", "audio", f"{call['id']}.mp3")
            subprocess.run([
                "ffmpeg", "-y", "-loglevel", "error", "-i", raw,
                "-f", "lavfi", "-i", f"anoisesrc=color=pink:amplitude=0.004:sample_rate={SR_OUT}:duration={total:.2f}",
                "-filter_complex",
                "[0:a]highpass=f=280,lowpass=f=3400[v];[1:a]aformat=channel_layouts=stereo[n];[v][n]amix=inputs=2:normalize=0[o]",
                "-map", "[o]", "-ac", "2", "-ar", str(SR_OUT), "-b:a", "48k", out,
            ], check=True)
        result[call["id"]] = {"duration": round(total, 2), "audio": f"audio/{call['id']}.mp3", "utterances": utts}
    with open(os.path.join(ROOT, "src", "data", "generated", "heroTimings.json"), "w") as f:
        json.dump(result, f, indent=1)
    print("done")


if __name__ == "__main__":
    sys.exit(main())
