"use client";

import React, { useEffect } from 'react';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useAuth } from '@/contexts/auth-context';
import { useAppKitAccount } from '@reown/appkit/react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Wallet, Loader2, CheckCircle2 } from 'lucide-react';
import { COLORS } from '@/lib/theme';

export function AuthStep() {
  const { close, nextStep } = useOnboarding();
  const { isConnected } = useAppKitAccount();
  const { isAuthenticated, isLoading, signIn, openWalletModal } = useAuth();

  // Initializing auth check logic moved to Context, but let's have UI feedback here
  
  const handleConnect = () => {
    if (!isConnected) {
        openWalletModal();
    } else if (!isAuthenticated) {
        signIn();
    }
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
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-3xl rounded-full" />
             <div className="absolute bottom-0 left-0 w-32 h-32 bg-emerald-500/5 blur-2xl rounded-full" />
          </div>

          <button onClick={close} className="absolute top-4 right-4 p-2 text-[#A3A3A3] hover:text-[#E5E5E5] transition-colors z-20">
            <X size={20} />
          </button>

          <div className="relative z-10 p-8 pt-10 text-center">
            <div className="w-16 h-16 bg-[#262626] rounded-full flex items-center justify-center mx-auto mb-6 ring-1 ring-[#262626]">
              <Wallet size={32} className="text-emerald-400" />
            </div>

            <h2 className="text-2xl font-bold text-[#E5E5E5] mb-3 font-heading">
              {isConnected && !isAuthenticated ? 'Verify Ownership' : 'Connect Your Wallet'}
            </h2>
            
            <p className="text-sm text-[#A3A3A3] leading-relaxed mb-8">
              {isConnected && !isAuthenticated ? (
                <>
                  Please sign the message in your wallet to verify you own this address. 
                  <span className="block mt-2 text-emerald-400/80 text-xs">This costs no gas and is purely for authentication.</span>
                </>
              ) : (
                <>
                  Link your wallet to create your secure Demo Vault. 
                  No pre-existing wallet necessary - we support Google, GitHub, X, and many other options.
                </>
              )}
            </p>

            <div className="space-y-4">
              <button
                onClick={handleConnect}
                disabled={isLoading}
                className="w-full py-3.5 px-6 bg-[#10B981] hover:bg-[#059669] text-[#050505] font-semibold rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/20 active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Verifying...
                  </>
                ) : isConnected && !isAuthenticated ? (
                  <>Sign In to Verify Ownership</>
                ) : (
                  <>
                    <Wallet size={18} /> Connect Wallet
                  </>
                )}
              </button>
              
              <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                <CheckCircle2 size={12} className="text-emerald-500" />
                <span>Secure connection</span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
