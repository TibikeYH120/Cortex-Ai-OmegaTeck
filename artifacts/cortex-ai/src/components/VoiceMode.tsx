import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Mic, MicOff, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppState } from "@/hooks/use-app-state";
import { VOICE_STORAGE_KEY, VOICE_OPTIONS, type VoiceId } from "@/hooks/use-voice";

type VoiceState = "idle" | "listening" | "thinking" | "speaking";

function getVoiceId(): VoiceId {
  try {
    const v = localStorage.getItem(VOICE_STORAGE_KEY);
    if (v && VOICE_OPTIONS.some(o => o.id === v)) return v as VoiceId;
  } catch {}
  return "nova";
}

/* ── Geo greeting ─────────────────────────────────────────────── */
async function detectCountry(): Promise<string> {
  try {
    const r = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(3000) });
    const d = await r.json() as { country_code?: string };
    return d.country_code ?? "US";
  } catch { return "US"; }
}

function greetingText(country: string): string {
  const map: Record<string, string> = {
    HU: "Szia! Én vagyok a CORTEX AI. Miben segíthetek?",
    DE: "Hallo! Ich bin CORTEX AI. Wie kann ich helfen?",
    FR: "Bonjour! Je suis CORTEX AI. Comment puis-je vous aider?",
    ES: "¡Hola! Soy CORTEX AI. ¿En qué puedo ayudarte?",
    IT: "Ciao! Sono CORTEX AI. Come posso aiutarti?",
    PT: "Olá! Sou o CORTEX AI. Como posso ajudar?",
    PL: "Cześć! Jestem CORTEX AI. Jak mogę pomóc?",
    RO: "Salut! Sunt CORTEX AI. Cum te pot ajuta?",
    NL: "Hoi! Ik ben CORTEX AI. Hoe kan ik helpen?",
    TR: "Merhaba! Ben CORTEX AI. Nasıl yardımcı olabilirim?",
    RU: "Привет! Я CORTEX AI. Чем могу помочь?",
    JP: "こんにちは！私はCORTEX AIです。",
    KR: "안녕하세요! 저는 CORTEX AI입니다.",
    CN: "你好！我是 CORTEX AI，有什么可以帮助你的？",
  };
  return map[country] ?? "Hey! I'm CORTEX AI. How can I help you today?";
}

/* ── Canvas bar drawer (called from RAF — no React) ─────────── */
function drawBars(canvas: HTMLCanvasElement, data: Uint8Array) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const count  = 24;
  const bw     = 3;
  const gap    = 3;
  const total  = count * (bw + gap) - gap;
  const startX = (W - total) / 2;
  for (let i = 0; i < count; i++) {
    const bin    = data[Math.floor((i / count) * data.length)] ?? 0;
    const height = Math.max(4, (bin / 255) * H * 0.92);
    const x      = startX + i * (bw + gap);
    const y      = (H - height) / 2;
    const hue    = 195 + (i / count) * 65;          // cyan → purple
    ctx.fillStyle = `hsl(${hue},100%,62%)`;
    ctx.fillRect(x, y, bw, height);
  }
}

/* ── Static Cortex Orb — React re-renders only on state change ── */
interface OrbProps { state: VoiceState }

