"use client";

import React from 'react';
import { useOnboarding } from '@/contexts/onboarding-context';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, TrendingUp, Trophy, Terminal } from 'lucide-react';
import confetti from 'canvas-confetti';
import { COLORS } from '@/lib/theme';

export function CompleteStep() {
  const { close } = useOnboarding();

  React.useEffect(() => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  }, []);

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

          <button onClick={close} className="absolute top-4 right-4 p-2 border border-white/5 bg-white/[0.03] text-white/30 hover:text-white hover:border-white/20 transition-all z-20">
            <X size={18} />
          </button>

          <div className="relative z-10 p-8 pt-12 text-center">
            <div className="w-20 h-20 border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-center mx-auto mb-8 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
              <Trophy size={40} className="text-emerald-400" />
            </div>

            <div className="inline-flex items-center gap-2 border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 mb-4">
              <Terminal size={10} className="text-emerald-400" />
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-400">Handshake Complete</span>
            </div>

            <h2 className="text-xl font-bold text-white tracking-tight uppercase mb-4">You're All Set</h2>
            
            <p className="text-[13px] text-slate-400 leading-relaxed mb-8 max-w-sm mx-auto">
              You've successfully set up your Demo Vault and started following a star trader.
              Sit back and watch the trades execute automatically.
            </p>

            <div className="grid grid-cols-2 gap-4 mb-10">
                 <div className="p-4 border border-white/5 bg-white/[0.02] cyber-panel-soft">
                    <TrendingUp size={20} className="mx-auto mb-2 text-emerald-400/70" />
                    <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Track PnL</div>
                 </div>
                 <div className="p-4 border border-white/5 bg-white/[0.02] cyber-panel-soft">
                    <CheckCircle2 size={20} className="mx-auto mb-2 text-emerald-400/70" />
                    <div className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Auto-Copy</div>
                 </div>
            </div>

            <button
                onClick={close}
                className="cyber-action-primary relative w-full h-14 bg-emerald-400 hover:bg-emerald-300 text-black text-[11px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 transition-all overflow-hidden group shadow-[0_0_20px_rgba(16,185,129,0.2)]"
              >
                Go to Dashboard
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-full -skew-x-12 -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-700" />
            </button>
            
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
