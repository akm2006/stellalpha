"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { COLORS } from '@/lib/theme';
import { X } from 'lucide-react';

interface OnboardingStepProps {
  title: string;
  description: string;
  children: React.ReactNode;
  onClose?: () => void;
  showCloseButton?: boolean;
}

export function OnboardingStep({ 
  title, 
  description, 
  children, 
  onClose,
  showCloseButton = true
}: OnboardingStepProps) {
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
          className="relative w-full max-w-md bg-[#121212] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          style={{ boxShadow: '0 0 50px rgba(16, 185, 129, 0.1)' }}
        >
          {/* Detailed Background Elements */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-emerald-500/10 blur-3xl rounded-full" />
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-blue-500/5 blur-2xl rounded-full" />
          </div>

          {/* Close Button */}
          {showCloseButton && onClose && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-white/40 hover:text-white transition-colors z-20"
            >
              <X size={20} />
            </button>
          )}

          {/* Content */}
          <div className="relative z-10 p-8 pt-10 text-center">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent mb-3">
              {title}
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed mb-8">
              {description}
            </p>
            
            {children}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
