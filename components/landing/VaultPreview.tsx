"use client";

import React, { useState } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { ArrowRight, ShieldCheck, Zap, Activity, Info, CheckCircle2, ChevronLeft, LayoutGrid, Target, ShieldAlert, Cpu } from "lucide-react";
import { useScrollContainer } from "./ScrollProvider";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariantsLeft: Variants = {
  hidden: { opacity: 0, x: -40 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6, type: "spring", bounce: 0.2 } }
};

const itemVariantsRight: Variants = {
  hidden: { opacity: 0, x: 40 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.6, type: "spring", bounce: 0.2 } }
};

const COPY_MODELS = [
  {
    id: "current_ratio",
    label: "Trader Ratio",
    type: "Institutional",
    suitability: "Direct Replication",
    desc: "Derived from the leader's liquid balance. Best for following traders where conviction sizing is worth preserving directly.",
    icon: Target
  },
  {
    id: "fixed_available_pct",
    label: "Fixed % of Free Cash",
    type: "Dynamic",
    suitability: "Liquidity Optimized",
    desc: "Uses a fixed percentage of your current available follower cash. Best for high-frequency traders where continuity is the primary edge.",
    icon: Zap,
    isRecommended: true
  },
  {
    id: "fixed_starting_pct",
    label: "Fixed % of Start",
    type: "Stable",
    suitability: "Capital Preservation",
    desc: "Allocates a constant dollar amount based on your initial capital. Ideal for stable participation regardless of equity fluctuations.",
    icon: ShieldCheck
  },
  {
    id: "target_buy_pct_with_cap",
    label: "Trader % w/ Cap",
    type: "Industry",
    suitability: "Scaled Exposure",
    desc: "Copies a percentage of the leader's buy amount while enforcing a strict maximum limit to prevent capital exhaustion.",
    icon: Cpu
  },
  {
    id: "hybrid_envelope_leader_ratio",
    label: "Balanced Hybrid",
    type: "Advanced",
    suitability: "Volatility Shield",
    desc: "Wraps leader conviction signals inside a strict user-controlled risk envelope. The best broad default for volatile meme-copy cycles.",
    icon: ShieldAlert
  }
];

const demoRows = [
  ["Mode", "Virtual Capital Simulation"],
  ["Latency", "< 800ms leader-to-copy"],
  ["Control", "Non-custodial intent feed"],
];

