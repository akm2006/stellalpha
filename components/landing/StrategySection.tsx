"use client";

import { 
  Zap, 
  Activity, 
  Info, 
  CheckCircle2, 
  Target, 
  ShieldAlert, 
  Cpu, 
  ShieldCheck
} from "lucide-react";

const StellalphaLogo = ({ size = 12 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 445 436"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="text-emerald-500"
  >
    <path d="M187.43 331.101L368.93 196.101L443.93 175.601L301.93 282.101L162.43 384.101L187.43 331.101Z" fill="currentColor" />
    <path d="M268.43 176.101L373.43 193.601L441.43 176.101L286.93 148.601L268.43 176.101Z" fill="currentColor" />
    <path d="M221.93 0.601471L286.93 149.101L268.43 177.101L221.93 76.6015V0.601471Z" fill="currentColor" />
    <path d="M155.43 148.601L222.93 1.60147L220.93 76.1015L175.43 176.601L155.43 148.601Z" fill="currentColor" />
    <path d="M0.929932 174.601L154.93 148.601L174.93 176.101L74.4299 193.601L0.929932 174.601Z" fill="currentColor" />
    <path d="M122.43 272.101L0.929932 176.101L73.4299 194.101L136.93 243.101L122.43 272.101Z" fill="currentColor" />
    <path d="M367.93 432.101L309.43 312.101L284.43 330.601L320.43 405.101L367.93 432.101Z" fill="currentColor" />
    <path d="M122.93 402.601L76.4299 431.601L222.43 133.101V201.101L122.93 402.601Z" fill="currentColor" />
    <path d="M245.93 248.101L222.43 201.101V133.101L270.43 228.101L245.93 248.101Z" fill="currentColor" />
  </svg>
);

const COPY_MODELS = [
  {
    id: "current_ratio",
    label: "Trader Ratio",
    type: "Institutional",
    suitability: "Direct Conviction Scaling",
    desc: "Derived from the leader's liquid balance. Preserves the leader's exact conviction signal.",
    icon: Target,
    isOriginal: true
  },
  {
    id: "fixed_available_pct",
    label: "Fixed % of Free Cash",
    type: "Quantitative",
    suitability: "High-Frequency Continuity",
    desc: "Uses the same share of your free cash on every buy. Best for compounding sequence-sensitive traders.",
    icon: Zap
  },
  {
    id: "fixed_starting_pct",
    label: "Fixed % of Starting Funds",
    type: "Stable",
    suitability: "Capital Preservation",
    desc: "Uses the same share of your starting funds on every buy. Ideal for stable participation regardless of PnL.",
    icon: ShieldCheck
  },
  {
    id: "target_buy_pct_with_cap",
    label: "Trader Buy % With Cap",
    type: "Industry",
    suitability: "Risk-Bounded Exposure",
    desc: "Copies part of each trader buy, with a hard limit to protect your balance from oversized single entries.",
    icon: Cpu
  },
  {
    id: "hybrid_envelope_leader_ratio",
    label: "Balanced Hybrid",
    type: "Advanced",
    suitability: "Volatile Alpha Cycles",
    desc: "Sets a small cash limit, then adjusts inside it using the trader sizing. Best for meme-copy cycles.",
    icon: ShieldAlert,
    isOriginal: true
  }
];

const OriginalBadge = () => {
    return (
        <div className="absolute top-3 right-3 z-30 flex items-center group/badge">
            {/* Tooltip - Pure CSS hover via group-hover placed on the left */}
            <div className="absolute right-[calc(100%+12px)] top-1/2 -translate-y-1/2 whitespace-nowrap px-3 py-1.5 border border-emerald-500/40 bg-[#0A0A0A] shadow-[0_0_20px_rgba(0,0,0,0.9)] z-50 text-[9px] font-mono text-emerald-400 uppercase tracking-widest pointer-events-none opacity-0 translate-x-1 group-hover/badge:opacity-100 group-hover/badge:translate-x-0 transition-all duration-200">
                Stellalpha native copy model
                <div className="absolute left-full top-1/2 -translate-y-1/2 w-3 h-px bg-emerald-500/40" />
            </div>

            <div className="flex items-center gap-2 border border-emerald-400/50 bg-emerald-400/10 px-2.5 py-1 rounded-sm shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all cursor-help relative z-10 hover:scale-105">
                <StellalphaLogo size={14} />
                <span className="text-[8px] font-mono text-emerald-400 uppercase tracking-[0.2em] font-bold">Original</span>
            </div>
        </div>
    );
};

export const StrategySection = () => {
  return (
    <section id="strategy-container" className="relative">
      <section id="strategy-synthesis" className="landing-section h-screen snap-start flex flex-col justify-center px-6">
        <div className="mx-auto max-w-7xl w-full py-4 md:py-6">
          <div className="grid lg:grid-cols-[0.95fr_1.05fr] gap-8 lg:gap-12 items-center">
            <div className="max-w-lg text-left">
              <span className="cyber-command mb-3 block text-[10px] text-cyan-200/80 uppercase tracking-[0.2em]">Strategy Synthesis</span>
              <h2 className="mb-4 text-2xl font-medium tracking-tight text-white md:text-3xl leading-tight">
                Match curated performance with <span className="text-emerald-400 font-bold">precision logic & settings</span>.
              </h2>
              <p className="text-sm leading-relaxed text-slate-400">
                Stellalpha analyzes trader history to recommend the exact copy model and execution parameters for their style. Every follow is backed by automated, strategy-aware allocation.
              </p>
            </div>

            <div className="cyber-panel border border-white/10 bg-black/35 p-0 min-h-[420px] flex flex-col overflow-hidden">
              <div className="cyber-table-header border-b border-white/5 p-6 bg-black/20 shrink-0">
                <div className="flex items-center gap-5">
                  <img src="https://pbs.twimg.com/profile_images/2009524375649996800/sKQZieeJ_400x400.jpg" alt="crypto 挪吒" className="w-14 h-14 border border-white/10 cyber-panel-soft object-cover" />
                  <div>
                    <h3 className="text-xl font-medium text-white mb-0.5 flex items-center gap-2">crypto 挪吒 <span className="text-[9px] px-1.5 py-0.5 border border-emerald-400/30 bg-emerald-400/5 text-emerald-400 uppercase font-mono tracking-tighter">Star Trader</span></h3>
                    <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Performance profile analyzed</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6 flex-1 flex flex-col justify-center bg-black/10">
                <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-5 text-left">
                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold">
                      <Zap size={14} /> Recommended Model
                    </div>
                    <div className="cyber-panel-soft cyber-row p-5 border border-emerald-400/30 bg-emerald-400/5 relative group transition-all">
                      <div className="flex justify-between items-center mb-3 relative z-10">
                        <h4 className="text-sm font-semibold text-white uppercase tracking-wider">Fixed % of Free Cash</h4>
                        <CheckCircle2 size={16} className="text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]" />
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed relative z-10">
                        Maintains high liquidity to capture volatile alpha streams. Optimized for high-frequency entry profiles.
                      </p>
                    </div>
                    <div className="flex items-center gap-3 p-3 border border-white/5 bg-white/[0.02] rounded-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                      <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tight font-medium">Match: Optimized for Volatility</span>
                    </div>
                  </div>

                  <div className="space-y-5 text-left">
                    <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                      <Activity size={14} /> Recommended Settings
                    </div>
                    <div className="space-y-4">
                      <div className="cyber-panel-soft border border-cyan-400/30 bg-cyan-400/5 p-4 relative">
                        <div className="flex justify-between items-end mb-2.5 relative z-10">
                          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Demo Allocation</span>
                          <span className="text-sm font-bold text-white tracking-tight">$50.00</span>
                        </div>
                        <div className="flex justify-between items-end relative z-10">
                          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Risk per Entry</span>
                          <span className="text-[10px] font-mono text-emerald-400 font-bold">5.0% P.B.</span>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
                        <CheckCircle2 size={12} className="absolute -top-1.5 -right-1.5 text-cyan-400 bg-[#050505] rounded-full" />
                      </div>
                      <div className="flex items-start gap-3 p-1">
                        <Info size={14} className="mt-0.5 text-cyan-400 shrink-0 opacity-80" />
                        <p className="text-[10px] text-slate-500 leading-snug uppercase tracking-tighter font-mono">
                          Settings Synthesized for Performance.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="strategy-library" className="landing-section h-screen snap-start flex flex-col justify-center px-6">
        <div className="mx-auto max-w-7xl w-full">
          <div className="grid lg:grid-cols-[0.85fr_1.15fr] gap-6 lg:gap-12 items-center">
            <div className="text-left">
              <span className="cyber-command mb-3 block text-[10px] text-emerald-400/80">Model Repository</span>
              <h2 className="mb-4 text-2xl font-medium tracking-tight text-white md:text-4xl leading-tight">
                5 execution models to <span className="text-emerald-400">match your alpha style</span>.
              </h2>
              <p className="text-sm leading-relaxed text-slate-400 mb-6 max-w-md">
                Stellalpha provides the infrastructure for precise intent replication. Choose the copy model that fits your risk appetite and the trader's historical profile.
              </p>
            </div>

            <div className="space-y-2 max-h-[580px] overflow-y-auto scrollbar-hide pr-2">
              {COPY_MODELS.map((model) => (
                <div key={model.id} className="relative group text-left">
                  <div className="cyber-panel-soft cyber-row border border-white/10 bg-black/35 transition-all p-3 flex items-start gap-5">
                    <div className="p-2 border border-white/10 text-emerald-400 bg-black/40 shrink-0 group-hover:bg-emerald-400/5 transition-colors relative z-10">
                      <model.icon size={20} />
                    </div>
                    <div className="flex-1 min-w-0 relative z-10">
                      <div className="flex justify-between items-center mb-1 pr-28">
                        <h4 className="text-[13px] font-bold tracking-wider text-white uppercase">
                          {model.label}
                        </h4>
                      </div>
                      <p className="text-[10px] text-cyan-300/80 mb-1 font-medium tracking-tight">
                        <span className="text-slate-500 uppercase text-[8px] font-bold tracking-widest mr-2">{model.type}:</span> {model.suitability}
                      </p>
                      <p className="text-[11px] text-slate-400 leading-snug">
                        {model.desc}
                      </p>
                    </div>
                  </div>
                  {model.isOriginal && <OriginalBadge key={`${model.id}-badge`} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </section>
  );
};
