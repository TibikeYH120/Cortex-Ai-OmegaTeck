import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetAnthropicConversationQueryKey, getListAnthropicConversationsQueryKey } from "@workspace/api-client-react";

const IMAGE_PATTERN = /\[GENERATE_IMAGE:\s*([\s\S]+?)\]/;

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
  // Phase 1: server is actively streaming (we buffer silently — no text visible)
  const [isGenerating, setIsGenerating] = useState(false);
  // Phase 2: typewriter animation is playing (streamingContent fills smoothly)
  const [isTypewriting, setIsTypewriting] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  // Live char counter shown during the silent buffering phase
  const [generatingCharCount, setGeneratingCharCount] = useState(0);
  const charCountRef = useRef(0);
  const charCountIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSearchingRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  // isStreaming covers both phases for backward compat with ChatArea
  const isStreaming = isGenerating || isTypewriting;

  const cancelAnimation = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
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

  const sendMessage = async (content: string, overrideConvId?: number, imageAttachment?: string) => {
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
    setGeneratingCharCount(0);
    charCountIntervalRef.current = setInterval(() => {
      setGeneratingCharCount(charCountRef.current);
    }, 500);
    let fullText = "";
    let usedSearch = false;
    let sources: WebSearchSource[] = [];

    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`/api/anthropic/conversations/${targetId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content, imageAttachment }),
        signal: abortControllerRef.current.signal,
      });

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

              if (data.done) {
                usedSearch = data.usedSearch ?? false;
                break;
              }

              if (data.content) {
                if (isSearchingRef.current) {
                  isSearchingRef.current = false;
                  setIsSearching(false);
                }
                // Buffer silently — no state update during generation phase
                fullText += data.content;
                charCountRef.current = fullText.length;
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

      // Phase 2: typewriter animation — fires onFinished when the animation completes
      startTypewriter(fullText, () => {
        setStreamingContent("");
        onFinished?.(fullText, usedSearch, sources);
        queryClient.invalidateQueries({ queryKey: getGetAnthropicConversationQueryKey(targetId) });
        queryClient.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
      });

    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Stream error:", err);
        onError?.(err.message || "Error during generation.");
      }
      cancelAnimation();
      setIsTypewriting(false);
      setStreamingContent("");
    } finally {
      // Always clear the char-count interval on exit (success, abort, or error).
      if (charCountIntervalRef.current !== null) {
        clearInterval(charCountIntervalRef.current);
        charCountIntervalRef.current = null;
      }
      setGeneratingCharCount(0);
      setIsGenerating(false);
      isSearchingRef.current = false;
      setIsSearching(false);
      // NOTE: intentionally do NOT reset isTypewriting/streamingContent here —
      // the typewriter animation runs after this finally block and manages its own state.
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
  };
}
