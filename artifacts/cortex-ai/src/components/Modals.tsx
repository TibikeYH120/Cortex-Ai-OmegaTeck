import { useState, useEffect, useRef } from "react";
import {
  X, Save, ShieldAlert, User, Cpu, Wifi, Lock, BarChart3,
  Eye, EyeOff, CheckCircle2, AlertCircle, MessageSquare, Zap, Shield,
  Info, Globe, Volume2, Palette, Key, Mic, Play, Square, Loader2, BookOpen
} from "lucide-react";
import { useAppState } from "@/hooks/use-app-state";
import { UserAvatar, CortexAvatar } from "./AvatarUtils";
import { VOICE_OPTIONS, VOICE_SETTINGS_EVENT, type VoiceId } from "@/hooks/use-voice";

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
  const { user } = useAppState();
  const isGuest = true; // Demo mode
  const isLoading = false;
  const profile = { name: user?.name || "Demo User", bio: "", createdAt: new Date().toISOString(), id: 0 };

  const [tab, setTab] = useState<"profile" | "password" | "stats">("profile");
  const [name, setName] = useState(user?.name || "");
  const [bio, setBio] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [stats] = useState<{ conversationCount: number; messageCount: number; memberSince: string } | null>({ conversationCount: 0, messageCount: 0, memberSince: new Date().toISOString() });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
    onOpenChange(false);
  };

  const handleChangePassword = async () => {
    setError("Profile editing not available in demo mode.");
  };

  const updateMutation = { isPending: false };

  if (!open) return null;

  const joinDate = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "-";

  const tabs = [
    { id: "profile", label: "Profile", icon: <User size={13} /> },
    { id: "password", label: "Password", icon: <Key size={13} /> },
    { id: "stats", label: "Statistics", icon: <BarChart3 size={13} /> },
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
            <h2 className="font-display font-bold text-base text-white flex-1">User Account</h2>
            <button onClick={() => onOpenChange(false)} className="text-muted hover:text-white transition-colors p-1 rounded-lg hover:bg-white/6">
              <X size={17} />
            </button>
          </div>

          {/* Avatar Row */}
          <div className="px-6 py-5 flex items-center gap-5 border-b border-white/4 bg-black/10 shrink-0">
            {isGuest ? (
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-[#00d0ff]" style={{ background: "rgba(0,208,255,0.08)", border: "1px solid rgba(0,208,255,0.2)" }}>
                G
              </div>
            ) : (
              <UserAvatar name={user?.name || "?"} email={user?.email} size={64} />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-lg font-bold text-white truncate">{user?.name || "Guest"}</div>
              <div className="text-sm text-muted/60 font-mono truncate">{user?.email}</div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider font-semibold" style={{ background: "rgba(0,208,255,0.08)", border: "1px solid rgba(0,208,255,0.2)", color: "#00d0ff" }}>
                  {user?.role === "guest" ? "Guest" : "OmegaTeck Member"}
                </span>
                {!isGuest && <span className="text-[10px] text-muted/40 font-mono">Joined: {joinDate}</span>}
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
                  <p className="text-foreground/80">Profile editing is not available in guest mode. Sign up for the full OmegaTeck experience!</p>
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
                  <label className="text-[10px] font-mono text-muted/70 uppercase tracking-wider">Display name</label>
                  <input
                    type="text" value={name} onChange={e => setName(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-all"
                    style={{ background: "#10101f", border: "1px solid rgba(255,255,255,0.08)" }}
                    onFocus={e => e.currentTarget.style.borderColor = "rgba(0,208,255,0.4)"}
                    onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
                    placeholder="e.g. Alex"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-muted/70 uppercase tracking-wider">Bio</label>
                  <textarea
                    value={bio} onChange={e => setBio(e.target.value)} rows={3}
                    className="w-full rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-all resize-none"
                    style={{ background: "#10101f", border: "1px solid rgba(255,255,255,0.08)" }}
                    onFocus={e => e.currentTarget.style.borderColor = "rgba(0,208,255,0.4)"}
                    onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}
                    placeholder="A few words about you..."
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-muted/70 uppercase tracking-wider">Email address</label>
                  <div className="w-full rounded-xl px-4 py-3 text-sm text-muted/50 font-mono" style={{ background: "#0d0d1c", border: "1px solid rgba(255,255,255,0.04)" }}>
                    {user?.email}
                    <span className="ml-2 text-[10px] text-muted/30">(cannot be changed)</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-mono text-muted/70 uppercase tracking-wider">Avatar preview</label>
                  <div className="flex items-center gap-4 p-4 rounded-xl" style={{ background: "#10101f", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <UserAvatar name={name || user?.name || "?"} email={user?.email} size={56} />
                    <div className="text-xs text-muted/60">
                      <div className="font-mono mb-1">Your unique avatar is generated from your name.</div>
                      <div className="text-muted/40">Every user gets a distinct pattern.</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : tab === "password" ? (
              <div className="p-6 space-y-4">
                <div className="p-3 rounded-xl flex items-center gap-2 text-xs" style={{ background: "rgba(108,59,255,0.08)", border: "1px solid rgba(108,59,255,0.2)" }}>
                  <Shield size={13} className="text-[#6c3bff] shrink-0" />
                  <span className="text-muted/70">Your password is securely encrypted and stored.</span>
                </div>
                {[
                  { label: "Current password", value: currentPassword, setValue: setCurrentPassword, show: showCurrent, setShow: setShowCurrent },
                  { label: "New password", value: newPassword, setValue: setNewPassword, show: showNew, setShow: setShowNew },
                  { label: "Confirm new password", value: confirmPassword, setValue: setConfirmPassword, show: false, setShow: () => {} },
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
                    <AlertCircle size={12} /> Passwords do not match
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 space-y-5">
                {stats ? (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <StatCard icon={<MessageSquare size={16} />} label="Messages" value={stats.messageCount} color="#00d0ff" />
                      <StatCard icon={<Zap size={16} />} label="Chats" value={stats.conversationCount} color="#6c3bff" />
                      <StatCard icon={<User size={16} />} label="Rank" value="Member" color="#00ff88" />
                    </div>
                    <div className="p-4 rounded-xl space-y-3" style={{ background: "#10101f", border: "1px solid rgba(255,255,255,0.05)" }}>
                      <div className="text-[10px] font-mono text-muted/50 uppercase tracking-widest mb-3">Account details</div>
                      {[
                        { label: "Member since", value: joinDate },
                        { label: "Account type", value: user?.role === "guest" ? "Guest" : "OmegaTeck Member" },
                        { label: "User ID", value: `#${profile?.id}` },
                        { label: "Email", value: user?.email || "-" },
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
              Cancel
            </button>
            {!isGuest && (
              <button
                onClick={tab === "password" ? handleChangePassword : tab === "stats" ? () => onOpenChange(false) : handleSaveProfile}
                disabled={updateMutation.isPending}
                className="px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #00d0ff, #6c3bff)", color: "#000", boxShadow: "0 0 16px rgba(0,208,255,0.25)" }}
              >
                <Save size={14} />
                {tab === "password" ? "Change Password" : tab === "stats" ? "Close" : (saved ? "Saved ✓" : updateMutation.isPending ? "Saving..." : "Save Profile")}
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

const VOICE_STORAGE_KEY = "cortex_voice_id";
const AUTO_READ_STORAGE_KEY = "cortex_voice_auto_read";

export function SettingsModal({ open, onOpenChange }: ModalProps) {
  const [settingsTab, setSettingsTab] = useState<"ai" | "voice" | "instructions" | "appearance" | "notifications" | "about">("ai");
  const [streamingMode, setStreamingMode] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [compactMode, setCompactMode] = useState(false);
  const [codeHighlight, setCodeHighlight] = useState(true);

  const { isGuest } = useAppState();
  const updateMutation = useUpdateProfile();
  const queryClient = useQueryClient();

  const [cortexModel, setCortexModelState] = useState<"cortex" | "cortex-lite">(() => {
    try { return (localStorage.getItem("cortex_model") as "cortex" | "cortex-lite") || "cortex"; } catch { return "cortex"; }
  });

  const handleModelSelect = (m: "cortex" | "cortex-lite") => {
    setCortexModelState(m);
    try {
      localStorage.setItem("cortex_model", m);
      window.dispatchEvent(new CustomEvent("cortex-model-change", { detail: m }));
    } catch {}
  };

  const [sysAbout, setSysAbout] = useState<string>(() => {
    try { return localStorage.getItem("cortex_sys_about") ?? ""; } catch { return ""; }
  });
  const [sysRespond, setSysRespond] = useState<string>(() => {
    try { return localStorage.getItem("cortex_sys_respond") ?? ""; } catch { return ""; }
  });
  const [isSavingInstructions, setIsSavingInstructions] = useState(false);
  const [savedInstructions, setSavedInstructions] = useState(false);

  const { data: profileForInstructions } = useGetProfile({
    query: { enabled: open && !isGuest && settingsTab === "instructions" }
  });

  useEffect(() => {
    if (profileForInstructions) {
      const about = profileForInstructions.systemAbout ?? "";
      const respond = profileForInstructions.systemRespond ?? "";
      setSysAbout(about);
      setSysRespond(respond);
      try {
        localStorage.setItem("cortex_sys_about", about);
        localStorage.setItem("cortex_sys_respond", respond);
      } catch {}
    }
  }, [profileForInstructions]);

  const handleSaveInstructions = async () => {
    try { localStorage.setItem("cortex_sys_about", sysAbout); } catch {}
    try { localStorage.setItem("cortex_sys_respond", sysRespond); } catch {}
    if (!isGuest) {
      setIsSavingInstructions(true);
      try {
        await updateMutation.mutateAsync({ data: { systemAbout: sysAbout, systemRespond: sysRespond } });
        queryClient.invalidateQueries({ queryKey: getGetProfileQueryKey() });
        setSavedInstructions(true);
        setTimeout(() => setSavedInstructions(false), 2000);
      } catch {
        /* DB save failed — do not show success state */
      } finally {
        setIsSavingInstructions(false);
      }
    } else {
      setSavedInstructions(true);
      setTimeout(() => setSavedInstructions(false), 2000);
    }
  };

  const [selectedVoice, setSelectedVoice] = useState<VoiceId>(() => {
    try {
      const v = localStorage.getItem(VOICE_STORAGE_KEY);
      if (v && VOICE_OPTIONS.some(o => o.id === v)) return v as VoiceId;
    } catch {}
    return "nova";
  });
  const [autoRead, setAutoRead] = useState<boolean>(() => {
    try { return localStorage.getItem(AUTO_READ_STORAGE_KEY) === "true"; } catch { return false; }
  });
  const [previewingVoice,  setPreviewingVoice]  = useState<VoiceId | null>(null);
  const [loadingPreview,   setLoadingPreview]   = useState<VoiceId | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.src = "";
      previewAudioRef.current = null;
    }
    setPreviewingVoice(null);
    setLoadingPreview(null);
  };

  const handleVoicePreview = async (id: VoiceId) => {
    if (previewingVoice === id) { stopPreview(); return; }
    stopPreview();

    setLoadingPreview(id);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text: "Hello, I am Cortex AI. How can I help you?", voiceId: id }),
      });
      if (!res.ok) throw new Error("Preview failed");
      const buf  = await res.arrayBuffer();
      const blob = new Blob([buf], { type: "audio/mpeg" });
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      setLoadingPreview(null);
      setPreviewingVoice(id);
      audio.onended = () => { URL.revokeObjectURL(url); setPreviewingVoice(null); previewAudioRef.current = null; };
      audio.onerror = () => { URL.revokeObjectURL(url); setPreviewingVoice(null); setLoadingPreview(null); previewAudioRef.current = null; };
      await audio.play();
    } catch {
      setLoadingPreview(null);
      setPreviewingVoice(null);
    }
  };

  const handleVoiceSelect = (id: VoiceId) => {
    setSelectedVoice(id);
    try { localStorage.setItem(VOICE_STORAGE_KEY, id); } catch {}
    window.dispatchEvent(new CustomEvent(VOICE_SETTINGS_EVENT, { detail: { voiceId: id } }));
  };

  const handleAutoRead = (v: boolean) => {
    setAutoRead(v);
    try { localStorage.setItem(AUTO_READ_STORAGE_KEY, String(v)); } catch {}
    window.dispatchEvent(new CustomEvent(VOICE_SETTINGS_EVENT, { detail: { autoRead: v } }));
  };

  useEffect(() => { if (!open) { setSettingsTab("ai"); stopPreview(); } }, [open]);

  if (!open) return null;

  const tabs = [
    { id: "ai", label: "AI Model", icon: <Cpu size={13} /> },
    { id: "voice", label: "Voice", icon: <Mic size={13} /> },
    { id: "instructions", label: "Instructions", icon: <BookOpen size={13} /> },
    { id: "appearance", label: "Appearance", icon: <Palette size={13} /> },
    { id: "notifications", label: "Notifications", icon: <Volume2 size={13} /> },
    { id: "about", label: "About", icon: <Info size={13} /> },
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
            <h2 className="font-display font-bold text-base text-white flex-1">System Settings</h2>
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
            {settingsTab === "voice" && (
              <div className="space-y-5">
                {/* Auto-read toggle */}
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="px-4 py-2 text-[10px] font-mono text-muted/50 uppercase tracking-widest" style={{ background: "#0e0e1e" }}>Playback</div>
                  <div className="px-4" style={{ background: "#10101f" }}>
                    <SettingRow icon={<Volume2 size={14} />} label="Auto-read responses" desc="Automatically read AI replies aloud">
                      <Toggle value={autoRead} onChange={handleAutoRead} />
                    </SettingRow>
                  </div>
                </div>

                {/* Voice selector */}
                <div>
                  <div className="text-[10px] font-mono text-muted/50 uppercase tracking-widest mb-3">Voice character</div>
                  <div className="grid grid-cols-2 gap-3">
                    {VOICE_OPTIONS.map(v => (
                      <div
                        key={v.id}
                        className="flex flex-col items-start gap-2 p-4 rounded-xl transition-all cursor-pointer"
                        style={{
                          background: selectedVoice === v.id ? `${v.color}12` : "#10101f",
                          border: selectedVoice === v.id ? `1.5px solid ${v.color}60` : "1px solid rgba(255,255,255,0.05)",
                          boxShadow: selectedVoice === v.id ? `0 0 16px ${v.color}20` : "none",
                        }}
                        onClick={() => handleVoiceSelect(v.id)}
                      >
                        <div className="flex items-center gap-2 w-full">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: `${v.color}20`, border: `1px solid ${v.color}40` }}>
                            <Mic size={11} style={{ color: v.color }} />
                          </div>
                          <span className="font-display font-bold text-sm" style={{ color: selectedVoice === v.id ? v.color : "rgba(255,255,255,0.85)" }}>{v.label}</span>
                          {selectedVoice === v.id && (
                            <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: v.color, boxShadow: `0 0 6px ${v.color}` }} />
                          )}
                        </div>
                        <span className="text-[10px] text-muted/50 font-mono">{v.desc}</span>
                        {/* Preview button */}
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); void handleVoicePreview(v.id); }}
                          className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-lg transition-all mt-0.5"
                          style={{
                            background: previewingVoice === v.id ? `${v.color}25` : "rgba(255,255,255,0.04)",
                            border: `1px solid ${previewingVoice === v.id ? v.color + "60" : "rgba(255,255,255,0.08)"}`,
                            color: previewingVoice === v.id ? v.color : "rgba(255,255,255,0.4)",
                          }}
                        >
                          {loadingPreview === v.id ? (
                            <Loader2 size={9} className="animate-spin" />
                          ) : previewingVoice === v.id ? (
                            <Square size={9} />
                          ) : (
                            <Play size={9} />
                          )}
                          {loadingPreview === v.id ? "Loading…" : previewingVoice === v.id ? "Stop" : "Preview"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded-xl text-xs text-muted/50" style={{ background: "rgba(0,208,255,0.03)", border: "1px solid rgba(0,208,255,0.08)" }}>
                  <Mic size={13} className="text-[#00d0ff]/40 mb-2" />
                  Click the speaker icon on any AI message to hear it read aloud. Use the mic button in the chat input for voice input. Powered by OpenAI.
                </div>
              </div>
            )}

            {settingsTab === "instructions" && (
              <div className="space-y-5">
                {/* About section */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <User size={13} className="text-[#00d0ff]" />
                    <span className="text-xs font-semibold text-white/80">What should CORTEX AI know about you?</span>
                  </div>
                  <div className="text-[10px] font-mono text-muted/50 mb-2">
                    Your background, expertise, location, or anything the AI should always keep in mind.
                  </div>
                  <div className="relative">
                    <textarea
                      value={sysAbout}
                      onChange={e => setSysAbout(e.target.value.slice(0, 500))}
                      placeholder={"e.g. I'm a software engineer who works with Python and TypeScript. I prefer concise, direct answers with code examples."}
                      rows={4}
                      className="w-full rounded-xl text-sm text-foreground resize-none px-4 py-3 outline-none transition-all focus:shadow-[0_0_0_2px_rgba(0,208,255,0.25)]"
                      style={{ background: "#10101f", border: "1px solid rgba(255,255,255,0.07)", caretColor: "#00d0ff" }}
                    />
                    <span className="absolute bottom-2 right-3 text-[10px] font-mono text-muted/40 tabular-nums">
                      {sysAbout.length}/500
                    </span>
                  </div>
                </div>

                {/* Respond section */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare size={13} className="text-[#6c3bff]" />
                    <span className="text-xs font-semibold text-white/80">How should CORTEX AI respond?</span>
                  </div>
                  <div className="text-[10px] font-mono text-muted/50 mb-2">
                    Preferred tone, language, response length, or formatting style.
                  </div>
                  <div className="relative">
                    <textarea
                      value={sysRespond}
                      onChange={e => setSysRespond(e.target.value.slice(0, 500))}
                      placeholder={"e.g. Always respond in Hungarian. Keep answers short and to the point. Avoid unnecessary filler phrases."}
                      rows={4}
                      className="w-full rounded-xl text-sm text-foreground resize-none px-4 py-3 outline-none transition-all focus:shadow-[0_0_0_2px_rgba(108,59,255,0.25)]"
                      style={{ background: "#10101f", border: "1px solid rgba(255,255,255,0.07)", caretColor: "#6c3bff" }}
                    />
                    <span className="absolute bottom-2 right-3 text-[10px] font-mono text-muted/40 tabular-nums">
                      {sysRespond.length}/500
                    </span>
                  </div>
                </div>

                {/* Save button */}
                <button
                  onClick={handleSaveInstructions}
                  disabled={isSavingInstructions}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: savedInstructions
                      ? "linear-gradient(135deg, #00ff88, #00d0ff)"
                      : "linear-gradient(135deg, #00d0ff, #6c3bff)",
                    color: "#000",
                    boxShadow: savedInstructions
                      ? "0 0 20px rgba(0,255,136,0.3)"
                      : "0 0 20px rgba(0,208,255,0.2)",
                  }}
                >
                  {isSavingInstructions ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : savedInstructions ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <Save size={14} />
                  )}
                  {isSavingInstructions ? "Saving…" : savedInstructions ? "Saved!" : "Save Instructions"}
                </button>

                {isGuest && (
                  <div className="px-4 py-3 rounded-xl text-[11px] text-muted/60 font-mono text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    Sign in to sync instructions across devices
                  </div>
                )}
              </div>
            )}

            {settingsTab === "ai" && (
              <div className="space-y-5">
                {/* Model Selector */}
                <div>
                  <div className="text-[10px] font-mono text-muted/50 uppercase tracking-widest mb-3">Select Engine</div>
                  <div className="grid grid-cols-2 gap-3">
                    {/* CORTEX */}
                    <button
                      type="button"
                      onClick={() => handleModelSelect("cortex")}
                      className="flex flex-col items-start gap-2 p-4 rounded-xl text-left transition-all"
                      style={{
                        background: cortexModel === "cortex" ? "rgba(0,208,255,0.07)" : "#10101f",
                        border: cortexModel === "cortex" ? "1.5px solid rgba(0,208,255,0.45)" : "1px solid rgba(255,255,255,0.06)",
                        boxShadow: cortexModel === "cortex" ? "0 0 20px rgba(0,208,255,0.12)" : "none",
                      }}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(0,208,255,0.12)", border: "1px solid rgba(0,208,255,0.25)" }}>
                          <Cpu size={14} style={{ color: "#00d0ff" }} />
                        </div>
                        <span className="font-display font-bold text-sm" style={{ color: cortexModel === "cortex" ? "#00d0ff" : "rgba(255,255,255,0.85)" }}>CORTEX</span>
                        {cortexModel === "cortex" && (
                          <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: "#00d0ff", boxShadow: "0 0 6px #00d0ff" }} />
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-muted/50">Advanced AI Engine</span>
                      <div className="px-2 py-0.5 rounded text-[9px] font-mono uppercase" style={{ background: "rgba(0,208,255,0.08)", color: "#00d0ff", border: "1px solid rgba(0,208,255,0.2)" }}>
                        Most Capable
                      </div>
                    </button>

                    {/* CORTEX LITE */}
                    <button
                      type="button"
                      onClick={() => handleModelSelect("cortex-lite")}
                      className="flex flex-col items-start gap-2 p-4 rounded-xl text-left transition-all"
                      style={{
                        background: cortexModel === "cortex-lite" ? "rgba(108,59,255,0.07)" : "#10101f",
                        border: cortexModel === "cortex-lite" ? "1.5px solid rgba(108,59,255,0.5)" : "1px solid rgba(255,255,255,0.06)",
                        boxShadow: cortexModel === "cortex-lite" ? "0 0 20px rgba(108,59,255,0.12)" : "none",
                      }}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(108,59,255,0.12)", border: "1px solid rgba(108,59,255,0.25)" }}>
                          <Zap size={14} style={{ color: "#6c3bff" }} />
                        </div>
                        <span className="font-display font-bold text-sm" style={{ color: cortexModel === "cortex-lite" ? "#6c3bff" : "rgba(255,255,255,0.85)" }}>CORTEX LITE</span>
                        {cortexModel === "cortex-lite" && (
                          <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: "#6c3bff", boxShadow: "0 0 6px #6c3bff" }} />
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-muted/50">Lite AI Engine</span>
                      <div className="px-2 py-0.5 rounded text-[9px] font-mono uppercase" style={{ background: "rgba(108,59,255,0.08)", color: "#6c3bff", border: "1px solid rgba(108,59,255,0.2)" }}>
                        Fast &amp; Light
                      </div>
                    </button>
                  </div>
                </div>

                {/* Chat Settings */}
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="px-4 py-2 text-[10px] font-mono text-muted/50 uppercase tracking-widest" style={{ background: "#0e0e1e" }}>Chat settings</div>
                  <div className="px-4" style={{ background: "#10101f" }}>
                    <SettingRow icon={<Zap size={14} />} label="Streaming response" desc="See generated text in real time">
                      <Toggle value={streamingMode} onChange={setStreamingMode} />
                    </SettingRow>
                    <SettingRow icon={<MessageSquare size={14} />} label="Auto-scroll" desc="Automatically scroll to new messages">
                      <Toggle value={autoScroll} onChange={setAutoScroll} />
                    </SettingRow>
                    <SettingRow icon={<Globe size={14} />} label="Code highlighting" desc="Syntax highlighting in code blocks">
                      <Toggle value={codeHighlight} onChange={setCodeHighlight} />
                    </SettingRow>
                  </div>
                </div>

                {/* Capabilities */}
                <div>
                  <div className="text-[10px] font-mono text-muted/50 uppercase tracking-widest mb-3">Model capabilities</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Code writing & debug", color: "#00d0ff" },
                      { label: "Multi-language support", color: "#6c3bff" },
                      { label: "Creative content", color: "#ff2e7e" },
                      { label: "Technical analysis", color: "#00ff88" },
                      { label: "Game design", color: "#ffd700" },
                      { label: "Web development", color: "#00c9ff" },
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
                  <div className="px-4 py-2 text-[10px] font-mono text-muted/50 uppercase tracking-widest" style={{ background: "#0e0e1e" }}>Interface</div>
                  <div className="px-4" style={{ background: "#10101f" }}>
                    <SettingRow icon={<Palette size={14} />} label="Dark theme" desc="Cyberpunk dark mode (default)">
                      <Toggle value={true} onChange={() => {}} />
                    </SettingRow>
                    <SettingRow icon={<MessageSquare size={14} />} label="Compact view" desc="Smaller message bubbles">
                      <Toggle value={compactMode} onChange={setCompactMode} />
                    </SettingRow>
                    <SettingRow icon={<Info size={14} />} label="Timestamps" desc="Show message send time">
                      <Toggle value={showTimestamps} onChange={setShowTimestamps} />
                    </SettingRow>
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-mono text-muted/50 uppercase tracking-widest mb-3">Color palette</div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { name: "Background", color: "#03030a" },
                      { name: "Cyan", color: "#00d0ff" },
                      { name: "Purple", color: "#6c3bff" },
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
                  <div className="px-4 py-2 text-[10px] font-mono text-muted/50 uppercase tracking-widest" style={{ background: "#0e0e1e" }}>Notification settings</div>
                  <div className="px-4" style={{ background: "#10101f" }}>
                    <SettingRow icon={<Volume2 size={14} />} label="Sound notifications" desc="Play sound on new message">
                      <Toggle value={soundEnabled} onChange={setSoundEnabled} />
                    </SettingRow>
                  </div>
                </div>
                <div className="p-4 rounded-xl text-sm text-muted/50" style={{ background: "rgba(0,208,255,0.03)", border: "1px solid rgba(0,208,255,0.08)" }}>
                  <Globe size={14} className="text-[#00d0ff]/40 mb-2" />
                  More notification options coming soon. OmegaTeck is continuously improving the Cortex AI platform.
                </div>
              </div>
            )}

            {settingsTab === "about" && (
              <div className="space-y-5">
                <div className="flex flex-col items-center py-4 gap-3">
                  <CortexAvatar size={72} />
                  <div className="text-center">
                    <div className="font-display font-bold text-xl text-white tracking-wide">CORTEX AI</div>
                    <div className="text-[11px] font-mono text-muted/50 mt-1">v9 Beta — OmegaTeck Technology</div>
                  </div>
                </div>

                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="px-4 py-2 text-[10px] font-mono text-muted/50 uppercase tracking-widest" style={{ background: "#0e0e1e" }}>Connection status</div>
                  <div className="px-4" style={{ background: "#10101f" }}>
                    {[
                      { icon: <Wifi size={13} />, name: "OmegaTeck Core Server", status: "Connected", color: "#00ff88" },
                      { icon: <Cpu size={13} />, name: "CORTEX AI Engine", status: "Available", color: "#00d0ff" },
                      { icon: <Shield size={13} />, name: "Secure session", status: "Active", color: "#6c3bff" },
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
                    { k: "Platform", v: "CORTEX AI v9 Beta" },
                    { k: "Developer", v: "OmegaTeck Technology" },
                    { k: "Founder", v: "Tibor" },
                    { k: "AI Engine", v: "CORTEX AI Engine" },
                    { k: "Projects", v: "OmegaHumanity, VoidExio" },
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
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