export const VaultPreview = () => {
  const scrollRef = useScrollContainer();
  const [showCatalog, setShowCatalog] = useState(false);

  return (
    <>
      <section id="preview-1" className="landing-section snap-start flex items-center justify-center min-h-screen relative overflow-hidden border-b border-white/5 px-6">
        <div className="mx-auto max-w-7xl w-full py-8 md:py-12">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ root: scrollRef as React.RefObject<Element>, once: true }}
            variants={containerVariants}
            className="grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr]"
          >
            <motion.div
              variants={itemVariantsLeft}
              className="max-w-lg"
            >
              <span className="cyber-command mb-4 block text-[10px] text-cyan-200/80">
                Strategy Synthesis
              </span>
              <h2 className="mb-5 text-2xl font-medium tracking-tight text-white md:text-3xl">
                Match curated performance with <span className="text-emerald-400">precision logic</span>.
              </h2>
              <p className="mb-8 text-sm leading-relaxed text-slate-400">
                Stellalpha analyzes a Star Trader's history to recommend 
                the exact copy model for their style. Every follow is backed by 
                automated, strategy-aware allocation.
              </p>
              <a href="/star-traders" className="cursor-pointer">
                <button className="group flex items-center gap-2 border border-white/10 bg-white/[0.03] px-6 py-3 text-sm font-medium text-white transition-all hover:border-emerald-400/40 hover:bg-emerald-400/5 cursor-pointer">
                  Explore Star Traders
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </button>
              </a>
            </motion.div>

            <motion.div
              variants={itemVariantsRight}
              className="cyber-panel border border-white/10 bg-black/35 overflow-hidden relative flex flex-col min-h-[480px] max-h-[520px]"
            >
              <AnimatePresence mode="wait">
                {!showCatalog ? (
                  <motion.div
                    key="synthesis"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col flex-1"
                  >
                    {/* Header */}
                    <div className="cyber-table-header border-b border-white/5 p-6 bg-black/20 shrink-0">
                      <div className="flex items-center gap-5">
                        <div className="relative shrink-0">
                          <div className="absolute inset-0 bg-emerald-500/20 blur-md opacity-50" />
                          <img 
                            src="https://pbs.twimg.com/profile_images/2009524375649996800/sKQZieeJ_400x400.jpg" 
                            alt="crypto 挪吒" 
                            className="w-14 h-14 border border-white/10 cyber-panel-soft object-cover relative z-10"
                          />
                        </div>
                        <div>
                          <h3 className="text-xl font-medium text-white mb-0.5 flex items-center gap-2">
                            crypto 挪吒
                            <span className="text-[9px] px-1.5 py-0.5 border border-emerald-400/30 bg-emerald-400/5 text-emerald-400 uppercase tracking-tighter font-mono">Star Trader</span>
                          </h3>
                          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Performance profile analyzed</p>
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-6 space-y-6 flex-1 flex flex-col justify-center">
                      <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
                        <div className="space-y-5">
                          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-bold">
                            <Zap size={14} /> Recommended Model
                          </div>
                          <div className="cyber-row p-5 border border-emerald-400/30 bg-emerald-400/5 relative group cursor-pointer" onClick={() => setShowCatalog(true)}>
                              <div className="flex justify-between items-center mb-3 relative z-10">
                                  <h4 className="text-sm font-semibold text-white">Fixed % of Free Cash</h4>
                                  <CheckCircle2 size={16} className="text-emerald-400" />
                              </div>
                              <p className="text-[11px] text-slate-400 leading-relaxed relative z-10">
                                  Maintains high liquidity to capture volatile alpha streams. 
                                  Optimized for high-frequency entry profiles.
                              </p>
                              <div className="absolute inset-0 bg-emerald-500/[0.02] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                          </div>
                          <div className="flex items-center gap-3 p-3 border border-white/5 bg-white/[0.02] rounded-sm">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50" />
                              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tight font-medium">Match: Optimized for Volatility</span>
                          </div>
                        </div>

                        <div className="space-y-5">
                          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-slate-500 font-bold">
                            <Activity size={14} /> Execution Settings
                          </div>
                          <div className="space-y-4">
                              <div className="cyber-panel-soft border border-white/10 bg-black/40 p-4">
                                  <div className="flex justify-between items-end mb-2.5">
                                      <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Demo Allocation</span>
                                      <span className="text-sm font-bold text-white tracking-tight">$50.00</span>
                                  </div>
                                  <div className="flex justify-between items-end">
                                      <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Risk per Entry</span>
                                      <span className="text-[10px] font-mono text-emerald-400 font-bold">5.0% P.B.</span>
                                  </div>
                              </div>
                              <div className="flex items-start gap-3 p-1">
                                  <Info size={14} className="mt-0.5 text-cyan-400 shrink-0 opacity-80" />
                                  <p className="text-[10px] text-slate-500 leading-snug">
                                      Automatic sizing adjusted to historical liquidity.
                                  </p>
                              </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Footer with Simple CTA */}
                    <div className="p-5 border-t border-white/5 flex justify-between items-center bg-black/20 shrink-0 mt-auto">
                        <div className="text-[9px] font-mono uppercase tracking-widest text-slate-600 font-medium">
                            Protocol: <span className="text-emerald-500 uppercase">Live</span>
                        </div>
                        <button 
                          onClick={() => setShowCatalog(true)}
                          className="px-6 py-2 bg-emerald-400 hover:bg-emerald-300 text-black text-[10px] font-bold uppercase tracking-widest cursor-pointer transition-all flex items-center gap-2 cyber-action-primary"
                        >
                          <LayoutGrid size={14} /> Explore Models
                        </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="catalog"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col flex-1"
                  >
                    {/* Catalog Header */}
                    <div className="cyber-table-header border-b border-white/10 p-6 bg-black/40 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => setShowCatalog(false)}
                          className="p-2 border border-white/10 hover:border-emerald-400/40 text-slate-400 hover:text-emerald-400 transition-all cursor-pointer bg-white/5"
                        >
                          <ChevronLeft size={18} />
                        </button>
                        <div>
                          <h3 className="text-xl font-medium text-white tracking-tight">Model Catalog</h3>
                          <p className="text-[9px] font-mono text-emerald-400 uppercase tracking-[0.25em] font-bold">Execution Infrastructure Library</p>
                        </div>
                      </div>
                    </div>

                    {/* Rich Catalog List */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide bg-black/10">
                      {COPY_MODELS.map((model) => (
                        <div 
                          key={model.id}
                          className={`cyber-row p-4 border transition-all relative group flex items-start gap-5 ${
                            model.isRecommended ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/5 bg-white/[0.01]'
                          }`}
                        >
                          <div className={`p-2.5 border ${model.isRecommended ? 'border-emerald-400/30 text-emerald-400' : 'border-white/10 text-slate-600'} bg-black/30 shrink-0`}>
                            <model.icon size={18} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-1.5">
                              <h4 className={`text-sm font-bold tracking-wide ${model.isRecommended ? 'text-emerald-300' : 'text-slate-100'}`}>
                                {model.label}
                                {model.isRecommended && <span className="ml-3 text-[8px] border border-emerald-400/40 px-1.5 py-0.5 uppercase tracking-tighter bg-emerald-400/10 text-emerald-400 font-mono">Recommended</span>}
                              </h4>
                              <span className={`text-[9px] font-mono uppercase tracking-[0.15em] ${model.isRecommended ? 'text-emerald-500' : 'text-slate-600'} font-bold`}>
                                {model.type}
                              </span>
                            </div>
                            <p className="text-[10px] text-cyan-400/80 mb-2 font-medium tracking-tight">
                              <span className="text-slate-600 uppercase text-[8px] font-bold tracking-widest mr-2">Suitability:</span> {model.suitability}
                            </p>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              {model.desc}
                            </p>
                          </div>
                          <div className="absolute inset-y-0 right-0 w-1 bg-emerald-400 scale-y-0 group-hover:scale-y-100 transition-transform origin-center opacity-40" />
                        </div>
                      ))}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-white/5 bg-black/20 flex justify-center shrink-0">
                      <p className="text-[9px] text-slate-600 font-mono uppercase tracking-[0.2em] flex items-center gap-2 font-medium">
                        <Info size={12} className="text-slate-700" /> Models are ranked based on historical volatility and alpha frequency
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section id="preview-2" className="landing-section snap-start flex items-center justify-center min-h-screen relative overflow-hidden border-b border-white/5 px-6">
        <div className="mx-auto max-w-7xl w-full py-12">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ root: scrollRef as React.RefObject<Element>, once: true }}
            variants={containerVariants}
            className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]"
          >
            <motion.div
              variants={itemVariantsLeft}
              className="cyber-panel border border-white/10 order-2 bg-black/35 p-5 lg:order-1"
            >
              <div className="mb-5 flex items-center justify-between border-b border-white/5 pb-3">
                <span className="cyber-command text-[10px] text-emerald-300/80">
                  Demo Vault Activity
                </span>
                <span className="border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[9px] font-mono uppercase tracking-[0.18em] text-emerald-400">
                  Active Feed
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {demoRows.map(([label, value]) => (
                  <div
                    key={label}
                    className="cyber-row border border-white/10 bg-white/[0.025] p-4 group"
                  >
                    <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-500 relative z-10 group-hover:text-slate-400 transition-colors">
                      {label}
                    </p>
                    <p className="text-sm font-medium text-white relative z-10">{value}</p>
                  </div>
                ))}
                <div className="cyber-row border border-white/10 bg-white/[0.025] p-4 group flex items-center gap-3">
                    <Activity size={18} className="text-emerald-400 animate-pulse" />
                    <div>
                        <p className="text-[10px] font-mono uppercase tracking-widest text-slate-500">Live Status</p>
                        <p className="text-xs font-semibold text-white">Syncing Intent</p>
                    </div>
                </div>
              </div>

              <div className="mt-5 border border-emerald-400/15 bg-emerald-400/5 p-4 text-xs leading-relaxed text-slate-300">
                Stellalpha executes every follow through a secure non-custodial vault. 
                The demo environment allows you to monitor intent and exits 
                without any capital risk.
              </div>
            </motion.div>

            <motion.div
              variants={itemVariantsRight}
              className="order-1 max-w-lg lg:order-2"
            >
              <span className="cyber-command mb-4 block text-[10px] text-emerald-300/80">
                Onboarding: Demo Vault
              </span>
              <h2 className="mb-5 text-2xl font-medium tracking-tight text-white md:text-3xl">
                Experience non-custodial copy trading <span className="text-emerald-400">without risk</span>.
              </h2>
              <p className="mb-8 text-sm leading-relaxed text-slate-400">
                Deploy a virtual follow to verify strategy behavior, copied-position
                accounting, and sub-second execution logic before moving to real allocation.
              </p>
              <a href="/demo-vault" className="cursor-pointer">
                <button className="cyber-action-primary bg-emerald-400 px-6 py-3 text-sm font-semibold uppercase text-black transition-all hover:bg-emerald-300 cursor-pointer">
                  Try Demo
                </button>
              </a>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </>
  );
};
