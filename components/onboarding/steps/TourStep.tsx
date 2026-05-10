"use client";

import React from 'react';
import { useOnboarding } from '@/contexts/onboarding-context';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MousePointer2, Terminal } from 'lucide-react';
import { COLORS } from '@/lib/theme';

export function TourStep() {
  const { close, nextStep } = useOnboarding();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 50, scale: 0.95 }}
        className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[90] w-full max-w-lg px-4"
      >
        <div className="bg-[#0A0A0A] border border-emerald-500/30 p-5 flex items-start gap-5 cyber-panel-soft shadow-[0_0_40px_rgba(0,0,0,0.8)] relative overflow-hidden">
            {/* Corner accents */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500/50" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-emerald-500/50" />

            <div className="w-12 h-12 border border-emerald-500/20 bg-emerald-500/5 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(16,185,129,0.1)] relative z-10">
                <MousePointer2 size={24} className="text-emerald-400" />
            </div>

            <div className="flex-1 relative z-10">
                <div className="flex items-center gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 border border-emerald-500/20 bg-emerald-500/5 px-1.5 py-0.5">
                        <Terminal size={10} className="text-emerald-400" />
                        <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-400">Interaction required</span>
                    </div>
                </div>
                <h3 className="text-base font-bold text-white mb-2 uppercase tracking-wide">Select a Star Trader</h3>
                <p className="text-[12px] text-slate-400 mb-5 leading-relaxed">
                    Review the performance of top traders and click 
                    <span className="inline-block px-1.5 py-0.5 mx-1.5 border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold font-mono uppercase tracking-widest">Follow</span> 
                    to start copying their trades.
                </p>
                <div className="flex gap-4">
                    <button onClick={close} className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 hover:text-emerald-400 transition-colors">
                        [ DISMISS ]
                    </button>
                </div>
            </div>

            <button onClick={close} className="p-1 text-slate-500 hover:text-white transition-colors relative z-10">
                <X size={18} />
            </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
