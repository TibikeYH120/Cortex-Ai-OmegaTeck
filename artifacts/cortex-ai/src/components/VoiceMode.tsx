import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Mic, MicOff, Loader2 } from "lucide-react";
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

/* ── Geo greeting ────────────────────────────────────────────── */
async function detectCountry(): Promise<string> {
  try {
    const r = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(3000) });
    const d = await r.json() as { country_code?: string };
    return d.country_code ?? "US";
  } catch {
    return "US";
  }
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

/* ── Cortex Orb (SVG rings design matching the app's style) ── */
function CortexOrb({ state }: { state: VoiceState }) {
  const isListening = state === "listening";
  const isThinking  = state === "thinking";
  const isSpeaking  = state === "speaking";
  const isActive    = isListening || isSpeaking;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 260, height: 260 }}>

      {/* Ripple rings when speaking/listening */}
      {isActive && [1, 2, 3].map(i => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: 260 + i * 50,
            height: 260 + i * 50,
            border: `1px solid ${isListening ? "rgba(0,208,255,0.3)" : "rgba(108,59,255,0.25)"}`,
            animation: `vmRipple ${1.2 + i * 0.35}s ease-out infinite`,
            animationDelay: `${i * 0.28}s`,
          }}
        />
      ))}

      {/* SVG — Cortex rotating dashed rings (matches welcome screen style) */}
      <svg
        viewBox="0 0 200 200"
        fill="none"
        className="absolute inset-0 w-full h-full"
        style={{ opacity: isThinking ? 1 : 0.85 }}
      >
        {/* Outer dashed ring */}
        <circle
          cx="100" cy="100" r="95"
          stroke={isThinking ? "#6c3bff" : "#00d0ff"}
          strokeWidth="1"
          strokeDasharray="8 4"
          style={{
            animation: `vmSpin ${isThinking ? 1.4 : 22}s linear infinite`,
            transformOrigin: "100px 100px",
            opacity: 0.5,
          }}
        />
        {/* Middle dashed ring — counter */}
        <circle
          cx="100" cy="100" r="74"
          stroke={isThinking ? "#6c3bff" : "#00d0ff"}
          strokeWidth="1"
          strokeDasharray="5 5"
          style={{
            animation: `vmSpinRev ${isThinking ? 2 : 30}s linear infinite`,
            transformOrigin: "100px 100px",
            opacity: 0.4,
          }}
        />
        {/* Inner solid ring */}
        <circle
          cx="100" cy="100" r="52"
          stroke={isListening ? "#00d0ff" : isSpeaking ? "#6c3bff" : isThinking ? "#6c3bff" : "#00d0ff"}
          strokeWidth="1.5"
          opacity={isActive ? 0.9 : 0.35}
          style={{ animation: isActive ? `vmPulseRing 0.9s ease-in-out infinite` : undefined }}
        />

        {/* Cross lines (compass style) */}
        {[0, 90, 180, 270].map(angle => {
          const rad = (angle * Math.PI) / 180;
          const x1 = 100 + 56 * Math.cos(rad);
          const y1 = 100 + 56 * Math.sin(rad);
          const x2 = 100 + 68 * Math.cos(rad);
          const y2 = 100 + 68 * Math.sin(rad);
          return (
            <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#00d0ff" strokeWidth="1.5" strokeLinecap="round"
              opacity={isActive ? 0.9 : 0.4}
            />
          );
        })}

        {/* Center glow dot */}
        <circle cx="100" cy="100" r="6"
          fill={isListening ? "#00d0ff" : isSpeaking ? "#6c3bff" : isThinking ? "#6c3bff" : "#00d0ff"}
          style={{ animation: "vmDotPulse 1.5s ease-in-out infinite" }}
        />
        <circle cx="100" cy="100" r="3" fill="white" opacity="0.9" />
      </svg>

      {/* Center fill glow */}
      <div
        className="absolute rounded-full"
        style={{
          width: 108,
          height: 108,
          background:
            isListening  ? "radial-gradient(circle, rgba(0,208,255,0.22) 0%, transparent 70%)" :
            isSpeaking   ? "radial-gradient(circle, rgba(108,59,255,0.22) 0%, transparent 70%)" :
            isThinking   ? "radial-gradient(circle, rgba(108,59,255,0.15) 0%, transparent 70%)" :
                           "radial-gradient(circle, rgba(0,208,255,0.1) 0%, transparent 70%)",
          boxShadow:
            isListening  ? "0 0 40px rgba(0,208,255,0.4)" :
            isSpeaking   ? "0 0 40px rgba(108,59,255,0.35)" :
            isThinking   ? "0 0 25px rgba(108,59,255,0.25)" :
                           "0 0 20px rgba(0,208,255,0.15)",
          transition: "all 0.4s ease",
          animation: isActive ? "vmGlowPulse 1s ease-in-out infinite" : "vmGlowIdle 3s ease-in-out infinite",
        }}
      />

      {/* Audio wave bars when speaking */}
      {isSpeaking && (
        <div className="absolute flex items-end justify-center gap-[3px]" style={{ height: 30, bottom: "calc(50% - 15px)" }}>
          {[0.5, 1, 1.7, 2.2, 1.5, 1.0, 0.6].map((h, i) => (
            <div
              key={i}
              className="rounded-full"
              style={{
                width: 3,
                background: "rgba(255,255,255,0.7)",
                height: `${h * 12}px`,
                animation: `vmAudioBar ${0.45 + i * 0.07}s ease-in-out infinite alternate`,
                animationDelay: `${i * 0.06}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Thinking spinner overlay */}
      {isThinking && (
        <div
          className="absolute rounded-full"
          style={{
            width: 148,
            height: 148,
            border: "2px solid transparent",
            borderTopColor: "#6c3bff",
            borderRightColor: "rgba(108,59,255,0.25)",
            animation: "vmSpin 0.9s linear infinite",
            transformOrigin: "center",
          }}
        />
      )}
    </div>
  );
}

/* ── Main VoiceMode ─────────────────────────────────────────── */
interface VoiceModeProps { onClose: () => void }

export function VoiceMode({ onClose }: VoiceModeProps) {
  const { activeConversationId, setActiveConversationId } = useAppState();
  const createConv = useCreateAnthropicConversation();

  const [voiceState, setVoiceState]   = useState<VoiceState>("idle");
  const [transcript,  setTranscript]  = useState("");
  const [aiText,      setAiText]      = useState("");
  const [error,       setError]       = useState<string | null>(null);
  const [greeted,     setGreeted]     = useState(false);
  const [convId,      setConvId]      = useState<number | null>(activeConversationId);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef        = useRef<Blob[]>([]);
  const audioRef         = useRef<HTMLAudioElement | null>(null);
  const abortRef         = useRef<AbortController | null>(null);
  const busyRef          = useRef(false);

  /* ── Ensure conversation ── */
  const ensureConv = useCallback(async (): Promise<number> => {
    if (convId) return convId;
    const res = await createConv.mutateAsync({ data: { title: "Voice Conversation" } });
    const id  = (res as any).id as number;
    setConvId(id);
    setActiveConversationId(id);
    return id;
  }, [convId, createConv, setActiveConversationId]);

  /* ── TTS ── */
  const stopAudio = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; audioRef.current = null; }
  }, []);

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

    await new Promise<void>(resolve => {
      audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      audio.play().catch(() => resolve());
    });
  }, [stopAudio]);

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
            if (j.content) { fullText += j.content; setAiText(fullText.slice(0, 100) + (fullText.length > 100 ? "…" : "")); }
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
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(250);
      setVoiceState("listening");
    } catch {
      setError("Microphone access denied.");
    }
  }, [voiceState, stopAudio]);

  const stopRecording = useCallback(async () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    mediaRecorderRef.current = null;
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
  }, [handleTranscript]);

  /* ── Cleanup ── */
  useEffect(() => () => {
    abortRef.current?.abort();
    stopAudio();
    mediaRecorderRef.current?.stop();
  }, [stopAudio]);

  /* ── Spacebar shortcut ── */
  useEffect(() => {
    const dn = (e: KeyboardEvent) => { if (e.code === "Space" && voiceState === "idle") { e.preventDefault(); startRecording(); } };
    const up = (e: KeyboardEvent) => { if (e.code === "Space" && voiceState === "listening") { e.preventDefault(); stopRecording(); } };
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup",   up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, [voiceState, startRecording, stopRecording]);

  const isBusy    = voiceState === "thinking" || voiceState === "speaking";
  const micLabel  =
    voiceState === "idle"      ? "Hold to Speak" :
    voiceState === "listening" ? "Release to Send" :
    voiceState === "thinking"  ? "Processing…" : "Speaking…";

  const stateColor =
    voiceState === "listening" ? "#00d0ff" :
    voiceState === "thinking"  ? "#6c3bff" :
    voiceState === "speaking"  ? "#6c3bff" : "rgba(255,255,255,0.35)";

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col items-center justify-between select-none"
      style={{ zIndex: 2000, background: "#03030a" }}
    >
      {/* Background grid */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(0,208,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,208,255,0.03) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
      }} />

      {/* Corner brackets */}
      {(["top-4 left-4", "top-4 right-4", "bottom-4 left-4", "bottom-4 right-4"] as const).map((pos, i) => (
        <div key={i} className={`absolute ${pos} pointer-events-none`} style={{ width: 20, height: 20 }}>
          <div style={{
            width: "100%", height: "100%",
            borderTop: i < 2 ? "1.5px solid rgba(0,208,255,0.35)" : "none",
            borderBottom: i >= 2 ? "1.5px solid rgba(0,208,255,0.35)" : "none",
            borderLeft: i % 2 === 0 ? "1.5px solid rgba(0,208,255,0.35)" : "none",
            borderRight: i % 2 === 1 ? "1.5px solid rgba(0,208,255,0.35)" : "none",
          }} />
        </div>
      ))}

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between w-full px-6 pt-8">
        <div className="flex items-center gap-2.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{
              background: stateColor,
              boxShadow: `0 0 8px ${stateColor}`,
              animation: "vmDotPulse 1.5s ease-in-out infinite",
            }}
          />
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

      {/* Orb + status */}
      <div className="relative z-10 flex flex-col items-center gap-8 -mt-6">
        <CortexOrb state={voiceState} />

        {/* State label */}
        <div className="flex flex-col items-center gap-2.5 px-8 text-center" style={{ maxWidth: 300 }}>
          <span
            className="font-mono text-xs tracking-[0.25em] uppercase transition-colors"
            style={{ color: stateColor }}
          >
            {voiceState === "idle"      ? "Ready" :
             voiceState === "listening" ? "Listening…" :
             voiceState === "thinking"  ? "Processing…" : "Speaking…"}
          </span>
          {transcript && voiceState !== "idle" && (
            <p className="text-[11px] font-mono text-white/40 leading-relaxed line-clamp-2 italic">
              "{transcript}"
            </p>
          )}
          {aiText && (
            <p className="text-[11px] font-mono text-[#00d0ff]/50 leading-relaxed line-clamp-3">
              {aiText}
            </p>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="relative z-10 px-5 py-2 rounded-full text-xs font-mono"
          style={{ background: "rgba(255,46,126,0.08)", border: "1px solid rgba(255,46,126,0.25)", color: "#ff2e7e" }}>
          {error}
        </div>
      )}

      {/* Mic button */}
      <div className="relative z-10 flex flex-col items-center gap-3 pb-16">
        <button
          onPointerDown={() => { if (voiceState === "idle") startRecording(); }}
          onPointerUp={()   => { if (voiceState === "listening") stopRecording(); }}
          onPointerLeave={()=> { if (voiceState === "listening") stopRecording(); }}
          disabled={isBusy}
          className="relative flex items-center justify-center rounded-full transition-all disabled:opacity-35 active:scale-95"
          style={{
            width: 72, height: 72,
            background:
              voiceState === "listening"
                ? "rgba(0,208,255,0.12)"
                : "rgba(255,255,255,0.04)",
            border: voiceState === "listening"
              ? "1.5px solid rgba(0,208,255,0.6)"
              : "1.5px solid rgba(255,255,255,0.1)",
            boxShadow: voiceState === "listening"
              ? "0 0 28px rgba(0,208,255,0.35), 0 0 56px rgba(0,208,255,0.1)"
              : "none",
          }}
        >
          {voiceState === "thinking" ? (
            <Loader2 size={26} className="animate-spin" style={{ color: "#6c3bff" }} />
          ) : voiceState === "listening" ? (
            <MicOff size={26} style={{ color: "#00d0ff" }} />
          ) : (
            <Mic size={26} className="text-white/60" />
          )}
          {voiceState === "listening" && (
            <span className="absolute inset-[-5px] rounded-full border border-[#00d0ff]/35 animate-ping" />
          )}
        </button>

        <div className="flex flex-col items-center gap-1">
          <span className="text-[11px] font-mono tracking-wider transition-colors"
            style={{ color: voiceState === "listening" ? "#00d0ff" : "rgba(255,255,255,0.3)" }}>
            {micLabel}
          </span>
          <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.15)" }}>
            or hold Space
          </span>
        </div>
      </div>

      {/* Keyframes */}
      <style>{`
        @keyframes vmSpin       { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes vmSpinRev    { from{transform:rotate(0deg)} to{transform:rotate(-360deg)} }
        @keyframes vmRipple     { 0%{transform:scale(0.88);opacity:.7} 100%{transform:scale(1.3);opacity:0} }
        @keyframes vmPulseRing  { 0%,100%{opacity:.35} 50%{opacity:.9} }
        @keyframes vmDotPulse   { 0%,100%{opacity:.7} 50%{opacity:1} }
        @keyframes vmGlowIdle   { 0%,100%{opacity:.6;transform:scale(1)} 50%{opacity:.9;transform:scale(1.06)} }
        @keyframes vmGlowPulse  { 0%,100%{opacity:.8;transform:scale(0.95)} 50%{opacity:1;transform:scale(1.08)} }
        @keyframes vmAudioBar   { from{transform:scaleY(0.25)} to{transform:scaleY(1)} }
      `}</style>
    </div>,
    document.body
  );
}
