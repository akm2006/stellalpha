"use client";

import React from "react";
import { motion, Variants } from "framer-motion";
import { ArrowRight, FileText, ShieldCheck, Sparkles, ChevronDown } from "lucide-react";
import { Terminal } from "./Terminal";
import { useScrollContainer } from "./ScrollProvider";
import LocalNavbar from "./LocalNavbar";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 }
  }
};

const itemVariantsLeft: Variants = {
  hidden: { opacity: 0, x: -50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.8, type: "spring", bounce: 0.3 } }
};

const itemVariantsRight: Variants = {
  hidden: { opacity: 0, x: 50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.8, type: "spring", bounce: 0.3 } }
};

export const Hero = () => {
  const scrollRef = useScrollContainer();
  return (
    <section id="hero" className="landing-section snap-start flex flex-col justify-center min-h-screen relative border-b border-white/5 px-6">
      <LocalNavbar />
      
      <div className="max-w-7xl mx-auto w-full relative z-10 py-6 mt-16">
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ root: scrollRef as React.RefObject<Element>, once: true }}
          variants={containerVariants}
          className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-center"
        >
          <motion.div variants={itemVariantsLeft} className="space-y-4">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 border border-emerald-400/20 bg-emerald-400/5 px-3 py-0.5 text-[9px] font-mono uppercase tracking-[0.24em] text-emerald-300">
                Curated traders
                <span className="h-1 w-1 rounded-full bg-emerald-400/60" />
                Recommended strategy
                <span className="h-1 w-1 rounded-full bg-cyan-300/60" />
                Non-custodial control
              </div>
              <h1 className="max-w-xl text-3xl font-semibold leading-[1.05] tracking-tight text-white sm:text-4xl lg:text-5xl">
                Copy proven <span className="text-emerald-400">Solana traders</span> with the strategy that fits them, <span className="text-emerald-400">without giving up custody</span>.
              </h1>
            </div>
            
            <div className="space-y-3 max-w-xl">
              <p className="text-sm leading-relaxed text-slate-400">
                Pick a curated Star Trader and deploy a non-custodial 
                vault. Stellalpha recommends the exact copy logic to 
                fit the trader's history before real capital is allocated.
              </p>
              
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="cyber-panel-soft cyber-row border border-white/10 bg-black/35 p-3 transition-colors">
                  <div className="mb-1 flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.18em] text-emerald-300 relative z-10">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    Non-custodial Execution
                  </div>
                  <p className="text-[10px] leading-relaxed text-slate-500 relative z-10">
                    Unified infrastructure for copying curated Solana strategies.
                  </p>
                </div>
                <div className="cyber-panel-soft cyber-row border border-white/10 bg-black/35 p-3 transition-colors">
                  <div className="mb-1 flex items-center gap-2 text-[9px] font-mono uppercase tracking-[0.18em] text-cyan-200 relative z-10">
                    <div className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(0,229,212,0.5)]" />
                    Strategy-Aware
                  </div>
                  <p className="text-[10px] leading-relaxed text-slate-500 relative z-10">
                    Proprietary copy logic matched to the trader's edge.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-1">
              <a href="/star-traders" className="cursor-pointer">
                <button className="cyber-action-primary flex h-10 items-center gap-2 bg-emerald-400 px-5 text-xs font-semibold uppercase text-black transition-all hover:bg-emerald-300 cursor-pointer">
                  <ArrowRight size={16} className="text-black" />
                  Explore Star Traders
                </button>
              </a>
              <a href="/demo-vault" className="cursor-pointer">
                <button className="h-10 border border-white/10 bg-white/[0.03] px-5 text-xs font-medium text-white transition-all hover:border-emerald-400/40 hover:bg-emerald-400/5 cyber-panel-soft cursor-pointer">
                  Try Demo
                </button>
              </a>
              <a href="/whitepaper.pdf" target="_blank" rel="noopener noreferrer" className="cyber-panel-soft border border-white/10 px-4 flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500 transition-colors hover:border-white/20 hover:text-slate-200 cursor-pointer">
                <FileText size={14} />
                Whitepaper
              </a>
            </div>
          </motion.div> 

          <motion.div 
            variants={itemVariantsRight}
            className="relative h-[380px] w-full perspective-1000 md:h-[450px]"
          >
             <Terminal />
          </motion.div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2, duration: 1 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2 pointer-events-none"
      >
        <span className="text-[10px] font-mono font-bold uppercase tracking-[0.4em] text-slate-400">Explore</span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.6)]"
        >
          <ChevronDown size={24} />
        </motion.div>
      </motion.div>
    </section>
  );
};
