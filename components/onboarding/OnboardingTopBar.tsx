"use client";

import React from 'react';
import { useOnboarding, OnboardingStep } from '@/contexts/onboarding-context';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, ArrowRight, X, Terminal } from 'lucide-react';
import { COLORS } from '@/lib/theme';

export function OnboardingTopBar() {
  const { step, isOpen, dismiss } = useOnboarding();

  // Define steps and their progress value (out of 100)
  const steps: { id: OnboardingStep; label: string; progress: number }[] = [
    { id: 'WELCOME', label: 'Welcome', progress: 10 },
    { id: 'AUTH', label: 'Connect', progress: 25 },
    { id: 'DEPLOY', label: 'Deploy Vault', progress: 40 },
    { id: 'TOUR', label: 'Find Trader', progress: 60 },
    { id: 'ALLOCATE', label: 'Allocate', progress: 80 },
    { id: 'INITIALIZE', label: 'Initialize', progress: 95 },
    { id: 'COMPLETE', label: 'Done', progress: 100 },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === step);
  const currentStepData = steps[currentStepIndex];

  // Specific instructions for interactive steps
  const getInstruction = () => {
    switch (step) {
      case 'TOUR':
        return "Browse the list and click 'Follow' on a Star Trader to copy.";
      case 'ALLOCATE':
        return "Enter an amount (e.g., $1000) and click 'Allocate' to fund the strategy.";
      case 'INITIALIZE':
        return "Click the pulsing 'Initialize' button to activate the copy bot.";
      default:
        return null;
    }
  };

  // Only show for interactive steps where user might get lost
  const shouldShow = isOpen && ['TOUR', 'ALLOCATE', 'INITIALIZE'].includes(step);

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
           initial={{ y: -100, opacity: 0 }}
           animate={{ y: 0, opacity: 1 }}
           exit={{ y: -100, opacity: 0 }}
           transition={{ type: "spring", stiffness: 300, damping: 30 }}
           className="fixed top-20 left-1/2 -translate-x-1/2 z-[50] w-full max-w-2xl px-4 pointer-events-none" 
        >
          <div className="bg-[#0A0A0A] border border-emerald-500/30 p-4 flex items-center gap-6 pointer-events-auto backdrop-blur-md bg-opacity-95 cyber-panel-soft shadow-[0_0_30px_rgba(0,0,0,0.8)] relative">
            {/* Top corner accent */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500/50" />
            
            {/* Progress Circular - Cyber Styled */}
            <div className="relative shrink-0 w-14 h-14 flex items-center justify-center">
               <svg className="w-full h-full -rotate-90">
                 <circle cx="28" cy="28" r="24" stroke="#1A1A1A" strokeWidth="2" fill="none" />
                 <motion.circle 
                    cx="28" cy="28" r="24" 
                    stroke="#10B981" 
                    strokeWidth="3" 
                    fill="none" 
                    strokeDasharray="150.7"
                    initial={{ strokeDashoffset: 150.7 }}
                    animate={{ strokeDashoffset: 150.7 - (150.7 * (currentStepData?.progress || 0)) / 100 }}
                    transition={{ duration: 1, ease: "easeInOut" }}
                    strokeLinecap="butt"
                    className="drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                 />
               </svg>
               <div className="absolute flex flex-col items-center justify-center">
                 <span className="text-[10px] font-black font-mono text-emerald-400 leading-none">
                   {Math.round(currentStepData?.progress || 0)}%
                 </span>
               </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
               <div className="flex items-center gap-3 mb-1.5">
                 <div className="flex items-center gap-1.5 border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5">
                    <Terminal size={10} className="text-emerald-400" />
                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-400">Step {currentStepIndex + 1} / {steps.length - 1}</span>
                 </div>
                 <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">{currentStepData?.label}</span>
               </div>
               <p className="text-sm text-slate-200 font-medium tracking-tight">
                 {getInstruction()}
               </p>
            </div>

            {/* Help/Dismiss */}
            <button 
              onClick={dismiss} 
              className="p-2 border border-white/5 bg-white/[0.03] text-slate-500 hover:text-white hover:border-white/20 transition-all active:scale-95"
              title="Hide onboarding"
            >
               <X size={16} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
