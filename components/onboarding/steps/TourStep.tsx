"use client";

import React from 'react';
import { useOnboarding } from '@/contexts/onboarding-context';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowDown, MousePointer2 } from 'lucide-react';
import { COLORS } from '@/lib/theme';

export function TourStep() {
  const { close, nextStep } = useOnboarding();

  // This step is unique: it does NOT block the screen entirely.
  // It renders an overlay pointing to something.
  // For simplicity MVP: It renders a bottom-sheet like modal saying "Pick a trader".
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[90] w-full max-w-lg px-4"
      >
        <div className="bg-[#0A0A0A] border border-[#262626] rounded-xl shadow-2xl p-5 flex items-start gap-4"
             style={{ boxShadow: '0 0 40px rgba(0,0,0,0.5)' }}>
            
            <div className="w-10 h-10 bg-[#262626] rounded-full flex items-center justify-center shrink-0 ring-1 ring-[#10B981]/20">
                <MousePointer2 size={20} className="text-[#10B981]" />
            </div>

            <div className="flex-1">
                <h3 className="text-lg font-bold text-[#E5E5E5] mb-1 font-heading">Select a Star Trader</h3>
                <p className="text-sm text-[#A3A3A3] mb-4 leading-relaxed">
                    Review the performance of top traders and click 
                    <span className="inline-block px-1.5 py-0.5 mx-1 bg-[#10B981]/10 text-[#10B981] rounded text-xs border border-[#10B981]/20 font-medium font-mono">Follow</span> 
                    to start copying their trades.
                </p>
                <div className="flex gap-3">
                    <button onClick={close} className="text-xs text-[#A3A3A3] hover:text-[#E5E5E5] underline decoration-dotted transition-colors">
                        Dismiss
                    </button>
                </div>
            </div>

            <button onClick={close} className="text-[#A3A3A3] hover:text-[#E5E5E5] transition-colors">
                <X size={18} />
            </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
