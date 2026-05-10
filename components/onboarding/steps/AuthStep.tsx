"use client";

import React, { useEffect } from 'react';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useAuth } from '@/contexts/auth-context';
import { useAppKitAccount } from '@reown/appkit/react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Wallet, Loader2, CheckCircle2, Terminal, ShieldCheck } from 'lucide-react';
import { COLORS } from '@/lib/theme';

export function AuthStep() {
  const { close, nextStep } = useOnboarding();
  const { isConnected } = useAppKitAccount();
  const { isAuthenticated, isLoading, signIn, openWalletModal } = useAuth();

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
            <div className="w-16 h-16 border border-emerald-500/30 bg-emerald-500/5 flex items-center justify-center mx-auto mb-8 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
              <ShieldCheck size={32} className="text-emerald-400" />
            </div>

            <div className="inline-flex items-center gap-2 border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 mb-4">
              <Terminal size={10} className="text-emerald-400" />
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-emerald-400">Security Check</span>
            </div>

            <h2 className="text-xl font-bold text-white tracking-tight uppercase mb-4">
              {isConnected && !isAuthenticated ? 'Verify Ownership' : 'Establish Connection'}
            </h2>
            
            <p className="text-[13px] text-slate-400 leading-relaxed mb-10 max-w-sm mx-auto">
              {isConnected && !isAuthenticated ? (
                <>
                  Please sign the message in your wallet to verify you own this address. 
                  <span className="block mt-2 text-emerald-400 font-mono text-[10px] uppercase tracking-wider opacity-80">Execution: Gasless Auth_Sync</span>
                </>
              ) : (
                <>
                  Link your wallet to create your secure Demo Vault. 
                  We support Google, GitHub, and major social logins for immediate access.
                </>
              )}
            </p>

            <div className="space-y-4">
              <button
                onClick={handleConnect}
                disabled={isLoading}
                className="cyber-action-primary relative w-full h-14 bg-emerald-400 hover:bg-emerald-300 text-black text-[11px] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 transition-all overflow-hidden group shadow-[0_0_20px_rgba(16,185,129,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Verifying...
                  </>
                ) : isConnected && !isAuthenticated ? (
                  <>Sign In to Verify</>
                ) : (
                  <>
                    <Wallet size={16} /> Connect Wallet
                  </>
                )}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-full -skew-x-12 -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-700" />
              </button>
              
              <div className="flex items-center justify-center gap-2 text-[9px] font-mono uppercase tracking-[0.2em] text-slate-600">
                <CheckCircle2 size={12} className="text-emerald-500/60" />
                <span>Protocol encryption active</span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
