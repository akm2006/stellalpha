"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, TrendingUp } from "lucide-react";

export const VaultPreview = () => {
  return (
    <section className="py-24 px-6 bg-[#050505] border-b border-white/5 relative overflow-hidden">
      {/* Background Glow - Removed */}
      {/* <div className="absolute right-0 top-0 w-1/3 h-full bg-emerald-500/5 blur-[100px] pointer-events-none" /> */}

      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-12">
        
        <div className="max-w-lg">
          <span className="text-emerald-500 font-mono text-xs tracking-widest uppercase mb-4 block">Verifiable On-Chain Transparency</span>
          <h2 className="text-3xl font-medium text-white mb-6">
             Allocate Capital to <br />
             Top Traders
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            Select from high-performance <span className="text-emerald-400 font-medium">Star Traders</span>, view on-chain history and analysis before allocating.
          </p>
          <a href="/star-traders">
            <button className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white border border-white/10 text-sm font-medium transition-all group flex items-center gap-2">
              Explore Star Traders <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </a>
        </div>

        {/* Star Trader Card Mock */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md bg-[#0A0A0A] border border-white/10 overflow-hidden shadow-2xl relative group"
        >
          {/* Header */}
          <div className="p-5 border-b border-white/5 bg-white/[0.02]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 flex items-center justify-center bg-slate-800 text-lg rounded-none border border-white/10">
                  🦈
                </div>
                <div>
                  <h3 className="text-white font-medium flex items-center gap-2">
                    Apex Momentum
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-1.5 py-0.5 uppercase tracking-wider">Top Tier</span>
                  </h3>
                  <div className="text-xs text-slate-500 font-mono flex items-center gap-2">
                    9x...A7b2 
                    <span className="text-emerald-500/50">●</span> 
                    <span className="text-slate-600">Active now</span>
                  </div>
                </div>
              </div>
              <button 
                  className="px-4 py-1.5 bg-[#22D3EE] text-black text-xs font-bold uppercase tracking-wider flex items-center gap-2 hover:opacity-90 transition-all shadow-[0_0_15px_rgba(34,211,238,0.3)]"
                >
                  Follow
              </button>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 divide-x divide-white/5 border-b border-white/5">
            <div className="p-4 text-center">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Total PNL (30D)</div>
              <div className="text-xl font-mono font-medium text-emerald-400">+$342,891</div>
            </div>
            <div className="p-4 text-center">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Win Rate</div>
              <div className="text-xl font-mono font-medium text-white">82.4%</div>
            </div>
          </div>
          <div className="grid grid-cols-2 divide-x divide-white/5 border-b border-white/5">
            <div className="p-4 text-center">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Profit Factor</div>
              <div className="text-xl font-mono font-medium text-emerald-400">3.12x</div>
            </div>
            <div className="p-4 text-center">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Sharpe Ratio</div>
              <div className="text-xl font-mono font-medium text-purple-400">2.85</div>
            </div>
          </div>

          {/* Recent Activity / Chart Preview */}
          <div className="p-5 bg-white/[0.01]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-mono text-slate-500 uppercase">Recent Performance</span>
              <div className="flex gap-1">
                 <div className="w-1 h-1 bg-emerald-500 rounded-full" />
                 <div className="w-1 h-1 bg-emerald-500 rounded-full opacity-50" />
                 <div className="w-1 h-1 bg-emerald-500 rounded-full opacity-25" />
              </div>
            </div>
            
            {/* Simple Boxy Chart */}
            <div className="h-24 w-full flex items-end gap-0.5 border-b border-white/5 pb-1">
               {[35, 42, 38, 55, 62, 58, 48, 65, 78, 72, 85, 90, 82, 95, 100].map((h, i) => (
                 <div 
                  key={i} 
                  style={{ height: `${h}%` }} 
                  className={`flex-1 hover:bg-emerald-400 transition-colors ${i > 10 ? 'bg-emerald-500' : 'bg-emerald-900/40'}`} 
                />
               ))}
            </div>
            
            <div className="mt-4 flex items-center gap-3 text-xs text-slate-500 font-mono">
              <div className="flex items-center gap-1.5 px-2 py-1 border border-white/10 bg-white/5">
                <span className="text-emerald-400">BUY</span> SOL
              </div>
              <span>→</span>
              <div className="flex items-center gap-1.5 px-2 py-1 border border-white/10 bg-white/5">
                <span className="text-red-400">SELL</span> USDC
              </div>
              <span className="ml-auto text-slate-600">Just now</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
