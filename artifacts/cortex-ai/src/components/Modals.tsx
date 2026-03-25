import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Save, ShieldAlert } from "lucide-react";
import { useGetProfile, useUpdateProfile } from "@workspace/api-client-react";
import { useAppState } from "@/hooks/use-app-state";
import { useQueryClient } from "@tanstack/react-query";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileModal({ open, onOpenChange }: ModalProps) {
  const { isGuest } = useAppState();
  const { data: profile } = useGetProfile({ query: { enabled: open && !isGuest } });
  const updateMutation = useUpdateProfile();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setBio(profile.bio || "");
    }
  }, [profile]);

  const handleSave = async () => {
    if (isGuest) return onOpenChange(false);
    await updateMutation.mutateAsync({ data: { name, bio } });
    queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    onOpenChange(false);
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
            initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-s2 border border-border2 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-black/20">
              <h2 className="font-display font-bold text-lg text-white">Profil szerkesztése</h2>
              <button onClick={() => onOpenChange(false)} className="text-muted hover:text-white transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              {isGuest ? (
                <div className="p-4 bg-primary/10 border border-primary/30 rounded-xl text-primary text-sm flex items-start gap-3">
                  <ShieldAlert size={20} className="shrink-0" />
                  <p>Vendég módban a profil nem szerkeszthető. Kérlek regisztrálj a teljes élményhez.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-muted uppercase">Név</label>
                    <input 
                      type="text" value={name} onChange={e => setName(e.target.value)}
                      className="w-full bg-s3 border border-border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-mono text-muted uppercase">Bemutatkozás</label>
                    <textarea 
                      value={bio} onChange={e => setBio(e.target.value)} rows={3}
                      className="w-full bg-s3 border border-border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-border bg-black/20 flex justify-end gap-3">
              <button onClick={() => onOpenChange(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-muted hover:text-white transition-colors">Mégse</button>
              <button 
                onClick={handleSave} disabled={isGuest || updateMutation.isPending}
                className="px-6 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-primary to-secondary text-black hover:opacity-90 transition-opacity glow-primary flex items-center gap-2 disabled:opacity-50"
              >
                <Save size={16} />
                {updateMutation.isPending ? "Mentés..." : "Mentés"}
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
            initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-s2 border border-border2 rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-black/20">
              <h2 className="font-display font-bold text-lg text-white">Rendszer Beállítások</h2>
              <button onClick={() => onOpenChange(false)} className="text-muted hover:text-white transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-xs font-mono text-primary uppercase mb-2">Aktív Modell</h3>
                <div className="p-3 bg-s3 border border-border rounded-xl flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center text-primary font-bold font-display text-xs border border-primary/30">
                    CX
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">Claude 3.5 Sonnet</div>
                    <div className="text-[10px] font-mono text-muted">claude-sonnet-4-6</div>
                  </div>
                  <div className="ml-auto px-2 py-1 rounded bg-primary/10 border border-primary/20 text-[10px] font-mono text-primary uppercase">
                    Aktív
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-xs font-mono text-muted uppercase mb-2">Hálózat státusz</h3>
                <div className="flex items-center gap-2 text-sm text-white bg-s3 p-3 rounded-xl border border-border">
                  <div className="w-2 h-2 rounded-full bg-[#00ff88] shadow-[0_0_8px_#00ff88] animate-[blink_2s_ease-in-out_infinite]" />
                  OmegaTeck Core Server: Kapcsolódva
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
