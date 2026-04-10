import { useState, useRef, useCallback, useEffect } from "react";

export const VOICE_OPTIONS = [
  { id: "nova", label: "Nova", desc: "Warm & clear", color: "#00d0ff" },
  { id: "aria", label: "Aria", desc: "Bright & expressive", color: "#6c3bff" },
  { id: "echo", label: "Echo", desc: "Calm & measured", color: "#ff2e7e" },
  { id: "orion", label: "Orion", desc: "Deep & confident", color: "#00ff88" },
] as const;

export type VoiceId = (typeof VOICE_OPTIONS)[number]["id"];

const VOICE_STORAGE_KEY = "cortex_voice_id";
const AUTO_READ_STORAGE_KEY = "cortex_voice_auto_read";

function getStoredVoiceId(): VoiceId {
  try {
    const v = localStorage.getItem(VOICE_STORAGE_KEY);
    if (v && VOICE_OPTIONS.some(o => o.id === v)) return v as VoiceId;
  } catch {}
  return "nova";
}

function getStoredAutoRead(): boolean {
  try {
    return localStorage.getItem(AUTO_READ_STORAGE_KEY) === "true";
  } catch {}
  return false;
}

export interface UseVoiceReturn {
  speak: (text: string, messageId: string | number) => void;
  stopSpeaking: () => void;
  isPlaying: boolean;
  isLoadingAudio: boolean;
  activeMessageId: string | number | null;
  preferredVoiceId: VoiceId;
  setPreferredVoiceId: (id: VoiceId) => void;
  autoRead: boolean;
  setAutoRead: (v: boolean) => void;
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string>;
  recordingError: string | null;
}

export function useVoice(): UseVoiceReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<string | number | null>(null);
  const [preferredVoiceId, setPreferredVoiceIdState] = useState<VoiceId>(getStoredVoiceId);
  const [autoRead, setAutoReadState] = useState<boolean>(getStoredAutoRead);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const stopSpeaking = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setIsPlaying(false);
    setIsLoadingAudio(false);
    setActiveMessageId(null);
  }, []);

  const speak = useCallback((text: string, messageId: string | number) => {
    if (activeMessageId === messageId && (isPlaying || isLoadingAudio)) {
      stopSpeaking();
      return;
    }
    stopSpeaking();

    const stripped = text
      .replace(/```[\s\S]*?```/g, " code block ")
      .replace(/`[^`]*`/g, "")
      .replace(/!\[.*?\]\(.*?\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/#{1,6}\s+/g, "")
      .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1")
      .replace(/>\s+/g, "")
      .replace(/[-*+]\s+/g, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .trim()
      .slice(0, 4000);

    if (!stripped) return;

    setActiveMessageId(messageId);
    setIsLoadingAudio(true);
    setIsPlaying(false);

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ text: stripped, voiceId: preferredVoiceId }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error("TTS request failed");
        if (!res.body) throw new Error("Empty TTS response");

        const arrayBuffer = await res.arrayBuffer();
        const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);

        if (controller.signal.aborted) {
          URL.revokeObjectURL(url);
          return;
        }

        const audio = new Audio(url);
        audioRef.current = audio;
        setIsLoadingAudio(false);
        setIsPlaying(true);

        audio.onended = () => {
          URL.revokeObjectURL(url);
          setIsPlaying(false);
          setActiveMessageId(null);
          audioRef.current = null;
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          setIsPlaying(false);
          setIsLoadingAudio(false);
          setActiveMessageId(null);
          audioRef.current = null;
        };

        await audio.play();
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setIsPlaying(false);
        setIsLoadingAudio(false);
        setActiveMessageId(null);
      }
    })();
  }, [activeMessageId, isPlaying, isLoadingAudio, preferredVoiceId, stopSpeaking]);

  const setPreferredVoiceId = useCallback((id: VoiceId) => {
    setPreferredVoiceIdState(id);
    try { localStorage.setItem(VOICE_STORAGE_KEY, id); } catch {}
  }, []);

  const setAutoRead = useCallback((v: boolean) => {
    setAutoReadState(v);
    try { localStorage.setItem(AUTO_READ_STORAGE_KEY, String(v)); } catch {}
  }, []);

  const startRecording = useCallback(async () => {
    setRecordingError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.start(250);
      setIsRecording(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Microphone access denied";
      setRecordingError(msg);
      setIsRecording(false);
    }
  }, []);

  const stopRecording = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      const mr = mediaRecorderRef.current;
      if (!mr) {
        setIsRecording(false);
        resolve("");
        return;
      }

      mr.onstop = async () => {
        const stream = mr.stream;
        stream.getTracks().forEach(t => t.stop());
        mediaRecorderRef.current = null;
        setIsRecording(false);

        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        chunksRef.current = [];

        if (blob.size === 0) { resolve(""); return; }

        try {
          const formData = new FormData();
          formData.append("audio", blob, "recording.webm");

          const res = await fetch("/api/stt", {
            method: "POST",
            credentials: "include",
            body: formData,
          });

          if (!res.ok) { resolve(""); return; }
          const data = await res.json() as { transcript?: string };
          resolve(data.transcript || "");
        } catch (err) {
          reject(err);
        }
      };

      mr.stop();
    });
  }, []);

  useEffect(() => {
    return () => {
      stopSpeaking();
      if (mediaRecorderRef.current) {
        try { mediaRecorderRef.current.stop(); } catch {}
        mediaRecorderRef.current = null;
      }
    };
  }, [stopSpeaking]);

  return {
    speak,
    stopSpeaking,
    isPlaying,
    isLoadingAudio,
    activeMessageId,
    preferredVoiceId,
    setPreferredVoiceId,
    autoRead,
    setAutoRead,
    isRecording,
    startRecording,
    stopRecording,
    recordingError,
  };
}
