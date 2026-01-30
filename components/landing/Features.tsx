"use client";

import React from "react";
import { motion } from "framer-motion";
import { Zap, ShieldCheck, Activity, Network, Cpu, Server } from "lucide-react";
import { COLORS } from "@/lib/theme";

const FEATURES = [
  {
    icon: Activity,
    label: "Helius Geyser & Webhooks",
    value: "Sub-Second Detection",
    description: "Enterprise-grade transaction ingress via Helius Enhanced Webhooks ensures instant signal detection."
  },
  {
    icon: Zap,
    label: "Smart Sizing Engine",
    value: "Proportional Mirroring",
    description: "Dynamic equity modeling with 'Safe Boost' prevents dust trades and ensures accurate copy ratios."
  },
  {
    icon: ShieldCheck,
    label: "Non-Custodial Vaults",
    value: "Program Derived Address",
    description: "Capital is held in secure Anchor PDAs. Smart contracts enforce zero-access permissions for managers."
  },
  {
    icon: Network,
    label: "Atomic Settlement",
    value: "Jupiter CPI Integration",
    description: "Trades are executed atomically via Cross-Program Invocation, ensuring funds never leave the vault."
  }
];

export const Features = () => {
  return (
    <section className="py-24 px-6 relative overflow-hidden bg-[#0A0A0A] border-b border-white/5">
       {/* Background Pattern */}
       <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle at center, #262626 1px, transparent 1px)`,
          backgroundSize: '32px 32px'
        }}
      />
      
      <div className="max-w-7xl mx-auto relative z-10">
        <div className="mb-16 md:text-center max-w-2xl mx-auto">
          <h2 className="text-3xl font-medium mb-4 text-white tracking-tight">
            Institutional Infrastructure
          </h2>
          <p className="text-sm text-slate-400">
            Built for speed, security, and transparency. Our stack leverages the best of Solana's ecosystem.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((feature, idx) => (
            <motion.div 
              key={feature.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="bg-[#050505] border border-white/10 p-6 hover:border-emerald-500/30 transition-colors group"
            >
              <div className="flex items-start justify-between mb-5">
                <div className="p-3 bg-white/5 rounded-lg text-emerald-500 group-hover:bg-emerald-500/10 transition-colors">
                  <feature.icon size={20} />
                </div>
              </div>
              
              <div className="mb-3">
                 <span className="text-[10px] font-mono tracking-widest text-emerald-500/80 uppercase mb-1 block">
                  {feature.value}
                </span>
                <h3 className="text-lg font-medium text-slate-200">
                  {feature.label}
                </h3>
              </div>
              
              <p className="text-sm leading-relaxed text-slate-500 group-hover:text-slate-400 transition-colors">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Technical Architecture Block */}
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-16 border border-white/10 bg-[#050505] p-8 rounded-xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[80px] rounded-full pointer-events-none" />
            
            <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
              <div className="flex items-start gap-4 max-w-2xl">
                <div className="p-3 border border-white/10 rounded-lg bg-white/5 hidden sm:block">
                  <Network size={24} className="text-emerald-500" />
                </div>
                <div>
                  <h3 className="text-lg font-medium mb-1 text-white">
                    Cross-Program Invocation (CPI)
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    We use Anchor CPIs to interact directly with Jupiter's on-chain programs. 
                    This means your funds never leave the vault's permissioned environment—even during a swap.
                    Zero intermediate custody.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-2 bg-emerald-950/30 border border-emerald-500/20 rounded-full">
                <ShieldCheck size={16} className="text-emerald-400" />
                <span className="text-xs font-mono font-medium text-emerald-400">
                  SECURED BY ANCHOR
                </span>
              </div>
            </div>
          </motion.div>
      </div>
    </section>
  );
};
