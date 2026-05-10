"use client";

import React from "react";
import { motion, Variants } from "framer-motion";
import { useScrollContainer } from "./ScrollProvider";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.7, type: "spring", bounce: 0.25 } }
};

const PHASES = [
  {
    id: "01",
    title: "Demo Environment",
    status: "done",
    desc: "Virtual-capital simulation proving copy models, latency, and intent replication."
  },
  {
    id: "02",
    title: "Strategy Synthesis",
    status: "active",
    desc: "Mapping curated Star Traders to proprietary execution models and optimized risk parameters."
  },
  {
    id: "03",
    title: "Non-custodial Pilot",
    status: "upcoming",
    desc: "Live execution of copy trades through secure, user-controlled vaults and precise sizing limits."
  },
  {
    id: "04",
    title: "Protocol Expansion",
    status: "upcoming",
    desc: "Deep integration for complex DeFi interactions and a decentralized logic registry."
  },
];

export const Roadmap = () => {
  const scrollRef = useScrollContainer();
  return (
    <section id="roadmap" className="landing-section snap-start flex items-center justify-center min-h-screen relative border-b border-white/5 px-6 py-12 md:py-16">
       <div className="max-w-7xl mx-auto w-full">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ root: scrollRef as React.RefObject<Element>, once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-col md:flex-row justify-between items-end mb-16"
        >
          <div>
            <span className="cyber-command mb-2 block text-[10px] text-emerald-300/80">Maturity path</span>
            <h2 className="text-2xl font-medium text-white tracking-tight md:text-3xl">From demo allocation to <span className="text-emerald-400">controlled</span> execution.</h2>
          </div>
          <p className="text-slate-400 text-sm max-w-md mt-4 md:mt-0 md:text-right">
            The roadmap stays focused on allocation safety, strategy quality,
            and transparent copy behavior.
          </p>
        </motion.div>

        <div className="relative">
          {/* Progress Line - Track */}
          <div className="absolute top-2 left-[19px] md:left-0 md:top-[14px] w-px md:w-full h-full md:h-0.5 bg-white/10 z-0" />
          
          {/* Progress Line - Completed Portion */}
          <div className="absolute top-2 left-[19px] md:left-0 md:top-[14px] w-px md:w-[37.5%] h-full md:h-0.5 bg-emerald-500/50 z-0" />
          
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ root: scrollRef as React.RefObject<Element>, once: true }}
            variants={containerVariants}
            className="grid md:grid-cols-4 gap-8 relative z-10"
          >
            {PHASES.map((phase) => {
              const isDone = phase.status === 'done';
              const isActive = phase.status === 'active';
              
              return (
                <motion.div 
                  key={phase.id}
                  variants={itemVariants}
                  className="relative group pt-6 md:pt-10 pl-12 md:pl-0"
                >
                   {/* Node Indicator */}
                   <div className={`absolute left-3 md:left-0 top-[1px] md:top-[8px] -translate-x-1/2 md:translate-x-0 w-3.5 h-3.5 rounded-full border-2 bg-[#050505] transition-all duration-500 z-20 
                    ${isDone ? 'border-emerald-400 bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 
                      isActive ? 'border-emerald-400 bg-emerald-900/50 animate-pulse ring-4 ring-emerald-500/10' : 'border-white/20 group-hover:border-white/40'}`} 
                   />

                   <div className={`cyber-panel-soft border p-5 bg-black/35 h-full flex flex-col transition-all duration-300 group-hover:border-white/20
                    ${isActive ? 'border-emerald-400/30 ring-1 ring-emerald-400/10' : 'border-white/10'}`}>
                      <div className="flex justify-between items-start mb-4">
                        <span className={`text-[10px] font-mono uppercase tracking-widest ${isDone ? 'text-emerald-400' : isActive ? 'text-emerald-300' : 'text-slate-600'}`}>
                          Phase {phase.id}
                        </span>
                        {isDone && <div className="text-[9px] px-1.5 py-0.5 border border-emerald-400/20 bg-emerald-400/5 text-emerald-400 uppercase tracking-tighter">Verified</div>}
                        {isActive && <div className="text-[9px] px-1.5 py-0.5 border border-cyan-400/20 bg-cyan-400/5 text-cyan-300 uppercase tracking-tighter">Current</div>}
                      </div>

                      <h3 className="text-sm font-semibold text-white mb-2 group-hover:text-emerald-300 transition-colors">
                        {phase.title}
                      </h3>
                      <p className="text-xs text-slate-500 leading-relaxed mt-auto">
                        {phase.desc}
                      </p>
                   </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
       </div>
    </section>
  );
};