const CortexOrb = ({ state }: OrbProps) => {
  const isListening = state === "listening";
  const isThinking  = state === "thinking";
  const isSpeaking  = state === "speaking";
  const isActive    = isListening || isSpeaking;
  const accent      = isListening ? "#00d0ff" : "#6c3bff";

  return (
    <div className="relative flex items-center justify-center" style={{ width: 280, height: 280 }}>

      {/* Ambient glow — updated by RAF via DOM ref (glowRef is set in parent) */}
      <div id="vm-glow" className="absolute rounded-full" style={{
        width: 220, height: 220,
        background: isListening
          ? "radial-gradient(circle, rgba(0,208,255,0.18) 0%, transparent 70%)"
          : isSpeaking
          ? "radial-gradient(circle, rgba(108,59,255,0.22) 0%, transparent 70%)"
          : isThinking
          ? "radial-gradient(circle, rgba(108,59,255,0.1) 0%, transparent 70%)"
          : "radial-gradient(circle, rgba(0,208,255,0.07) 0%, transparent 70%)",
        transition: "background 0.4s ease",
      }} />

      {/* Ripple rings — CSS only, no JS update needed */}
      {isActive && [1, 2].map(i => (
        <div key={i} className="absolute rounded-full" style={{
          width:  260 + i * 52,
          height: 260 + i * 52,
          border: `1px solid ${isListening
            ? `rgba(0,208,255,${0.3 - i * 0.09})`
            : `rgba(108,59,255,${0.25 - i * 0.07})`}`,
          animation: `vmRipple ${1.1 + i * 0.35}s ease-out infinite`,
          animationDelay: `${i * 0.28}s`,
        }} />
      ))}

      {/* SVG rings — static, only color changes on state change */}
      <svg viewBox="0 0 200 200" fill="none" className="absolute inset-0 w-full h-full">
        {/* Outer dashed — slow spin, GPU */}
        <circle cx="100" cy="100" r="95"
          stroke={isThinking ? "#6c3bff" : "#00d0ff"}
          strokeWidth="1" strokeDasharray="8 4"
          style={{ animation: `vmSpin ${isThinking ? 1.4 : 22}s linear infinite`,
                   transformOrigin: "100px 100px", opacity: isThinking ? 0.8 : 0.42 }}
        />
        {/* Middle dashed — counter spin */}
        <circle cx="100" cy="100" r="74"
          stroke={isThinking ? "#6c3bff" : "#00d0ff"}
          strokeWidth="1" strokeDasharray="5 5"
          style={{ animation: `vmSpinRev ${isThinking ? 2 : 30}s linear infinite`,
                   transformOrigin: "100px 100px", opacity: isThinking ? 0.7 : 0.35 }}
        />
        {/* Inner ring — id for direct DOM update */}
        <circle id="vm-inner-ring" cx="100" cy="100" r="52"
          stroke={accent} strokeWidth={isActive ? 1.8 : 1.2}
          opacity={isActive ? 0.85 : 0.28}
        />
        {/* Compass ticks — static positions, color only */}
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
        {/* Center dot */}
        <circle id="vm-dot" cx="100" cy="100" r="6"
          fill={isListening ? "#00d0ff" : isSpeaking ? "#6c3bff" : isThinking ? "#6c3bff" : "#00d0ff"}
          style={{ animation: "vmDotPulse 1.5s ease-in-out infinite" }}
        />
        <circle cx="100" cy="100" r="3" fill="white" opacity="0.9" />
      </svg>

      {/* Volume ring — updated by RAF via DOM id, hidden when not listening */}
      <div id="vm-vol-ring" className="absolute rounded-full pointer-events-none"
        style={{ width: 116, height: 116, opacity: 0, transition: "opacity 0.2s ease",
                 border: "1.5px solid rgba(0,208,255,0.5)",
                 boxShadow: "0 0 20px rgba(0,208,255,0.3)" }}
      />

      {/* Thinking spinner */}
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

      {/* Canvas — audio bar visualization (speaking) or mic level (listening) */}
      <canvas id="vm-canvas" width={110} height={64}
        className="absolute"
        style={{ opacity: 0, transition: "opacity 0.25s ease" }}
      />
    </div>
  );
};

/* ── Main VoiceMode ──────────────────────────────────────────── */
interface VoiceModeProps { onClose: () => void }

