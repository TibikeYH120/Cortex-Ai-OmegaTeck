import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Mic, MicOff, Loader2, Volume2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppState } from "@/hooks/use-app-state";
import { useCreateAnthropicConversation } from "@workspace/api-client-react";
import { VOICE_STORAGE_KEY, VOICE_OPTIONS, type VoiceId } from "@/hooks/use-voice";

// ── VAD constants ─────────────────────────────────────────────────────────────
const VAD_START_THRESHOLD = 0.018;  // RMS level to trigger speech detection
const VAD_END_THRESHOLD   = 0.010;  // RMS level below which is considered silence
const VAD_START_DEBOUNCE  = 280;    // ms of continuous speech before recording starts
const VAD_SILENCE_TIMEOUT = 1400;   // ms of silence before auto-stopping
const VAD_MIN_RECORDING   = 400;    // ms minimum recording to process (avoid noise)

type VoiceState = "connecting" | "idle" | "listening" | "thinking" | "speaking";

function getVoiceId(): VoiceId {
  try {
    const v = localStorage.getItem(VOICE_STORAGE_KEY);
    if (v && VOICE_OPTIONS.some(o => o.id === v)) return v as VoiceId;
  } catch {}
  return "nova";
}

function getBrowserLanguage(): string {
  const lang = navigator.language || "en";
  const code = lang.split("-")[0].toLowerCase();
  const SUPPORTED = ["af","ar","az","be","bg","bs","ca","cs","cy","da","de","el","en",
    "es","et","fa","fi","fr","gl","he","hi","hr","hu","hy","id","is","it","ja","kk","kn",
    "ko","lt","lv","mi","mk","mr","ms","ne","nl","no","pl","pt","ro","ru","sk","sl","sr",
    "sv","sw","tl","ta","th","tr","uk","ur","vi","zh"];
  return SUPPORTED.includes(code) ? code : "en";
}

/* ── Canvas bar drawer ────────────────────────────────────────── */
function drawBars(canvas: HTMLCanvasElement, data: Uint8Array) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const count = 24, bw = 3, gap = 3;
  const total = count * (bw + gap) - gap;
  const startX = (W - total) / 2;
  for (let i = 0; i < count; i++) {
    const bin    = data[Math.floor((i / count) * data.length)] ?? 0;
    const height = Math.max(4, (bin / 255) * H * 0.92);
    const x      = startX + i * (bw + gap);
    const y      = (H - height) / 2;
    const hue    = 195 + (i / count) * 65;
    ctx.fillStyle = `hsl(${hue},100%,62%)`;
    ctx.fillRect(x, y, bw, height);
  }
}

