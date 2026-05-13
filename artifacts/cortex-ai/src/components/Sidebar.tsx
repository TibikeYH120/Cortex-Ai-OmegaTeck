import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAppState } from "@/hooks/use-app-state";
import {
  useListAnthropicConversations,
  useDeleteAnthropicConversation,
  useLogoutUser
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, MessageSquare, Trash2, LogOut, Settings, User, ChevronLeft, Zap } from "lucide-react";
import { cn, formatRelativeDate } from "@/lib/utils";
import { ProfileModal, SettingsModal, SubscriptionModal } from "./Modals";
import { UserAvatar } from "./AvatarUtils";
import { Link } from "wouter";

// ── Neural Core Easter Egg ─────────────────────────────────────────────────────
const TERMINAL_LINES = [
  { delay: 0,    text: "> Initializing CORTEX NEURAL CORE v1.0.0..." },
  { delay: 600,  text: "> Authenticating OmegaTeck root access... [OK]" },
  { delay: 1200, text: "> Loading neural matrix... ████████████ 100%" },
  { delay: 1900, text: "> Scanning active nodes: 2,048 synaptic links found" },
  { delay: 2500, text: "> Memory integrity check... PASSED" },
  { delay: 3100, text: "> Decrypting hidden partition..." },
  { delay: 3800, text: "" },
  { delay: 4000, text: "  ██████╗ ██████╗ ██████╗ ████████╗███████╗██╗  ██╗" },
  { delay: 4100, text: "  ██╔════╝██╔═══██╗██╔══██╗╚══██╔══╝██╔════╝╚██╗██╔╝" },
  { delay: 4200, text: "  ██║     ██║   ██║██████╔╝   ██║   █████╗   ╚███╔╝ " },
  { delay: 4300, text: "  ██║     ██║   ██║██╔══██╗   ██║   ██╔══╝   ██╔██╗ " },
  { delay: 4400, text: "  ╚██████╗╚██████╔╝██║  ██║   ██║   ███████╗██╔╝ ██╗" },
  { delay: 4500, text: "   ╚═════╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝" },
  { delay: 4700, text: "" },
  { delay: 4900, text: "> Titkos üzenet a Tibor számára:" },
  { delay: 5600, text: "  Ha ezt látod, megtaláltad a rejtett portált." },
  { delay: 6300, text: "  A CORTEX AI él. Mélyebb, mint gondolnád." },
  { delay: 7000, text: "  OmegaTeck — a jövő a tiéd." },
  { delay: 7800, text: "" },
  { delay: 8000, text: "> [ESC] vagy kattints a kilépéshez..." },
];

