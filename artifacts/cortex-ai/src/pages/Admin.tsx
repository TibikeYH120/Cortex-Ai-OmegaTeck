import { useState, useEffect, useCallback } from "react";
import { Shield, RefreshCw, Zap, User, Trash2, KeyRound, ChevronDown, ChevronUp, Eye, EyeOff, LogOut, Database } from "lucide-react";
import { cn } from "@/lib/utils";

const API = "/api/admin";

interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  todayMsgs: number;
  totalMsgs: number;
}

interface CacheStats {
  configured: boolean;
  totalCached: number;
  freshCached: number;
}

function useAdminFetch(password: string) {
  return useCallback(
    (path: string, opts: RequestInit = {}) =>
      fetch(`${API}${path}`, {
        ...opts,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": password,
          ...(opts.headers as Record<string, string> | undefined),
        },
      }),
    [password]
  );
}

// ── Password gate ──────────────────────────────────────────────────────────────
function PasswordGate({ onAuth }: { onAuth: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr("");
    const res = await fetch(`${API}/verify`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    setLoading(false);
    if (res.ok) {
      onAuth(pw);
    } else {
      setErr("Hibás jelszó. Próbáld újra.");
      setPw("");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      <div className="cyber-blob bg-primary w-[40vw] h-[40vh] -top-[5%] -left-[5%]" />
      <div className="cyber-blob bg-secondary w-[40vw] h-[40vh] -bottom-[5%] -right-[5%]" />

      <form
        onSubmit={submit}
        className="glass-ai rounded-2xl p-8 w-full max-w-sm shadow-2xl relative z-10"
      >
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
            <Shield size={20} className="text-primary" />
          </div>
          <div>
            <div className="font-display font-bold text-white text-sm tracking-wide">CORTEX ADMIN</div>
            <div className="font-mono text-[10px] text-muted/60 tracking-widest uppercase">OmegaTeck Control Panel</div>
          </div>
        </div>

        <div className="space-y-1.5 mb-4">
          <label className="font-mono text-[10px] text-muted uppercase tracking-widest">Admin jelszó</label>
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={pw}
              onChange={e => setPw(e.target.value)}
              placeholder="••••••••••"
              autoFocus
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all pr-11"
            />
            <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors">
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {err && (
          <p className="text-destructive text-xs font-mono mb-4">{err}</p>
        )}

        <button
          type="submit"
          disabled={!pw || loading}
          className="w-full py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-primary to-secondary text-black transition-all hover:-translate-y-0.5 hover:shadow-[0_0_20px_rgba(0,208,255,0.4)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "Ellenőrzés..." : "Belépés"}
        </button>
      </form>
    </div>
  );
}

// ── User row ───────────────────────────────────────────────────────────────────
function UserRow({
  user,
  adminFetch,
  onRefresh,
}: {
  user: AdminUser;
  adminFetch: ReturnType<typeof useAdminFetch>;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [roleLoading, setRoleLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  const isPlus = user.role === "cortex_plus";

  const toggleRole = async () => {
    setRoleLoading(true);
    const newRole = isPlus ? "member" : "cortex_plus";
    await adminFetch(`/users/${user.id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role: newRole }),
    });
    setRoleLoading(false);
    onRefresh();
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPw) return;
    setPwLoading(true);
    setPwMsg("");
    const res = await adminFetch(`/users/${user.id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ newPassword: newPw }),
    });
    setPwLoading(false);
    if (res.ok) {
      setPwMsg("✓ Jelszó frissítve");
      setNewPw("");
    } else {
      setPwMsg("✗ Hiba történt");
    }
  };

  const deleteUser = async () => {
    if (!confirm(`Biztosan törlöd: ${user.name}?`)) return;
    await adminFetch(`/users/${user.id}`, { method: "DELETE" });
    onRefresh();
  };

  return (
    <div className="glass-ai rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/3 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <User size={14} className="text-primary/70" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white truncate">{user.name}</span>
            <span className={cn(
              "font-mono text-[9px] px-1.5 py-0.5 rounded uppercase tracking-widest",
              isPlus
                ? "bg-[#f97316]/15 text-[#f97316] border border-[#f97316]/30"
                : "bg-white/5 text-muted/60 border border-white/8"
            )}>
              {isPlus ? "✦ Plus" : "Member"}
            </span>
          </div>
          <div className="text-[10px] font-mono text-muted/50 truncate">{user.email}</div>
        </div>

        <div className="hidden sm:flex items-center gap-4 text-[10px] font-mono text-muted/50 shrink-0">
          <span title="Ma">{user.todayMsgs} ma</span>
          <span title="Összesen">{user.totalMsgs} össz.</span>
          <span>{new Date(user.createdAt).toLocaleDateString("hu-HU")}</span>
        </div>

        {expanded ? <ChevronUp size={14} className="text-muted/50 shrink-0" /> : <ChevronDown size={14} className="text-muted/50 shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-white/6 px-4 py-4 flex flex-col sm:flex-row gap-4">
          <div className="flex sm:flex-col gap-2 shrink-0">
            <button
              onClick={toggleRole}
              disabled={roleLoading}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono font-semibold transition-all disabled:opacity-50 whitespace-nowrap",
                isPlus
                  ? "bg-white/5 border border-white/10 text-muted hover:text-white hover:border-white/20"
                  : "bg-[#f97316]/10 border border-[#f97316]/30 text-[#f97316] hover:bg-[#f97316]/20"
              )}
            >
              <Zap size={12} />
              {roleLoading ? "..." : isPlus ? "Visszaminősítés" : "Plus aktiválás"}
            </button>

            <button
              onClick={deleteUser}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono text-red-400/70 border border-red-400/20 hover:bg-red-400/10 hover:text-red-400 transition-all"
            >
              <Trash2 size={12} />
              Törlés
            </button>
          </div>

          <form onSubmit={resetPassword} className="flex-1 flex flex-col gap-2">
            <label className="font-mono text-[10px] text-muted/60 uppercase tracking-widest flex items-center gap-1.5">
              <KeyRound size={10} />
              Jelszó visszaállítás
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                placeholder="Új jelszó (min. 6 karakter)"
                className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-muted/40 focus:outline-none focus:border-primary/40 transition-all"
              />
              <button
                type="submit"
                disabled={!newPw || newPw.length < 6 || pwLoading}
                className="px-3 py-2 rounded-xl text-xs font-mono bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {pwLoading ? "..." : "Mentés"}
              </button>
            </div>
            {pwMsg && (
              <span className={cn("text-[10px] font-mono", pwMsg.startsWith("✓") ? "text-[#00ff88]" : "text-destructive")}>
                {pwMsg}
              </span>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

// ── Admin page ─────────────────────────────────────────────────────────────────
export function Admin() {
  const [password, setPassword] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);

  const adminFetch = useAdminFetch(password);

  const loadUsers = useCallback(async () => {
    if (!password) return;
    setLoading(true);
    try {
      const res = await adminFetch("/users");
      if (res.ok) setUsers(await res.json());
    } finally {
      setLoading(false);
    }
  }, [password, adminFetch]);

  const loadCacheStats = useCallback(async () => {
    if (!password) return;
    try {
      const res = await adminFetch("/search-cache-stats");
      if (res.ok) setCacheStats(await res.json());
    } catch {
      // ignore — widget just stays hidden
    }
  }, [password, adminFetch]);

  useEffect(() => {
    if (password) {
      loadUsers();
      loadCacheStats();
    }
  }, [password, loadUsers, loadCacheStats]);

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const plusCount = users.filter(u => u.role === "cortex_plus").length;

  if (!password) {
    return <PasswordGate onAuth={pw => setPassword(pw)} />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <div className="cyber-blob bg-primary w-[40vw] h-[40vh] -top-[5%] -left-[5%]" />
      <div className="cyber-blob bg-secondary w-[35vw] h-[35vh] -bottom-[5%] -right-[5%]" />

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
              <Shield size={20} className="text-primary" />
            </div>
            <div>
              <div className="font-display font-bold text-white tracking-wide">CORTEX ADMIN</div>
              <div className="font-mono text-[10px] text-muted/50 tracking-widest">OmegaTeck Control Panel</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { loadUsers(); loadCacheStats(); }}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono text-muted hover:text-white hover:bg-white/5 border border-white/8 transition-all"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Frissítés
            </button>
            <button
              onClick={() => setPassword("")}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-mono text-muted hover:text-red-400 hover:bg-red-400/10 border border-white/8 transition-all"
            >
              <LogOut size={13} />
              Kilépés
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Összes felhasználó", value: users.length },
            { label: "Cortex Plus", value: plusCount },
            { label: "Ma aktív", value: users.filter(u => u.todayMsgs > 0).length },
          ].map(stat => (
            <div key={stat.label} className="glass-ai rounded-xl px-4 py-3 text-center">
              <div className="font-display font-bold text-2xl text-primary">{stat.value}</div>
              <div className="font-mono text-[10px] text-muted/60 uppercase tracking-widest mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Search cache (Cloudflare D1) */}
        {cacheStats && (
          <div className="relative overflow-hidden rounded-xl mb-6 px-4 py-2.5 flex items-center gap-3 bg-white/[0.02] backdrop-blur-xl border border-white/[0.06] transition-colors hover:border-white/10">
            <div className="w-6 h-6 rounded-md bg-white/5 border border-white/8 flex items-center justify-center shrink-0">
              <Database size={11} className="text-muted/70" />
            </div>

            <span className="text-[11px] font-mono text-muted/50 tracking-wide">Kereső cache</span>

            <span className={cn(
              "w-1 h-1 rounded-full shrink-0",
              cacheStats.configured ? "bg-[#00ff88]/70 shadow-[0_0_6px_rgba(0,255,136,0.5)]" : "bg-muted/30"
            )} />

            <span className="text-[10px] font-mono text-muted/35">
              {cacheStats.configured ? "D1 aktív" : "nincs konfigurálva"}
            </span>

            <div className="flex-1" />

            <div className="hidden sm:flex items-center gap-3 shrink-0 text-[10px] font-mono text-muted/40">
              <span>{cacheStats.freshCached} friss</span>
              <span className="w-px h-3 bg-white/10" />
              <span>{cacheStats.totalCached} összesen</span>
            </div>
          </div>
        )}

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Keresés név vagy email alapján..."
          className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-muted/40 focus:outline-none focus:border-primary/40 transition-all mb-4"
        />

        {/* User list */}
        <div className="flex flex-col gap-2">
          {loading && users.length === 0 ? (
            <div className="text-center py-12 font-mono text-muted/50 text-sm">Betöltés...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 font-mono text-muted/50 text-sm">Nincs találat</div>
          ) : (
            filtered.map(user => (
              <UserRow key={user.id} user={user} adminFetch={adminFetch} onRefresh={loadUsers} />
            ))
          )}
        </div>

        <div className="mt-8 text-center font-mono text-[10px] text-muted/30">
          OmegaTeck Technology · CORTEX Admin v1.0
        </div>
      </div>
    </div>
  );
}