export function VoiceMode({ onClose }: VoiceModeProps) {
  const { activeConversationId, setActiveConversationId } = useAppState();

  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript,  setTranscript]  = useState("");
  const [aiText,      setAiText]      = useState("");
  const [error,       setError]       = useState<string | null>(null);
  const [greeted,     setGreeted]     = useState(false);
  const [convId,      setConvId]      = useState<number | null>(activeConversationId);

  /* Refs that don't cause re-renders */
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const chunksRef         = useRef<Blob[]>([]);
  const audioRef          = useRef<HTMLAudioElement | null>(null);
  const abortRef          = useRef<AbortController | null>(null);
  const busyRef           = useRef(false);
  const voiceStateRef     = useRef<VoiceState>("idle");

  /* Audio analysis — all refs, zero React state */
  const audioCtxRef    = useRef<AudioContext | null>(null);
  const analyserRef    = useRef<AnalyserNode | null>(null);
  const rafRef         = useRef<number | null>(null);
  const frameCountRef  = useRef(0);
  const elemSrcRef     = useRef<MediaElementAudioSourceNode | null>(null);
  const fftDataRef     = useRef<Uint8Array>(new Uint8Array(32));

  /* Keep voiceStateRef in sync without extra renders */
  const setVS = useCallback((s: VoiceState) => {
    voiceStateRef.current = s;
    setVoiceState(s);
  }, []);

  /* ── Direct DOM helpers (no React re-renders) ── */
  const getEl = <T extends Element>(id: string) =>
    document.getElementById(id) as T | null;

  const updateAudioDOM = useCallback((level: number, data: Uint8Array) => {
    const state = voiceStateRef.current;

    /* Volume ring during listening */
    const volRing = getEl<HTMLDivElement>("vm-vol-ring");
    if (volRing) {
      if (state === "listening" && level > 0.04) {
        const s = 116 + level * 38;
        volRing.style.width  = `${s}px`;
        volRing.style.height = `${s}px`;
        volRing.style.opacity = String(Math.min(1, level * 1.4));
        volRing.style.boxShadow = `0 0 ${18 + level * 32}px rgba(0,208,255,${0.25 + level * 0.35})`;
      } else {
        volRing.style.opacity = "0";
      }
    }

    /* Canvas bars when speaking */
    const canvas = getEl<HTMLCanvasElement>("vm-canvas");
    if (canvas) {
      if (state === "speaking") {
        canvas.style.opacity = "1";
        drawBars(canvas, data);
      } else {
        canvas.style.opacity = "0";
      }
    }
  }, []);

  /* ── Audio analysis RAF loop — throttled to ~24fps ── */
  const startAnalysisLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = fftDataRef.current;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      /* Skip every other frame → ~30fps on 60Hz, ~24fps on 48Hz */
      frameCountRef.current = (frameCountRef.current + 1) % 2;
      if (frameCountRef.current !== 0) return;

      analyser.getByteFrequencyData(data);
      const avg   = data.reduce((s, v) => s + v, 0) / data.length;
      const level = Math.min(1, avg / 80);
      updateAudioDOM(level, data);
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [updateAudioDOM]);

  const stopAnalysis = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    /* Reset canvas */
    const canvas = getEl<HTMLCanvasElement>("vm-canvas");
    if (canvas) { canvas.style.opacity = "0"; const ctx = canvas.getContext("2d"); ctx?.clearRect(0, 0, canvas.width, canvas.height); }
    const volRing = getEl<HTMLDivElement>("vm-vol-ring");
    if (volRing) volRing.style.opacity = "0";
  }, []);

  const initAnalyser = useCallback(() => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") void ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.72;
    analyserRef.current = analyser;
    fftDataRef.current  = new Uint8Array(analyser.frequencyBinCount);
    return { ctx, analyser };
  }, []);

  const startMicAnalysis = useCallback((stream: MediaStream) => {
    try {
      const { ctx, analyser } = initAnalyser();
      const src = ctx.createMediaStreamSource(stream);
      src.connect(analyser);
      startAnalysisLoop();
    } catch { /* optional */ }
  }, [initAnalyser, startAnalysisLoop]);

  const startSpeakingAnalysis = useCallback((audio: HTMLAudioElement) => {
    try {
      const { ctx, analyser } = initAnalyser();
      let src: MediaElementAudioSourceNode;
      if (elemSrcRef.current) {
        src = elemSrcRef.current;
      } else {
        src = ctx.createMediaElementSource(audio);
        elemSrcRef.current = src;
      }
      src.connect(analyser);
      analyser.connect(ctx.destination);
      startAnalysisLoop();
    } catch { /* optional */ }
  }, [initAnalyser, startAnalysisLoop]);

  /* ── Ensure conversation ── */
  const ensureConv = useCallback(async (): Promise<number> => {
    if (convId) return convId;
    const id = Date.now();
    setConvId(id);
    setActiveConversationId(id);
    return id;
  }, [convId, setActiveConversationId]);

  /* ── TTS ── */
  const stopAudio = useCallback(() => {
    stopAnalysis();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  }, [stopAnalysis]);

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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ text: stripped, voiceId: getVoiceId() }),
    });
    if (!res.ok) return;

    const buf   = await res.arrayBuffer();
    const blob  = new Blob([buf], { type: "audio/mpeg" });
    const url   = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    setVS("speaking");

    startSpeakingAnalysis(audio);

    await new Promise<void>(resolve => {
      audio.onended = () => { URL.revokeObjectURL(url); stopAnalysis(); audioRef.current = null; resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); stopAnalysis(); resolve(); };
      audio.play().catch(() => resolve());
    });
  }, [stopAudio, startSpeakingAnalysis, stopAnalysis, setVS]);

  /* ── AI response ── */
  const handleTranscript = useCallback(async (text: string) => {
    if (!text.trim() || busyRef.current) { setVS("idle"); return; }
    busyRef.current = true;
    setTranscript(text);
    setVS("thinking");
    setAiText("");

    try {
      const cid = await ensureConv();
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
            if (j.content) { fullText += j.content; setAiText(fullText.slice(0, 120) + (fullText.length > 120 ? "…" : "")); }
          } catch {}
        }
      }
      await speakText(fullText);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError("Something went wrong. Try again.");
    } finally {
      busyRef.current = false;
      setVS("idle");
      setAiText("");
    }
  }, [ensureConv, speakText, setVS]);

  /* ── Auto-greet ── */
  useEffect(() => {
    if (greeted || busyRef.current) return;
    setGreeted(true);
    busyRef.current = true;
    (async () => {
      try {
        const country = await detectCountry();
        const text    = greetingText(country);
        setAiText(text);
        await speakText(text);
      } finally {
        busyRef.current = false;
        setVS("idle");
        setAiText("");
      }
    })();
  }, [greeted, speakText, setVS]);

  /* ── Recording ── */
  const startRecording = useCallback(async () => {
    if (voiceStateRef.current !== "idle" || busyRef.current) return;
    stopAudio();
    setError(null);
    setTranscript("");
    setAiText("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(250);
      setVS("listening");
      startMicAnalysis(stream);
    } catch { setError("Microphone access denied."); }
  }, [stopAudio, startMicAnalysis, setVS]);

  const stopRecording = useCallback(async () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    mediaRecorderRef.current = null;
    stopAnalysis();
    setVS("thinking");
    await new Promise<void>(resolve => {
      mr.onstop = async () => {
        mr.stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        chunksRef.current = [];
        if (blob.size === 0) { setVS("idle"); resolve(); return; }
        try {
          const fd = new FormData();
          fd.append("audio", blob, "rec.webm");
          const res  = await fetch("/api/stt", { method: "POST", credentials: "include", body: fd });
          const data = await res.json() as { transcript?: string };
          await handleTranscript(data.transcript || "");
        } catch { setVS("idle"); }
        resolve();
      };
      mr.stop();
    });
  }, [handleTranscript, stopAnalysis, setVS]);

  /* ── Cleanup ── */
  useEffect(() => () => {
    abortRef.current?.abort();
    stopAudio();
    mediaRecorderRef.current?.stop();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close().catch(() => {});
  }, [stopAudio]);

  /* ── Spacebar ── */
  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      if (e.code === "Space" && voiceStateRef.current === "idle") { e.preventDefault(); startRecording(); }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && voiceStateRef.current === "listening") { e.preventDefault(); stopRecording(); }
    };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup",   up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, [startRecording, stopRecording]);

  const isBusy   = voiceState === "thinking" || voiceState === "speaking";
  const micLabel =
    voiceState === "idle"      ? "Hold to Speak" :
    voiceState === "listening" ? "Release to Send" :
    voiceState === "thinking"  ? "Processing…" : "Speaking…";

  const stateColor =
    voiceState === "listening" ? "#00d0ff" :
    voiceState === "thinking"  ? "#6c3bff" :
    voiceState === "speaking"  ? "#6c3bff" : "rgba(255,255,255,0.28)";

  const stateLabel =
    voiceState === "idle"      ? "READY" :
    voiceState === "listening" ? "LISTENING" :
    voiceState === "thinking"  ? "PROCESSING" : "SPEAKING";

  return createPortal(
    <motion.div
      className="fixed inset-0 flex flex-col items-center justify-between select-none"
      style={{ zIndex: 2000, background: "#03030a" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Static background grid — no animation */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(0,208,255,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(0,208,255,0.022) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
      }} />

      {/* Corner brackets — static, no animation */}
      {([
        { pos: "top-5 left-5",    bt: true,  bb: false, bl: true,  br: false },
        { pos: "top-5 right-5",   bt: true,  bb: false, bl: false, br: true  },
        { pos: "bottom-5 left-5", bt: false, bb: true,  bl: true,  br: false },
        { pos: "bottom-5 right-5",bt: false, bb: true,  bl: false, br: true  },
      ] as const).map((c, i) => (
        <div key={i} className={`absolute ${c.pos} pointer-events-none`} style={{
          width: 20, height: 20,
          borderTop:    c.bt ? "1.5px solid rgba(0,208,255,0.32)" : "none",
          borderBottom: c.bb ? "1.5px solid rgba(0,208,255,0.32)" : "none",
          borderLeft:   c.bl ? "1.5px solid rgba(0,208,255,0.32)" : "none",
          borderRight:  c.br ? "1.5px solid rgba(0,208,255,0.32)" : "none",
        }} />
      ))}

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between w-full px-6 pt-8">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full" style={{
            background: stateColor,
            boxShadow: `0 0 8px ${stateColor}`,
            animation: "vmDotPulse 1.5s ease-in-out infinite",
            transition: "background 0.3s ease, box-shadow 0.3s ease",
          }} />
          <span className="font-display font-bold text-sm tracking-[0.2em] uppercase" style={{ color: "rgba(255,255,255,0.72)" }}>
            CORTEX <span style={{ color: "#00d0ff" }}>LIVE</span>
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center rounded-full transition-all hover:bg-white/8"
          style={{ width: 36, height: 36, border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <X size={15} className="text-white/50" />
        </button>
      </div>

      {/* Orb + status */}
      <div className="relative z-10 flex flex-col items-center gap-9 -mt-4">
        <CortexOrb state={voiceState} />

        <div className="flex flex-col items-center gap-3 px-8 text-center" style={{ maxWidth: 320, minHeight: 76 }}>
          {/* State label with smooth transition */}
          <AnimatePresence mode="wait">
            <motion.span
              key={voiceState}
              className="font-mono text-xs tracking-[0.28em] uppercase"
              style={{ color: stateColor }}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.22 }}
            >
              {stateLabel}
              {(voiceState === "listening" || voiceState === "speaking") && (
                <span style={{ animation: "vmEllipsis 1.2s steps(3,end) infinite" }}>…</span>
              )}
            </motion.span>
          </AnimatePresence>

          <AnimatePresence>
            {transcript && voiceState !== "idle" && (
              <motion.p className="text-[11px] font-mono text-white/32 leading-relaxed line-clamp-2 italic"
                initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                "{transcript}"
              </motion.p>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {aiText && (
              <motion.p className="text-[12px] font-mono leading-relaxed line-clamp-3"
                style={{ color: "rgba(0,208,255,0.52)" }}
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

      {/* Mic button */}
      <div className="relative z-10 flex flex-col items-center gap-3 pb-16">
        <motion.button
          onPointerDown={() => { if (voiceStateRef.current === "idle") startRecording(); }}
          onPointerUp={()   => { if (voiceStateRef.current === "listening") stopRecording(); }}
          onPointerLeave={()=> { if (voiceStateRef.current === "listening") stopRecording(); }}
          disabled={isBusy}
          whileTap={{ scale: 0.93 }}
          whileHover={{ scale: isBusy ? 1 : 1.05 }}
          className="relative flex items-center justify-center rounded-full disabled:opacity-30"
          style={{
            width: 74, height: 74,
            background: voiceState === "listening" ? "rgba(0,208,255,0.1)" : "rgba(255,255,255,0.04)",
            border: voiceState === "listening" ? "1.5px solid rgba(0,208,255,0.55)" : "1.5px solid rgba(255,255,255,0.1)",
            boxShadow: voiceState === "listening" ? "0 0 28px rgba(0,208,255,0.28)" : "none",
            transition: "background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease",
          }}
        >
          {voiceState === "thinking" ? (
            <Loader2 size={26} className="animate-spin" style={{ color: "#6c3bff" }} />
          ) : voiceState === "speaking" ? (
            <div className="flex items-end gap-[2px]" style={{ height: 22 }}>
              {[0.5, 1.0, 1.6, 1.0, 0.5].map((h, i) => (
                <div key={i} className="rounded-full" style={{
                  width: 3, background: "#6c3bff",
                  height: `${h * 10}px`,
                  animation: `vmAudioBar ${0.4 + i * 0.08}s ease-in-out infinite alternate`,
                  animationDelay: `${i * 0.07}s`,
                }} />
              ))}
            </div>
          ) : voiceState === "listening" ? (
            <MicOff size={26} style={{ color: "#00d0ff" }} />
          ) : (
            <Mic size={26} className="text-white/52" />
          )}
          {voiceState === "listening" && (
            <span className="absolute inset-[-6px] rounded-full border border-[#00d0ff]/28 animate-ping" />
          )}
        </motion.button>

        <AnimatePresence mode="wait">
          <motion.div key={voiceState} className="flex flex-col items-center gap-1"
            initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <span className="text-[11px] font-mono tracking-wider"
              style={{ color: voiceState === "listening" ? "#00d0ff" : "rgba(255,255,255,0.26)" }}>
              {micLabel}
            </span>
            <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.11)" }}>
              or hold Space
            </span>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Minimal keyframes — only GPU-composited animations */}
      <style>{`
        @keyframes vmSpin      { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes vmSpinRev   { from{transform:rotate(0deg)} to{transform:rotate(-360deg)} }
        @keyframes vmRipple    { 0%{transform:scale(0.87);opacity:.72} 100%{transform:scale(1.42);opacity:0} }
        @keyframes vmDotPulse  { 0%,100%{opacity:.62;transform:scale(1)} 50%{opacity:1;transform:scale(1.22)} }
        @keyframes vmAudioBar  { from{transform:scaleY(0.18)} to{transform:scaleY(1)} }
        @keyframes vmEllipsis  { 0%{content:'.'} 33%{content:'..'} 66%{content:'...'} }
      `}</style>
    </motion.div>,
    document.body
  );
}
