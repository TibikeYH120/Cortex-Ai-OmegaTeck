import { useState, useRef, useEffect } from "react";
import { useAppState } from "@/hooks/use-app-state";
import { useCreateAnthropicConversation, useGetAnthropicConversation } from "@workspace/api-client-react";
import { useChatStream } from "@/hooks/use-chat-stream";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { Send, Menu, Plus } from "lucide-react";
import { motion } from "framer-motion";
import { cn, formatDate } from "@/lib/utils";

export function ChatArea() {
  const { user, isGuest, activeConversationId, setActiveConversationId, setSidebarOpen } = useAppState();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Local state for optimistic UI updates
  const [localMessages, setLocalMessages] = useState<any[]>([]);

  const { data: activeConversation } = useGetAnthropicConversation(activeConversationId!, {
    query: { enabled: !!activeConversationId && !isGuest }
  });

  const createMutation = useCreateAnthropicConversation();
  
  // Custom hook for SSE streaming
  const { sendMessage, isStreaming, streamingContent } = useChatStream({
    conversationId: activeConversationId,
    onFinished: () => {
      // Keep focus on input after AI responds
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  });

  // Sync local messages with API data
  useEffect(() => {
    if (activeConversationId && activeConversation) {
      setLocalMessages(activeConversation.messages);
    } else if (!activeConversationId) {
      setLocalMessages([]);
    }
  }, [activeConversation, activeConversationId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [localMessages, streamingContent]);

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const content = input.trim();
    setInput("");
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Optimistic user message
    const tempUserMsg = {
      id: Date.now(),
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    };
    setLocalMessages(prev => [...prev, tempUserMsg]);

    try {
      let targetConvId = activeConversationId;

      // Create new conversation if none active
      if (!targetConvId) {
        if (isGuest) {
          targetConvId = Date.now();
          setActiveConversationId(targetConvId);
        } else {
          const newConv = await createMutation.mutateAsync({
            data: { title: content.length > 40 ? content.slice(0, 40) + "..." : content }
          });
          targetConvId = newConv.id;
          setActiveConversationId(targetConvId);
        }
      }

      // Guest mode mock response
      if (isGuest) {
        setTimeout(() => {
          const mockAiMsg = {
            id: Date.now() + 1,
            role: 'assistant',
            content: "Vendég módban vagyok. Kérlek lépj be, ha kapcsolatba szeretnél lépni a valódi OmegaTeck szerverrel. Addig is korlátozott mock adatokat tudok csak megjeleníteni.\n\n```js\nconsole.log('Guest mode active');\n```",
            createdAt: new Date().toISOString()
          };
          setLocalMessages(prev => [...prev, mockAiMsg]);
        }, 1000);
        return;
      }

      // Trigger actual SSE fetch
      await sendMessage(content, targetConvId);

    } catch (err) {
      console.error(err);
      // fallback error message
      setLocalMessages(prev => [...prev, {
        id: Date.now(),
        role: 'assistant',
        content: "⚠ CORTEX CONNECTION ERROR — Kérlek próbáld újra.",
        createdAt: new Date().toISOString()
      }]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
    setInput(e.target.value);
  };

  const suggestionCards = [
    { icon: "⚛️", title: "React komponens", sub: "Segíts egyet írni", prompt: "Segíts egy React komponensben" },
    { icon: "🎮", title: "Game Design Doc", sub: "Új játék tervezése", prompt: "Írj egy game design dokumentumot egy új játékhoz" },
    { icon: "🌐", title: "Three.js alapok", sub: "3D web fejlesztés", prompt: "Magyarázd el a Three.js alapjait egy kezdőnek" },
    { icon: "✦", title: "Landing page dizájn", sub: "OmegaTeck stílus", prompt: "Tervezz egy modern landing page-t az OmegaTeck-nek" }
  ];

  return (
    <main className="flex-1 flex flex-col h-screen relative bg-black/40 backdrop-blur-[2px]">
      {/* Top Bar */}
      <header className="h-16 border-b border-border bg-black/50 backdrop-blur-md flex items-center justify-between px-4 lg:px-8 shrink-0 relative z-10">
        <div className="flex items-center gap-4">
          <button className="md:hidden text-muted hover:text-white" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <div className="font-display font-bold text-sm tracking-wide text-white flex items-center gap-2">
            {activeConversation ? (
              <span className="truncate max-w-[200px] md:max-w-md">{activeConversation.title}</span>
            ) : (
              <>Új <span className="text-primary">beszélgetés</span></>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#00ff88]/20 bg-[#00ff88]/5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00ff88] shadow-[0_0_8px_#00ff88] animate-[blink_2s_ease-in-out_infinite]" />
            <span className="font-mono text-[10px] text-[#00ff88] tracking-widest font-semibold uppercase">Online</span>
          </div>
          <button 
            onClick={() => setActiveConversationId(null)}
            className="w-9 h-9 rounded-xl bg-s2 border border-border flex items-center justify-center text-muted hover:text-primary hover:border-border2 transition-all"
            title="Új beszélgetés"
          >
            <Plus size={18} />
          </button>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto scroll-smooth relative z-0">
        <div className="max-w-3xl mx-auto px-4 py-8 lg:py-12 flex flex-col gap-8">
          
          {!activeConversationId && localMessages.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center min-h-[60vh] text-center pt-10"
            >
              <div className="relative w-[100px] h-[100px] mb-8">
                <svg viewBox="0 0 90 90" fill="none" className="w-full h-full animate-[spin_20s_linear_infinite] drop-shadow-[0_0_20px_rgba(0,208,255,0.5)]">
                  <circle cx="45" cy="45" r="42" stroke="#00d0ff" strokeWidth="1" strokeDasharray="6 3"/>
                  <circle cx="45" cy="45" r="32" stroke="#6c3bff" strokeWidth="1" strokeDasharray="4 4"/>
                  <circle cx="45" cy="45" r="20" stroke="#00d0ff" strokeWidth="1.5" opacity=".6"/>
                  <circle cx="45" cy="45" r="7" fill="#00d0ff" opacity=".8"/>
                  <circle cx="45" cy="45" r="3.5" fill="white"/>
                  <line x1="45" y1="3" x2="45" y2="13" stroke="#00d0ff" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="45" y1="77" x2="45" y2="87" stroke="#00d0ff" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="3" y1="45" x2="13" y2="45" stroke="#00d0ff" strokeWidth="1.5" strokeLinecap="round"/>
                  <line x1="77" y1="45" x2="87" y2="45" stroke="#00d0ff" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="font-mono text-[11px] text-muted tracking-[3px] uppercase mb-4">Cortex AI — OmegaTeck</div>
              <h1 className="text-3xl lg:text-4xl font-bold leading-tight mb-4">
                Szia, <span className="text-primary text-glow">{user?.name?.split(' ')[0] || 'Felhasználó'}</span>!<br/>Miben segíthetek?
              </h1>
              <p className="text-muted text-sm lg:text-base max-w-md font-light mb-10">
                Kérdezz bármit — kódolás, game design, web fejlesztés, kreatív ötletek.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                {suggestionCards.map((card, i) => (
                  <button
                    key={i}
                    onClick={() => { setInput(card.prompt); textareaRef.current?.focus(); }}
                    className="flex flex-col text-left p-4 rounded-xl bg-s2 border border-border hover:border-border2 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/50 transition-all group"
                  >
                    <span className="text-xl mb-2 grayscale group-hover:grayscale-0 transition-all">{card.icon}</span>
                    <span className="text-sm font-semibold text-white mb-1">{card.title}</span>
                    <span className="text-[11px] text-muted font-light">{card.sub}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <>
              {localMessages.map((msg, i) => (
                <MessageBubble key={msg.id || i} message={msg} user={user} />
              ))}
              
              {isStreaming && (
                <MessageBubble 
                  message={{ role: 'assistant', content: streamingContent || '', createdAt: new Date().toISOString() }} 
                  user={user} 
                  isTyping={!streamingContent} 
                />
              )}
              <div ref={messagesEndRef} className="h-4" />
            </>
          )}

        </div>
      </div>

      {/* Input Area */}
      <div className="p-4 lg:p-6 border-t border-border bg-black/60 backdrop-blur-xl shrink-0 z-10">
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-end bg-s2 border border-border rounded-2xl overflow-hidden focus-within:border-border2 focus-within:shadow-[0_0_0_3px_rgba(0,208,255,0.05),_0_0_20px_rgba(0,208,255,0.08)] transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Üzenet Cortex AI-nak..."
              className="w-full bg-transparent border-none outline-none text-foreground text-sm resize-none py-4 px-5 max-h-[180px] min-h-[56px]"
              rows={1}
            />
            <div className="p-2 shrink-0">
              <button
                onClick={handleSend}
                disabled={!input.trim() || isStreaming}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-black shadow-[0_0_14px_rgba(0,208,255,0.3)] hover:shadow-[0_0_22px_rgba(0,208,255,0.5)] hover:-translate-y-px transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
              >
                <Send size={18} className="mr-0.5 mt-0.5" />
              </button>
            </div>
          </div>
          <div className="mt-3 flex justify-between px-2">
            <span className="font-mono text-[10px] text-muted tracking-wide">ENTER = küld &nbsp;·&nbsp; SHIFT+ENTER = új sor</span>
          </div>
        </div>
      </div>
    </main>
  );
}

function MessageBubble({ message, user, isTyping = false }: { message: any, user: any, isTyping?: boolean }) {
  const isAI = message.role === 'assistant';
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("flex gap-4", !isAI && "flex-row-reverse")}
    >
      {/* Avatar */}
      <div className={cn(
        "w-9 h-9 rounded-xl shrink-0 flex items-center justify-center font-display font-bold text-[11px] mt-1 shadow-lg",
        isAI 
          ? "bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/30 text-primary shadow-primary/20"
          : "bg-gradient-to-br from-[#ff2e7e]/10 to-secondary/10 border border-secondary/30 text-secondary shadow-secondary/20"
      )}>
        {isAI ? 'CX' : (user?.name?.[0]?.toUpperCase() || 'U')}
      </div>

      {/* Bubble */}
      <div className={cn("max-w-[calc(100%-3rem)] flex flex-col", !isAI && "items-end")}>
        <div className={cn("flex items-center gap-2 mb-1.5", !isAI && "flex-row-reverse")}>
          <span className={cn("text-xs font-mono font-semibold", isAI ? "text-primary" : "text-secondary")}>
            {isAI ? 'Cortex AI' : (user?.name || 'Te')}
          </span>
          {message.createdAt && (
            <span className="text-[10px] font-mono text-muted">{formatDate(message.createdAt)}</span>
          )}
        </div>
        
        <div className={cn(
          "px-5 py-4 text-sm leading-relaxed relative",
          isAI 
            ? "bg-s2 border border-border rounded-2xl rounded-tl-sm text-foreground"
            : "bg-gradient-to-br from-primary/5 to-secondary/5 border border-secondary/20 rounded-2xl rounded-tr-sm text-right"
        )}>
          {isTyping ? (
            <div className="flex gap-1.5 items-center py-2 h-6">
              <span className="w-2 h-2 rounded-full bg-primary animate-[bounce_1.3s_ease-in-out_infinite]" />
              <span className="w-2 h-2 rounded-full bg-primary animate-[bounce_1.3s_ease-in-out_infinite_0.2s]" />
              <span className="w-2 h-2 rounded-full bg-primary animate-[bounce_1.3s_ease-in-out_infinite_0.4s]" />
            </div>
          ) : (
            <div className={cn(!isAI && "whitespace-pre-wrap")}>
              {isAI ? (
                <MarkdownRenderer content={message.content} />
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
