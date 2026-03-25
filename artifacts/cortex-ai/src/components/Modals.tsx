import { useState, useEffect } from "react";
import {
  X, Save, ShieldAlert, User, Cpu, Wifi, Lock, BarChart3,
  Eye, EyeOff, CheckCircle2, AlertCircle, MessageSquare, Zap, Shield,
  Info, Globe, Volume2, Palette, Key
} from "lucide-react";
import { useGetProfile, useUpdateProfile, getGetProfileQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAppState } from "@/hooks/use-app-state";
import { useQueryClient } from "@tanstack/react-query";
import { UserAvatar, CortexAvatar } from "./AvatarUtils";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ModalBackdrop({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md"
      style={{ zIndex: 999 }}
      onClick={onClose}
    />
  );
}

function StatCard({ icon, label, value, color = "#00d0ff" }: { icon: React.ReactNode; label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 p-3 rounded-xl" style={{ background: "#0e0e1e", border: "1px solid rgba(255,255,255,0.05)" }}>
      <span style={{ color }}>{icon}</span>
      <span className="text-lg font-bold text-white">{value}</span>
      <span className="text-[10px] font-mono text-muted/50 uppercase tracking-wider">{label}</span>
    </div>
  );
}

export function ProfileModal({ open, onOpenChange }: ModalProps) {
  const { isGuest, user } = useAppState();
  const { data: profile, isLoading } = useGetProfile({ query: { enabled: open && !isGuest } });
  const updateMutation = useUpdateProfile();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<"profile" | "password" | "stats">("profile");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [stats, setStats] = useState<{ conversationCount: number; messageCount: number; memberSince: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setBio(profile.bio || "");
    } else if (user && !isGuest) {
      setName(user.name || "");
    }
  }, [profile, user, isGuest]);

  useEffect(() => {
    if (open && !isGuest && tab === "stats") {
      fetch("/api/profile/stats", { credentials: "include" })
        .then(r => r.json())
        .then(setStats)
        .catch(() => {});
    }
  }, [open, tab, isGuest]);

  useEffect(() => {
    if (!open) {
      setTab("profile");
      setError("");
      setSuccess("");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [open]);

  const handleSaveProfile = async () => {
    if (isGuest) { onOpenChange(false); return; }
    setError(""); setSuccess("");
    try {
      await updateMutation.mutateAsync({ data: { name, bio } });
      queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      setSaved(true);
      setSuccess("Profil sikeresen frissítve!");
      setTimeout(() => { setSaved(false); setSuccess(""); onOpenChange(false); }, 1500);
    } catch (err: any) {
      setError(err?.message || "Hiba a mentés során.");
    }
  };

  const handleChangePassword = async () => {
    setError(""); setSuccess("");
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Töltsd ki az összes jelszó mezőt!"); return;
    }
    if (newPassword !== confirmPassword) {
      setError("Az új jelszavak nem egyeznek!"); return;
    }
    if (newPassword.length < 6) {
      setError("Az új jelszónak legalább 6 karakternek kell lennie."); return;
    }
    try {
      const res = await fetch("/api/profile/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Hiba a jelszóváltás során."); return; }
      setSuccess("Jelszó sikeresen megváltva!");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch {
      setError("Hálózati hiba.");
    }
  };

  if (!open) return null;

  const joinDate = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric" })
    : "-";

  const tabs = [
    { id: "profile", label: "Profil", icon: <User size={13} /> },
    { id: "password", label: "Jelszó", icon: <Key size={13} /> },
    { id: "stats", label: "Statisztika", icon: <BarChart3 size={13} /> },
  ] as const;

  return (
    <>
      <ModalBackdrop onClose={() => onOpenChange(false)} />
      <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none" style={{ zIndex: 1000 }}>
        <div
          className="relative w-full max-w-lg rounded-2xl overflow-hidden pointer-events-auto flex flex-col"
          style={{ background: "#0b0b1a", border: "1px solid rgba(0,208,255,0.15)", boxShadow: "0 24px 80px rgba(0,0,0,0.9), 0 0 60px rgba(0,208,255,0.05)", maxHeight: "90vh" }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-white/6 bg-black/30 shrink-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(0,208,255,0.08)", border: "1px solid rgba(0,208,255,0.2)" }}>
              <User size={15} className="text-[#00d0ff]" />
            </div>
            <h2 className="font-display font-bold text-base text-white flex-1">Felhasználói fiók</h2>
            <button onClick={() => onOpenChange(false)} className="text-muted hover:text-white transition-colors p-1 rounded-lg hover:bg-white/6">
              <X size={17} />
            </button>
          </div>

          {/* Avatar Row */}
          <div className="px-6 py-5 flex items-center gap-5 border-b border-white/4 bg-black/10 shrink-0">
            {isGuest ? (
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-[#00d0ff]" style={{ background: "rgba(0,208,255,0.08)", border: "1px solid rgba(0,208,255,0.2)" }}>
                V
              </div>
            ) : (
              <UserAvatar name={user?.name || "?"} email={user?.email} size={64} />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-lg font-bold text-white truncate">{user?.name || "Vendég"}</div>
              <div className="text-sm text-muted/60 font-mono truncate">{user?.email}</div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider font-semibold" style={{ background: "rgba(0,208,255,0.08)", border: "1px solid rgba(0,208,255,0.2)", color: "#00d0ff" }}>
                  {user?.role === "guest" ? "Vendég" : "OmegaTeck Tag"}
                </span>
                {!isGuest && <span className="text-[10px] text-muted/40 font-mono">Csatlakozott: {joinDate}</span>}
              </div>
            </div>
          </div>

          {/* Tabs */}
          {!isGuest && (
            <div className="flex border-b border-white/5 shrink-0 bg-black/20">
              {tabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setTab(t.id); setError(""); setSuccess(""); }}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold transition-all"
                  style={{
                    color: tab === t.id ? "#00d0ff" : "rgba(255,255,255,0.4)",
                    borderBottom: tab === t.id ? "2px solid #00d0ff" : "2px solid transparent",
                  }}
                >
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
          )}

          {/* Body */}
          <div className="overflow-y-auto flex-1">
            {isGuest ? (
              <div className="p-6">
                <div className="p-4 rounded-xl flex items-start gap-3 text-sm" style={{ background: "rgba(0,208,255,0.05)", border: "1px solid rgba(0,208,255,0.15)" }}>
                  <ShieldAlert size={17} className="shrink-0 text-[#00d0ff] mt-0.5" />
                  <p className="text-foreground/80">Vendég módban a profil nem szerkeszthető. Kérlek regisztrálj a teljes OmegaTeck élményhez!</p>
                </div>
              </div>
            ) : isLoading ? (
              <div className="p-6 space-y-3">
                <div className="h-10 rounded-xl animate-pulse bg-white/4" />
                <div className="h-24 rounded-xl animate-pulse bg-white/4" />
              </div>
            ) : tab === "profile" ? (
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-muted/70 uppercase tracking-wider">Megjelenített név</label>
                  <input
                    type="text" value={name} onChange={e => setName(e.target.value)}
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
                    value={bio} onChange={e => setBio(e.target.value)} rows={3}
                    className="w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-all resize-none"
                    style={{ background: "#10101f", border: "1px solid rgba(255,255,255,0.08)" }}
                    onFocus={e => e.currentTarget.style.borderColor = "rgba(0,208,255,0.4)"}
                    onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
                    placeholder="Pár szó rólad..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-muted/70 uppercase tracking-wider">Email cím</label>
                  <div className="w-full rounded-xl px-4 py-3 text-sm text-muted/50 font-mono" style={{ background: "#0d0d1c", border: "1px solid rgba(255,255,255,0.04)" }}>
                    {user?.email}
                    <span className="ml-2 text-[10px] text-muted/30">(nem módosítható)</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-muted/70 uppercase tracking-wider">Profilikon előnézet</label>
                  <div className="flex items-center gap-4 p-4 rounded-xl" style={{ background: "#10101f", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <UserAvatar name={name || user?.name || "?"} email={user?.email} size={56} />
                    <div className="text-xs text-muted/60">
                      <div className="font-mono mb-1">Az egyedi ikonod a nevedből generált.</div>
                      <div className="text-muted/40">Minden felhasználónak egyedi mintája van.</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : tab === "password" ? (
              <div className="p-6 space-y-4">
                <div className="p-3 rounded-xl flex items-center gap-2 text-xs" style={{ background: "rgba(108,59,255,0.08)", border: "1px solid rgba(108,59,255,0.2)" }}>
                  <Shield size={13} className="text-[#6c3bff] shrink-0" />
                  <span className="text-muted/70">A jelszavad biztonságosan titkosítva van tárolva.</span>
                </div>
                {[
                  { label: "Jelenlegi jelszó", value: currentPassword, setValue: setCurrentPassword, show: showCurrent, setShow: setShowCurrent },
                  { label: "Új jelszó", value: newPassword, setValue: setNewPassword, show: showNew, setShow: setShowNew },
                  { label: "Új jelszó megerősítése", value: confirmPassword, setValue: setConfirmPassword, show: false, setShow: () => {} },
                ].map((field, i) => (
                  <div key={i} className="space-y-2">
                    <label className="text-[10px] font-mono text-muted/70 uppercase tracking-wider">{field.label}</label>
                    <div className="relative">
                      <input
                        type={field.show ? "text" : "password"}
                        value={field.value}
                        onChange={e => field.setValue(e.target.value)}
                        className="w-full rounded-xl px-4 py-3 pr-10 text-sm text-white focus:outline-none transition-all"
                        style={{ background: "#10101f", border: "1px solid rgba(255,255,255,0.08)" }}
                        onFocus={e => e.currentTarget.style.borderColor = "rgba(0,208,255,0.4)"}
                        onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
                        placeholder="••••••••"
                      />
                      {i < 2 && (
                        <button
                          type="button"
                          onClick={() => field.setShow(!field.show)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted/50 hover:text-white transition-colors"
                        >
                          {field.show ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {newPassword && confirmPassword && newPassword !== confirmPassword && (
                  <div className="text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle size={12} /> A jelszavak nem egyeznek
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 space-y-5">
                {stats ? (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <StatCard icon={<MessageSquare size={16} />} label="Üzenetek" value={stats.messageCount} color="#00d0ff" />
                      <StatCard icon={<Zap size={16} />} label="Chatok" value={stats.conversationCount} color="#6c3bff" />
                      <StatCard icon={<User size={16} />} label="Rang" value="Tag" color="#00ff88" />
                    </div>
                    <div className="p-4 rounded-xl space-y-3" style={{ background: "#10101f", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <div className="text-[10px] font-mono text-muted/50 uppercase tracking-widest mb-3">Fiók részletek</div>
                      {[
                        { label: "Csatlakozás dátuma", value: joinDate },
                        { label: "Fiók típusa", value: user?.role === "guest" ? "Vendég" : "OmegaTeck Tag" },
                        { label: "Felhasználói ID", value: `#${profile?.id}` },
                        { label: "Email cím", value: user?.email || "-" },
                      ].map((item, i) => (
                        <div key={i} className="flex justify-between items-center py-1 border-b border-white/3 last:border-0">
                          <span className="text-xs text-muted/50 font-mono">{item.label}</span>
                          <span className="text-xs text-white/70 font-mono">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    {[1,2,3].map(i => <div key={i} className="h-16 rounded-xl animate-pulse bg-white/4" />)}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error / Success */}
          {(error || success) && (
            <div className={`mx-6 mb-1 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 shrink-0 ${error ? "text-red-400" : "text-[#00ff88]"}`}
              style={{ background: error ? "rgba(239,68,68,0.08)" : "rgba(0,255,136,0.08)", border: `1px solid ${error ? "rgba(239,68,68,0.2)" : "rgba(0,255,136,0.2)"}` }}>
              {error ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}
              {error || success}
            </div>
          )}

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/6 bg-black/20 flex justify-end gap-3 shrink-0">
            <button onClick={() => onOpenChange(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-muted hover:text-white transition-colors">
              Mégse
            </button>
            {!isGuest && (
              <button
                onClick={tab === "password" ? handleChangePassword : tab === "stats" ? () => onOpenChange(false) : handleSaveProfile}
                disabled={updateMutation.isPending}
                className="px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #00d0ff, #6c3bff)", color: "#000", boxShadow: "0 0 16px rgba(0,208,255,0.25)" }}
              >
                <Save size={14} />
                {tab === "password" ? "Jelszó Módosítása" : tab === "stats" ? "Bezárás" : (saved ? "Mentve ✓" : updateMutation.isPending ? "Mentés..." : "Profil Mentése")}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function SettingRow({ icon, label, desc, children }: { icon: React.ReactNode; label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-white/4 last:border-0">
      <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
        <span className="text-muted/60 shrink-0">{icon}</span>
        <div>
          <div className="text-sm text-white/90">{label}</div>
          {desc && <div className="text-[11px] text-muted/50 mt-0.5">{desc}</div>}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="w-10 h-5.5 rounded-full relative transition-all"
      style={{
        background: value ? "linear-gradient(90deg, #00d0ff, #6c3bff)" : "rgba(255,255,255,0.1)",
        border: value ? "none" : "1px solid rgba(255,255,255,0.12)",
        width: 40, height: 22,
      }}
    >
      <div
        className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white transition-all"
        style={{ left: value ? "calc(100% - 20px)" : 2 }}
      />
    </button>
  );
}

export function SettingsModal({ open, onOpenChange }: ModalProps) {
  const [settingsTab, setSettingsTab] = useState<"ai" | "appearance" | "notifications" | "about">("ai");
  const [streamingMode, setStreamingMode] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [compactMode, setCompactMode] = useState(false);
  const [codeHighlight, setCodeHighlight] = useState(true);

  useEffect(() => { if (!open) setSettingsTab("ai"); }, [open]);

  if (!open) return null;

  const tabs = [
    { id: "ai", label: "AI Modell", icon: <Cpu size={13} /> },
    { id: "appearance", label: "Megjelenés", icon: <Palette size={13} /> },
    { id: "notifications", label: "Értesítések", icon: <Volume2 size={13} /> },
    { id: "about", label: "Névjegy", icon: <Info size={13} /> },
  ] as const;

  return (
    <>
      <ModalBackdrop onClose={() => onOpenChange(false)} />
      <div className="fixed inset-0 flex items-center justify-center p-4 pointer-events-none" style={{ zIndex: 1000 }}>
        <div
          className="relative w-full max-w-lg rounded-2xl overflow-hidden pointer-events-auto flex flex-col"
          style={{ background: "#0b0b1a", border: "1px solid rgba(0,208,255,0.15)", boxShadow: "0 24px 80px rgba(0,0,0,0.9), 0 0 60px rgba(0,208,255,0.05)", maxHeight: "90vh" }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-6 py-4 border-b border-white/6 bg-black/30 shrink-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(0,208,255,0.08)", border: "1px solid rgba(0,208,255,0.2)" }}>
              <Cpu size={15} className="text-[#00d0ff]" />
            </div>
            <h2 className="font-display font-bold text-base text-white flex-1">Rendszer beállítások</h2>
            <button onClick={() => onOpenChange(false)} className="text-muted hover:text-white transition-colors p-1 rounded-lg hover:bg-white/6">
              <X size={17} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/5 shrink-0 bg-black/20 overflow-x-auto">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setSettingsTab(t.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-all whitespace-nowrap px-2"
                style={{
                  color: settingsTab === t.id ? "#00d0ff" : "rgba(255,255,255,0.4)",
                  borderBottom: settingsTab === t.id ? "2px solid #00d0ff" : "2px solid transparent",
                }}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="overflow-y-auto flex-1 p-6">
            {settingsTab === "ai" && (
              <div className="space-y-5">
                {/* Model Card */}
                <div className="p-4 rounded-xl flex items-center gap-4" style={{ background: "#10101f", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <CortexAvatar size={52} />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-white">Cortex AI</div>
                    <div className="text-[11px] font-mono text-muted/60 mt-0.5">claude-sonnet-4-6 · Anthropic</div>
                    <div className="text-[10px] text-muted/40 mt-1">Legfrissebb Claude Sonnet modell</div>
                  </div>
                  <div className="px-2 py-1 rounded-md text-[10px] font-mono uppercase" style={{ background: "rgba(0,255,136,0.08)", border: "1px solid rgba(0,255,136,0.2)", color: "#00ff88" }}>
                    Aktív
                  </div>
                </div>

                {/* AI Settings */}
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="px-4 py-2 text-[10px] font-mono text-muted/50 uppercase tracking-widest" style={{ background: "#0e0e1e" }}>Chat beállítások</div>
                  <div className="px-4" style={{ background: "#10101f" }}>
                    <SettingRow icon={<Zap size={14} />} label="Streaming válasz" desc="Valós időben látod a generált szöveget">
                      <Toggle value={streamingMode} onChange={setStreamingMode} />
                    </SettingRow>
                    <SettingRow icon={<MessageSquare size={14} />} label="Automatikus görgetés" desc="Új üzeneteknél automatikusan legörgeti az oldalt">
                      <Toggle value={autoScroll} onChange={setAutoScroll} />
                    </SettingRow>
                    <SettingRow icon={<Globe size={14} />} label="Kód kiemelés" desc="Szintaxis kiemelés a kód blokkokban">
                      <Toggle value={codeHighlight} onChange={setCodeHighlight} />
                    </SettingRow>
                  </div>
                </div>

                {/* Capabilities */}
                <div>
                  <div className="text-[10px] font-mono text-muted/50 uppercase tracking-widest mb-3">Modell képességek</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Kód írás & debug", color: "#00d0ff" },
                      { label: "Magyar & angol", color: "#6c3bff" },
                      { label: "Kreatív tartalom", color: "#ff2e7e" },
                      { label: "Technikai elemzés", color: "#00ff88" },
                      { label: "Game Design", color: "#ffd700" },
                      { label: "Web fejlesztés", color: "#00c9ff" },
                    ].map((cap, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "#0e0e1e", border: "1px solid rgba(255,255,255,0.04)" }}>
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cap.color }} />
                        <span className="text-xs text-white/70">{cap.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {settingsTab === "appearance" && (
              <div className="space-y-5">
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="px-4 py-2 text-[10px] font-mono text-muted/50 uppercase tracking-widest" style={{ background: "#0e0e1e" }}>Felület</div>
                  <div className="px-4" style={{ background: "#10101f" }}>
                    <SettingRow icon={<Palette size={14} />} label="Sötét téma" desc="Cyberpunk dark mód (alapértelmezett)">
                      <Toggle value={true} onChange={() => {}} />
                    </SettingRow>
                    <SettingRow icon={<MessageSquare size={14} />} label="Kompakt nézet" desc="Kisebb üzenet buborékok">
                      <Toggle value={compactMode} onChange={setCompactMode} />
                    </SettingRow>
                    <SettingRow icon={<Info size={14} />} label="Időbélyegek" desc="Üzenet küldési idő megjelenítése">
                      <Toggle value={showTimestamps} onChange={setShowTimestamps} />
                    </SettingRow>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-mono text-muted/50 uppercase tracking-widest mb-3">Szín paletta</div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { name: "Háttér", color: "#03030a" },
                      { name: "Cyan", color: "#00d0ff" },
                      { name: "Lila", color: "#6c3bff" },
                      { name: "Pink", color: "#ff2e7e" },
                    ].map((c, i) => (
                      <div key={i} className="flex flex-col items-center gap-2">
                        <div className="w-10 h-10 rounded-xl shadow-lg" style={{ background: c.color, boxShadow: `0 0 12px ${c.color}40` }} />
                        <span className="text-[9px] font-mono text-muted/50">{c.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {settingsTab === "notifications" && (
              <div className="space-y-5">
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="px-4 py-2 text-[10px] font-mono text-muted/50 uppercase tracking-widest" style={{ background: "#0e0e1e" }}>Értesítési beállítások</div>
                  <div className="px-4" style={{ background: "#10101f" }}>
                    <SettingRow icon={<Volume2 size={14} />} label="Hang értesítések" desc="Hang lejátszása új üzenetnél">
                      <Toggle value={soundEnabled} onChange={setSoundEnabled} />
                    </SettingRow>
                  </div>
                </div>
                <div className="p-4 rounded-xl text-sm text-muted/50" style={{ background: "rgba(0,208,255,0.03)", border: "1px solid rgba(0,208,255,0.08)" }}>
                  <Globe size={14} className="text-[#00d0ff]/40 mb-2" />
                  Hamarosan több értesítési lehetőség érkezik. Az OmegaTeck folyamatosan fejleszti a Cortex AI platformot.
                </div>
              </div>
            )}

            {settingsTab === "about" && (
              <div className="space-y-5">
                <div className="flex flex-col items-center py-4 gap-3">
                  <CortexAvatar size={72} />
                  <div className="text-center">
                    <div className="font-display font-bold text-xl text-white tracking-wide">CORTEX AI</div>
                    <div className="text-[11px] font-mono text-muted/50 mt-1">v1.0.0 — OmegaTeck Technology</div>
                  </div>
                </div>

                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="px-4 py-2 text-[10px] font-mono text-muted/50 uppercase tracking-widest" style={{ background: "#0e0e1e" }}>Kapcsolat állapot</div>
                  <div className="px-4" style={{ background: "#10101f" }}>
                    {[
                      { icon: <Wifi size={13} />, name: "OmegaTeck Core Server", status: "Kapcsolódva", color: "#00ff88" },
                      { icon: <Cpu size={13} />, name: "Anthropic AI API", status: "Elérhető", color: "#00d0ff" },
                      { icon: <Shield size={13} />, name: "Biztonságos munkamenet", status: "Aktív", color: "#6c3bff" },
                    ].map((item, i) => (
                      <div key={i} className="py-3 flex items-center gap-3 border-b border-white/4 last:border-0">
                        <span style={{ color: item.color }}>{item.icon}</span>
                        <div className="flex-1">
                          <div className="text-xs text-white/80">{item.name}</div>
                          <div className="text-[10px] font-mono text-muted/50">{item.status}</div>
                        </div>
                        <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: item.color, boxShadow: `0 0 6px ${item.color}` }} />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl space-y-2 text-[11px] font-mono" style={{ background: "#10101f", border: "1px solid rgba(255,255,255,0.04)" }}>
                  {[
                    { k: "Platform", v: "CORTEX AI v1.0.0" },
                    { k: "Fejlesztő", v: "OmegaTeck Technology" },
                    { k: "Alapító", v: "Tibor" },
                    { k: "AI Motor", v: "Claude Sonnet 4.6" },
                    { k: "Projektek", v: "OmegaHumanity, VoidExio" },
                  ].map(({ k, v }, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-muted/40">{k}</span>
                      <span className="text-white/60">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-white/6 bg-black/20 flex justify-end shrink-0">
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
