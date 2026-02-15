"use client";

import React from 'react';
import { useOnboarding } from '@/contexts/onboarding-context';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowRight, ShieldCheck, Wallet, Clock } from 'lucide-react';
import { COLORS } from '@/lib/theme';

export function WelcomeStep() {
  const { nextStep, dismiss } = useOnboarding();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      >
        <motion.div // Card Container
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="relative w-full max-w-md bg-[#0A0A0A] border border-[#262626] rounded-2xl shadow-2xl overflow-hidden"
          style={{ boxShadow: '0 0 50px rgba(16, 185, 129, 0.05)' }}
        >
          {/* Detailed Background Elements */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-emerald-500/5 blur-3xl rounded-full" />
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-emerald-500/5 blur-2xl rounded-full" />
          </div>

          <button
            onClick={close}
            className="absolute top-4 right-4 p-2 text-white/40 hover:text-white transition-colors z-20"
          >
            <X size={20} />
          </button>

          <div className="relative z-10 p-8 pt-10 text-center">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6 ring-1 ring-emerald-500/20">
              <ShieldCheck size={32} className="text-emerald-400" />
            </div>

            <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent mb-3">
              Welcome to Stellalpha
            </h2>
            
            <p className="text-sm text-slate-400 leading-relaxed mb-6">
              Try our Demo Vault feature to experience copy trading in a simulated environment with <span className="text-emerald-400 font-medium">$1,000 virtual capital</span>.
            </p>

            <div className="flex items-center justify-center gap-2 mb-8 text-[11px] uppercase tracking-wider font-semibold text-emerald-500/80">
              <Clock size={12} />
              <span>Takes less than a minute</span>
              <span className="w-1 h-1 rounded-full bg-[#262626]" />
              <span>No fees</span>
            </div>

            <div className="space-y-3">
              <button
                onClick={nextStep}
                className="w-full py-3.5 px-6 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-emerald-500/20 active:scale-[0.98]"
              >
                Start Demo Setup <ArrowRight size={18} />
              </button>
              
              <button
                onClick={dismiss}
                className="w-full py-3 px-6 text-slate-500 hover:text-slate-300 text-sm font-medium transition-colors"
              >
                Don't show again
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
