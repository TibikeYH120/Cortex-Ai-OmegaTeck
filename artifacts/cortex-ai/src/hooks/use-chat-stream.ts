import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetAnthropicConversationQueryKey, getListAnthropicConversationsQueryKey } from "@workspace/api-client-react";

const IMAGE_PATTERN = /\[GENERATE_IMAGE:\s*([\s\S]+?)\]/;

interface UseChatStreamProps {
  conversationId: number | null;
  onFinished?: (fullContent: string) => void;
  onImageGenerated?: (imageData: string, prompt: string) => void;
  onError?: (err: string) => void;
}

export function useChatStream({ conversationId, onFinished, onImageGenerated, onError }: UseChatStreamProps) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = async (content: string, overrideConvId?: number, imageAttachment?: string) => {
    const targetId = overrideConvId || conversationId;
    if (!targetId) {
      onError?.("No active conversation.");
      return;
    }

    setIsStreaming(true);
    setStreamingContent("");
    let fullText = "";

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
              if (data.done) break;
              if (data.content) {
                fullText += data.content;
                setStreamingContent(fullText);
              }
            } catch (err) {
              console.error("SSE parse error", err, line);
            }
          }
        }
      }

      setIsStreaming(false);
      setStreamingContent("");

      // Check if Claude wants to generate an image
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

        // Only refresh the sidebar list, not the conversation detail.
        // Refreshing the detail would overwrite local image messages with stale server data,
        // because generated images are intentionally not persisted in the DB (they are ephemeral).
        queryClient.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });
        return;
      }

      onFinished?.(fullText);

      queryClient.invalidateQueries({ queryKey: getGetAnthropicConversationQueryKey(targetId) });
      queryClient.invalidateQueries({ queryKey: getListAnthropicConversationsQueryKey() });

    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Stream error:", err);
        onError?.(err.message || "Error during generation.");
      }
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
    }
  };

  const stopStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
      setStreamingContent("");
    }
  };

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { sendMessage, isStreaming, streamingContent, stopStream, isGeneratingImage };
}
