import { useState } from "react";
import { useAppState } from "@/hooks/use-app-state";
import { 
  useListAnthropicConversations, 
  useDeleteAnthropicConversation,
  useLogoutUser
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus, MessageSquare, Trash2, LogOut, Settings, User, ChevronLeft, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { ProfileModal } from "./Modals";
import { SettingsModal } from "./Modals";

export function Sidebar() {
  const { isGuest, user, activeConversationId, setActiveConversationId, sidebarOpen, setSidebarOpen, setGuestMode } = useAppState();
  const queryClient = useQueryClient();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  
  // Modals state
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
    if (confirm("Biztosan törlöd a beszélgetést?")) {
      deleteMutation.mutate({ id });
      if (activeConversationId === id) setActiveConversationId(null);
    }
  };

  const userInitials = user?.name ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'U';

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <aside 
        className={cn(
          "fixed md:static inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-border flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 flex items-center justify-center">
              <svg viewBox="0 0 40 40" fill="none" className="w-full h-full">
                <circle cx="20" cy="20" r="18" stroke="#00d0ff" strokeWidth="1.5" strokeDasharray="4 2" opacity=".4"/>
                <path d="M20 4C11.16 4 4 11.16 4 20c0 5.8 3.1 10.86 7.76 13.74L14.5 29.5C11.3 27.5 9.2 24 9.2 20c0-5.96 4.84-10.8 10.8-10.8S30.8 14.04 30.8 20c0 4-2.1 7.5-5.3 9.5l2.74 4.24C32.9 30.86 36 25.8 36 20c0-8.84-7.16-16-16-16z" fill="#00d0ff" opacity=".85"/>
                <circle cx="20" cy="20" r="3.5" fill="#00d0ff" opacity=".9"/>
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-muted font-mono leading-none tracking-widest uppercase">OmegaTeck</span>
              <span className="font-display font-bold text-[14px] leading-tight tracking-wide text-white">CORTEX AI</span>
            </div>
          </div>
          <button className="md:hidden text-muted hover:text-white" onClick={() => setSidebarOpen(false)}>
            <ChevronLeft size={20} />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-4 shrink-0">
          <button 
            onClick={() => {
              setActiveConversationId(null);
              if(window.innerWidth < 768) setSidebarOpen(false);
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-s2 border border-border text-sm font-medium hover:border-border2 hover:bg-s3 hover:text-primary transition-all group"
          >
            <MessageSquarePlus size={18} className="text-muted group-hover:text-primary transition-colors" />
            <span>Új beszélgetés</span>
          </button>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto px-3 pb-4 scroll-smooth">
          <div className="px-2 mb-2 text-[10px] font-mono text-muted uppercase tracking-wider">Előzmények</div>
          
          {isGuest ? (
            <div className="text-center p-4 text-xs text-muted/70 bg-s2 rounded-lg border border-border/50 mx-2">
              Vendég módban az előzmények nem mentődnek.
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center p-4 text-xs text-muted/70">Még nincs előzmény</div>
          ) : (
            <div className="flex flex-col gap-1">
              {conversations.map(conv => (
                <div 
                  key={conv.id}
                  onClick={() => {
                    setActiveConversationId(conv.id);
                    if(window.innerWidth < 768) setSidebarOpen(false);
                  }}
                  className={cn(
                    "group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all border",
                    activeConversationId === conv.id 
                      ? "bg-primary/10 border-primary/30 text-primary" 
                      : "bg-transparent border-transparent hover:bg-s2 hover:border-border text-foreground/80 hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <MessageSquare size={14} className={activeConversationId === conv.id ? "text-primary" : "text-muted group-hover:text-foreground/70"} />
                    <span className="text-sm truncate select-none">{conv.title || "Új beszélgetés"}</span>
                  </div>
                  <button 
                    onClick={(e) => handleDelete(e, conv.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-muted hover:text-destructive hover:bg-destructive/10 rounded-md transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* User Footer */}
        <div className="p-4 border-t border-border shrink-0 relative">
          <div 
            className="flex items-center gap-3 p-2 rounded-xl hover:bg-s2 cursor-pointer transition-colors"
            onClick={() => setProfileMenuOpen(!profileMenuOpen)}
          >
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/30 flex items-center justify-center font-display font-bold text-xs text-primary shadow-lg shadow-primary/10">
              {userInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate text-white">{user?.name}</div>
              <div className="text-[10px] font-mono text-muted truncate">{user?.role === 'guest' ? 'Vendég' : 'OmegaTeck Tag'}</div>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); handleLogout(); }}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Kijelentkezés"
            >
              <LogOut size={16} />
            </button>
          </div>

          {/* Profile Dropdown */}
          <AnimatePresence>
            {profileMenuOpen && (
              <motion.div 
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-[80px] left-4 right-4 bg-s2 border border-border2 rounded-xl p-2 shadow-2xl shadow-black/80 z-50"
              >
                <div 
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-s3 text-sm text-foreground/80 hover:text-white cursor-pointer transition-colors"
                  onClick={() => { setProfileMenuOpen(false); setProfileModalOpen(true); }}
                >
                  <User size={16} className="text-muted" /> Profil
                </div>
                <div 
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-s3 text-sm text-foreground/80 hover:text-white cursor-pointer transition-colors"
                  onClick={() => { setProfileMenuOpen(false); setSettingsModalOpen(true); }}
                >
                  <Settings size={16} className="text-muted" /> Beállítások
                </div>
                <div className="h-px bg-border my-1 mx-2" />
                <div 
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-destructive/10 text-sm text-muted hover:text-destructive cursor-pointer transition-colors"
                  onClick={handleLogout}
                >
                  <LogOut size={16} /> Kijelentkezés
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>

      <ProfileModal open={profileModalOpen} onOpenChange={setProfileModalOpen} />
      <SettingsModal open={settingsModalOpen} onOpenChange={setSettingsModalOpen} />
    </>
  );
}
