"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOnboarding } from '@/contexts/onboarding-context';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Server, CheckCircle, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { COLORS } from '@/lib/theme';

export function DeployStep() {
  const { close, deployVault, isDeploying, deployError, setStep } = useOnboarding();
  const [progress, setProgress] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const router = useRouter();

  // Fake progress bar for better UX
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isDeploying) {
      setProgress(0);
      interval = setInterval(() => {
        setProgress(p => {
            if (p >= 90) return p; // Wait for real completion
            return p + Math.random() * 10; 
        });
      }, 500);
    } 
    return () => clearInterval(interval);
  }, [isDeploying]);

  const handleDeploy = async () => {
      try {
          await deployVault();
          setIsSuccess(true);
      } catch (e) {
          // handled by context error state
      }
  };

  const handleContinue = () => {
      router.push('/star-traders');
      setStep('TOUR');
  };

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
            <div className="absolute top-0 right-1/2 translate-x-1/2 w-64 h-64 bg-emerald-500/5 blur-3xl rounded-full" />
          </div>

          <button onClick={close} className="absolute top-4 right-4 p-2 text-[#A3A3A3] hover:text-[#E5E5E5] transition-colors z-20">
            <X size={20} />
          </button>

          <div className="relative z-10 p-8 pt-10 text-center">
            <div className="w-16 h-16 bg-[#262626] rounded-full flex items-center justify-center mx-auto mb-6 ring-1 ring-[#262626]">
              {isDeploying ? (
                 <Loader2 size={32} className="text-emerald-400 animate-spin" />
              ) : isSuccess ? (
                 <CheckCircle size={32} className="text-emerald-400" />
              ):(
                 <Server size={32} className="text-emerald-400" />
              )}
            </div>

            <h2 className="text-2xl font-bold text-[#E5E5E5] mb-3 font-heading">
                {isSuccess ? 'Vault Ready!' : 'Initialize Demo Vault'}
            </h2>
            
            <p className="text-sm text-[#A3A3A3] leading-relaxed mb-8">
              {isSuccess ? (
                  <>
                    Your simulated demo vault has been created and funded with <span className="text-emerald-400">$1,000 virtual USD</span>.
                  </>
              ) : (
                  <>
                    We'll create a dedicated demo vault for you and deposit <span className="text-emerald-400">$1,000 virtual USD</span>. 
                    No gas fees required.
                  </>
              )}
            </p>

            {deployError && (
              <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-xs text-red-400 text-left">
                <AlertCircle size={14} className="shrink-0" />
                {deployError}
              </div>
            )}

            {isDeploying ? (
              <div className="w-full bg-[#262626] rounded-full h-2 mb-2 overflow-hidden">
                <motion.div 
                    className="bg-[#10B981] h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ ease: "linear" }}
                />
              </div>
            ) : isSuccess ? (
                <button
                onClick={handleContinue}
                className="w-full py-3.5 px-6 bg-[#10B981] hover:bg-[#059669] text-[#050505] font-semibold rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-emerald-500/20 active:scale-[0.98]"
              >
                Find Traders to Copy <ArrowRight size={18} />
              </button>
            ) : (
              <button
                onClick={handleDeploy}
                className="w-full py-3.5 px-6 bg-[#10B981] hover:bg-[#059669] text-[#050505] font-semibold rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-emerald-500/20 active:scale-[0.98]"
              >
                Deploy Vault & Start
              </button>
            )}
            
            {isDeploying && (
                 <p className="text-xs text-[#A3A3A3] mt-2">Setting up simulation environment...</p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
