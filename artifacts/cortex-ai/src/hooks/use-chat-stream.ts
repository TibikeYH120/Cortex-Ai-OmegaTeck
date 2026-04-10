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
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);

  // RAF-based throttle: accumulate text between frames so React only
  // re-renders at most once per animation frame (~60fps) instead of
  // once per SSE chunk (potentially hundreds per second).
  const pendingTextRef = useRef<string>("");
  const rafIdRef = useRef<number | null>(null);

  const flushPending = useCallback(() => {
    setStreamingContent(pendingTextRef.current);
    rafIdRef.current = null;
  }, []);

  const scheduleStreamUpdate = useCallback((text: string) => {
    pendingTextRef.current = text;
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(flushPending);
    }
  }, [flushPending]);

  const cancelPendingFlush = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    pendingTextRef.current = "";
  }, []);

  const sendMessage = async (content: string, overrideConvId?: number, imageAttachment?: string) => {
    const targetId = overrideConvId || conversationId;
    if (!targetId) {
      onError?.("No active conversation.");
      return;
    }

    setIsStreaming(true);
    setStreamingContent("");
    setIsSearching(false);
    pendingTextRef.current = "";
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
                if (isSearching) setIsSearching(false);
                fullText += data.content;
                scheduleStreamUpdate(fullText);
              }
            } catch (err) {
              console.error("SSE parse error", err, line);
            }
          }
        }
      }

      cancelPendingFlush();
      setIsStreaming(false);
      setIsSearching(false);
      setStreamingContent("");

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

      onFinished?.(fullText, usedSearch, sources);

      queryClient.invalidateQueries({ queryKey: getGetAnthropicConversationQueryKey(targetId) });
      queryClient.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });

    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Stream error:", err);
        onError?.(err.message || "Error during generation.");
      }
    } finally {
      cancelPendingFlush();
      setIsStreaming(false);
      setIsSearching(false);
      setStreamingContent("");
    }
  };

  const stopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      cancelPendingFlush();
      setIsStreaming(false);
      setIsSearching(false);
      setStreamingContent("");
    }
  };

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      cancelPendingFlush();
    };
  }, [cancelPendingFlush]);

  return { sendMessage, isStreaming, streamingContent, stopStream, isGeneratingImage, isSearching };
}
