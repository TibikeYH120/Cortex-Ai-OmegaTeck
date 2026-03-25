import { useState } from "react";
import { useLoginUser, useRegisterUser } from "@workspace/api-client-react";
import { useAppState } from "@/hooks/use-app-state";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
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
    <div className="min-h-screen flex items-center justify-center relative p-4 bg-background z-10 overflow-hidden">
      <div className="cyber-blob bg-primary w-[50vw] h-[50vh] -top-[10%] -left-[10%]" />
      <div className="cyber-blob bg-secondary w-[50vw] h-[50vh] -bottom-[10%] -right-[10%]" />

      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-[420px] bg-s2/80 backdrop-blur-2xl border border-border2 rounded-[24px] p-8 shadow-2xl shadow-black relative overflow-hidden"
      >
        {/* Logo Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative w-14 h-14 mb-4">
            <svg viewBox="0 0 40 40" fill="none" className="w-full h-full drop-shadow-[0_0_15px_rgba(0,208,255,0.4)]">
              <circle cx="20" cy="20" r="18" stroke="#00d0ff" strokeWidth="1.5" strokeDasharray="4 2" opacity=".4"/>
              <path d="M20 4C11.16 4 4 11.16 4 20c0 5.8 3.1 10.86 7.76 13.74L14.5 29.5C11.3 27.5 9.2 24 9.2 20c0-5.96 4.84-10.8 10.8-10.8S30.8 14.04 30.8 20c0 4-2.1 7.5-5.3 9.5l2.74 4.24C32.9 30.86 36 25.8 36 20c0-8.84-7.16-16-16-16z" fill="#00d0ff" opacity=".85"/>
              <circle cx="20" cy="20" r="3.5" fill="#00d0ff" opacity=".9"/>
            </svg>
          </div>
          <span className="font-mono text-[10px] text-primary tracking-[0.3em] uppercase mb-1">OmegaTeck</span>
          <h1 className="font-display font-black text-3xl text-white tracking-wide">CORTEX AI</h1>
        </div>

        <div className="text-center mb-8">
          <h2 className="text-xl font-bold text-white mb-1">Welcome back</h2>
          <p className="text-sm text-muted">Sign in to your account to continue</p>
        </div>

        {/* Tabs */}
        <div className="flex p-1 bg-s3 border border-border rounded-xl mb-6">
          <button 
            type="button"
            onClick={() => { setTab("login"); setErrorMsg(""); }}
            className={cn(
              "flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all",
              tab === "login" ? "bg-s2 text-white shadow-sm border border-border" : "text-muted hover:text-white/80"
            )}
          >
            Sign In
          </button>
          <button 
            type="button"
            onClick={() => { setTab("register"); setErrorMsg(""); }}
            className={cn(
              "flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all",
              tab === "register" ? "bg-s2 text-white shadow-sm border border-border" : "text-muted hover:text-white/80"
            )}
          >
            Register
          </button>
        </div>

        {errorMsg && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6">
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm font-medium">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          </motion.div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === "register" && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono text-muted uppercase ml-1">Username</label>
              <input 
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Alex"
                className="w-full bg-s3 border border-border rounded-xl px-4 py-3.5 text-sm text-white placeholder:text-muted/60 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[11px] font-mono text-muted uppercase ml-1">Email address</label>
            <input 
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="e.g. alex@omegateck.hu"
              autoComplete="email"
              className="w-full bg-s3 border border-border rounded-xl px-4 py-3.5 text-sm text-white placeholder:text-muted/60 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          <div className="space-y-1.5 relative">
            <label className="text-[11px] font-mono text-muted uppercase ml-1">Password</label>
            <div className="relative">
              <input 
                type={showPass ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                placeholder={tab === "register" ? "Minimum 6 characters" : "••••••••"}
                autoComplete={tab === "register" ? "new-password" : "current-password"}
                className="w-full bg-s3 border border-border rounded-xl px-4 py-3.5 text-sm text-white placeholder:text-muted/60 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all pr-12"
              />
              <button 
                type="button" 
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors"
              >
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button 
            type="submit"
            disabled={loginMutation.isPending || registerMutation.isPending}
            className="w-full py-3.5 mt-2 rounded-xl text-sm font-bold bg-gradient-to-r from-primary to-secondary text-black shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loginMutation.isPending || registerMutation.isPending ? "Please wait..." : (tab === "login" ? "SIGN IN" : "CREATE ACCOUNT")}
          </button>
        </form>

        <div className="flex items-center gap-4 my-6">
          <div className="h-px flex-1 bg-border" />
          <span className="text-[11px] font-mono text-muted uppercase">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <button 
          type="button"
          onClick={handleGuest}
          className="w-full py-3.5 rounded-xl text-sm font-semibold bg-s3 border border-border text-foreground hover:bg-s2 hover:border-border2 hover:text-primary transition-all group"
        >
          Continue <span className="text-muted group-hover:text-primary transition-colors">as guest</span>
        </button>
      </motion.div>
    </div>
  );
}
