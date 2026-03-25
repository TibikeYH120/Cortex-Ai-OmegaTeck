import { useState, useEffect } from "react";
import { X, Save, ShieldAlert, User, Cpu, Wifi } from "lucide-react";
import { useGetProfile, useUpdateProfile, getGetProfileQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAppState } from "@/hooks/use-app-state";
import { useQueryClient } from "@tanstack/react-query";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ModalBackdrop({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm"
      style={{ zIndex: 999 }}
      onClick={onClose}
    />
  );
}

export function ProfileModal({ open, onOpenChange }: ModalProps) {
  const { isGuest, user } = useAppState();
  const { data: profile, isLoading } = useGetProfile({
    query: { enabled: open && !isGuest }
  });
  const updateMutation = useUpdateProfile();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setBio(profile.bio || "");
    } else if (user && !isGuest) {
      setName(user.name || "");
    }
  }, [profile, user, isGuest]);

  const handleSave = async () => {
    if (isGuest) { onOpenChange(false); return; }
    setError("");
    try {
      await updateMutation.mutateAsync({ data: { name, bio } });
      queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        onOpenChange(false);
      }, 900);
    } catch (err: any) {
      setError(err?.message || "Hiba a mentés során.");
    }
  };

  if (!open) return null;

  return (
    <>
      <ModalBackdrop onClose={() => onOpenChange(false)} />
      <div
        className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none"
        style={{ zIndex: 1000 }}
      >
        <div
          className="relative w-full max-w-md rounded-2xl overflow-hidden pointer-events-auto"
          style={{
            background: "#0b0b1a",
            border: "1px solid rgba(0,208,255,0.15)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.8), 0 0 40px rgba(0,208,255,0.06)"
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-white/6 bg-black/20">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(0,208,255,0.08)", border: "1px solid rgba(0,208,255,0.2)" }}>
              <User size={15} className="text-[#00d0ff]" />
            </div>
            <h2 className="font-display font-bold text-base text-white flex-1">Profil szerkesztése</h2>
            <button onClick={() => onOpenChange(false)} className="text-muted hover:text-white transition-colors p-1 rounded-lg hover:bg-white/6">
              <X size={17} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            {isGuest ? (
              <div className="p-4 rounded-xl flex items-start gap-3 text-sm" style={{ background: "rgba(0,208,255,0.05)", border: "1px solid rgba(0,208,255,0.15)" }}>
                <ShieldAlert size={17} className="shrink-0 text-[#00d0ff] mt-0.5" />
                <p className="text-foreground/80">Vendég módban a profil nem szerkeszthető. Kérlek regisztrálj a teljes élményhez!</p>
              </div>
            ) : isLoading ? (
              <div className="space-y-3">
                <div className="h-10 rounded-xl animate-pulse bg-white/4" />
                <div className="h-24 rounded-xl animate-pulse bg-white/4" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-muted/70 uppercase tracking-wider">Megjelenített név</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-all"
                    style={{ background: "#10101f", border: "1px solid rgba(255,255,255,0.08)" }}
                    onFocus={e => e.currentTarget.style.borderColor = "rgba(0,208,255,0.4)"}
                    onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
                    placeholder="Pl. Tibor"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-muted/70 uppercase tracking-wider">Bemutatkozás</label>
                  <textarea
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-all resize-none"
                    style={{ background: "#10101f", border: "1px solid rgba(255,255,255,0.08)" }}
                    onFocus={e => e.currentTarget.style.borderColor = "rgba(0,208,255,0.4)"}
                    onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
                    placeholder="Pár szó rólad..."
                  />
                </div>
                <div className="px-3 py-2 rounded-xl text-xs font-mono text-muted/60" style={{ background: "#10101f", border: "1px solid rgba(255,255,255,0.05)" }}>
                  Email: <span className="text-foreground/50">{user?.email}</span>
                </div>
                {error && (
                  <div className="text-xs text-red-400 px-1">{error}</div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/6 bg-black/20 flex justify-end gap-3">
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-muted hover:text-white transition-colors"
            >
              Mégse
            </button>
            <button
              onClick={handleSave}
              disabled={isGuest || updateMutation.isPending}
              className="px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, #00d0ff, #6c3bff)",
                color: "#000",
                boxShadow: "0 0 16px rgba(0,208,255,0.25)"
              }}
            >
              <Save size={14} />
              {saved ? "Mentve ✓" : updateMutation.isPending ? "Mentés..." : "Mentés"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function SettingsModal({ open, onOpenChange }: ModalProps) {
  if (!open) return null;

  return (
    <>
      <ModalBackdrop onClose={() => onOpenChange(false)} />
      <div
        className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none"
        style={{ zIndex: 1000 }}
      >
        <div
          className="relative w-full max-w-md rounded-2xl overflow-hidden pointer-events-auto"
          style={{
            background: "#0b0b1a",
            border: "1px solid rgba(0,208,255,0.15)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.8), 0 0 40px rgba(0,208,255,0.06)"
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-white/6 bg-black/20">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(0,208,255,0.08)", border: "1px solid rgba(0,208,255,0.2)" }}>
              <Cpu size={15} className="text-[#00d0ff]" />
            </div>
            <h2 className="font-display font-bold text-base text-white flex-1">Rendszer beállítások</h2>
            <button onClick={() => onOpenChange(false)} className="text-muted hover:text-white transition-colors p-1 rounded-lg hover:bg-white/6">
              <X size={17} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">
            {/* Active model */}
            <div>
              <div className="text-[10px] font-mono text-[#00d0ff]/60 uppercase tracking-widest mb-3">Aktív modell</div>
              <div className="p-4 rounded-xl flex items-center gap-4" style={{ background: "#10101f", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-display font-bold text-xs text-[#00d0ff] shrink-0" style={{ background: "linear-gradient(135deg, rgba(0,208,255,0.12), rgba(108,59,255,0.12))", border: "1px solid rgba(0,208,255,0.25)", boxShadow: "0 0 12px rgba(0,208,255,0.1)" }}>
                  CX
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-white">Cortex AI</div>
                  <div className="text-[10px] font-mono text-muted/60 mt-0.5">claude-sonnet-4-6 · Anthropic</div>
                </div>
                <div className="px-2 py-1 rounded-md text-[10px] font-mono uppercase" style={{ background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.2)", color: "#00ff88" }}>
                  Aktív
                </div>
              </div>
            </div>

            {/* Connection */}
            <div>
              <div className="text-[10px] font-mono text-muted/50 uppercase tracking-widest mb-3">Kapcsolat</div>
              <div className="space-y-2">
                {[
                  { icon: <Wifi size={14} />, name: "OmegaTeck Core Server", status: "Kapcsolódva", color: "#00ff88" },
                  { icon: <Cpu size={14} />, name: "Anthropic AI API", status: "Elérhető", color: "#00d0ff" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "#10101f", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <span style={{ color: item.color }}>{item.icon}</span>
                    <div className="flex-1">
                      <div className="text-xs text-white">{item.name}</div>
                      <div className="text-[10px] font-mono text-muted/60">{item.status}</div>
                    </div>
                    <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: item.color, boxShadow: `0 0 8px ${item.color}` }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Version */}
            <div className="p-3 rounded-xl text-[11px] font-mono space-y-1" style={{ background: "#10101f", border: "1px solid rgba(255,255,255,0.04)" }}>
              <div className="flex justify-between"><span className="text-muted/50">Verzió</span><span className="text-foreground/50">CORTEX AI v1.0.0</span></div>
              <div className="flex justify-between"><span className="text-muted/50">Fejlesztő</span><span className="text-foreground/50">OmegaTeck Technology</span></div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/6 bg-black/20 flex justify-end">
            <button
              onClick={() => onOpenChange(false)}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:bg-white/6"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              Bezárás
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
