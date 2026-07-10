import { useState } from "react";
import { useLoginUser, useRegisterUser } from "@workspace/api-client-react";
import { useAppState } from "@/hooks/use-app-state";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, AlertCircle, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export function AuthScreen() {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [showPass, setShowPass] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const loginMutation = useLoginUser();
  const registerMutation = useRegisterUser();
  const { setGuestMode } = useAppState();
  const queryClient = useQueryClient();

  const isPending = loginMutation.isPending || registerMutation.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!email || !password || (tab === "register" && !name)) {
      setErrorMsg("Please fill in all fields!");
      return;
    }

    try {
      if (tab === "login") {
        await loginMutation.mutateAsync({ data: { email, password } });
      } else {
        if (password.length < 6) {
          setErrorMsg("Password must be at least 6 characters!");
          return;
        }
        await registerMutation.mutateAsync({ data: { name, email, password } });
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      window.location.reload();

    } catch (err: any) {
      setErrorMsg(err.message || "Invalid credentials or network error.");
    }
  };

  const handleGuest = () => {
    setGuestMode(true);
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative p-4 bg-background overflow-hidden">
      {/* Background blobs */}
      <div className="cyber-blob bg-primary w-[60vw] h-[60vh] -top-[15%] -left-[15%]" />
      <div className="cyber-blob bg-secondary w-[55vw] h-[55vh] -bottom-[15%] -right-[15%]" />

      {/* Subtle grid pattern */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(0,208,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(0,208,255,0.025) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
          zIndex: 0,
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[420px]"
      >
        {/* Glow behind card */}
        <div
          className="absolute inset-0 rounded-[28px] blur-2xl opacity-30 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(0,208,255,0.25) 0%, transparent 70%)" }}
        />

        <div className="glass-auth rounded-[28px] overflow-hidden relative">
          {/* Top edge highlight */}
          <div className="absolute top-0 left-6 right-6 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(0,208,255,0.5), transparent)" }} />

          <div className="p-8">
            {/* Logo */}
            <div className="flex flex-col items-center mb-8">
              <div className="relative mb-4">
                <div className="absolute inset-0 rounded-full blur-xl opacity-60" style={{ background: "rgba(0,208,255,0.3)" }} />
                <svg viewBox="0 0 40 40" fill="none" className="relative w-14 h-14">
                  <circle cx="20" cy="20" r="18" stroke="#00d0ff" strokeWidth="1.5" strokeDasharray="4 2" opacity=".35"/>
                  <path d="M20 4C11.16 4 4 11.16 4 20c0 5.8 3.1 10.86 7.76 13.74L14.5 29.5C11.3 27.5 9.2 24 9.2 20c0-5.96 4.84-10.8 10.8-10.8S30.8 14.04 30.8 20c0 4-2.1 7.5-5.3 9.5l2.74 4.24C32.9 30.86 36 25.8 36 20c0-8.84-7.16-16-16-16z" fill="#00d0ff" opacity=".9"/>
                  <circle cx="20" cy="20" r="3.5" fill="#00d0ff"/>
                </svg>
              </div>
              <span className="font-mono text-[9px] text-primary/80 tracking-[0.35em] uppercase mb-1.5">OmegaTeck Technology</span>
              <h1 className="font-display font-black text-2xl text-white tracking-widest text-glow-sm">CORTEX AI</h1>
            </div>

            {/* Tabs */}
            <div className="flex p-1 bg-black/40 border border-white/6 rounded-2xl mb-6 gap-1">
              {(["login", "register"] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setTab(t); setErrorMsg(""); }}
                  className={cn(
                    "flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200",
                    tab === t
                      ? "bg-white/7 text-white border border-white/10 shadow-sm"
                      : "text-muted/70 hover:text-white/80"
                  )}
                >
                  {t === "login" ? "Sign In" : "Register"}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {errorMsg && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                  animate={{ opacity: 1, height: "auto", marginBottom: 20 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-center gap-2.5 px-4 py-3 bg-destructive/8 border border-destructive/25 rounded-xl text-destructive text-sm">
                    <AlertCircle size={15} className="shrink-0" />
                    <span className="leading-snug">{errorMsg}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <AnimatePresence>
                {tab === "register" && (
                  <motion.div
                    key="name-field"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-mono text-muted/70 uppercase tracking-[0.15em] ml-1">Username</label>
                      <input
                        type="text" value={name} onChange={e => setName(e.target.value)}
                        placeholder="e.g. Alex"
                        className="w-full bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder:text-muted/40 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono text-muted/70 uppercase tracking-[0.15em] ml-1">Email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@omegateck.hu"
                  autoComplete="email"
                  className="w-full bg-white/3 border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder:text-muted/40 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-mono text-muted/70 uppercase tracking-[0.15em] ml-1">Password</label>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder={tab === "register" ? "Min. 6 characters" : "••••••••"}
                    autoComplete={tab === "register" ? "new-password" : "current-password"}
                    className="w-full bg-white/3 border border-white/8 rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder:text-muted/40 outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted/50 hover:text-white transition-colors"
                  >
                    {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="group relative w-full py-3.5 mt-1 rounded-xl text-sm font-bold overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                style={{
                  background: "linear-gradient(135deg, #00d0ff 0%, #6c3bff 100%)",
                  boxShadow: "0 0 20px rgba(0,208,255,0.25), 0 4px 16px rgba(0,0,0,0.3)",
                }}
              >
                <span
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 60%)" }}
                />
                <span className="relative flex items-center justify-center gap-2 text-black font-bold">
                  {isPending ? (
                    <span className="font-mono tracking-widest text-xs">CONNECTING…</span>
                  ) : (
                    <>
                      <span>{tab === "login" ? "SIGN IN" : "CREATE ACCOUNT"}</span>
                      {!isPending && <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />}
                    </>
                  )}
                </span>
              </button>
            </form>

            <div className="flex items-center gap-3 my-5">
              <div className="h-px flex-1 bg-white/6" />
              <span className="text-[10px] font-mono text-muted uppercase tracking-widest">or</span>
              <div className="h-px flex-1 bg-white/6" />
            </div>

            <button
              type="button"
              onClick={handleGuest}
              className="w-full py-3 rounded-xl text-sm font-medium bg-white/3 border border-white/7 text-white/80 hover:bg-white/5 hover:border-white/12 hover:text-white transition-all"
            >
              Continue as guest
              <span className="ml-2 text-muted text-xs font-mono">20 msgs/day</span>
            </button>
          </div>
        </div>

        <p className="text-center text-[10px] font-mono text-muted/60 mt-5 tracking-widest uppercase">
          OmegaTeck Technology © 2026
        </p>
      </motion.div>
    </div>
  );
}
