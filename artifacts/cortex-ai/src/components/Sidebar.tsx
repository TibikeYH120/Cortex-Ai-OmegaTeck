import { useState } from "react";
import { createPortal } from "react-dom";
import { useAppState } from "@/hooks/use-app-state";
import {
  useListAnthropicConversations,
  useDeleteAnthropicConversation,
  useLogoutUser
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, MessageSquare, Trash2, LogOut, Settings, User, ChevronLeft } from "lucide-react";
import { cn, formatRelativeDate } from "@/lib/utils";
import { ProfileModal, SettingsModal } from "./Modals";
import { UserAvatar } from "./AvatarUtils";

export function Sidebar() {
  const { isGuest, user, activeConversationId, setActiveConversationId, sidebarOpen, setSidebarOpen, setGuestMode } = useAppState();
  const queryClient = useQueryClient();
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  const { data: conversations = [] } = useListAnthropicConversations({
    query: { enabled: !isGuest }
  });

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
        window.location.reload();
      }
    }
  });

  const handleLogout = () => {
    if (isGuest) {
      setGuestMode(false);
      window.location.reload();
    } else {
      logoutMutation.mutate();
    }
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
          <div className="flex items-center gap-3">
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

          {isGuest ? (
            <div className="text-center p-4 bg-white/2 rounded-lg border border-white/4 mx-1">
              <div className="text-xs text-muted/70 mb-2">Sign in to save your chat history.</div>
              <button
                onClick={() => { setGuestMode(false); window.location.reload(); }}
                className="text-[10px] font-mono text-primary/80 hover:text-primary border border-primary/20 hover:border-primary/50 px-3 py-1 rounded-lg transition-all"
              >
                Sign in
              </button>
            </div>
          ) : conversations.length === 0 ? (
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
                <div className="text-[10px] font-mono text-muted/60">{user?.role === "guest" ? "Guest" : "OmegaTeck Member"}</div>
              </div>
            </div>

            {/* Action Buttons */}
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

      {/* Modals rendered via portal to document.body to avoid z-index/overflow issues */}
      {createPortal(
        <>
          <ProfileModal open={profileModalOpen} onOpenChange={setProfileModalOpen} />
          <SettingsModal open={settingsModalOpen} onOpenChange={setSettingsModalOpen} />
        </>,
        document.body
      )}
    </>
  );
}
