import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Save, ShieldAlert, User, Cpu, Wifi } from "lucide-react";
import { useGetProfile, useUpdateProfile, getGetProfileQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAppState } from "@/hooks/use-app-state";
import { useQueryClient } from "@tanstack/react-query";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileModal({ open, onOpenChange }: ModalProps) {
  const { isGuest, user } = useAppState();
  const { data: profile, isLoading } = useGetProfile({ query: { enabled: open && !isGuest } });
  const updateMutation = useUpdateProfile();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setBio(profile.bio || "");
    } else if (user && !isGuest) {
      setName(user.name || "");
    }
  }, [profile, user, isGuest]);

  const handleSave = async () => {
    if (isGuest) return onOpenChange(false);
    try {
      await updateMutation.mutateAsync({ data: { name, bio } });
      // Invalidate both profile and auth/me using correct Orval-generated keys
      queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        onOpenChange(false);
      }, 800);
    } catch (err) {
      console.error("Profile save error:", err);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-s2 border border-border2 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex items-center gap-3 bg-black/20">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
                <User size={16} className="text-primary" />
              </div>
              <h2 className="font-display font-bold text-base text-white flex-1">Profil szerkesztése</h2>
              <button onClick={() => onOpenChange(false)} className="text-muted hover:text-white transition-colors p-1">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {isGuest ? (
                <div className="p-4 bg-primary/8 border border-primary/20 rounded-xl text-foreground/80 text-sm flex items-start gap-3">
                  <ShieldAlert size={18} className="shrink-0 text-primary mt-0.5" />
                  <p>Vendég módban a profil nem szerkeszthető. Kérlek regisztrálj a teljes élményhez!</p>
                </div>
              ) : isLoading ? (
                <div className="space-y-3">
                  {[80, 60, 100].map((w, i) => (
                    <div key={i} className={`h-10 bg-white/4 rounded-xl animate-pulse`} style={{ width: `${w}%` }} />
                  ))}
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Megjelenített név</label>
                    <input
                      type="text" value={name} onChange={e => setName(e.target.value)}
                      className="w-full bg-s3 border border-border rounded-xl px-4 py-3 text-sm text-white placeholder-muted focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
                      placeholder="Pl. Tibor"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono text-muted uppercase tracking-wider">Bemutatkozás</label>
                    <textarea
                      value={bio} onChange={e => setBio(e.target.value)} rows={3}
                      className="w-full bg-s3 border border-border rounded-xl px-4 py-3 text-sm text-white placeholder-muted focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all resize-none"
                      placeholder="Pár szó rólad..."
                    />
                  </div>
                  <div className="p-3 bg-s3 rounded-xl border border-border text-xs text-muted font-mono">
                    Email: <span className="text-foreground/70">{user?.email}</span>
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border bg-black/20 flex justify-end gap-3">
              <button onClick={() => onOpenChange(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-muted hover:text-white transition-colors">
                Mégse
              </button>
              <button
                onClick={handleSave}
                disabled={isGuest || updateMutation.isPending}
                className="px-6 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-primary to-secondary text-black hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_14px_rgba(0,208,255,0.2)]"
              >
                <Save size={14} />
                {saved ? "Mentve ✓" : updateMutation.isPending ? "Mentés..." : "Mentés"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function SettingsModal({ open, onOpenChange }: ModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-s2 border border-border2 rounded-2xl shadow-2xl shadow-black/80 overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex items-center gap-3 bg-black/20">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center">
                <Cpu size={16} className="text-primary" />
              </div>
              <h2 className="font-display font-bold text-base text-white flex-1">Rendszer beállítások</h2>
              <button onClick={() => onOpenChange(false)} className="text-muted hover:text-white transition-colors p-1">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Active Model */}
              <div>
                <div className="text-[10px] font-mono text-primary uppercase tracking-widest mb-3">Aktív modell</div>
                <div className="p-4 bg-s3 border border-border rounded-xl flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center text-primary font-bold font-display text-xs border border-primary/30 shadow-[0_0_12px_rgba(0,208,255,0.15)]">
                    CX
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-white">Cortex AI</div>
                    <div className="text-[10px] font-mono text-muted mt-0.5">claude-sonnet-4-6 · Anthropic</div>
                  </div>
                  <div className="px-2 py-1 rounded-md bg-[#00ff88]/10 border border-[#00ff88]/20 text-[10px] font-mono text-[#00ff88] uppercase">
                    Aktív
                  </div>
                </div>
              </div>

              {/* Connection Status */}
              <div>
                <div className="text-[10px] font-mono text-muted uppercase tracking-widest mb-3">Kapcsolat</div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 bg-s3 rounded-xl border border-border">
                    <Wifi size={14} className="text-[#00ff88]" />
                    <div className="flex-1">
                      <div className="text-xs text-white">OmegaTeck Core Server</div>
                      <div className="text-[10px] font-mono text-muted">Kapcsolódva</div>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-[#00ff88] shadow-[0_0_8px_#00ff88] animate-pulse" />
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-s3 rounded-xl border border-border">
                    <Cpu size={14} className="text-[#00d0ff]" />
                    <div className="flex-1">
                      <div className="text-xs text-white">Anthropic AI API</div>
                      <div className="text-[10px] font-mono text-muted">Elérhető</div>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-[#00d0ff] shadow-[0_0_8px_#00d0ff] animate-pulse" />
                  </div>
                </div>
              </div>

              {/* App Version */}
              <div className="p-3 bg-s3 rounded-xl border border-border">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-muted">Verzió</span>
                  <span className="text-foreground/60">CORTEX AI v1.0.0</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono mt-1">
                  <span className="text-muted">Fejlesztő</span>
                  <span className="text-foreground/60">OmegaTeck Technology</span>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border bg-black/20 flex justify-end">
              <button
                onClick={() => onOpenChange(false)}
                className="px-6 py-2.5 rounded-xl text-sm font-bold bg-s3 border border-border text-white hover:border-border2 hover:bg-s2 transition-all"
              >
                Bezárás
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
