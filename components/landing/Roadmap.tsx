"use client";

import React from "react";
import { motion } from "framer-motion";

const PHASES = [
  {
    id: "01",
    title: "Phase I: Foundation",
    status: "active",
    desc: "Testing and achieving correctness and speed in demo vault environment. Verifying Helius integration."
  },
  {
    id: "02",
    title: "Phase II: Mainnet Beta",
    status: "upcoming",
    desc: "Controlled launch with limited users and whitelist access. Pending security audit completion."
  },
  {
    id: "03",
    title: "Phase III: Public Launch",
    status: "upcoming",
    desc: "Full Mainnet release with permissionless vault creation and increased cap limits."
  },
  {
    id: "04",
    title: "Phase IV: Evolution",
    status: "upcoming",
    desc: "Advanced features based on user feedback. Cross-chain expansion research and DAO governance."
  }
];

export const Roadmap = () => {
  return (
    <section className="py-24 px-6 border-b border-white/5 bg-[#050505]">
       <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-end mb-16">
          <div>
            <span className="text-emerald-500 font-mono text-xs tracking-widest uppercase mb-2 block">Trajectoire</span>
            <h2 className="text-3xl font-medium text-white tracking-tight">Development Roadmap</h2>
          </div>
          <p className="text-slate-400 text-sm max-w-md mt-4 md:mt-0 md:text-right">
            The evolution of non-custodial copy trading.
          </p>
        </div>

        <div className="relative">
          {/* Horizontal Timeline Track (Desktop) */}
          <div className="absolute top-0 left-0 right-0 h-px bg-white/10 hidden md:block" />
          <div 
            className="absolute top-0 left-0 h-px bg-gradient-to-r from-emerald-500 to-emerald-400 hidden md:block"
            style={{ width: '15%' }} // Rough estimate for Phase 1 active
          />

          {/* Vertical Timeline Track (Mobile) */}
          <div className="absolute top-0 bottom-0 left-[13px] w-px bg-white/10 block md:hidden" />
          <div 
            className="absolute top-0 left-[13px] w-px bg-gradient-to-b from-emerald-500 to-emerald-400 block md:hidden"
            style={{ height: '15%' }} // Rough estimate for Phase 1 active
          />

          <div className="grid md:grid-cols-4 gap-8">
            {PHASES.map((phase, idx) => {
              const isDone = phase.status === 'done';
              const isActive = phase.status === 'active';
              
              return (
                <motion.div 
                  key={phase.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="relative group pt-2 md:pt-8 pl-12 md:pl-0"
                >
                   {/* Timeline Node */}
                   <div className={`absolute w-2.5 h-2.5 rounded-full border-2 transition-all duration-300 z-10 bg-[#050505]
                      left-[9px] top-[32px] md:left-0 md:-top-[5px]
                      ${isDone ? 'bg-emerald-500 border-emerald-500' : 
                        isActive ? 'bg-[#050505] border-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)] scale-125' : 
                        'border-white/20'}`} 
                   />

                   {/* Content Card */}
                   <div className={`h-full p-6 border transition-all duration-300 flex flex-col rounded-xl
                      ${isActive ? 'bg-white/[0.03] border-emerald-500/30' : 
                        isDone ? 'bg-white/[0.01] border-white/10 hover:border-white/20' : 
                        'bg-transparent border-transparent hover:bg-white/[0.02] border-l-white/10 border-l'}`}
                   >
                      <div className="flex items-center justify-between mb-4">
                        <span className={`font-mono text-xs tracking-wider ${isActive ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {phase.id}
                        </span>
                        {isActive && (
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full animate-pulse">
                            Current
                          </span>
                        )}
                        {isDone && (
                          <span className="text-emerald-500">
                             ✓
                          </span>
                        )}
                      </div>
                      
                      <h3 className={`text-base font-medium mb-3 ${phase.status === 'upcoming' ? 'text-slate-400' : 'text-slate-100'}`}>
                        {phase.title}
                      </h3>
                      
                      <p className="text-sm text-slate-500 leading-relaxed mt-auto">
                        {phase.desc}
                      </p>
                   </div>
                </motion.div>
              );
            })}
          </div>
        </div>
       </div>
    </section>
  );
};
