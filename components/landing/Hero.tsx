"use client";

import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, FileText, Zap } from "lucide-react";
import { COLORS } from "@/lib/theme";
import { Terminal } from "./Terminal";

// Helper for branding consistency
const PoweredByLogo = ({ src, alt, label }: { src: string, alt: string, label: string }) => (
  <div className="flex items-center gap-2.5 opacity-60 hover:opacity-100 transition-opacity cursor-pointer group">
    <div className="h-8 w-8 flex items-center justify-center bg-white/5 border border-white/5 group-hover:border-white/10 transition-colors">
      <img src={src} alt={alt} className="h-4 w-4 object-contain" />
    </div>
    <span className="text-sm font-medium text-slate-400 group-hover:text-slate-200 transition-colors">{label}</span>
  </div>
);

export const Hero = () => {
  return (
    <section className="relative pt-20 pb-16 px-6 border-b border-white/5 bg-[#050505]">
      {/* Background Gradients - Removed per user request */}
      {/* <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" /> */}
      
      <div className="max-w-7xl mx-auto w-full relative z-10">
        
        {/* Status Badge */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2.5 px-3 py-1.5 border border-emerald-500/20 bg-emerald-500/5 mb-6"
        >
          <span className="flex h-1.5 w-1.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] font-mono font-medium tracking-widest text-emerald-400">
            PROTOCOL BETA ACTIVE
          </span>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center">
          
          {/* Left Content */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="space-y-6"
          >
            <div className="space-y-4">
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
                  <img src="https://www.helius.dev/_next/image?url=%2Flogo.svg&w=384&q=90" alt="Helius" className="h-5 w-auto object-contain opacity-50 hover:opacity-100 transition-opacity" />
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
