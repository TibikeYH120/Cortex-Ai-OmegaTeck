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

const OPENAI_VOICE_MAP: Record<string, string> = {
  nova: "nova", aria: "shimmer", echo: "echo", orion: "onyx",
};

/* ─── Animated Orb ─────────────────────────────────────────── */
function CortexOrb({ state }: { state: VoiceState }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 220, height: 220 }}>
      {/* Outer rings */}
      {[1, 2, 3].map(i => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: 220 + i * 48,
            height: 220 + i * 48,
            border: `1px solid rgba(0,208,255,${state === "idle" ? 0.06 : state === "listening" ? 0.18 : state === "thinking" ? 0.1 : 0.22})`,
            animation: state === "speaking"
              ? `orbRingExpand ${0.9 + i * 0.3}s ease-out infinite`
              : state === "listening"
              ? `orbPulse ${0.7 + i * 0.15}s ease-in-out infinite`
              : `orbBreath ${3 + i * 0.8}s ease-in-out infinite`,
            animationDelay: `${i * 0.18}s`,
          }}
        />
      ))}

      {/* Thinking spin ring */}
      {state === "thinking" && (
        <div
          className="absolute rounded-full"
          style={{
            width: 240,
            height: 240,
            border: "2px solid transparent",
            borderTopColor: "#6c3bff",
            borderRightColor: "rgba(108,59,255,0.3)",
            animation: "orbSpin 1.2s linear infinite",
          }}
        />
      )}

      {/* Core orb */}
      <div
        className="relative rounded-full flex items-center justify-center overflow-hidden"
        style={{
          width: 180,
          height: 180,
          background:
            state === "listening"
              ? "radial-gradient(circle at 40% 35%, rgba(200,255,255,0.9) 0%, rgba(0,208,255,0.7) 30%, rgba(0,160,200,0.4) 60%, rgba(0,80,120,0.15) 100%)"
              : state === "thinking"
              ? "radial-gradient(circle at 40% 35%, rgba(180,160,255,0.9) 0%, rgba(108,59,255,0.7) 30%, rgba(60,20,180,0.4) 60%, rgba(20,5,80,0.15) 100%)"
              : state === "speaking"
              ? "radial-gradient(circle at 40% 35%, rgba(255,255,255,0.95) 0%, rgba(0,208,255,0.8) 25%, rgba(108,59,255,0.5) 55%, rgba(20,5,50,0.2) 100%)"
              : "radial-gradient(circle at 40% 35%, rgba(160,240,255,0.7) 0%, rgba(0,208,255,0.45) 35%, rgba(60,30,140,0.3) 65%, rgba(10,3,30,0.15) 100%)",
          boxShadow:
            state === "listening"
              ? "0 0 40px rgba(0,208,255,0.7), 0 0 80px rgba(0,208,255,0.3), inset 0 0 30px rgba(255,255,255,0.1)"
              : state === "thinking"
              ? "0 0 40px rgba(108,59,255,0.7), 0 0 80px rgba(108,59,255,0.3), inset 0 0 30px rgba(200,180,255,0.1)"
              : state === "speaking"
              ? "0 0 50px rgba(0,208,255,0.8), 0 0 100px rgba(108,59,255,0.4), inset 0 0 40px rgba(255,255,255,0.15)"
              : "0 0 30px rgba(0,208,255,0.3), 0 0 60px rgba(108,59,255,0.15), inset 0 0 20px rgba(255,255,255,0.05)",
          animation:
            state === "listening"
              ? "orbCorePulse 0.7s ease-in-out infinite"
              : state === "speaking"
              ? "orbCoreSpeak 1.1s ease-in-out infinite"
              : state === "thinking"
              ? "orbCoreThink 2s ease-in-out infinite"
              : "orbCoreIdle 3.5s ease-in-out infinite",
          transition: "background 0.5s ease, box-shadow 0.5s ease",
        }}
      >
        {/* Inner gloss */}
        <div
          className="absolute rounded-full"
          style={{
            width: "55%",
            height: "45%",
            top: "12%",
            left: "18%",
            background: "radial-gradient(ellipse, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 100%)",
            filter: "blur(4px)",
          }}
        />

        {/* Audio bars when speaking */}
        {state === "speaking" && (
          <div className="flex items-end gap-1" style={{ height: 36 }}>
            {[1, 1.8, 2.8, 2, 1.4, 2.5, 1.2].map((h, i) => (
              <div
                key={i}
                className="rounded-full"
                style={{
                  width: 4,
                  height: `${h * 10}px`,
                  background: "rgba(255,255,255,0.85)",
                  animation: `audioBar ${0.5 + Math.random() * 0.5}s ease-in-out infinite alternate`,
                  animationDelay: `${i * 0.08}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Scan line effect */}
      <div
        className="absolute rounded-full overflow-hidden pointer-events-none"
        style={{ width: 180, height: 180, opacity: 0.15 }}
      >
        <div style={{
          position: "absolute", inset: 0,
          background: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,208,255,0.3) 3px, rgba(0,208,255,0.3) 4px)",
          animation: "scanLine 3s linear infinite",
        }} />
      </div>
    </div>
  );
}

/* ─── Status label ──────────────────────────────────────────── */
function StatusLabel({ state, transcript, aiText }: { state: VoiceState; transcript: string; aiText: string }) {
  const text =
    state === "idle" ? "Hold to speak" :
    state === "listening" ? "Listening…" :
    state === "thinking" ? "Processing…" :
    "Speaking…";

  const color =
    state === "listening" ? "#00d0ff" :
    state === "thinking" ? "#6c3bff" :
    state === "speaking" ? "#00d0ff" :
    "rgba(255,255,255,0.4)";

  return (
    <div className="flex flex-col items-center gap-3 px-6 text-center" style={{ maxWidth: 320 }}>
      <span className="font-mono text-sm tracking-widest uppercase" style={{ color }}>
        {text}
      </span>
      {transcript && state !== "idle" && (
        <p className="text-xs font-mono text-white/50 leading-relaxed line-clamp-2">
          "{transcript}"
        </p>
      )}
      {aiText && state === "speaking" && (
        <p className="text-xs font-mono text-[#00d0ff]/60 leading-relaxed line-clamp-3">
          {aiText}
        </p>
      )}
    </div>
  );
}

/* ─── Main VoiceMode component ──────────────────────────────── */
interface VoiceModeProps {
  onClose: () => void;
}

export function VoiceMode({ onClose }: VoiceModeProps) {
  const { activeConversationId, setActiveConversationId } = useAppState();
  const createConv = useCreateAnthropicConversation();

  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [aiText, setAiText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [convId, setConvId] = useState<number | null>(activeConversationId);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* Ensure we have a conversation to attach messages to */
  const ensureConversation = useCallback(async (): Promise<number> => {
    if (convId) return convId;
    const res = await createConv.mutateAsync({ data: { title: "Voice Conversation" } });
    const newId = (res as any).id as number;
    setConvId(newId);
    setActiveConversationId(newId);
    return newId;
  }, [convId, createConv, setActiveConversationId]);

  /* Stop any active audio */
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
  }, []);

  /* Speak text via TTS */
  const speakText = useCallback(async (text: string) => {
    stopAudio();
    const voiceId = getVoiceId();
    const stripped = text
      .replace(/```[\s\S]*?```/g, "code block")
      .replace(/`[^`]*`/g, "")
      .replace(/#{1,6}\s+/g, "")
      .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1")
      .replace(/\n+/g, " ")
      .trim()
      .slice(0, 3000);

    if (!stripped) return;

    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ text: stripped, voiceId }),
    });
    if (!res.ok) return;
    const buf = await res.arrayBuffer();
    const blob = new Blob([buf], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioRef.current = audio;
    setVoiceState("speaking");
    await new Promise<void>((resolve) => {
      audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      audio.play().catch(() => resolve());
    });
    setVoiceState("idle");
    setAiText("");
  }, [stopAudio]);

  /* Send transcript to AI and speak response */
  const handleTranscript = useCallback(async (text: string) => {
    if (!text.trim()) { setVoiceState("idle"); return; }
    setTranscript(text);
    setVoiceState("thinking");

    try {
      const cid = await ensureConversation();
      let sysAbout: string | null = null;
      let sysRespond: string | null = null;
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

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data:")) continue;
          try {
            const json = JSON.parse(line.slice(5));
            if (json.content) { fullText += json.content; setAiText(fullText.slice(0, 120) + (fullText.length > 120 ? "…" : "")); }
          } catch {}
        }
      }

      await speakText(fullText);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError("Something went wrong. Try again.");
      setVoiceState("idle");
    }
  }, [ensureConversation, speakText]);

  /* ── Recording ── */
  const startRecording = useCallback(async () => {
    if (voiceState !== "idle") return;
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
    } catch {
      setError("Microphone access denied.");
    }
  }, [voiceState, stopAudio]);

  const stopRecording = useCallback(async () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    mediaRecorderRef.current = null;

    await new Promise<void>((resolve) => {
      mr.onstop = async () => {
        const stream = mr.stream;
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        chunksRef.current = [];
        if (blob.size === 0) { setVoiceState("idle"); resolve(); return; }

        setVoiceState("thinking");
        try {
          const fd = new FormData();
          fd.append("audio", blob, "rec.webm");
          const res = await fetch("/api/stt", { method: "POST", credentials: "include", body: fd });
          if (!res.ok) { setVoiceState("idle"); resolve(); return; }
          const data = await res.json() as { transcript?: string };
          await handleTranscript(data.transcript || "");
        } catch {
          setVoiceState("idle");
        }
        resolve();
      };
      mr.stop();
    });
  }, [handleTranscript]);

  /* Cancel on close */
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      stopAudio();
      mediaRecorderRef.current?.stop();
    };
  }, [stopAudio]);

  /* Keyboard: Space to hold */
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === "Space" && voiceState === "idle") { e.preventDefault(); startRecording(); } };
    const up   = (e: KeyboardEvent) => { if (e.code === "Space" && voiceState === "listening") { e.preventDefault(); stopRecording(); } };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup",   up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [voiceState, startRecording, stopRecording]);

  const handleMicPress   = () => { if (voiceState === "idle") startRecording(); };
  const handleMicRelease = () => { if (voiceState === "listening") stopRecording(); };

  const micLabel =
    voiceState === "idle"      ? "Hold to Speak" :
    voiceState === "listening" ? "Release to Send" :
    voiceState === "thinking"  ? "Processing…" :
    "Speaking…";

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col items-center justify-between select-none"
      style={{ zIndex: 2000, background: "#03030a" }}
    >
      {/* Background grid */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(0,208,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,208,255,0.04) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }} />

      {/* Corner decoration lines */}
      {[["top-0 left-0","border-t border-l"],["top-0 right-0","border-t border-r"],["bottom-0 left-0","border-b border-l"],["bottom-0 right-0","border-b border-r"]].map(([pos, borders], i) => (
        <div key={i} className={`absolute ${pos} ${borders} w-8 h-8 pointer-events-none`} style={{ borderColor: "rgba(0,208,255,0.2)" }} />
      ))}

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between w-full px-6 pt-6">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#00d0ff", boxShadow: "0 0 8px #00d0ff" }} />
          <span className="font-display font-bold text-sm tracking-widest uppercase text-white/80">
            CORTEX <span style={{ color: "#00d0ff" }}>LIVE</span>
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-9 h-9 rounded-full transition-all hover:bg-white/8"
          style={{ border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <X size={16} className="text-white/60" />
        </button>
      </div>

      {/* Orb */}
      <div className="relative z-10 flex flex-col items-center gap-10 -mt-8">
        <CortexOrb state={voiceState} />
        <StatusLabel state={voiceState} transcript={transcript} aiText={aiText} />
      </div>

      {/* Error */}
      {error && (
        <div className="relative z-10 px-5 py-2 rounded-full text-xs font-mono" style={{ background: "rgba(255,46,126,0.1)", border: "1px solid rgba(255,46,126,0.3)", color: "#ff2e7e" }}>
          {error}
        </div>
      )}

      {/* Mic button */}
      <div className="relative z-10 flex flex-col items-center gap-3 pb-14">
        <button
          onPointerDown={handleMicPress}
          onPointerUp={handleMicRelease}
          onPointerLeave={handleMicRelease}
          disabled={voiceState === "thinking" || voiceState === "speaking"}
          className="relative flex items-center justify-center rounded-full transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
          style={{
            width: 76,
            height: 76,
            background:
              voiceState === "listening"
                ? "radial-gradient(circle, rgba(0,208,255,0.3) 0%, rgba(0,208,255,0.1) 100%)"
                : "rgba(255,255,255,0.05)",
            border: voiceState === "listening"
              ? "2px solid rgba(0,208,255,0.7)"
              : "2px solid rgba(255,255,255,0.12)",
            boxShadow: voiceState === "listening"
              ? "0 0 30px rgba(0,208,255,0.4), 0 0 60px rgba(0,208,255,0.15)"
              : "none",
          }}
        >
          {voiceState === "thinking" ? (
            <Loader2 size={28} className="text-[#6c3bff] animate-spin" />
          ) : voiceState === "listening" ? (
            <MicOff size={28} className="text-[#00d0ff]" />
          ) : (
            <Mic size={28} className="text-white/70" />
          )}
          {voiceState === "listening" && (
            <span className="absolute inset-[-4px] rounded-full border border-[#00d0ff]/40 animate-ping" />
          )}
        </button>
        <span className="text-[11px] font-mono tracking-wider" style={{ color: voiceState === "listening" ? "#00d0ff" : "rgba(255,255,255,0.3)" }}>
          {micLabel}
        </span>
        <span className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.2)" }}>
          or hold Space
        </span>
      </div>

      {/* CSS keyframes */}
      <style>{`
        @keyframes orbBreath   { 0%,100%{transform:scale(1);opacity:.9} 50%{transform:scale(1.04);opacity:1} }
        @keyframes orbPulse    { 0%,100%{transform:scale(1);opacity:.7} 50%{transform:scale(1.07);opacity:1} }
        @keyframes orbRingExpand { 0%{transform:scale(0.85);opacity:.8} 100%{transform:scale(1.25);opacity:0} }
        @keyframes orbSpin     { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes orbCoreIdle { 0%,100%{transform:scale(1)} 50%{transform:scale(1.03)} }
        @keyframes orbCorePulse { 0%,100%{transform:scale(0.95)} 50%{transform:scale(1.06)} }
        @keyframes orbCoreSpeak { 0%,100%{transform:scale(0.97)} 50%{transform:scale(1.05)} }
        @keyframes orbCoreThink { 0%,100%{transform:scale(1) rotate(0deg)} 50%{transform:scale(0.98) rotate(4deg)} }
        @keyframes audioBar    { from{transform:scaleY(0.3)} to{transform:scaleY(1)} }
        @keyframes scanLine    { from{transform:translateY(-100%)} to{transform:translateY(200%)} }
      `}</style>
    </div>,
    document.body
  );
}
