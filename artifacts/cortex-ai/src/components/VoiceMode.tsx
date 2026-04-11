import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Mic, MicOff, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppState } from "@/hooks/use-app-state";
import { useCreateAnthropicConversation } from "@workspace/api-client-react";
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

/* ── Cortex Orb ──────────────────────────────────────────────── */
interface OrbProps {
  state: VoiceState;
  audioLevel: number;   // 0–1, live mic level during listening
  audioData: number[];  // frequency bins, 0-255 each
}

function CortexOrb({ state, audioLevel, audioData }: OrbProps) {
  const isListening = state === "listening";
  const isThinking  = state === "thinking";
  const isSpeaking  = state === "speaking";
  const isActive    = isListening || isSpeaking;

  // Scale ripple rings with audio level during listening
  const rippleBoost = isListening ? 1 + audioLevel * 0.6 : 1;
  // Glow intensity based on audio
  const glowAlpha   = isListening ? 0.3 + audioLevel * 0.5 : isSpeaking ? 0.35 : 0.15;

  // Inner ring radius reacts to audio level during listening
  const innerR = isListening ? 52 + audioLevel * 14 : 52;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 280, height: 280 }}>

      {/* Ambient glow behind orb */}
      <div className="absolute rounded-full" style={{
        width: 220, height: 220,
        background: isListening
          ? `radial-gradient(circle, rgba(0,208,255,${glowAlpha}) 0%, transparent 70%)`
          : isSpeaking
          ? `radial-gradient(circle, rgba(108,59,255,${glowAlpha}) 0%, transparent 70%)`
          : isThinking
          ? "radial-gradient(circle, rgba(108,59,255,0.12) 0%, transparent 70%)"
          : "radial-gradient(circle, rgba(0,208,255,0.08) 0%, transparent 70%)",
        boxShadow: isListening
          ? `0 0 ${50 + audioLevel * 60}px rgba(0,208,255,${0.25 + audioLevel * 0.3})`
          : isSpeaking
          ? "0 0 55px rgba(108,59,255,0.3)"
          : "0 0 20px rgba(0,208,255,0.1)",
        transition: "background 0.4s ease, box-shadow 0.1s ease",
      }} />

      {/* Ripple rings — expand with audio level */}
      {isActive && [1, 2, 3].map(i => (
        <div key={i} className="absolute rounded-full" style={{
          width:  (260 + i * 48) * (i === 1 ? rippleBoost : 1),
          height: (260 + i * 48) * (i === 1 ? rippleBoost : 1),
          border: `1px solid ${isListening ? `rgba(0,208,255,${0.35 - i * 0.07})` : `rgba(108,59,255,${0.3 - i * 0.07})`}`,
          animation: `vmRipple ${1.1 + i * 0.3}s ease-out infinite`,
          animationDelay: `${i * 0.25}s`,
          transition: "width 0.08s ease, height 0.08s ease",
        }} />
      ))}

      {/* SVG rings */}
      <svg viewBox="0 0 200 200" fill="none" className="absolute inset-0 w-full h-full">
        {/* Outer dashed ring */}
        <circle cx="100" cy="100" r="95"
          stroke={isThinking ? "#6c3bff" : "#00d0ff"}
          strokeWidth="1"
          strokeDasharray="8 4"
          style={{
            animation: `vmSpin ${isThinking ? 1.2 : 20}s linear infinite`,
            transformOrigin: "100px 100px",
            opacity: isThinking ? 0.8 : 0.45,
          }}
        />
        {/* Middle dashed ring */}
        <circle cx="100" cy="100" r="74"
          stroke={isThinking ? "#6c3bff" : "#00d0ff"}
          strokeWidth="1"
          strokeDasharray="5 5"
          style={{
            animation: `vmSpinRev ${isThinking ? 1.8 : 28}s linear infinite`,
            transformOrigin: "100px 100px",
            opacity: isThinking ? 0.7 : 0.38,
          }}
        />
        {/* Inner ring — pulsing with audio level */}
        <circle cx="100" cy="100" r={innerR}
          stroke={isListening ? "#00d0ff" : isSpeaking ? "#6c3bff" : isThinking ? "#6c3bff" : "#00d0ff"}
          strokeWidth={isActive ? 1.8 : 1.2}
          opacity={isActive ? 0.85 : 0.3}
          style={{
            transition: "r 0.06s ease, stroke-width 0.2s ease",
            animation: isActive ? `vmPulseRing ${isListening ? 0.5 + (1 - audioLevel) * 0.8 : 0.9}s ease-in-out infinite` : undefined,
          }}
        />
        {/* Compass tick lines */}
        {[0, 90, 180, 270].map(angle => {
          const rad = (angle * Math.PI) / 180;
          const boost = isListening ? audioLevel * 8 : 0;
          const x1 = 100 + (56 + boost) * Math.cos(rad);
          const y1 = 100 + (56 + boost) * Math.sin(rad);
          const x2 = 100 + (70 + boost) * Math.cos(rad);
          const y2 = 100 + (70 + boost) * Math.sin(rad);
          return (
            <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={isListening ? "#00d0ff" : isSpeaking ? "#6c3bff" : "#00d0ff"}
              strokeWidth="1.5" strokeLinecap="round"
              opacity={isActive ? 0.9 : 0.35}
              style={{ transition: "x1 0.06s ease, y1 0.06s ease, x2 0.06s ease, y2 0.06s ease" }}
            />
          );
        })}
        {/* Center dot */}
        <circle cx="100" cy="100" r={isListening ? 6 + audioLevel * 5 : 6}
          fill={isListening ? "#00d0ff" : isSpeaking ? "#6c3bff" : isThinking ? "#6c3bff" : "#00d0ff"}
          style={{
            animation: "vmDotPulse 1.4s ease-in-out infinite",
            transition: "r 0.06s ease, fill 0.3s ease",
          }}
        />
        <circle cx="100" cy="100" r="3" fill="white" opacity="0.9" />
      </svg>

      {/* Thinking spinner */}
      {isThinking && (
        <div className="absolute rounded-full" style={{
          width: 152, height: 152,
          border: "2px solid transparent",
          borderTopColor: "#6c3bff",
          borderRightColor: "rgba(108,59,255,0.2)",
          animation: "vmSpin 0.8s linear infinite",
          transformOrigin: "center",
        }} />
      )}

      {/* SPEAKING — frequency bars (24 bars using real or simulated audio data) */}
      {isSpeaking && (
        <div className="absolute flex items-center justify-center gap-[3px]"
          style={{ width: 96, height: 64 }}>
          {Array.from({ length: 24 }, (_, i) => {
            const bin = audioData[i] ?? 0;
            // Use real data if available, otherwise fallback to CSS animation
            const hasRealData = audioData.some(v => v > 0);
            const heightPx = hasRealData
              ? Math.max(4, (bin / 255) * 58)
              : undefined;
            const color = `hsl(${260 + (i / 24) * 60}, 100%, ${55 + (i / 24) * 15}%)`;
            return (
              <div key={i}
                className="rounded-full flex-shrink-0"
                style={{
                  width: 3,
                  height: heightPx ? `${heightPx}px` : `${6 + Math.sin(i * 0.9) * 12 + 10}px`,
                  background: color,
                  boxShadow: `0 0 6px ${color}80`,
                  animation: !hasRealData ? `vmAudioBar ${0.3 + i * 0.04}s ease-in-out infinite alternate` : undefined,
                  animationDelay: !hasRealData ? `${i * 0.03}s` : undefined,
                  transition: hasRealData ? "height 0.05s ease" : undefined,
                }}
              />
            );
          })}
        </div>
      )}

      {/* LISTENING — volume ring overlay reacting to mic */}
      {isListening && audioLevel > 0.05 && (
        <div className="absolute rounded-full pointer-events-none" style={{
          width: 116 + audioLevel * 40,
          height: 116 + audioLevel * 40,
          border: `${1 + audioLevel * 2}px solid rgba(0,208,255,${0.3 + audioLevel * 0.5})`,
          boxShadow: `0 0 ${20 + audioLevel * 40}px rgba(0,208,255,${0.2 + audioLevel * 0.4})`,
          transition: "width 0.05s ease, height 0.05s ease, border-width 0.05s ease",
        }} />
      )}
    </div>
  );
}

