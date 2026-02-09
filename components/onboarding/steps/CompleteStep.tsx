"use client";
// forcing refresh

import React from 'react';
import { useOnboarding } from '@/contexts/onboarding-context';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, TrendingUp, Trophy } from 'lucide-react';
import confetti from 'canvas-confetti';

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
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="relative w-full max-w-md bg-[#0A0A0A] border border-[#262626] rounded-2xl shadow-2xl overflow-hidden"
        >
           {/* Background */}
           <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-3xl rounded-full" />
             <div className="absolute bottom-0 left-0 w-32 h-32 bg-emerald-500/5 blur-2xl rounded-full" />
          </div>

          <button onClick={close} className="absolute top-4 right-4 p-2 text-[#A3A3A3] hover:text-[#E5E5E5] transition-colors z-20">
            <X size={20} />
          </button>

          <div className="relative z-10 p-8 pt-10 text-center">
            <div className="w-20 h-20 bg-[#262626] rounded-full flex items-center justify-center mx-auto mb-6 ring-1 ring-[#262626]">
              <Trophy size={40} className="text-[#10B981]" />
            </div>

            <h2 className="text-2xl font-bold text-[#E5E5E5] mb-3 font-heading">You're All Set!</h2>
            
            <p className="text-sm text-[#A3A3A3] leading-relaxed mb-8">
              You've successfully set up your Demo Vault and started following a star trader.
              Sit back and watch the trades execute automatically.
            </p>

            <div className="grid grid-cols-2 gap-3 mb-8">
                 <div className="p-4 rounded-lg bg-[#0A0A0A] border border-[#262626] shadow-sm">
                    <TrendingUp size={20} className="mx-auto mb-2 text-[#10B981]" />
                    <div className="text-xs text-[#A3A3A3] font-medium">Track PnL</div>
                 </div>
                 <div className="p-4 rounded-lg bg-[#0A0A0A] border border-[#262626] shadow-sm">
                    <CheckCircle2 size={20} className="mx-auto mb-2 text-[#10B981]" />
                    <div className="text-xs text-[#A3A3A3] font-medium">Auto-Copy</div>
                 </div>
            </div>

            <button
                onClick={close}
                className="w-full py-3.5 px-6 bg-[#10B981] hover:bg-[#059669] text-[#050505] font-semibold rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-emerald-500/20 active:scale-[0.98]"
              >
                Go to Dashboard
            </button>
            
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
