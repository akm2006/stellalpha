"use client";

import React from "react";
import { motion } from "framer-motion";

const STATS = [
  { label: "Total Volume", value: "$42.5M+", sub: "Simulated Testnet" },
  { label: "Active Vaults", value: "14", sub: "Strategies" },
  { label: "Avg Latency", value: "< 240ms", sub: "Global" },
  { label: "Safe Boost", value: "Active", sub: "Whale Protection" },
];

export const StatsBar = () => {
  return (
    <div className="border-b border-white/5 bg-[#050505] py-8">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((stat, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="text-center md:text-left border-r border-white/5 last:border-0"
            >
              <div className="text-2xl md:text-3xl font-semibold text-white mb-1 tracking-tight">
                {stat.value}
              </div>
              <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-1">
                {stat.label}
              </div>
              <div className="text-[10px] text-emerald-500/80 font-medium">
                {stat.sub}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
