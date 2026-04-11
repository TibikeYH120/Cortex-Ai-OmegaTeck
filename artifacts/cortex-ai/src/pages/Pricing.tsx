import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Zap, ArrowLeft, Sparkles } from "lucide-react";
import { Link } from "wouter";

const FEATURES = [
  "Korlátlan üzenetek",
  "CORTEX modell (Claude Sonnet)",
  "Képgenerálás (Gemini Vision AI)",
  "Webes keresés valós időben",
  "Hangalapú bevitel & felolvasás",
  "Voice Mode – élő beszélgetés",
  "Teljes előzmény megőrzés",
  "Képcsatolás & elemzés",
  "Prioritásos válaszidő",
  "Korai hozzáférés új funkciókhoz",
];

const FREE_FEATURES = [
  "Napi 10 üzenet",
  "CORTEX LITE modell",
  "Korlátozott előzmény",
];

export function Pricing() {
  const [yearly, setYearly] = useState(false);

  const monthlyPrice = 12.99;
  const yearlyPrice = 129;
  const yearlyMonthly = (yearlyPrice / 12).toFixed(2);
  const saving = Math.round(monthlyPrice * 12 - yearlyPrice);

  return (
    <div className="min-h-screen bg-background relative overflow-x-hidden">
      {/* Background blobs */}
      <div className="cyber-blob bg-primary w-[50vw] h-[50vh] top-[-10%] left-[-10%] opacity-[0.07]" />
      <div className="cyber-blob bg-secondary w-[60vw] h-[60vh] bottom-[-20%] right-[-15%] opacity-[0.06]" />
      <div className="cyber-blob bg-[#ff2e7e] w-[40vw] h-[40vh] top-[40%] left-[40%] opacity-[0.04]" />

      {/* Grid overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,208,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(0,208,255,0.5) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-12 sm:py-20">

        {/* Back link */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-10"
        >
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-mono text-muted hover:text-primary transition-colors group">
            <ArrowLeft size={15} className="group-hover:-translate-x-1 transition-transform" />
            Vissza az apphoz
          </Link>
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 mb-6">
            <Sparkles size={13} className="text-primary" />
            <span className="font-mono text-[11px] text-primary tracking-widest uppercase">Válassz tervet</span>
          </div>

          <h1 className="font-display font-bold text-3xl sm:text-5xl tracking-wide text-white mb-4">
            Egyszerű <span className="text-primary text-glow">árazás</span>
          </h1>
          <p className="text-muted text-sm sm:text-base max-w-md mx-auto font-light">
            Engedd szabadjára a teljes CORTEX AI teljesítményt. Nincs rejtett díj, bármikor lemondható.
          </p>
        </motion.div>

        {/* Billing toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center justify-center gap-4 mb-12"
        >
          <span className={`font-mono text-sm transition-colors ${!yearly ? "text-white" : "text-muted/60"}`}>Havi</span>
          <button
            onClick={() => setYearly(v => !v)}
            className={`relative w-14 h-7 rounded-full border transition-all duration-300 ${
              yearly ? "border-primary/40 bg-primary/10" : "border-white/10 bg-white/5"
            }`}
          >
            <span
              className={`absolute top-1 w-5 h-5 rounded-full transition-all duration-300 ${
                yearly ? "left-8 bg-primary shadow-[0_0_10px_rgba(0,208,255,0.6)]" : "left-1 bg-white/30"
              }`}
            />
          </button>
          <div className="flex items-center gap-2">
            <span className={`font-mono text-sm transition-colors ${yearly ? "text-white" : "text-muted/60"}`}>Éves</span>
            {yearly && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="font-mono text-[10px] bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88] px-2 py-0.5 rounded-full tracking-widest uppercase"
              >
                -{saving}€ spórolás
              </motion.span>
            )}
          </div>
        </motion.div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">

          {/* Free card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="relative flex flex-col rounded-2xl border border-white/8 bg-[#06060f] p-7"
          >
            <div className="mb-6">
              <div className="font-mono text-[10px] text-muted/60 tracking-widest uppercase mb-2">Alap</div>
              <div className="font-display font-bold text-xl text-white mb-1">CORTEX Free</div>
              <div className="flex items-end gap-1 mb-4">
                <span className="font-display font-bold text-4xl text-white">€0</span>
                <span className="font-mono text-sm text-muted/60 mb-1">/hó</span>
              </div>
              <p className="text-sm text-muted/70 font-light">Próbáld ki ingyen, korlátokkal.</p>
            </div>

            <div className="flex flex-col gap-3 mb-8 flex-1">
              {FREE_FEATURES.map((f, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full border border-white/15 flex items-center justify-center shrink-0">
                    <Check size={9} className="text-muted/60" />
                  </div>
                  <span className="text-sm text-muted/70">{f}</span>
                </div>
              ))}
            </div>

            <button className="w-full py-3 rounded-xl border border-white/10 bg-white/4 text-sm font-mono text-muted/70 hover:text-white hover:border-white/20 hover:bg-white/6 transition-all tracking-wide">
              Jelenlegi terv
            </button>
          </motion.div>

          {/* Plus card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="relative flex flex-col rounded-2xl overflow-hidden"
          >
            {/* Glow border */}
            <div className="absolute inset-0 rounded-2xl p-px bg-gradient-to-br from-primary/60 via-secondary/40 to-primary/20">
              <div className="w-full h-full rounded-2xl bg-[#06060f]" />
            </div>

            {/* Glow background */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />

            {/* Popular badge */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              <div className="flex items-center gap-1.5 px-4 py-1 rounded-full bg-gradient-to-r from-primary to-secondary text-black font-mono font-bold text-[10px] tracking-widest uppercase shadow-[0_0_20px_rgba(0,208,255,0.4)]">
                <Zap size={10} />
                Ajánlott
              </div>
            </div>

            <div className="relative z-10 flex flex-col p-7 flex-1">
              <div className="mb-6 mt-3">
                <div className="font-mono text-[10px] text-primary/70 tracking-widest uppercase mb-2">Prémium</div>
                <div className="font-display font-bold text-xl text-white mb-1">CORTEX Plus</div>

                <motion.div
                  key={yearly ? "yearly" : "monthly"}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-end gap-1 mb-1"
                >
                  <span className="font-display font-bold text-4xl text-white">
                    €{yearly ? yearlyMonthly : monthlyPrice}
                  </span>
                  <span className="font-mono text-sm text-muted/60 mb-1">/hó</span>
                </motion.div>

                {yearly && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="font-mono text-[11px] text-muted/50 mb-3"
                  >
                    €{yearlyPrice} számlázva évente
                  </motion.div>
                )}

                <p className="text-sm text-muted/70 font-light">Teljes hozzáférés minden funkcióhoz.</p>
              </div>

              <div className="flex flex-col gap-3 mb-8 flex-1">
                {FEATURES.map((f, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full border border-primary/40 bg-primary/10 flex items-center justify-center shrink-0 shadow-[0_0_6px_rgba(0,208,255,0.2)]">
                      <Check size={9} className="text-primary" />
                    </div>
                    <span className="text-sm text-foreground/80">{f}</span>
                  </div>
                ))}
              </div>

              <button className="w-full py-3 rounded-xl bg-gradient-to-r from-primary to-secondary text-black font-mono font-bold text-sm tracking-wider uppercase hover:shadow-[0_0_28px_rgba(0,208,255,0.4)] hover:-translate-y-0.5 transition-all shadow-[0_0_16px_rgba(0,208,255,0.25)]">
                Előfizetés indítása
              </button>

              <p className="text-center font-mono text-[10px] text-muted/40 mt-3 tracking-wide">
                Bármikor lemondható · Nincs rejtett díj
              </p>
            </div>
          </motion.div>
        </div>

        {/* Bottom note */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="text-center mt-14"
        >
          <div className="inline-flex items-center gap-6 flex-wrap justify-center">
            {["Biztonságos fizetés", "GDPR megfelelő", "Magyar támogatás"].map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-primary/50" />
                <span className="font-mono text-[11px] text-muted/50 tracking-wide">{item}</span>
              </div>
            ))}
          </div>
        </motion.div>

      </div>
    </div>
  );
}
