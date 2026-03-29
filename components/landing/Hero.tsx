"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, FileText } from "lucide-react";
import { Terminal } from "./Terminal";

export const Hero = () => {
  return (
    <section className="relative pt-20 pb-16 px-6 border-b border-white/5 bg-[#050505]">
      {/* Background Gradients - Removed per user request */}
      {/* <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" /> */}
      
      <div className="max-w-7xl mx-auto w-full relative z-10">
        
        {/* Status Badge */}


        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center">
          
          {/* Left Content */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="space-y-6"
          >
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.24em] text-emerald-400">
                Demo simulation live
                <span className="h-1 w-1 rounded-full bg-emerald-500/50" />
                Mainnet mode coming soon
              </div>
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-semibold tracking-tighter leading-tight md:leading-[1.05] text-white">
                Autonomous <br />
                Copy Trading <br />
                <span className="text-white relative inline-block">
                  Without Custody
                  <div className="absolute -bottom-2 left-0 right-0 h-1 bg-emerald-500 w-full" />
                </span>
              </h1>
            </div>
            
            <div className="space-y-4 max-w-xl">
              <p className="text-base leading-relaxed text-slate-400">
                Copy top traders with ultra-low latency execution, without ever compromising asset custody.
              </p>
              
              <p className="text-lg md:text-xl font-medium text-emerald-400 tracking-tight">
                Let the stars lead the alpha, while you hold the keys.
              </p>
            </div>

            <div className="flex flex-wrap gap-4 pt-2">
              <a href="/demo-vault">
                <button className="h-11 px-6 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)]">
                  <ArrowRight size={16} className="text-black" />
                  TRY DEMO
                </button>
              </a>
              <a href="/whitepaper.pdf" target="_blank" rel="noopener noreferrer">
                <button 
                  className="h-11 px-6 border border-slate-700 hover:border-slate-500 bg-white/5 hover:bg-white/10 text-white font-medium text-sm transition-all flex items-center gap-2"
                >
                  <FileText size={16} />
                  READ WHITEPAPER
                </button>
              </a>
            </div>

            {/* Powered By Section */}
             <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="pt-6 mt-2 border-t border-white/5"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                <span className="text-[10px] font-mono tracking-widest text-slate-500 uppercase">
                  Powered By
                </span> 
                <div className="flex items-center gap-6"> 
                  <img src="/solana.png" alt="Solana" className="h-6 w-auto object-contain opacity-50 hover:opacity-100 transition-opacity" />
                  <img src="/jupiter.png" alt="Jupiter" className="h-6 w-auto object-contain opacity-50 hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </motion.div>
          </motion.div> 

          {/* Right Content (Terminal) */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, rotateY: 10 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            transition={{ duration: 0.8, delay: 0.3, type: "spring" }}
            className="relative h-[400px] md:h-[500px] w-full perspective-1000"
          >
             <Terminal />
          </motion.div>
        </div>
      </div>
    </section>
  );
};
