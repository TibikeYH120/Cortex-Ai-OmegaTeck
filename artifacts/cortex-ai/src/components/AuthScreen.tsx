import { useState } from "react";
import { useAppState } from "@/hooks/use-app-state";
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

  const { setGuestMode } = useAppState();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("Authentication not available in demo mode. Please continue as guest.");
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
          <h2 className="text-xl font-bold text-white mb-1">Welcome</h2>
          <p className="text-sm text-muted">Demo mode - Continue as guest to try CORTEX AI</p>
        </div>

        {errorMsg && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mb-6">
            <div className="flex items-center gap-2 p-3 bg-primary/10 border border-primary/30 rounded-xl text-primary text-sm font-medium">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          </motion.div>
        )}

        <button 
          type="button"
          onClick={handleGuest}
          className="w-full py-3.5 rounded-xl text-sm font-bold bg-gradient-to-r from-primary to-secondary text-black shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all"
        >
          CONTINUE AS GUEST
        </button>

        <div className="mt-6 p-4 rounded-xl bg-white/2 border border-white/5 text-center">
          <p className="text-xs text-muted/60">
            This is a demo version of CORTEX AI. Deploy with your own backend for full authentication features.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
