"use client";

import React from 'react';
import { useOnboarding } from '@/contexts/onboarding-context';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, ShieldCheck, Clock, Terminal } from 'lucide-react';
import { COLORS } from '@/lib/theme';

export function WelcomeStep() {
  const { nextStep, dismiss } = useOnboarding();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
      >
        <motion.div 
          initial={{ scale: 0.95, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 30 }}
          transition={{ type: "spring", stiffness: 260, damping: 25 }}
          className="relative w-full max-w-md bg-[#0A0A0A] border border-white/10 cyber-panel-soft shadow-[0_0_50px_rgba(0,0,0,1)] overflow-hidden"
        >
          {/* Industrial Corner Accents */}
          <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-emerald-500/50" />
          <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-emerald-500/50" />
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-emerald-500/50" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-emerald-500/50" />

          {/* Background Shading */}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.03] to-transparent pointer-events-none" />

          <button
            onClick={dismiss}
            className="absolute top-4 right-4 p-2 border border-white/5 bg-white/[0.03] text-white/30 hover:text-white hover:border-white/20 transition-all z-20"
          >
            <X size={18} />
          </button>

          <div className="relative z-10 p-8 pt-12 text-center">
            <div className="w-16 h-16 border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-center mx-auto mb-8 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
              <ShieldCheck size={32} className="text-emerald-400" />
            </div>

            <div className="inline-flex items-center gap-2 border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 mb-4">
              <Terminal size={10} className="text-emerald-400" />
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-400">Initialization Flow</span>
            </div>

            <h2 className="text-2xl font-bold text-white tracking-tight uppercase mb-4">
                Welcome to <span className="text-emerald-400">Stellalpha</span>
            </h2>
            
            <p className="text-[13px] text-slate-400 leading-relaxed mb-8 max-w-sm mx-auto">
              Experience non-custodial copy trading in a simulated environment with <span className="text-emerald-400 font-bold">$1,000.00 virtual capital</span>.
            </p>

            <div className="flex items-center justify-center gap-4 mb-10 text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500">
              <div className="flex items-center gap-1.5">
                <Clock size={12} className="text-emerald-500/60" />
                <span>~1 minute</span>
              </div>
              <div className="h-1 w-1 rounded-full bg-white/10" />
              <div className="flex items-center gap-1.5">
                <Terminal size={12} className="text-emerald-500/60" />
                <span>Demo_Mode</span>
              </div>
            </div>

            <div className="space-y-4">
              <button
                onClick={nextStep}
                className="cyber-action-primary relative w-full h-14 bg-emerald-400 hover:bg-emerald-300 text-black text-[11px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 transition-all overflow-hidden group shadow-[0_0_20px_rgba(16,185,129,0.2)]"
              >
                Start Initialization
                <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-full -skew-x-12 -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-700" />
              </button>
              
              <button
                onClick={dismiss}
                className="w-full h-12 border border-white/5 bg-white/[0.02] text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 hover:text-slate-300 hover:border-white/15 transition-all"
              >
                Skip Onboarding
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