/* ── Main VoiceMode ──────────────────────────────────────────── */
interface VoiceModeProps { onClose: () => void }

export function VoiceMode({ onClose }: VoiceModeProps) {
  const { activeConversationId, setActiveConversationId } = useAppState();
  const createConv = useCreateAnthropicConversation();

  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript,  setTranscript]  = useState("");
  const [aiText,      setAiText]      = useState("");
  const [error,       setError]       = useState<string | null>(null);
  const [greeted,     setGreeted]     = useState(false);
  const [convId,      setConvId]      = useState<number | null>(activeConversationId);
  const [audioLevel,  setAudioLevel]  = useState(0);
  const [audioData,   setAudioData]   = useState<number[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const audioRef         = useRef<HTMLAudioElement | null>(null);
  const abortRef         = useRef<AbortController | null>(null);
  const busyRef          = useRef(false);

  // Audio analysis refs
  const audioCtxRef   = useRef<AudioContext | null>(null);
  const analyserRef   = useRef<AnalyserNode | null>(null);
  const rafRef        = useRef<number | null>(null);
  const srcNodeRef    = useRef<MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null>(null);
  const elemSrcRef    = useRef<MediaElementAudioSourceNode | null>(null);

  /* ── Audio analysis helpers ── */
  const stopAnalysis = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setAudioLevel(0);
    setAudioData([]);
  }, []);

  const startMicAnalysis = useCallback((stream: MediaStream) => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") void ctx.resume();

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.75;
      analyserRef.current = analyser;

      const src = ctx.createMediaStreamSource(stream);
      srcNodeRef.current = src;
      src.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const poll = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        setAudioLevel(Math.min(1, avg / 80));
        rafRef.current = requestAnimationFrame(poll);
      };
      rafRef.current = requestAnimationFrame(poll);
    } catch { /* mic analysis is optional */ }
  }, []);

  const startSpeakingAnalysis = useCallback((audio: HTMLAudioElement) => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext();
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") void ctx.resume();

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.65;
      analyserRef.current = analyser;

      // Reuse existing element source node if possible (element can only be connected once)
      let src: MediaElementAudioSourceNode;
      if (elemSrcRef.current) {
        src = elemSrcRef.current;
      } else {
        src = ctx.createMediaElementSource(audio);
        elemSrcRef.current = src;
      }
      srcNodeRef.current = src;
      src.connect(analyser);
      analyser.connect(ctx.destination);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const poll = () => {
        analyser.getByteFrequencyData(data);
        setAudioData(Array.from(data));
        rafRef.current = requestAnimationFrame(poll);
      };
      rafRef.current = requestAnimationFrame(poll);
    } catch { /* speaking analysis is optional */ }
  }, []);

  /* ── Ensure conversation ── */
  const ensureConv = useCallback(async (): Promise<number> => {
    if (convId) return convId;
    const res = await createConv.mutateAsync({ data: { title: "Voice Conversation" } });
    const id  = res.id;
    setConvId(id);
    setActiveConversationId(id);
    return id;
  }, [convId, createConv, setActiveConversationId]);

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

    const buf  = await res.arrayBuffer();
    const blob = new Blob([buf], { type: "audio/mpeg" });
    const url  = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    setVoiceState("speaking");
    setAudioData([]);

    // Start speaking audio analysis
    startSpeakingAnalysis(audio);

    await new Promise<void>(resolve => {
      audio.onended = () => { URL.revokeObjectURL(url); stopAnalysis(); audioRef.current = null; resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); stopAnalysis(); resolve(); };
      audio.play().catch(() => resolve());
    });
  }, [stopAudio, startSpeakingAnalysis, stopAnalysis]);

  /* ── AI response ── */
  const handleTranscript = useCallback(async (text: string) => {
    if (!text.trim() || busyRef.current) { setVoiceState("idle"); return; }
    busyRef.current = true;
    setTranscript(text);
    setVoiceState("thinking");
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
      setVoiceState("idle");
      setAiText("");
    }
  }, [ensureConv, speakText]);

  /* ── Auto-greet on open ── */
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
        setVoiceState("idle");
        setAiText("");
      }
    })();
  }, [greeted, speakText]);

  /* ── Recording ── */
  const startRecording = useCallback(async () => {
    if (voiceState !== "idle" || busyRef.current) return;
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
      setVoiceState("listening");
      startMicAnalysis(stream);
    } catch {
      setError("Microphone access denied.");
    }
  }, [voiceState, stopAudio, startMicAnalysis]);

  const stopRecording = useCallback(async () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    mediaRecorderRef.current = null;
    stopAnalysis();
    setVoiceState("thinking");
    await new Promise<void>(resolve => {
      mr.onstop = async () => {
        mr.stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        chunksRef.current = [];
        if (blob.size === 0) { setVoiceState("idle"); resolve(); return; }
        try {
          const fd = new FormData();
          fd.append("audio", blob, "rec.webm");
          const res = await fetch("/api/stt", { method: "POST", credentials: "include", body: fd });
          const data = await res.json() as { transcript?: string };
          await handleTranscript(data.transcript || "");
        } catch { setVoiceState("idle"); }
        resolve();
      };
      mr.stop();
    });
  }, [handleTranscript, stopAnalysis]);

  /* ── Cleanup ── */
  useEffect(() => () => {
    abortRef.current?.abort();
    stopAudio();
    mediaRecorderRef.current?.stop();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close().catch(() => {});
  }, [stopAudio]);

  /* ── Spacebar shortcut ── */
  useEffect(() => {
    const dn = (e: KeyboardEvent) => { if (e.code === "Space" && voiceState === "idle") { e.preventDefault(); startRecording(); } };
    const up = (e: KeyboardEvent) => { if (e.code === "Space" && voiceState === "listening") { e.preventDefault(); stopRecording(); } };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup",   up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, [voiceState, startRecording, stopRecording]);

  const isBusy   = voiceState === "thinking" || voiceState === "speaking";
  const micLabel =
    voiceState === "idle"      ? "Hold to Speak" :
    voiceState === "listening" ? "Release to Send" :
    voiceState === "thinking"  ? "Processing…" : "Speaking…";

  const stateColor =
    voiceState === "listening" ? "#00d0ff" :
    voiceState === "thinking"  ? "#6c3bff" :
    voiceState === "speaking"  ? "#6c3bff" : "rgba(255,255,255,0.3)";

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
      transition={{ duration: 0.3 }}
    >
      {/* Animated background grid */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{
        backgroundImage: "linear-gradient(rgba(0,208,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,208,255,0.025) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
      }}>
        {/* Scan line */}
        <div className="absolute left-0 right-0 h-[2px] pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(0,208,255,0.12) 30%, rgba(0,208,255,0.25) 50%, rgba(0,208,255,0.12) 70%, transparent 100%)",
            animation: "vmScanLine 5s linear infinite",
          }}
        />
      </div>

      {/* Corner brackets — with breathing animation */}
      {([
        { pos: "top-5 left-5",    bt: true,  bb: false, bl: true,  br: false },
        { pos: "top-5 right-5",   bt: true,  bb: false, bl: false, br: true  },
        { pos: "bottom-5 left-5", bt: false, bb: true,  bl: true,  br: false },
        { pos: "bottom-5 right-5",bt: false, bb: true,  bl: false, br: true  },
      ] as const).map((c, i) => (
        <div key={i} className={`absolute ${c.pos} pointer-events-none`}
          style={{
            width: 22, height: 22,
            borderTop:    c.bt ? "1.5px solid rgba(0,208,255,0.4)" : "none",
            borderBottom: c.bb ? "1.5px solid rgba(0,208,255,0.4)" : "none",
            borderLeft:   c.bl ? "1.5px solid rgba(0,208,255,0.4)" : "none",
            borderRight:  c.br ? "1.5px solid rgba(0,208,255,0.4)" : "none",
            animation: "vmBracketPulse 3s ease-in-out infinite",
            animationDelay: `${i * 0.35}s`,
          }}
        />
      ))}

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between w-full px-6 pt-8">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full" style={{
            background: stateColor,
            boxShadow: `0 0 10px ${stateColor}`,
            animation: "vmDotPulse 1.4s ease-in-out infinite",
            transition: "background 0.3s ease, box-shadow 0.3s ease",
          }} />
          <span className="font-display font-bold text-sm tracking-[0.2em] uppercase" style={{ color: "rgba(255,255,255,0.75)" }}>
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

      {/* Orb */}
      <div className="relative z-10 flex flex-col items-center gap-10 -mt-4">
        <CortexOrb state={voiceState} audioLevel={audioLevel} audioData={audioData} />

        {/* State label — animated transitions */}
        <div className="flex flex-col items-center gap-3 px-8 text-center" style={{ maxWidth: 320, minHeight: 80 }}>
          <AnimatePresence mode="wait">
            <motion.span
              key={voiceState}
              className="font-mono text-xs tracking-[0.3em] uppercase"
              style={{ color: stateColor }}
              initial={{ opacity: 0, y: 6, letterSpacing: "0.15em" }}
              animate={{ opacity: 1, y: 0, letterSpacing: "0.3em" }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {stateLabel}
              {(voiceState === "listening" || voiceState === "speaking") && (
                <span style={{ animation: "vmEllipsis 1.2s steps(3, end) infinite" }}>…</span>
              )}
            </motion.span>
          </AnimatePresence>

          <AnimatePresence>
            {transcript && voiceState !== "idle" && (
              <motion.p
                className="text-[11px] font-mono text-white/35 leading-relaxed line-clamp-2 italic"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                "{transcript}"
              </motion.p>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {aiText && (
              <motion.p
                className="text-[12px] font-mono leading-relaxed line-clamp-3"
                style={{ color: "rgba(0,208,255,0.55)" }}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
              >
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
            style={{ background: "rgba(255,46,126,0.08)", border: "1px solid rgba(255,46,126,0.25)", color: "#ff2e7e" }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mic button */}
      <div className="relative z-10 flex flex-col items-center gap-3 pb-16">
        <motion.button
          onPointerDown={() => { if (voiceState === "idle") startRecording(); }}
          onPointerUp={()   => { if (voiceState === "listening") stopRecording(); }}
          onPointerLeave={()=> { if (voiceState === "listening") stopRecording(); }}
          disabled={isBusy}
          whileTap={{ scale: 0.93 }}
          whileHover={{ scale: isBusy ? 1 : 1.06 }}
          className="relative flex items-center justify-center rounded-full disabled:opacity-30"
          style={{
            width: 76, height: 76,
            background: voiceState === "listening"
              ? `rgba(0,208,255,${0.1 + audioLevel * 0.12})`
              : "rgba(255,255,255,0.04)",
            border: voiceState === "listening"
              ? `1.5px solid rgba(0,208,255,${0.5 + audioLevel * 0.4})`
              : "1.5px solid rgba(255,255,255,0.1)",
            boxShadow: voiceState === "listening"
              ? `0 0 ${24 + audioLevel * 36}px rgba(0,208,255,${0.3 + audioLevel * 0.3}), 0 0 56px rgba(0,208,255,0.08)`
              : "none",
            transition: "background 0.15s ease, border-color 0.15s ease, box-shadow 0.08s ease",
          }}
        >
          {voiceState === "thinking" ? (
            <Loader2 size={27} className="animate-spin" style={{ color: "#6c3bff" }} />
          ) : voiceState === "speaking" ? (
            <div className="flex items-end gap-[2px]" style={{ height: 22 }}>
              {[0.5, 1, 1.6, 1.0, 0.6].map((h, i) => (
                <div key={i} className="rounded-full" style={{
                  width: 3, background: "#6c3bff",
                  height: `${h * 10}px`,
                  animation: `vmAudioBar ${0.4 + i * 0.07}s ease-in-out infinite alternate`,
                  animationDelay: `${i * 0.07}s`,
                }} />
              ))}
            </div>
          ) : voiceState === "listening" ? (
            <MicOff size={27} style={{ color: "#00d0ff" }} />
          ) : (
            <Mic size={27} className="text-white/55" />
          )}

          {/* Ping ring when listening */}
          {voiceState === "listening" && (
            <span className="absolute inset-[-6px] rounded-full border border-[#00d0ff]/30 animate-ping" />
          )}
        </motion.button>

        <AnimatePresence mode="wait">
          <motion.div
            key={voiceState}
            className="flex flex-col items-center gap-1"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <span className="text-[11px] font-mono tracking-wider"
              style={{ color: voiceState === "listening" ? "#00d0ff" : "rgba(255,255,255,0.28)" }}>
              {micLabel}
            </span>
            <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.12)" }}>
              or hold Space
            </span>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes vmSpin        { from{transform:rotate(0deg)}   to{transform:rotate(360deg)} }
        @keyframes vmSpinRev     { from{transform:rotate(0deg)}   to{transform:rotate(-360deg)} }
        @keyframes vmRipple      { 0%{transform:scale(0.85);opacity:.75} 100%{transform:scale(1.4);opacity:0} }
        @keyframes vmPulseRing   { 0%,100%{opacity:.3} 50%{opacity:.9} }
        @keyframes vmDotPulse    { 0%,100%{opacity:.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.25)} }
        @keyframes vmGlowIdle    { 0%,100%{opacity:.55;transform:scale(1)} 50%{opacity:.85;transform:scale(1.07)} }
        @keyframes vmAudioBar    { from{transform:scaleY(0.15)} to{transform:scaleY(1)} }
        @keyframes vmScanLine    { 0%{top:-2px} 100%{top:100%} }
        @keyframes vmBracketPulse{ 0%,100%{opacity:.35} 50%{opacity:.7} }
        @keyframes vmEllipsis    { 0%{content:'.'} 33%{content:'..'} 66%{content:'...'} }
      `}</style>
    </motion.div>,
    document.body
  );
}
