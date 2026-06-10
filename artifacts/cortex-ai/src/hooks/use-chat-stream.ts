import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetAnthropicConversationQueryKey, getListAnthropicConversationsQueryKey } from "@workspace/api-client-react";

const IMAGE_PATTERN = /\[GENERATE_IMAGE:\s*([\s\S]+?)\]/;

// Large-output threshold: above this char count we skip the typewriter and
// show content live during generation instead of buffering silently.
const LIVE_STREAM_THRESHOLD = 2000;

export interface WebSearchSource {
  url: string;
  title: string;
}

interface UseChatStreamProps {
  conversationId: number | null;
  onFinished?: (fullContent: string, usedSearch: boolean, sources: WebSearchSource[]) => void;
  onImageGenerated?: (imageData: string, prompt: string) => void;
  onError?: (err: string) => void;
}

export function useChatStream({ conversationId, onFinished, onImageGenerated, onError }: UseChatStreamProps) {
  // Phase 1: server is actively streaming
  const [isGenerating, setIsGenerating] = useState(false);
  // Phase 2: typewriter animation (only for small outputs)
  const [isTypewriting, setIsTypewriting] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  // Live char counter shown during silent buffering (small outputs only)
  const [generatingCharCount, setGeneratingCharCount] = useState(0);
  // Daily limit tracking — updated after every successful message
  const [dailyRemaining, setDailyRemaining] = useState<number | null>(null);
  const [dailyResetAt, setDailyResetAt] = useState<string | null>(null);

  const charCountRef = useRef(0);
  const charCountIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSearchingRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  // RAF handle for live streaming display (large outputs)
  const liveRafRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // Mutable snapshot of accumulated text, read inside RAF callbacks
  const fullTextRef = useRef("");
  const queryClient = useQueryClient();

  const isStreaming = isGenerating || isTypewriting;

  const cancelAnimation = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (liveRafRef.current !== null) {
      cancelAnimationFrame(liveRafRef.current);
      liveRafRef.current = null;
    }
  }, []);

  const startTypewriter = useCallback((text: string, onDone: () => void) => {
    if (!text) {
      onDone();
      return;
    }
    setIsTypewriting(true);
    let i = 0;
    // Adaptive speed: max ~3 seconds (180 frames at 60 fps), minimum 3 chars/frame
    const CHARS_PER_FRAME = Math.max(3, Math.ceil(text.length / 180));

    const tick = () => {
      i += CHARS_PER_FRAME;
      if (i >= text.length) {
        setStreamingContent(text);
        setIsTypewriting(false);
        rafIdRef.current = null;
        onDone();
        return;
      }
      setStreamingContent(text.slice(0, i));
      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);
  }, []);

  // Schedule a live RAF update for large-output streaming
  const scheduleLiveUpdate = useCallback(() => {
    if (liveRafRef.current !== null) return; // RAF already pending
    liveRafRef.current = requestAnimationFrame(() => {
      setStreamingContent(fullTextRef.current);
      liveRafRef.current = null;
    });
  }, []);

  const sendMessage = async (content: string, overrideConvId?: number, imageAttachments?: string[]) => {
    const targetId = overrideConvId || conversationId;
    if (!targetId) {
      onError?.("No active conversation.");
      return;
    }

    cancelAnimation();
    setIsGenerating(true);
    setIsTypewriting(false);
    setStreamingContent("");
    setIsSearching(false);
    isSearchingRef.current = false;
    charCountRef.current = 0;
    fullTextRef.current = "";
    setGeneratingCharCount(0);

    // Char-count ticker — visible only for small outputs while buffering silently
    charCountIntervalRef.current = setInterval(() => {
      setGeneratingCharCount(charCountRef.current);
    }, 500);

    let fullText = "";
    let usedSearch = false;
    let sources: WebSearchSource[] = [];

    abortControllerRef.current = new AbortController();

    let systemAbout: string | null = null;
    let systemRespond: string | null = null;
    let cortexModel: string | null = null;
    try {
      systemAbout = localStorage.getItem("cortex_sys_about");
      systemRespond = localStorage.getItem("cortex_sys_respond");
      cortexModel = localStorage.getItem("cortex_model");
    } catch {}

    try {
      const response = await fetch(`/api/anthropic/conversations/${targetId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content, imageAttachments, systemAbout, systemRespond, cortexModel }),
        signal: abortControllerRef.current.signal,
      });

      if (response.status === 429) {
        const errData = await response.json().catch(() => ({}));
        const resetAt: string | undefined = errData.resetAt;
        let resetMsg = "";
        if (resetAt) {
          const resetDate = new Date(resetAt);
          resetMsg = ` Visszaáll ${resetDate.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}-kor.`;
        }
        throw new Error((errData.message || "Elérted a napi üzenetkorlátot.") + resetMsg + " Válts Cortex Plus-ra a korlátlan használathoz!");
      }
      if (!response.ok) throw new Error("Network error while sending message.");
      if (!response.body) throw new Error("Empty response from server.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim().startsWith("data: ")) {
            try {
              const dataStr = line.replace("data: ", "").trim();
              if (!dataStr) continue;

              const data = JSON.parse(dataStr);

              if (data.searching) {
                isSearchingRef.current = true;
                setIsSearching(true);
                continue;
              }

              if (data.sources) {
                sources = data.sources;
                continue;
              }

              // Auto-continuation from backend: keep generating state, no extra UI needed
              if (data.continuing) {
                continue;
              }

              if (data.done) {
                usedSearch = data.usedSearch ?? false;
                if (typeof data.remaining === "number") setDailyRemaining(data.remaining);
                if (typeof data.resetAt === "string") setDailyResetAt(data.resetAt);
                break;
              }

              if (data.content) {
                if (isSearchingRef.current) {
                  isSearchingRef.current = false;
                  setIsSearching(false);
                }
                fullText += data.content;
                charCountRef.current = fullText.length;
                fullTextRef.current = fullText;

                // For large outputs: update the display live via RAF throttle
                if (fullText.length > LIVE_STREAM_THRESHOLD) {
                  scheduleLiveUpdate();
                }
              }
            } catch (err) {
              console.error("SSE parse error", err, line);
            }
          }
        }
      }

      // Phase 1 done — server finished generating
      if (charCountIntervalRef.current !== null) {
        clearInterval(charCountIntervalRef.current);
        charCountIntervalRef.current = null;
      }
      // Flush any pending live RAF before switching state
      if (liveRafRef.current !== null) {
        cancelAnimationFrame(liveRafRef.current);
        liveRafRef.current = null;
      }
      setGeneratingCharCount(0);
      setIsGenerating(false);
      isSearchingRef.current = false;
      setIsSearching(false);

      const imageMatch = fullText.match(IMAGE_PATTERN);
      if (imageMatch) {
        const imagePrompt = imageMatch[1].trim();
        setIsGeneratingImage(true);
        try {
          const imgRes = await fetch("/api/image/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ prompt: imagePrompt }),
          });
          if (!imgRes.ok) throw new Error("Image generation failed");
          const { imageData } = await imgRes.json();
          onImageGenerated?.(imageData, imagePrompt);
        } catch (imgErr: any) {
          onError?.("Image generation failed: " + imgErr.message);
        } finally {
          setIsGeneratingImage(false);
        }
        queryClient.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
        return;
      }

      const finalize = () => {
        setStreamingContent("");
        onFinished?.(fullText, usedSearch, sources);
        queryClient.invalidateQueries({ queryKey: getGetAnthropicConversationQueryKey(targetId) });
        queryClient.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
      };

      if (fullText.length > LIVE_STREAM_THRESHOLD) {
        // Large output: content was already shown live during streaming.
        // Ensure the final state is set, then commit the message after a brief
        // layout tick so the transition from streaming bubble → permanent bubble
        // happens cleanly.
        setStreamingContent(fullText);
        setTimeout(finalize, 80);
      } else {
        // Small output: classic typewriter animation
        startTypewriter(fullText, finalize);
      }

    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Stream error:", err);
        onError?.(err.message || "Error during generation.");
      }
      cancelAnimation();
      setIsTypewriting(false);
      setStreamingContent("");
    } finally {
      if (charCountIntervalRef.current !== null) {
        clearInterval(charCountIntervalRef.current);
        charCountIntervalRef.current = null;
      }
      if (liveRafRef.current !== null) {
        cancelAnimationFrame(liveRafRef.current);
        liveRafRef.current = null;
      }
      setGeneratingCharCount(0);
      setIsGenerating(false);
      isSearchingRef.current = false;
      setIsSearching(false);
    }
  };

  const stopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (charCountIntervalRef.current !== null) {
      clearInterval(charCountIntervalRef.current);
      charCountIntervalRef.current = null;
    }
    cancelAnimation();
    setIsGenerating(false);
    setIsTypewriting(false);
    isSearchingRef.current = false;
    setIsSearching(false);
    setStreamingContent("");
    setGeneratingCharCount(0);
  };

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (charCountIntervalRef.current !== null) {
        clearInterval(charCountIntervalRef.current);
        charCountIntervalRef.current = null;
      }
      cancelAnimation();
    };
  }, [cancelAnimation]);

  return {
    sendMessage,
    isStreaming,
    isGenerating,
    streamingContent,
    stopStream,
    isGeneratingImage,
    isSearching,
    generatingCharCount,
    dailyRemaining,
    dailyResetAt,
  };
}