/* ── Orb visual ───────────────────────────────────────────────── */
const CortexOrb = ({ state, silenceRatio }: { state: VoiceState; silenceRatio: number }) => {
  const isListening = state === "listening";
  const isThinking  = state === "thinking";
  const isSpeaking  = state === "speaking";
  const isIdle      = state === "idle";
  const isActive    = isListening || isSpeaking;
  const accent      = isListening ? "#00d0ff" : "#6c3bff";

  return (
    <div className="relative flex items-center justify-center" style={{ width: 280, height: 280 }}>
      <div id="vm-glow" className="absolute rounded-full" style={{
        width: 220, height: 220,
        background: isListening
          ? "radial-gradient(circle, rgba(0,208,255,0.18) 0%, transparent 70%)"
          : isSpeaking
          ? "radial-gradient(circle, rgba(108,59,255,0.22) 0%, transparent 70%)"
          : isThinking
          ? "radial-gradient(circle, rgba(108,59,255,0.1) 0%, transparent 70%)"
          : "radial-gradient(circle, rgba(0,208,255,0.06) 0%, transparent 70%)",
        transition: "background 0.4s ease",
      }} />

      {isActive && [1, 2].map(i => (
        <div key={i} className="absolute rounded-full" style={{
          width: 260 + i * 52, height: 260 + i * 52,
          border: `1px solid ${isListening
            ? `rgba(0,208,255,${0.3 - i * 0.09})`
            : `rgba(108,59,255,${0.25 - i * 0.07})`}`,
          animation: `vmRipple ${1.1 + i * 0.35}s ease-out infinite`,
          animationDelay: `${i * 0.28}s`,
        }} />
      ))}

      <svg viewBox="0 0 200 200" fill="none" className="absolute inset-0 w-full h-full">
        <circle cx="100" cy="100" r="95"
          stroke={isThinking ? "#6c3bff" : "#00d0ff"}
          strokeWidth="1" strokeDasharray="8 4"
          style={{ animation: `vmSpin ${isThinking ? 1.4 : 22}s linear infinite`,
                   transformOrigin: "100px 100px", opacity: isThinking ? 0.8 : 0.42 }}
        />
        <circle cx="100" cy="100" r="74"
          stroke={isThinking ? "#6c3bff" : "#00d0ff"}
          strokeWidth="1" strokeDasharray="5 5"
          style={{ animation: `vmSpinRev ${isThinking ? 2 : 30}s linear infinite`,
                   transformOrigin: "100px 100px", opacity: isThinking ? 0.7 : 0.35 }}
        />
        <circle id="vm-inner-ring" cx="100" cy="100" r="52"
          stroke={accent} strokeWidth={isActive ? 1.8 : 1.2}
          opacity={isActive ? 0.85 : 0.28}
        />
        {[0, 90, 180, 270].map(angle => {
          const rad = (angle * Math.PI) / 180;
          return (
            <line key={angle}
              x1={100 + 56 * Math.cos(rad)} y1={100 + 56 * Math.sin(rad)}
              x2={100 + 70 * Math.cos(rad)} y2={100 + 70 * Math.sin(rad)}
              stroke={accent} strokeWidth="1.5" strokeLinecap="round"
              opacity={isActive ? 0.85 : 0.32}
            />
          );
        })}
        <circle id="vm-dot" cx="100" cy="100" r="6"
          fill={isListening ? "#00d0ff" : isSpeaking ? "#6c3bff" : isThinking ? "#6c3bff" : "#00d0ff"}
          style={{ animation: "vmDotPulse 1.5s ease-in-out infinite" }}
        />
        <circle cx="100" cy="100" r="3" fill="white" opacity="0.9" />
      </svg>

      <div id="vm-vol-ring" className="absolute rounded-full pointer-events-none"
        style={{ width: 116, height: 116, opacity: 0, transition: "opacity 0.15s ease",
                 border: "1.5px solid rgba(0,208,255,0.5)",
                 boxShadow: "0 0 20px rgba(0,208,255,0.3)" }}
      />

      {isThinking && (
        <div className="absolute rounded-full" style={{
          width: 150, height: 150,
          border: "2px solid transparent",
          borderTopColor: "#6c3bff",
          borderRightColor: "rgba(108,59,255,0.18)",
          animation: "vmSpin 0.85s linear infinite",
          transformOrigin: "center",
        }} />
      )}

      <canvas id="vm-canvas" width={110} height={64}
        className="absolute"
        style={{ opacity: 0, transition: "opacity 0.25s ease" }}
      />

      {/* VAD silence countdown arc */}
      {isListening && silenceRatio > 0 && (
        <svg className="absolute" viewBox="0 0 200 200" fill="none"
          style={{ width: 280, height: 280, transform: "rotate(-90deg)" }}>
          <circle cx="100" cy="100" r="95"
            stroke="#00d0ff" strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 95 * silenceRatio} ${2 * Math.PI * 95}`}
            opacity="0.6"
            style={{ transition: "stroke-dasharray 0.1s linear" }}
          />
        </svg>
      )}

      {/* Idle pulsing ring */}
      {isIdle && (
        <div className="absolute rounded-full" style={{
          width: 118, height: 118,
          border: "1px solid rgba(0,208,255,0.18)",
          animation: "vmRipple 2.5s ease-out infinite",
        }} />
      )}
    </div>
  );
};

/* ── Main VoiceMode ──────────────────────────────────────────── */
export function VoiceMode({ onClose }: { onClose: () => void }) {
  const { activeConversationId, setActiveConversationId } = useAppState();
  const createConv = useCreateAnthropicConversation();

  const [voiceState, setVoiceState]     = useState<VoiceState>("connecting");
  const [transcript,  setTranscript]    = useState("");
  const [aiText,      setAiText]        = useState("");
  const [error,       setError]         = useState<string | null>(null);
  const [silenceRatio, setSilenceRatio] = useState(0);
  const [convId,      setConvId]        = useState<number | null>(activeConversationId);
  const [micMuted,    setMicMuted]      = useState(false);

  const voiceStateRef  = useRef<VoiceState>("connecting");
  const busyRef        = useRef(false);
  const micMutedRef    = useRef(false);
  const streamRef      = useRef<MediaStream | null>(null);

  /* MediaRecorder */
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const recordingStartRef = useRef<number>(0);

  /* Audio analysis */
  const audioCtxRef   = useRef<AudioContext | null>(null);
  const analyserRef   = useRef<AnalyserNode | null>(null);
  const rafRef        = useRef<number | null>(null);
  const fftDataRef    = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(32) as Uint8Array<ArrayBuffer>);
  const elemSrcRef    = useRef<MediaElementAudioSourceNode | null>(null);
  const frameRef      = useRef(0);
  const audioRef      = useRef<HTMLAudioElement | null>(null);
  const abortRef      = useRef<AbortController | null>(null);

  /* VAD timestamps */
  const speechStartedAtRef  = useRef<number | null>(null);
  const silenceStartedAtRef = useRef<number | null>(null);
  const vadActiveRef        = useRef(false); // are we VAD-recording?

  const setVS = useCallback((s: VoiceState) => {
    voiceStateRef.current = s;
    setVoiceState(s);
  }, []);

  /* ── DOM helpers ── */
  const getEl = <T extends Element>(id: string) => document.getElementById(id) as T | null;

  const updateAudioDOM = useCallback((level: number, data: Uint8Array) => {
    const state = voiceStateRef.current;
    const volRing = getEl<HTMLDivElement>("vm-vol-ring");
    if (volRing) {
      if (state === "listening" && level > 0.03) {
        const s = 116 + level * 38;
        volRing.style.width  = `${s}px`;
        volRing.style.height = `${s}px`;
        volRing.style.opacity = String(Math.min(1, level * 1.5));
        volRing.style.boxShadow = `0 0 ${18 + level * 32}px rgba(0,208,255,${0.25 + level * 0.35})`;
      } else {
        volRing.style.opacity = "0";
      }
    }
    const canvas = getEl<HTMLCanvasElement>("vm-canvas");
    if (canvas) {
      if (state === "speaking") { canvas.style.opacity = "1"; drawBars(canvas, data); }
      else canvas.style.opacity = "0";
    }
  }, []);

  /* ── Analysis loop ── */
  const startAnalysisLoop = useCallback((onFrame?: (level: number, data: Uint8Array) => void) => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = fftDataRef.current;
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      frameRef.current = (frameRef.current + 1) % 2;
      if (frameRef.current !== 0) return;
      analyser.getByteFrequencyData(data);
      const avg   = data.reduce((s, v) => s + v, 0) / data.length;
      const level = Math.min(1, avg / 80);
      updateAudioDOM(level, data);
      onFrame?.(level, data);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [updateAudioDOM]);

  const stopAnalysis = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const canvas = getEl<HTMLCanvasElement>("vm-canvas");
    if (canvas) { canvas.style.opacity = "0"; canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); }
    const volRing = getEl<HTMLDivElement>("vm-vol-ring");
    if (volRing) volRing.style.opacity = "0";
  }, []);

  const stopAudio = useCallback(() => {
    stopAnalysis();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; audioRef.current = null; }
  }, [stopAnalysis]);

  /* ── TTS ── */
  const speakText = useCallback(async (text: string): Promise<void> => {
    stopAudio();
    const stripped = text
      .replace(/```[\s\S]*?```/g, "code block")
      .replace(/`[^`]*`/g, "")
      .replace(/#{1,6}\s+/g, "")
      .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1")
      .replace(/\n+/g, " ").trim().slice(0, 3000);
    if (!stripped) return;

    const res = await fetch("/api/tts", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: stripped, voiceId: getVoiceId() }),
    });
    if (!res.ok) return;

    const buf  = await res.arrayBuffer();
    const blob = new Blob([buf], { type: "audio/mpeg" });
    const url  = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    setVS("speaking");

    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") await ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.72;
      analyserRef.current = analyser;
      fftDataRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
      let src: MediaElementAudioSourceNode;
      if (elemSrcRef.current) { src = elemSrcRef.current; }
      else { src = ctx.createMediaElementSource(audio); elemSrcRef.current = src; }
      src.connect(analyser);
      analyser.connect(ctx.destination);
      startAnalysisLoop();
    } catch { /* optional */ }

    await new Promise<void>(resolve => {
      audio.onended = () => { URL.revokeObjectURL(url); stopAnalysis(); audioRef.current = null; resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); stopAnalysis(); resolve(); };
      audio.play().catch(() => resolve());
    });
  }, [stopAudio, startAnalysisLoop, stopAnalysis, setVS]);

  /* ── AI response ── */
  const handleTranscript = useCallback(async (text: string) => {
    if (!text.trim()) { setVS("idle"); return; }
    busyRef.current = true;
    setTranscript(text);
    setVS("thinking");
    setAiText("");
    setSilenceRatio(0);

    try {
      let cid = convId;
      if (!cid) {
        const res = await createConv.mutateAsync({ data: { title: "Voice Conversation" } });
        cid = res.id;
        setConvId(cid);
        setActiveConversationId(cid);
      }

      let sysAbout: string | null = null, sysRespond: string | null = null;
      try { sysAbout = localStorage.getItem("cortex_sys_about"); sysRespond = localStorage.getItem("cortex_sys_respond"); } catch {}

      abortRef.current = new AbortController();
      const res = await fetch(`/api/anthropic/conversations/${cid}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: text, systemAbout: sysAbout, systemRespond: sysRespond }),
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) throw new Error("AI error");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText  = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data:")) continue;
          try {
            const j = JSON.parse(line.slice(5));
            if (j.content) {
              fullText += j.content;
              setAiText(fullText.slice(0, 140) + (fullText.length > 140 ? "…" : ""));
            }
          } catch {}
        }
      }
      await speakText(fullText);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError("Valami hiba történt. Próbáld újra.");
    } finally {
      busyRef.current = false;
      setAiText("");
      setTranscript("");
      setSilenceRatio(0);
      if (voiceStateRef.current !== "connecting") setVS("idle");
    }
  }, [convId, createConv, setActiveConversationId, speakText, setVS]);

  /* ── Stop VAD recording & process ── */
  const stopVADRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === "inactive") return;
    mediaRecorderRef.current = null;
    vadActiveRef.current = false;

    mr.onstop = async () => {
      const elapsed = performance.now() - recordingStartRef.current;
      if (elapsed < VAD_MIN_RECORDING) { setVS("idle"); return; }
      const blob = new Blob(chunksRef.current, { type: mr.mimeType });
      chunksRef.current = [];
      if (blob.size < 800) { setVS("idle"); return; }
      setVS("thinking");
      try {
        const fd = new FormData();
        fd.append("audio", blob, "rec.webm");
        fd.append("language", getBrowserLanguage());
        const res = await fetch("/api/stt", { method: "POST", credentials: "include", body: fd });
        const data = await res.json() as { transcript?: string };
        await handleTranscript(data.transcript || "");
      } catch { setVS("idle"); }
    };
    mr.stop();
  }, [handleTranscript, setVS]);

  /* ── Start VAD recording ── */
  const startVADRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || busyRef.current || micMutedRef.current || vadActiveRef.current) return;
    vadActiveRef.current = true;
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
    const mr = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = mr;
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.start(200);
    recordingStartRef.current = performance.now();
    setVS("listening");
    setError(null);
    setTranscript("");
  }, [setVS]);

  /* ── Manual tap on mic button ── */
  const handleMicTap = useCallback(() => {
    const state = voiceStateRef.current;
    if (state === "speaking") {
      // Interrupt
      stopAudio();
      abortRef.current?.abort();
      busyRef.current = false;
      setVS("idle");
    } else if (state === "listening") {
      // Send immediately
      stopVADRecording();
    } else if (state === "idle") {
      // Force-start recording
      startVADRecording();
    }
  }, [stopAudio, stopVADRecording, startVADRecording, setVS]);

  /* ── Mic permission + continuous VAD loop ── */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        streamRef.current = stream;
        setVS("idle");

        // Set up analyser on the mic stream
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.78;
        analyserRef.current = analyser;
        fftDataRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
        const src = audioCtx.createMediaStreamSource(stream);
        src.connect(analyser);

        startAnalysisLoop((level) => {
          if (cancelled || busyRef.current || micMutedRef.current) {
            speechStartedAtRef.current  = null;
            silenceStartedAtRef.current = null;
            return;
          }

          const now   = performance.now();
          const state = voiceStateRef.current;

          if (state === "speaking" || state === "thinking" || state === "connecting") return;

          if (level > VAD_START_THRESHOLD) {
            silenceStartedAtRef.current = null; // reset silence timer
            setSilenceRatio(0);

            if (!vadActiveRef.current) {
              if (!speechStartedAtRef.current) {
                speechStartedAtRef.current = now;
              } else if (now - speechStartedAtRef.current > VAD_START_DEBOUNCE) {
                startVADRecording();
                speechStartedAtRef.current = null;
              }
            }
          } else {
            speechStartedAtRef.current = null; // reset speech detection

            if (vadActiveRef.current) {
              if (!silenceStartedAtRef.current) {
                silenceStartedAtRef.current = now;
              } else {
                const silenceElapsed = now - silenceStartedAtRef.current;
                const ratio = Math.min(1, silenceElapsed / VAD_SILENCE_TIMEOUT);
                setSilenceRatio(ratio);
                if (silenceElapsed >= VAD_SILENCE_TIMEOUT) {
                  silenceStartedAtRef.current = null;
                  stopVADRecording();
                }
              }
            }
          }
        });

      } catch {
        if (!cancelled) setError("Mikrofon hozzáférés megtagadva.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [startAnalysisLoop, startVADRecording, stopVADRecording, setVS]);

  /* ── Cleanup on unmount ── */
  useEffect(() => () => {
    abortRef.current?.abort();
    stopAudio();
    mediaRecorderRef.current?.stop();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close().catch(() => {});
  }, [stopAudio]);

  /* ── Spacebar shortcut ── */
  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      e.preventDefault();
      const state = voiceStateRef.current;
      if (state === "idle") startVADRecording();
      else if (state === "speaking") { stopAudio(); abortRef.current?.abort(); busyRef.current = false; setVS("idle"); }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (voiceStateRef.current === "listening") stopVADRecording();
    };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup",   up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, [startVADRecording, stopVADRecording, stopAudio, setVS]);

  /* ── Sync mute ref ── */
  useEffect(() => { micMutedRef.current = micMuted; }, [micMuted]);

  /* ── Derived UI state ── */
  const isBusy = voiceState === "thinking";

  const stateColor =
    voiceState === "listening" ? "#00d0ff" :
    voiceState === "thinking"  ? "#6c3bff" :
    voiceState === "speaking"  ? "#6c3bff" : "rgba(255,255,255,0.22)";

  const stateLabel =
    voiceState === "connecting" ? "CONNECTING" :
    voiceState === "idle"       ? (micMuted ? "MUTED" : "READY") :
    voiceState === "listening"  ? "LISTENING" :
    voiceState === "thinking"   ? "PROCESSING" : "SPEAKING";

  const hintMain =
    voiceState === "connecting" ? "Mikrofon engedélyezése…" :
    voiceState === "idle"       ? (micMuted ? "Mikrofon némítva" : "Csak szólj — automatikusan érzékeli a hangod") :
    voiceState === "listening"  ? "Hallgat… koppints a küldéshez" :
    voiceState === "thinking"   ? "Feldolgozás…" : "Koppints a megszakításhoz";

  return createPortal(
    <motion.div
      className="fixed inset-0 flex flex-col items-center justify-between select-none"
      style={{ zIndex: 2000, background: "#03030a" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Background grid */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(0,208,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(0,208,255,0.018) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
      }} />

      {/* Corner brackets */}
      {([
        { pos: "top-5 left-5",     bt: true,  bb: false, bl: true,  br: false },
        { pos: "top-5 right-5",    bt: true,  bb: false, bl: false, br: true  },
        { pos: "bottom-5 left-5",  bt: false, bb: true,  bl: true,  br: false },
        { pos: "bottom-5 right-5", bt: false, bb: true,  bl: false, br: true  },
      ] as const).map((c, i) => (
        <div key={i} className={`absolute ${c.pos} pointer-events-none`} style={{
          width: 20, height: 20,
          borderTop:    c.bt ? "1.5px solid rgba(0,208,255,0.28)" : "none",
          borderBottom: c.bb ? "1.5px solid rgba(0,208,255,0.28)" : "none",
          borderLeft:   c.bl ? "1.5px solid rgba(0,208,255,0.28)" : "none",
          borderRight:  c.br ? "1.5px solid rgba(0,208,255,0.28)" : "none",
        }} />
      ))}

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between w-full px-6 pt-8">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full" style={{
            background: stateColor,
            boxShadow: `0 0 8px ${stateColor}`,
            animation: voiceState !== "idle" ? "vmDotPulse 1.5s ease-in-out infinite" : "none",
            transition: "background 0.3s, box-shadow 0.3s",
          }} />
          <span className="font-display font-bold text-sm tracking-[0.2em] uppercase" style={{ color: "rgba(255,255,255,0.72)" }}>
            CORTEX <span style={{ color: "#00d0ff" }}>LIVE</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Mute toggle */}
          <button
            onClick={() => setMicMuted(m => !m)}
            title={micMuted ? "Mikrofon bekapcsolása" : "Mikrofon némítása"}
            className="flex items-center justify-center rounded-full transition-all hover:bg-white/8"
            style={{
              width: 36, height: 36,
              border: `1px solid ${micMuted ? "rgba(255,46,126,0.4)" : "rgba(255,255,255,0.1)"}`,
              color: micMuted ? "#ff2e7e" : "rgba(255,255,255,0.4)",
            }}
          >
            {micMuted ? <MicOff size={14} /> : <Mic size={14} />}
          </button>

          <button
            onClick={onClose}
            className="flex items-center justify-center rounded-full transition-all hover:bg-white/8"
            style={{ width: 36, height: 36, border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <X size={15} className="text-white/50" />
          </button>
        </div>
      </div>

      {/* Orb */}
      <div className="relative z-10 flex flex-col items-center gap-8 -mt-4">
        <CortexOrb state={voiceState} silenceRatio={silenceRatio} />

        <div className="flex flex-col items-center gap-2.5 px-8 text-center" style={{ maxWidth: 320, minHeight: 76 }}>
          <AnimatePresence mode="wait">
            <motion.span key={voiceState + (micMuted ? "m" : "")}
              className="font-mono text-xs tracking-[0.28em] uppercase"
              style={{ color: stateColor }}
              initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22 }}>
              {stateLabel}
              {(voiceState === "listening" || voiceState === "speaking") && (
                <span style={{ animation: "vmEllipsis 1.2s steps(3,end) infinite" }}>…</span>
              )}
            </motion.span>
          </AnimatePresence>

          <AnimatePresence>
            {transcript && voiceState !== "idle" && (
              <motion.p className="text-[11px] font-mono leading-relaxed line-clamp-2 italic"
                style={{ color: "rgba(255,255,255,0.30)" }}
                initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                "{transcript}"
              </motion.p>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {aiText && (
              <motion.p className="text-[12px] font-mono leading-relaxed line-clamp-3"
                style={{ color: "rgba(0,208,255,0.55)" }}
                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.22 }}>
                {aiText}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="relative z-10 px-5 py-2 rounded-full text-xs font-mono"
            style={{ background: "rgba(255,46,126,0.08)", border: "1px solid rgba(255,46,126,0.22)", color: "#ff2e7e" }}
            initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}>
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom controls */}
      <div className="relative z-10 flex flex-col items-center gap-4 pb-14">
        {/* Mic / action button */}
        <motion.button
          onClick={handleMicTap}
          disabled={isBusy || voiceState === "connecting"}
          whileTap={{ scale: 0.92 }}
          whileHover={{ scale: isBusy ? 1 : 1.06 }}
          className="relative flex items-center justify-center rounded-full disabled:opacity-30"
          style={{
            width: 74, height: 74,
            background: voiceState === "listening"
              ? "rgba(0,208,255,0.1)"
              : voiceState === "speaking"
              ? "rgba(108,59,255,0.1)"
              : "rgba(255,255,255,0.04)",
            border: voiceState === "listening"
              ? "1.5px solid rgba(0,208,255,0.55)"
              : voiceState === "speaking"
              ? "1.5px solid rgba(108,59,255,0.5)"
              : "1.5px solid rgba(255,255,255,0.1)",
            boxShadow: voiceState === "listening"
              ? "0 0 28px rgba(0,208,255,0.24)"
              : voiceState === "speaking"
              ? "0 0 28px rgba(108,59,255,0.2)"
              : "none",
            transition: "background 0.2s, border-color 0.2s, box-shadow 0.2s",
          }}
        >
          {voiceState === "thinking" ? (
            <Loader2 size={26} className="animate-spin" style={{ color: "#6c3bff" }} />
          ) : voiceState === "speaking" ? (
            <Volume2 size={26} style={{ color: "#6c3bff" }} />
          ) : voiceState === "listening" ? (
            <Mic size={26} style={{ color: "#00d0ff" }} />
          ) : (
            <Mic size={26} style={{ color: "rgba(255,255,255,0.42)" }} />
          )}
          {voiceState === "listening" && (
            <span className="absolute inset-[-6px] rounded-full border border-[#00d0ff]/22 animate-ping" />
          )}
        </motion.button>

        <AnimatePresence mode="wait">
          <motion.div key={voiceState + (micMuted ? "m" : "")}
            className="flex flex-col items-center gap-1"
            initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <span className="text-[11px] font-mono tracking-wide text-center"
              style={{ color: voiceState === "listening" ? "#00d0ff" : "rgba(255,255,255,0.24)", maxWidth: 240 }}>
              {hintMain}
            </span>
            {voiceState === "idle" && !micMuted && (
              <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.1)" }}>
                space to force-start
              </span>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <style>{`
        @keyframes vmSpin      { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes vmSpinRev   { from{transform:rotate(0deg)} to{transform:rotate(-360deg)} }
        @keyframes vmRipple    { 0%{transform:scale(0.87);opacity:.72} 100%{transform:scale(1.42);opacity:0} }
        @keyframes vmDotPulse  { 0%,100%{opacity:.62;transform:scale(1)} 50%{opacity:1;transform:scale(1.22)} }
        @keyframes vmEllipsis  { 0%{content:'.'} 33%{content:'..'} 66%{content:'...'} }
      `}</style>
    </motion.div>,
    document.body
  );
}
