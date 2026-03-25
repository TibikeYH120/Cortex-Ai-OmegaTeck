import { useState, useRef, useEffect } from "react";
import { useAppState } from "@/hooks/use-app-state";
import { useCreateAnthropicConversation, useGetAnthropicConversation } from "@workspace/api-client-react";
import { useChatStream } from "@/hooks/use-chat-stream";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { Send, Menu, Plus, StopCircle, Copy, Check, RotateCcw, Paperclip, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, formatDate } from "@/lib/utils";
import { UserAvatar, CortexAvatar } from "./AvatarUtils";

const IMAGE_GEN_PATTERN = /\[GENERATE_IMAGE:\s*[\s\S]+?\]/;

function filterServerMessages(msgs: any[]): any[] {
  return msgs.filter(m => {
    if (m.role === "assistant" && IMAGE_GEN_PATTERN.test(m.content)) return false;
    return true;
  });
}

export function ChatArea() {
  const { user, isGuest, activeConversationId, setActiveConversationId, setSidebarOpen } = useAppState();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [localMessages, setLocalMessages] = useState<any[]>([]);
  const [lastUserMessage, setLastUserMessage] = useState<string>("");
  const [imageAttachment, setImageAttachment] = useState<string | null>(null);
  const [imageAttachmentName, setImageAttachmentName] = useState<string>("");
  const isGeneratingImageRef = useRef(false);

  const { data: activeConversation } = useGetAnthropicConversation(activeConversationId!, {
    query: { enabled: !!activeConversationId && !isGuest }
  });

  const createMutation = useCreateAnthropicConversation();

  const { sendMessage, isStreaming, streamingContent, stopStream, isGeneratingImage } = useChatStream({
    conversationId: activeConversationId,
    onFinished: (fullContent) => {
      if (fullContent) {
        setLocalMessages(prev => [...prev, {
          id: Date.now(),
          role: "assistant",
          content: fullContent,
          createdAt: new Date().toISOString()
        }]);
      }
      setTimeout(() => textareaRef.current?.focus(), 100);
    },
    onImageGenerated: (imageData, prompt) => {
      setLocalMessages(prev => [...prev, {
        id: Date.now(),
        role: "assistant",
        content: prompt,
        type: "image",
        imageData,
        createdAt: new Date().toISOString()
      }]);
      setTimeout(() => textareaRef.current?.focus(), 100);
    },
    onError: (err) => {
      setLocalMessages(prev => [...prev, {
        id: Date.now(),
        role: "assistant",
        content: `⚠ CORTEX CONNECTION ERROR — ${err}`,
        createdAt: new Date().toISOString()
      }]);
    }
  });

  // Keep ref in sync without adding isGeneratingImage to the server-sync effect dependencies.
  // This prevents the sync effect from re-triggering when image generation finishes,
  // which would overwrite the just-added local image message with stale server data.
  useEffect(() => {
    isGeneratingImageRef.current = isGeneratingImage;
  }, [isGeneratingImage]);

  useEffect(() => {
    if (activeConversationId && activeConversation && !isStreaming) {
      // Skip sync while image generation is in progress (ref avoids effect re-trigger on change)
      if (isGeneratingImageRef.current) return;
      const serverMsgs = filterServerMessages(activeConversation.messages || []);
      // Merge server messages with local state, preserving ephemeral fields (e.g. imageAttachment).
      // Strategy: match by DB id first, then by role + content + timestamp proximity (≤10s).
      // usedLocalIds prevents the same local attachment binding to multiple server messages.
      setLocalMessages(prev => {
        const usedLocalIds = new Set<number | string>();
        return serverMsgs.map(serverMsg => {
          const serverTime = new Date(serverMsg.createdAt).getTime();
          const localMatch = prev.find(m => {
            if (usedLocalIds.has(m.id)) return false;
            if (m.id === serverMsg.id) return true;
            if (m.role !== serverMsg.role || m.content !== serverMsg.content) return false;
            const localTime = new Date(m.createdAt).getTime();
            return Math.abs(serverTime - localTime) < 10_000;
          });
          if (localMatch) usedLocalIds.add(localMatch.id);
          if (localMatch?.imageAttachment) {
            return { ...serverMsg, imageAttachment: localMatch.imageAttachment };
          }
          return serverMsg;
        });
      });
    } else if (!activeConversationId) {
      setLocalMessages([]);
    }
  }, [activeConversation, activeConversationId, isStreaming]);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [localMessages, streamingContent]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImageAttachment(ev.target?.result as string);
      setImageAttachmentName(file.name);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const clearAttachment = () => {
    setImageAttachment(null);
    setImageAttachmentName("");
  };

  const handleSend = async (overrideContent?: string) => {
    const content = (overrideContent || input).trim();
    if ((!content && !imageAttachment) || isStreaming || isGeneratingImage) return;

    if (!overrideContent) {
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    }

    const attachmentToSend = imageAttachment;
    clearAttachment();

    setLastUserMessage(content);

    const tempUserMsg = {
      id: Date.now(),
      role: "user",
      content,
      imageAttachment: attachmentToSend,
      createdAt: new Date().toISOString()
    };
    setLocalMessages(prev => [...prev, tempUserMsg]);

    try {
      let targetConvId = activeConversationId;

      if (!targetConvId) {
        if (isGuest) {
          targetConvId = Date.now();
          setActiveConversationId(targetConvId);
        } else {
          const title = content.length > 50 ? content.slice(0, 50) + "..." : content || "Image conversation";
          const newConv = await createMutation.mutateAsync({ data: { title } });
          targetConvId = newConv.id;
          setActiveConversationId(targetConvId);
        }
      }

      if (isGuest) {
        setTimeout(() => {
          setLocalMessages(prev => [...prev, {
            id: Date.now() + 1,
            role: "assistant",
            content: "You're in guest mode with limited access. Sign up to unlock the full CORTEX AI experience!\n\nAfter registering you get:\n- Unlimited AI messages\n- Saved conversation history\n- Personalized experience",
            createdAt: new Date().toISOString()
          }]);
        }, 800);
        return;
      }

      await sendMessage(content, targetConvId, attachmentToSend || undefined);

    } catch (err: any) {
      console.error(err);
    }
  };

  const handleRegenerate = () => {
    if (!lastUserMessage || isStreaming) return;
    setLocalMessages(prev => {
      const lastAiIdx = [...prev].reverse().findIndex(m => m.role === "assistant");
      if (lastAiIdx === -1) return prev;
      const actualIdx = prev.length - 1 - lastAiIdx;
      return prev.slice(0, actualIdx);
    });
    setTimeout(() => handleSend(lastUserMessage), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
    setInput(e.target.value);
  };

  const suggestionCards = [
    { icon: "⚛️", title: "React component", sub: "Help me build one", prompt: "Help me write a React component with TypeScript" },
    { icon: "🎮", title: "Game Design Doc", sub: "Design a new game", prompt: "Write a game design document for an indie game" },
    { icon: "🌐", title: "Three.js basics", sub: "3D web development", prompt: "Explain Three.js fundamentals for a beginner" },
    { icon: "✦", title: "Landing page", sub: "OmegaTeck style", prompt: "Design a modern cyberpunk-style landing page" }
  ];

  const showWelcome = !activeConversationId && localMessages.length === 0;

  return (
    <main className="flex-1 flex flex-col h-[100dvh] relative bg-black/40 backdrop-blur-[2px] overflow-hidden">
      {/* Top Bar */}
      <header className="h-16 border-b border-border bg-black/50 backdrop-blur-md flex items-center justify-between px-4 lg:px-8 shrink-0 relative z-10">
        <div className="flex items-center gap-4">
          <button className="md:hidden text-muted hover:text-white transition-colors" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="font-display font-bold text-sm tracking-wide text-white flex items-center gap-2">
            {activeConversation ? (
              <span className="truncate max-w-[200px] md:max-w-md">{activeConversation.title}</span>
            ) : (
              <span>New <span className="text-primary">chat</span></span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#00ff88]/20 bg-[#00ff88]/5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00ff88] shadow-[0_0_8px_#00ff88] animate-pulse" />
            <span className="font-mono text-[10px] text-[#00ff88] tracking-widest font-semibold uppercase">Online</span>
          </div>
          <button
            onClick={() => { setActiveConversationId(null); setLocalMessages([]); }}
            className="w-9 h-9 rounded-xl bg-s2 border border-border flex items-center justify-center text-muted hover:text-primary hover:border-border2 transition-all"
            title="New chat"
          >
            <Plus size={18} />
          </button>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto scroll-smooth relative z-0">
        <div className="max-w-3xl mx-auto px-4 py-8 lg:py-12 flex flex-col gap-6">

          <AnimatePresence mode="wait">
            {showWelcome ? (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="flex flex-col items-center justify-center min-h-[60vh] text-center pt-10"
              >
                <div className="relative w-[100px] h-[100px] mb-8">
                  <svg viewBox="0 0 90 90" fill="none" className="w-full h-full animate-[spin_25s_linear_infinite] drop-shadow-[0_0_24px_rgba(0,208,255,0.5)]">
                    <circle cx="45" cy="45" r="42" stroke="#00d0ff" strokeWidth="1" strokeDasharray="6 3" />
                    <circle cx="45" cy="45" r="32" stroke="#6c3bff" strokeWidth="1" strokeDasharray="4 4" />
                    <circle cx="45" cy="45" r="20" stroke="#00d0ff" strokeWidth="1.5" opacity=".6" />
                    <circle cx="45" cy="45" r="7" fill="#00d0ff" opacity=".8" />
                    <circle cx="45" cy="45" r="3.5" fill="white" />
                    <line x1="45" y1="3" x2="45" y2="13" stroke="#00d0ff" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="45" y1="77" x2="45" y2="87" stroke="#00d0ff" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="3" y1="45" x2="13" y2="45" stroke="#00d0ff" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="77" y1="45" x2="87" y2="45" stroke="#00d0ff" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="font-mono text-[11px] text-muted tracking-[3px] uppercase mb-4">Cortex AI — OmegaTeck</div>
                <h1 className="text-3xl lg:text-4xl font-bold leading-tight mb-4">
                  Hi, <span className="text-primary text-glow">{user?.name?.split(" ")[0] || "there"}</span>!<br />How can I help?
                </h1>
                <p className="text-muted text-sm lg:text-base max-w-md font-light mb-10">
                  Ask me anything — coding, game design, web development, creative ideas.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                  {suggestionCards.map((card, i) => (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.07 }}
                      onClick={() => { setInput(card.prompt); textareaRef.current?.focus(); }}
                      className="flex flex-col text-left p-4 rounded-xl bg-s2 border border-border hover:border-border2 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/50 transition-all group"
                    >
                      <span className="text-xl mb-2 grayscale group-hover:grayscale-0 transition-all">{card.icon}</span>
                      <span className="text-sm font-semibold text-white mb-1">{card.title}</span>
                      <span className="text-[11px] text-muted font-light">{card.sub}</span>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div key="messages" className="flex flex-col gap-6">
                {localMessages.map((msg, i) => (
                  <MessageBubble key={msg.id || i} message={msg} user={user} />
                ))}

                {isStreaming && (
                  <MessageBubble
                    message={{ role: "assistant", content: streamingContent || "", createdAt: new Date().toISOString() }}
                    user={user}
                    isTyping={!streamingContent}
                    isStreaming
                  />
                )}

                {isGeneratingImage && (
                  <MessageBubble
                    message={{ role: "assistant", content: "", createdAt: new Date().toISOString() }}
                    user={user}
                    isGeneratingImage
                  />
                )}

                <div ref={messagesEndRef} className="h-4" />
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>

      {/* Regenerate / Stop row */}
      <AnimatePresence>
        {(isStreaming || (localMessages.length > 0 && localMessages[localMessages.length - 1]?.role === "assistant")) && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="flex justify-center pb-2 shrink-0 z-10"
          >
            {isStreaming ? (
              <button
                onClick={stopStream}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono text-muted hover:text-white hover:bg-s2 border border-border hover:border-border2 transition-all"
              >
                <StopCircle size={14} className="text-destructive" />
                Stop
              </button>
            ) : (
              <button
                onClick={handleRegenerate}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono text-muted hover:text-white hover:bg-s2 border border-border hover:border-border2 transition-all"
              >
                <RotateCcw size={13} />
                Regenerate
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Area */}
      <div className="p-4 lg:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-border bg-black/60 backdrop-blur-xl shrink-0 z-10">
        <div className="max-w-3xl mx-auto">

          {/* Image attachment preview */}
          <AnimatePresence>
            {imageAttachment && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: "auto", marginBottom: 8 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 p-2 bg-s2 border border-border rounded-xl">
                  <img
                    src={imageAttachment}
                    alt="attachment"
                    className="w-14 h-14 object-cover rounded-lg border border-border shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[10px] text-primary tracking-widest uppercase mb-0.5">Image attached</div>
                    <div className="text-xs text-muted truncate">{imageAttachmentName}</div>
                  </div>
                  <button
                    onClick={clearAttachment}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-white hover:bg-white/10 transition-all shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative flex items-end bg-s2 border border-border rounded-2xl overflow-hidden focus-within:border-border2 focus-within:shadow-[0_0_0_3px_rgba(0,208,255,0.05),_0_0_20px_rgba(0,208,255,0.08)] transition-all">
            {/* Paperclip button */}
            <div className="p-2 pl-3 shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isStreaming || isGeneratingImage}
                title="Attach image"
                className="w-9 h-9 flex items-center justify-center rounded-xl text-muted hover:text-primary hover:bg-white/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Paperclip size={18} />
              </button>
            </div>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Message Cortex AI..."
              disabled={isStreaming}
              className="w-full bg-transparent border-none outline-none text-foreground text-sm resize-none py-4 px-2 max-h-[180px] min-h-[56px] disabled:opacity-50"
              rows={1}
            />
            <div className="p-2 shrink-0">
              <button
                onClick={() => handleSend()}
                disabled={(!input.trim() && !imageAttachment) || isStreaming || isGeneratingImage}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-black shadow-[0_0_14px_rgba(0,208,255,0.3)] hover:shadow-[0_0_22px_rgba(0,208,255,0.5)] hover:-translate-y-px transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
              >
                <Send size={18} className="mr-0.5 mt-0.5" />
              </button>
            </div>
          </div>
          <div className="mt-2 hidden sm:flex justify-between items-center px-2">
            <span className="font-mono text-[10px] text-muted/60 tracking-wide">ENTER = send &nbsp;·&nbsp; SHIFT+ENTER = new line</span>
            <span className="font-mono text-[10px] text-muted/40">claude-sonnet-4-6</span>
          </div>
        </div>
      </div>
    </main>
  );
}

function MessageBubble({
  message,
  user,
  isTyping = false,
  isStreaming = false,
  isGeneratingImage = false,
}: {
  message: any;
  user: any;
  isTyping?: boolean;
  isStreaming?: boolean;
  isGeneratingImage?: boolean;
}) {
  const isAI = message.role === "assistant";
  const [copied, setCopied] = useState(false);
  const [imgExpanded, setImgExpanded] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex gap-4 group", !isAI && "flex-row-reverse")}
    >
      {/* Avatar */}
      <div className="mt-1 shrink-0">
        {isAI ? (
          <CortexAvatar size={36} />
        ) : (
          <UserAvatar
            name={user?.name || "User"}
            email={user?.email}
            size={36}
          />
        )}
      </div>

      {/* Content */}
      <div className={cn("max-w-[calc(100%-3.5rem)] flex flex-col", !isAI && "items-end")}>
        <div className={cn("flex items-center gap-2 mb-1.5", !isAI && "flex-row-reverse")}>
          <span className={cn("text-xs font-mono font-semibold", isAI ? "text-primary" : "text-secondary")}>
            {isAI ? "Cortex AI" : (user?.name || "You")}
          </span>
          {message.createdAt && (
            <span className="text-[10px] font-mono text-muted/60">{formatDate(message.createdAt)}</span>
          )}
          {isAI && !isTyping && !isGeneratingImage && message.content && (
            <button
              onClick={handleCopy}
              className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] font-mono text-muted hover:text-white transition-all"
            >
              {copied ? <Check size={10} className="text-[#00ff88]" /> : <Copy size={10} />}
            </button>
          )}
        </div>

        {/* User image attachment */}
        {!isAI && message.imageAttachment && (
          <div className="mb-2">
            <img
              src={message.imageAttachment}
              alt="attachment"
              className="max-w-[280px] max-h-[200px] object-cover rounded-xl border border-secondary/20 cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => window.open(message.imageAttachment, "_blank")}
            />
          </div>
        )}

        <div className={cn(
          "px-5 py-4 text-sm leading-relaxed relative",
          isAI
            ? "bg-s2 border border-border rounded-2xl rounded-tl-sm text-foreground min-w-[60px]"
            : "bg-gradient-to-br from-primary/5 to-secondary/5 border border-secondary/20 rounded-2xl rounded-tr-sm text-right"
        )}>
          {isGeneratingImage ? (
            <div className="flex flex-col gap-3 py-1 min-w-[200px]">
              <div className="flex items-center gap-3">
                <div className="relative w-8 h-8 shrink-0">
                  <div className="absolute inset-0 rounded-lg border-2 border-[#00d0ff]/30 animate-ping" />
                  <div className="absolute inset-0 rounded-lg border-2 border-t-[#00d0ff] border-[#00d0ff]/10 animate-spin" />
                  <div className="absolute inset-[6px] rounded bg-[#00d0ff]/20" />
                </div>
                <div>
                  <div className="font-mono text-[11px] text-primary tracking-widest uppercase">Generating image...</div>
                  <div className="text-[10px] text-muted/50 font-mono mt-0.5">Gemini Vision AI</div>
                </div>
              </div>
              <div className="h-px bg-gradient-to-r from-[#00d0ff]/30 via-[#6c3bff]/30 to-transparent animate-pulse" />
            </div>
          ) : isTyping ? (
            <div className="flex gap-1.5 items-center py-1">
              <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          ) : message.type === "image" && message.imageData ? (
            <div className="flex flex-col gap-3">
              <div className="font-mono text-[10px] text-primary/70 uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00d0ff] shadow-[0_0_8px_#00d0ff]" />
                Generated image
              </div>
              <div
                className="relative rounded-xl overflow-hidden border border-white/10 cursor-pointer group/img"
                onClick={() => setImgExpanded(!imgExpanded)}
              >
                <img
                  src={message.imageData}
                  alt={message.content}
                  className={cn(
                    "w-full object-cover transition-all duration-300",
                    imgExpanded ? "max-h-[600px]" : "max-h-[280px]"
                  )}
                />
                <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/20 transition-all flex items-center justify-center">
                  <span className="opacity-0 group-hover/img:opacity-100 text-white font-mono text-[10px] bg-black/60 px-3 py-1 rounded-full transition-all">
                    {imgExpanded ? "Collapse" : "Expand"}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-muted/60 font-mono italic leading-relaxed">{message.content}</p>
              <a
                href={message.imageData}
                download="cortex-ai-image.png"
                className="self-start flex items-center gap-1.5 text-[10px] font-mono text-muted/50 hover:text-primary transition-colors"
              >
                ↓ Download
              </a>
            </div>
          ) : (
            <div className={cn(!isAI && "whitespace-pre-wrap")}>
              {isAI ? (
                <>
                  <MarkdownRenderer content={message.content} />
                  {isStreaming && (
                    <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse align-text-bottom" />
                  )}
                </>
              ) : (
                message.content
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
