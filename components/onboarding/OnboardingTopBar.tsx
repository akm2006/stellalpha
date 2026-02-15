"use client";

import React from 'react';
import { useOnboarding, OnboardingStep } from '@/contexts/onboarding-context';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, ArrowRight, X } from 'lucide-react';
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
           className="fixed top-20 left-1/2 -translate-x-1/2 z-[50] w-full max-w-2xl px-4 pointer-events-none" // pointer-events-none to let clicks pass through to page
        >
          <div className="bg-[#0A0A0A] border border-[#10B981] rounded-full shadow-2xl p-4 flex items-center gap-4 pointer-events-auto backdrop-blur-md bg-opacity-90 ring-1 ring-[#10B981]/20">
            
            {/* Progress Circular */}
            <div className="relative shrink-0 w-12 h-12 flex items-center justify-center">
               <svg className="w-full h-full -rotate-90">
                 <circle cx="24" cy="24" r="20" stroke="#262626" strokeWidth="4" fill="none" />
                 <motion.circle 
                    cx="24" cy="24" r="20" 
                    stroke="#10B981" 
                    strokeWidth="4" 
                    fill="none" 
                    strokeDasharray="125.6"
                    initial={{ strokeDashoffset: 125.6 }}
                    animate={{ strokeDashoffset: 125.6 - (125.6 * (currentStepData?.progress || 0)) / 100 }}
                    transition={{ duration: 1, ease: "easeInOut" }}
                    strokeLinecap="round"
                 />
               </svg>
               <span className="absolute text-[10px] font-bold text-emerald-400">
                 {Math.round(currentStepData?.progress || 0)}%
               </span>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
               <div className="flex items-center gap-2 mb-1">
                 <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Setup Demo Vault & Follow Trader • Step {currentStepIndex + 1} of {steps.length - 1}</span>
                 <span className="w-1 h-1 rounded-full bg-[#262626]" />
                 <span className="text-xs text-[#A3A3A3] font-medium">{currentStepData?.label}</span>
               </div>
               <p className="text-sm text-[#E5E5E5] font-medium truncate">
                 {getInstruction()}
               </p>
            </div>

            {/* Help/Dismiss */}
            <button 
              onClick={dismiss} 
              className="p-1.5 rounded-full hover:bg-white/10 text-slate-500 hover:text-white transition-colors"
              title="Hide onboarding"
            >
               <span className="sr-only">Hide</span>
               <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
