"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Terminal, Shield, Zap, Activity, TrendingUp } from "lucide-react";
import Link from "next/link";
import { BGPattern } from "@/components/ui/bg-pattern";

export const StellaHero = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section className="relative w-full min-h-[100vh] flex items-center justify-center overflow-hidden bg-[#050508] border-b border-white/5">
      
      {/* Professional Ambient Lighting - Deep & Atmospheric */}
      <div className="absolute top-[-10%] right-[-5%] w-[800px] h-[800px] bg-indigo-900/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-5%] w-[600px] h-[600px] bg-blue-900/5 blur-[100px] rounded-full pointer-events-none" />

      {/* Technical Grid */}
      <BGPattern variant="grid" size={48} className="opacity-[0.06]" />

      <div className="container relative z-10 px-4 md:px-6 lg:px-8 pt-24 md:pt-32">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          
          {/* LEFT COLUMN: Narrative */}
          <div className="flex flex-col items-start space-y-10 max-w-2xl">
            
            {/* Relevant Protocol Badge */}
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.08] text-sm font-medium text-gray-400 backdrop-blur-md hover:bg-white/[0.05] transition-colors cursor-default">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              <span className="text-xs uppercase tracking-wider font-semibold text-gray-300">Solana Migration Active</span>
            </div>

            {/* Headline - Technical & Direct */}
            <div className="space-y-6">
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-medium tracking-tighter text-white leading-[1.1] text-balance font-[family-name:var(--font-space-grotesk)]">
                Automated Trading, <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-br from-white via-gray-200 to-gray-500">
                  Without the Custody.
                </span>
              </h1>
              <p className="text-lg md:text-xl text-gray-400 leading-relaxed max-w-lg text-balance font-light">
                The first protocol to combine <strong>Jupiter's aggregation</strong> with <strong>PDA Vaults</strong>. 
                Follow star traders in real-time while keeping your private keys offline.
              </p>
            </div>

            {/* Primary Actions */}
            <div className="flex flex-col sm:flex-row gap-5 w-full sm:w-auto">
              <Link href="/dashboard" passHref>
                <Button 
                  size="lg" 
                  className="h-14 px-8 text-base font-semibold bg-white text-black hover:bg-gray-200 transition-all duration-200 rounded-lg w-full sm:w-auto shadow-lg shadow-white/5"
                >
                  <Terminal className="w-4 h-4 mr-2.5" />
                  Deploy Vault
                </Button>
              </Link>
              <Link 
                href="https://github.com/akm2006/stellalpha" 
                target="_blank"
                className="w-full sm:w-auto"
              >
                 <Button 
                  size="lg" 
                  variant="outline"
                  className="h-14 px-8 text-base bg-transparent border-white/10 text-gray-300 hover:text-white hover:bg-white/5 hover:border-white/20 transition-all rounded-lg w-full sm:w-auto"
                >
                  Read Docs
                </Button>
              </Link>
            </div>

            {/* Tech Stack - Logos fixed for visibility */}
            <div className="pt-10 border-t border-white/[0.06] w-full">
              <p className="text-[10px] font-mono text-gray-600 uppercase tracking-widest mb-5">Built on</p>
              <div className="flex flex-wrap gap-8 items-center">
                 {/* Solana */}
                 <div className="flex items-center gap-3 group opacity-60 hover:opacity-100 transition-opacity duration-300">
                   <div className="relative w-6 h-6">
                      <img src="/solana.png" alt="Solana" className="w-full h-full object-contain grayscale group-hover:grayscale-0 transition-all duration-300" />
                      {/* Subtle backlight for visibility on dark bg */}
                      <div className="absolute inset-0 bg-white/20 blur-md -z-10 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                   </div>
                   <span className="text-sm font-medium text-gray-400 group-hover:text-white transition-colors">Solana</span>
                 </div>

                 {/* Jupiter */}
                 <div className="flex items-center gap-3 group opacity-60 hover:opacity-100 transition-opacity duration-300">
                   <div className="relative w-6 h-6">
                      <img src="/jupiter.png" alt="Jupiter" className="w-full h-full object-contain grayscale group-hover:grayscale-0 transition-all duration-300" />
                      <div className="absolute inset-0 bg-green-400/20 blur-md -z-10 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                   </div>
                   <span className="text-sm font-medium text-gray-400 group-hover:text-white transition-colors">Jupiter</span>
                 </div>

                 {/* Anchor */}
                 <div className="flex items-center gap-3 group opacity-60 hover:opacity-100 transition-opacity duration-300">
                   <div className="relative w-6 h-6 flex items-center justify-center bg-white/5 rounded-md border border-white/10 group-hover:border-cyan-500/50 transition-colors">
                      <img src="/anchor.png" alt="Solana" className="w-full h-full object-contain grayscale group-hover:grayscale-0 transition-all duration-300" />
                   </div>
                   <span className="text-sm font-medium text-gray-400 group-hover:text-white transition-colors">Anchor</span>
                 </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Professional Dashboard Visual */}
          <div className="relative hidden lg:block perspective-[2000px]">
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="relative z-10"
            >
              {/* Interface Container */}
              <div className="relative rounded-xl border border-white/10 bg-[#0C0C0E] shadow-2xl overflow-hidden max-w-md mx-auto">
                
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-white/[0.02]">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-green-500/50" />
                    <span className="text-[11px] font-mono text-gray-500 tracking-tight">vault_id: 8x...F2a9</span>
                  </div>
                  <div className="flex gap-1.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-white/10" />
                    <div className="h-1.5 w-1.5 rounded-full bg-white/10" />
                  </div>
                </div>

                {/* Dashboard Body */}
                <div className="p-5 grid gap-5">
                  
                  {/* Main Balance Area */}
                  <div className="space-y-1">
                    <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">Total Equity</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-mono text-white font-medium tracking-tight">1,240.50</span>
                      <span className="text-sm font-mono text-gray-500">SOL</span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <div className="flex items-center text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium">
                        <TrendingUp className="w-3 h-3 mr-1" /> +12.4%
                      </div>
                      <span className="text-[10px] text-gray-600">24h PnL</span>
                    </div>
                  </div>

                  {/* Simulated Chart (CSS Gradient) */}
                  <div className="h-24 w-full rounded-lg border border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent relative overflow-hidden">
                    {/* Line */}
                    <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-emerald-500/20" />
                    <svg className="absolute inset-0 h-full w-full text-emerald-500/20" preserveAspectRatio="none">
                       <path d="M0 50 C 40 40, 60 60, 100 30 C 140 10, 180 40, 220 20 C 260 0, 300 30, 400 10 L 400 100 L 0 100 Z" fill="currentColor" fillOpacity="0.1" />
                       <path d="M0 50 C 40 40, 60 60, 100 30 C 140 10, 180 40, 220 20 C 260 0, 300 30, 400 10" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>
                  </div>

                  {/* Active Log */}
                  <div className="space-y-3 pt-2">
                    <p className="text-[10px] font-mono text-gray-600 uppercase tracking-widest">Recent Signal</p>
                    <div className="flex items-start gap-3 p-3 rounded border border-white/5 bg-white/[0.02]">
                      <div className="mt-0.5">
                         <Activity className="w-4 h-4 text-cyan-500" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-center">
                           <span className="text-xs font-medium text-gray-300">Star Trader #492</span>
                           <span className="text-[10px] text-gray-600 font-mono">2s ago</span>
                        </div>
                        <p className="text-[11px] text-gray-500 leading-relaxed">
                           Executed <span className="text-gray-300">Swap</span> on Jupiter. <br />
                           <span className="font-mono text-cyan-500/80">450 USDC → 2.4 SOL</span>
                        </p>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Footer Status */}
                <div className="px-5 py-3 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      <span className="text-[10px] text-gray-400 font-medium">Watcher Active</span>
                   </div>
                   <span className="text-[10px] font-mono text-gray-600">v1.2</span>
                </div>

              </div>
              
              {/* Soft glow underneath for depth */}
              <div className="absolute -inset-4 bg-cyan-500/10 blur-3xl -z-10 rounded-full opacity-20" />
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
};