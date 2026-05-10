"use client";

import React from "react";
import { motion, Variants } from "framer-motion";
import { useScrollContainer } from "./ScrollProvider";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 15 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
};

const STATS = [
  { label: "Total Volume", value: "$42.5M+", sub: "Simulated Testnet" },
  { label: "Active Vaults", value: "14", sub: "Strategies" },
  { label: "Avg Latency", value: "< 240ms", sub: "Global" },
  { label: "Safe Boost", value: "Active", sub: "Whale Protection" },
];

export const StatsBar = () => {
  const scrollRef = useScrollContainer();
  return (
    <section id="stats" className="landing-section snap-start flex items-center justify-center min-h-screen relative border-b border-white/5 bg-[#050505]">
      <div className="max-w-7xl mx-auto px-6 w-full">
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ root: scrollRef as React.RefObject<Element>, once: true }}
          variants={containerVariants}
          className="grid grid-cols-1 md:grid-cols-4 gap-6"
        >
          {STATS.map((stat, idx) => (
            <motion.div 
              key={idx}
              variants={itemVariants}
              className="group"
            >
              <div className="cyber-panel-soft border border-white/10 bg-black/35 p-8 transition-all duration-300 group-hover:border-emerald-400/30 group-hover:bg-black/50">
                <div className="text-4xl md:text-5xl font-semibold text-white mb-3 tracking-tighter group-hover:text-emerald-300 transition-colors">
                  {stat.value}
                </div>
                <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-emerald-400/80 mb-2">
                  {stat.label}
                </div>
                <div className="text-[9px] font-mono uppercase tracking-widest text-slate-500">
                  {stat.sub}
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};
