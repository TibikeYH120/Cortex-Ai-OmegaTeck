import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetAnthropicConversationQueryKey, getListAnthropicConversationsQueryKey } from "@workspace/api-client-react";

interface UseChatStreamProps {
  conversationId: number | null;
  onFinished?: () => void;
  onError?: (err: string) => void;
}

export function useChatStream({ conversationId, onFinished, onError }: UseChatStreamProps) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = async (content: string, overrideConvId?: number) => {
    const targetId = overrideConvId || conversationId;
    if (!targetId) {
      onError?.("Nincs aktív beszélgetés.");
      return;
    }

    setIsStreaming(true);
    setStreamingContent("");
    
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch(`/api/anthropic/conversations/${targetId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error("Hálózati hiba történt a küldés során.");
      }

      if (!response.body) throw new Error("Üres válasz a szervertől.");

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
              
              if (data.done) {
                break;
              }
              if (data.content) {
                setStreamingContent((prev) => prev + data.content);
              }
            } catch (err) {
              console.error("SSE parse error", err, line);
            }
          }
        }
      }
      
      // Refresh queries to sync persistent state
      queryClient.invalidateQueries({ queryKey: getGetAnthropicConversationQueryKey(targetId) });
      queryClient.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
      
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Stream error:", err);
        onError?.(err.message || "Hiba a generálás során.");
      }
    } finally {
      setIsStreaming(false);
      onFinished?.();
    }
  };

  const stopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
      onFinished?.();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { sendMessage, isStreaming, streamingContent, stopStream };
}