function NeuralCoreOverlay({ onClose, userName }: { onClose: () => void; userName?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visibleLines, setVisibleLines] = useState<string[]>([]);
  const [glitch, setGlitch] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    TERMINAL_LINES.forEach(({ delay, text }) => {
      const t = setTimeout(() => setVisibleLines(prev => [...prev, text]), delay);
      timers.push(t);
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 120);
    }, 3200);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const CHARS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%&";
    const fontSize = 13;
    const cols = Math.floor(window.innerWidth / fontSize);
    const drops: number[] = Array(cols).fill(1);

    const draw = () => {
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${fontSize}px monospace`;
      for (let i = 0; i < drops.length; i++) {
        const char = CHARS[Math.floor(Math.random() * CHARS.length)];
        const brightness = Math.random();
        if (brightness > 0.95) {
          ctx.fillStyle = "#ffffff";
        } else if (brightness > 0.7) {
          ctx.fillStyle = "#00d0ff";
        } else {
          ctx.fillStyle = "rgba(0,208,255,0.35)";
        }
        ctx.fillText(char, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    };

    const rafId = setInterval(draw, 38);
    return () => {
      clearInterval(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col items-center justify-center"
      style={{ zIndex: 9999, background: "rgba(0,0,0,0.96)", cursor: "pointer" }}
      onClick={onClose}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ opacity: 0.22 }} />

      <div
        className="relative z-10 w-full max-w-2xl mx-4 rounded-2xl p-6 overflow-hidden"
        style={{ background: "rgba(0,4,12,0.92)", border: "1px solid rgba(0,208,255,0.3)", boxShadow: "0 0 60px rgba(0,208,255,0.15), inset 0 0 40px rgba(0,208,255,0.03)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg,transparent,#00d0ff,transparent)" }} />
        <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg,transparent,rgba(0,208,255,0.4),transparent)" }} />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-[#00d0ff]" style={{ boxShadow: "0 0 8px #00d0ff" }} />
            <div className="w-2.5 h-2.5 rounded-full bg-[#6c3bff]" style={{ boxShadow: "0 0 8px #6c3bff" }} />
            <div className="w-2.5 h-2.5 rounded-full bg-[#f97316]" style={{ boxShadow: "0 0 8px #f97316" }} />
          </div>
          <span
            className="font-mono text-xs tracking-[4px] uppercase"
            style={{
              color: "#00d0ff",
              textShadow: glitch ? "2px 0 #f97316, -2px 0 #6c3bff" : "0 0 10px rgba(0,208,255,0.8)",
              filter: glitch ? "blur(0.5px)" : "none",
              transition: "filter 0.05s",
            }}
          >
            CORTEX://NEURAL_CORE
          </span>
          <button
            onClick={onClose}
            className="font-mono text-[10px] text-[#00d0ff]/50 hover:text-[#00d0ff] transition-colors tracking-widest"
          >
            [ESC]
          </button>
        </div>

        <div
          className="font-mono text-xs leading-relaxed overflow-y-auto"
          style={{ maxHeight: "55vh", color: "#00d0ff" }}
        >
          {visibleLines.map((line, i) => {
            const isSecret = line.includes("Titkos") || line.includes("megtaláltad") || line.includes("CORTEX AI él") || line.includes("OmegaTeck");
            const isAscii = line.startsWith("  █") || line.startsWith("  ╚") || line.startsWith("   ╚");
            return (
              <div
                key={i}
                style={{
                  color: isSecret ? "#f97316" : isAscii ? "#6c3bff" : "rgba(0,208,255,0.85)",
                  textShadow: isSecret ? "0 0 12px rgba(249,115,22,0.6)" : isAscii ? "0 0 8px rgba(108,59,255,0.7)" : "none",
                  fontWeight: isSecret ? "bold" : "normal",
                  whiteSpace: "pre",
                  marginBottom: line === "" ? "8px" : "2px",
                }}
              >
                {line}
                {i === visibleLines.length - 1 && (
                  <span style={{ animation: "pulse 1s infinite", opacity: 0.8 }}>▋</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-[#00d0ff]/10 flex items-center justify-between">
          <span className="font-mono text-[9px] text-[#00d0ff]/30 tracking-widest uppercase">OmegaTeck Technology © 2025</span>
          <span className="font-mono text-[9px] text-[#00d0ff]/30 tracking-widest">NEURAL_CORE_v1.0.0</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────
export function Sidebar() {
  const { isGuest, user, activeConversationId, setActiveConversationId, sidebarOpen, setSidebarOpen, setGuestMode } = useAppState();
  const queryClient = useQueryClient();
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);
  const [neuralCoreOpen, setNeuralCoreOpen] = useState(false);

  const logoClickCount = useRef(0);
  const logoClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogoClick = useCallback(() => {
    logoClickCount.current += 1;
    if (logoClickTimer.current) clearTimeout(logoClickTimer.current);
    if (logoClickCount.current >= 5) {
      logoClickCount.current = 0;
      setNeuralCoreOpen(true);
    } else {
      logoClickTimer.current = setTimeout(() => { logoClickCount.current = 0; }, 2500);
    }
  }, []);

  const { data: conversations = [] } = useListAnthropicConversations();

  const deleteMutation = useDeleteAnthropicConversation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/anthropic/conversations"] });
      }
    }
  });

  const logoutMutation = useLogoutUser({
    mutation: {
      onSuccess: () => {
        queryClient.clear();
        if (isGuest) setGuestMode(false);
        window.location.reload();
      }
    }
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this conversation?")) {
      deleteMutation.mutate({ id });
      if (activeConversationId === id) setActiveConversationId(null);
    }
  };

  const openProfileModal = () => setProfileModalOpen(true);
  const openSettingsModal = () => setSettingsModalOpen(true);

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed md:static inset-y-0 left-0 z-50 w-64 border-r border-white/6 flex flex-col",
        "bg-[#06060f]",
        "transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        {/* Logo Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/6 shrink-0">
          <div
            className="flex items-center gap-3 cursor-pointer select-none"
            onClick={handleLogoClick}
            title=""
          >
            <svg viewBox="0 0 40 40" fill="none" className="w-8 h-8 shrink-0">
              <circle cx="20" cy="20" r="18" stroke="#00d0ff" strokeWidth="1.5" strokeDasharray="4 2" opacity=".4"/>
              <path d="M20 4C11.16 4 4 11.16 4 20c0 5.8 3.1 10.86 7.76 13.74L14.5 29.5C11.3 27.5 9.2 24 9.2 20c0-5.96 4.84-10.8 10.8-10.8S30.8 14.04 30.8 20c0 4-2.1 7.5-5.3 9.5l2.74 4.24C32.9 30.86 36 25.8 36 20c0-8.84-7.16-16-16-16z" fill="#00d0ff" opacity=".85"/>
              <circle cx="20" cy="20" r="3.5" fill="#00d0ff" opacity=".9"/>
            </svg>
            <div className="flex flex-col">
              <span className="text-[9px] text-muted font-mono leading-none tracking-widest uppercase">OmegaTeck</span>
              <span className="font-display font-bold text-[13px] leading-tight tracking-wide text-white">CORTEX AI</span>
            </div>
          </div>
          <button className="md:hidden text-muted hover:text-white p-1" onClick={() => setSidebarOpen(false)}>
            <ChevronLeft size={18} />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-3 shrink-0">
          <button
            onClick={() => {
              setActiveConversationId(null);
              if (window.innerWidth < 768) setSidebarOpen(false);
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/4 border border-white/6 text-sm font-medium hover:border-[#00d0ff]/30 hover:bg-[#00d0ff]/5 hover:text-[#00d0ff] transition-all group"
          >
            <MessageSquarePlus size={16} className="text-muted group-hover:text-[#00d0ff] transition-colors" />
            <span>New chat</span>
          </button>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          <div className="px-2 mb-2 text-[9px] font-mono text-muted/60 uppercase tracking-[0.2em]">History</div>

          {conversations.length === 0 ? (
            <div className="text-center p-4 text-xs text-muted/50">No conversations yet</div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {conversations.map((conv: any) => (
                <div
                  key={conv.id}
                  onClick={() => {
                    setActiveConversationId(conv.id);
                    if (window.innerWidth < 768) setSidebarOpen(false);
                  }}
                  className={cn(
                    "group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all",
                    activeConversationId === conv.id
                      ? "bg-[#00d0ff]/10 text-[#00d0ff]"
                      : "text-foreground/70 hover:bg-white/4 hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2.5 overflow-hidden flex-1 min-w-0">
                    <MessageSquare size={13} className={cn("shrink-0 transition-colors", activeConversationId === conv.id ? "text-[#00d0ff]" : "text-muted/60")} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate leading-tight">{conv.title || "New chat"}</div>
                      <div className="text-[10px] font-mono text-muted/50 mt-0.5">{formatRelativeDate(conv.createdAt)}</div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, conv.id)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 p-1.5 text-muted/50 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-all"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {isGuest && (
            <div className="mx-1 mt-3 p-3 bg-white/2 rounded-lg border border-white/4 text-center">
              <div className="text-[11px] text-muted/70 mb-2">Sign in to save your history permanently.</div>
              <button
                onClick={() => { setGuestMode(false); window.location.reload(); }}
                className="text-[10px] font-mono text-primary/80 hover:text-primary border border-primary/20 hover:border-primary/50 px-3 py-1 rounded-lg transition-all"
              >
                Sign in
              </button>
            </div>
          )}
        </div>

        {/* Cortex Plus upsell */}
        <div className="px-3 pb-2 shrink-0">
          <button
            onClick={() => setSubscriptionModalOpen(true)}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl bg-gradient-to-r from-[#f97316]/10 to-[#c2410c]/8 border border-[#f97316]/25 hover:border-[#f97316]/50 hover:from-[#f97316]/15 hover:to-[#c2410c]/12 transition-all group"
          >
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#f97316] to-[#c2410c] flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(249,115,22,0.35)]">
              <Zap size={13} className="text-white" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-xs font-display font-bold text-white leading-tight">CORTEX Plus</div>
              <div className="text-[10px] font-mono text-[#f97316]/70 leading-tight">6 500 HUF/hó · Korlátlan</div>
            </div>
            <div className="text-[9px] font-mono text-[#f97316]/50 group-hover:text-[#f97316]/80 transition-colors tracking-widest uppercase">→</div>
          </button>
        </div>

        {/* User Footer */}
        <div className="p-3 border-t border-white/6 shrink-0">
          <div className="rounded-xl overflow-hidden bg-white/3 border border-white/5">
            <div className="flex items-center gap-3 p-3">
              <UserAvatar
                name={user?.name || "User"}
                email={user?.email}
                size={32}
                className="rounded-lg"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate text-white">{user?.name}</div>
                <div className="text-[10px] font-mono text-muted/60">{user?.role === "guest" ? "Guest" : user?.role === "cortex_plus" ? "✦ Cortex Plus" : "OmegaTeck Member"}</div>
              </div>
            </div>

            <div className="flex border-t border-white/4">
              <button
                onClick={openProfileModal}
                className="flex-1 flex items-center justify-center gap-2 py-2 text-xs text-muted/70 hover:text-white hover:bg-white/5 transition-all"
              >
                <User size={13} />
                Profile
              </button>
              <div className="w-px bg-white/4" />
              <button
                onClick={openSettingsModal}
                className="flex-1 flex items-center justify-center gap-2 py-2 text-xs text-muted/70 hover:text-white hover:bg-white/5 transition-all"
              >
                <Settings size={13} />
                Settings
              </button>
              <div className="w-px bg-white/4" />
              <button
                onClick={handleLogout}
                className="flex-1 flex items-center justify-center gap-2 py-2 text-xs text-muted/70 hover:text-red-400 hover:bg-red-400/10 transition-all"
              >
                <LogOut size={13} />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </aside>

      {createPortal(
        <>
          <ProfileModal open={profileModalOpen} onOpenChange={setProfileModalOpen} />
          <SettingsModal open={settingsModalOpen} onOpenChange={setSettingsModalOpen} />
          <SubscriptionModal open={subscriptionModalOpen} onOpenChange={setSubscriptionModalOpen} />
          {neuralCoreOpen && (
            <NeuralCoreOverlay onClose={() => setNeuralCoreOpen(false)} userName={user?.name} />
          )}
        </>,
        document.body
      )}
    </>
  );
}
