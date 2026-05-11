"use client";

import React from "react";
import { motion } from "framer-motion";
import { 
  ChevronRight,
  Activity,
  Database,
  BarChart3,
  Terminal
} from "lucide-react";

export const DemoActivation = () => {
  return (
    <div className="mx-auto max-w-7xl text-center relative z-10 w-full px-6 py-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="space-y-10"
      >
        <div className="max-w-4xl mx-auto">
          <h2 className="mb-4 text-3xl font-semibold tracking-tight text-white md:text-5xl lg:text-6xl leading-[1.05] uppercase">
            Activate <span className="text-emerald-400 italic">virtual</span> <br/>execution.
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-sm md:text-base leading-relaxed text-slate-400">
            Deploy a non-custodial terminal with <span className="text-emerald-400 font-bold">$1,000.00</span> in virtual capital. 
            Test curated models and professional replication logic in a risk-free environment.
          </p>
        </div>

        {/* Technical Feature Matrix - Cyberpunk Style */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[
            { 
              icon: Database, 
              title: "On-demand Liquidity", 
              desc: "Immediate $1,000.00 virtual allocation for strategy testing.",
              label: "VIRTUAL_CAPITAL" 
            },
            { 
              icon: Activity, 
              title: "Intent Syncing", 
              desc: "Precision mirroring of curated trade signals and sizing.",
              label: "High_Fidelity_Demo" 
            },
            { 
              icon: BarChart3, 
              title: "Real-time Metrics", 
              desc: "Transparent tracking of simulated vault states and PnL.",
              label: "Performance_Analysis" 
            },
          ].map((item, idx) => (
            <div key={idx} className="cyber-panel-soft cyber-row p-6 border border-white/10 bg-black/35 transition-all text-left relative overflow-hidden group min-h-[140px] flex flex-col justify-center">
                <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity relative z-20">
                    <item.icon size={32} className="text-emerald-400" />
                </div>
                <div className="mb-3 relative z-20">
                    <span className="px-2 py-0.5 border border-emerald-400/30 bg-emerald-400/5 text-[9px] font-mono text-emerald-400 font-bold uppercase tracking-[0.2em] shadow-[0_0_10px_rgba(16,185,129,0.1)] group-hover:shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all">
                        {item.label}
                    </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed relative z-20 font-medium">
                    {item.desc}
                </p>
            </div>
          ))}
        </div>

        <div className="flex justify-center pt-6">
          <a href="/demo-vault" className="group">
            <button className="cyber-action-primary relative h-16 bg-emerald-400 px-14 text-[11px] font-black uppercase tracking-[0.3em] text-black transition-all hover:bg-emerald-300 flex items-center gap-4 overflow-hidden cursor-pointer shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)]">
              Initialize Demo Vault
              <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
              <motion.div 
                animate={{ x: ["-150%", "350%"] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "linear", repeatDelay: 1 }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-full -skew-x-12 pointer-events-none"
              />
            </button>
          </a>
        </div>
      </motion.div>
    </div>
  );
};
