"use client";

import React from "react";
import { motion } from "framer-motion";
import { Coins, Vote, TrendingUp, Zap } from "lucide-react";

const UTILITIES = [
  {
    icon: Coins,
    title: "Staking & Revenue Share",
    desc: "Stake tokens to earn a 30% share of protocol performance fees generated from profitable copy trades."
  },
  {
    icon: Vote,
    title: "Governance Rights",
    desc: "Vote on new Star Trader whitelisting, risk parameters, and treasury allocations."
  },
  {
    icon: Zap,
    title: "Fee Reduction",
    desc: "Hold tokens to receive up to 50% discount on protocol fees and priority relay processing."
  },
  {
    icon: TrendingUp,
    title: "Exclusive Strategy Access",
    desc: "Hold tokens to gain early entry to capped high-performance Star Trader vaults."
  }
];

export const TokenUtility = () => {
  return (
    <section className="py-24 px-6 bg-[#0A0A0A] border-b border-white/5">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
        
        <motion.div
           initial={{ opacity: 0, x: -20 }}
           whileInView={{ opacity: 1, x: 0 }}
           viewport={{ once: true }}
        >
          <div className="flex items-center gap-3 mb-6">
            <Coins size={20} className="text-emerald-500" />
            <span className="text-xs font-mono tracking-widest text-slate-500">TOKENOMICS</span>
          </div>
          
          <h2 className="text-3xl font-medium mb-6 text-white tracking-tight">
             Protocol Governance & <br /> Economic Model
          </h2>
          
          <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-md">
            The native token aligns incentives between Star Traders, Followers, and the Protocol. 
            It is designed to capture value from vault performance and govern the decentralized future of the platform.
          </p>


        </motion.div>

        <div className="grid sm:grid-cols-2 gap-4">
          {UTILITIES.map((item, idx) => (
             <motion.div 
               key={item.title}
               initial={{ opacity: 0, scale: 0.95 }}
               whileInView={{ opacity: 1, scale: 1 }}
               viewport={{ once: true }}
               transition={{ delay: idx * 0.1 }}
               className="bg-[#050505] p-6 border border-white/5 hover:border-emerald-500/20 transition-all rounded-xl"
             >
                <item.icon size={20} className="text-emerald-500 mb-4" />
                <h3 className="text-base font-medium text-slate-200 mb-2">{item.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
             </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
};
