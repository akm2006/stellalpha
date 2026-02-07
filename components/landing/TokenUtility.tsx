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
    <section className="py-16 px-6 bg-[#0A0A0A] border-b border-white/5 overflow-hidden">
      <div className="max-w-6xl mx-auto">
        
        {/* 1. Centered Header Section */}
        <div className="text-center max-w-3xl mx-auto mb-16">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="flex items-center justify-center gap-3 mb-4"
            >
                <Coins size={18} className="text-emerald-500" />
                <span className="text-xs font-mono tracking-widest text-slate-500 uppercase">Tokenomics</span>
            </motion.div>

            <motion.h2
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="text-3xl md:text-4xl font-medium mb-4 text-white tracking-tight"
            >
                Protocol Governance & <br /> Economic Model
            </motion.h2>

            <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="text-slate-400 text-sm leading-relaxed"
            >
                The native token aligns incentives between Star Traders, Followers, and the Protocol. <br className="hidden md:block"/>
                It is designed to capture value from vault performance and govern the decentralized future.
            </motion.p>
        </div>



        {/* 2. Split Content Area */}
        <div className="grid lg:grid-cols-2 gap-12 items-center">
            
            {/* Left Column: Visual Anchor ($STLA + Cyrene) */}
            <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="relative"
            >
                 <div className="relative group">
                    {/* Atmospheric Glow - Reduced */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-emerald-500/5 blur-[80px] rounded-full pointer-events-none" />
                    
                    <div className="relative z-10 flex flex-col items-center text-center">
                         {/* Floating Token */}
                         <div className="relative w-56 h-56 mb-6">
                             {/* Reduced inner glow */}
                             <div className="absolute inset-0 bg-emerald-500/10 blur-[40px] rounded-full animate-pulse" />
                             <img 
                                src="/stla.png" 
                                alt="$STLA Token" 
                                className="w-full h-full object-contain filter drop-shadow-[0_0_20px_rgba(16,185,129,0.15)] animate-[float_6s_ease-in-out_infinite] relative z-20"
                             />
                         </div>

                         {/* Ticker & Status */}
                         <div className="mb-8">
                             <div className="flex items-center justify-center gap-3 mb-2">
                                <h3 className="text-5xl font-bold text-white tracking-tighter">$STLA</h3>
                          
                             </div>
                             <p className="text-emerald-500/60 font-mono text-xs tracking-widest uppercase">Coming Soon</p>
                         </div>

                         {/* Trust Pill: Cyrene AI - Interactive */}
                         <a 
                            href="https://cyreneai.com/preview-page/stellalpha" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-4 bg-[#0B1221] border border-blue-900/40 rounded-md px-6 py-3 backdrop-blur-sm hover:border-blue-500/50 transition-all shadow-lg hover:shadow-blue-900/20 group/cyrene cursor-pointer"
                         >
                              <div className="flex flex-col items-end h-[15px] overflow-hidden relative min-w-[90px]">
                                  <span className="text-[10px] text-blue-200/60 font-medium tracking-wider uppercase group-hover/cyrene:-translate-y-full transition-transform duration-300 absolute right-0">Launching on</span>
                                  <span className="text-[10px] text-blue-400 font-medium tracking-wider uppercase absolute top-full right-0 group-hover/cyrene:-translate-y-full transition-transform duration-300 w-full text-right">Support us on</span>
                              </div>
                              <div className="h-5 w-px bg-blue-500/20 group-hover/cyrene:bg-blue-400/50 transition-colors" />
                              <img src="/cyrene_ai.png" alt="Cyrene AI" className="h-6 w-auto object-contain opacity-100" />
                         </a>
                    </div>
                 </div>
            </motion.div>


            {/* Right Column: Feature Grid */}
            <div className="grid sm:grid-cols-2 gap-4">
              {UTILITIES.map((item, idx) => (
                 <motion.div 
                   key={item.title}
                   initial={{ opacity: 0, y: 20 }}
                   whileInView={{ opacity: 1, y: 0 }}
                   viewport={{ once: true }}
                   transition={{ delay: 0.2 + (idx * 0.1) }}
                   className="bg-[#050505] p-6 border border-white/10 hover:border-emerald-500/30 transition-all rounded-md group flex flex-col h-full hover:bg-white/[0.02]"
                 >
                    <div className="w-10 h-10 bg-white/5 rounded-md flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-emerald-500/10 transition-all duration-300">
                        <item.icon size={20} className="text-emerald-500" />
                    </div>
                    <h3 className="text-base font-medium text-white mb-2">{item.title}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                 </motion.div>
              ))}
            </div>

        </div>

      </div>
    </section>
  );
};
