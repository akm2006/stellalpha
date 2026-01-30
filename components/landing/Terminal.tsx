"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { COLORS } from "@/lib/theme";

const TERMINAL_LOGS = [
  { type: "INFO", msg: "System Active. Monitoring 14 'Star Trader' Wallets." },
  { type: "WARN", msg: "Signal Detected: 8x...F29a swapped 500 USDC -> SOL" },
  { type: "EXEC", msg: "Calc Ratio: (Trade 500 / Equity 1M) = 0.05%" },
  { type: "EXEC", msg: "Simulating Trade & Calculating Route (Jupiter)..." },
  { type: "INFO", msg: "Best Route: MERCURIAL -> ORCA (Impact: <0.01%)" },
  { type: "EXEC", msg: "Executing via PDA Vault (CPI Invoke)..." },
  { type: "SUCCESS", msg: "Transaction Confirmed. Fee Payer: Relayer." },
];

export const Terminal = () => {
  const [logs, setLogs] = useState<typeof TERMINAL_LOGS>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLogs((prevLogs) => {
        if (prevLogs.length >= TERMINAL_LOGS.length) return []; // Reset for loop effect
        const nextLog = TERMINAL_LOGS[prevLogs.length];
        return nextLog ? [...prevLogs, nextLog] : prevLogs;
      });
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full h-full bg-[#050505] border border-white/10 font-mono text-[10px] md:text-xs p-4 md:p-6 flex flex-col shadow-2xl relative overflow-hidden group">
      
      <div className="flex items-center justify-between mb-4 border-b border-slate-800/50 pb-3 select-none relative z-10">
        <div /> {/* Spacer to keep justify-between working if needed, or just empty */}
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: COLORS.brand }}></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: COLORS.brand }}></span>
          </span>
          <span className="text-[9px] tracking-wider font-medium text-emerald-400/90">HELIUS_LASER_STREAM :: ACTIVE</span>
        </div>
      </div>
      
      <div className="space-y-3 flex-1 overflow-y-auto scrollbar-hide relative z-10">
        <AnimatePresence mode='popLayout'>
          {logs.map((log, i) => (
            <motion.div 
              key={`${i}-${log.msg.substring(0, 5)}`} // Ensure unique key
              initial={{ opacity: 0, x: -10, height: 0 }}
              animate={{ opacity: 1, x: 0, height: 'auto' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex gap-2 md:gap-3 items-start min-w-0"
            >
              <span className="shrink-0 whitespace-nowrap opacity-40 font-mono text-[9px] pt-0.5" style={{ color: COLORS.data }}>
                [{new Date().toLocaleTimeString('en-US', { hour12: false })}]
              </span>
              
              <span className={`shrink-0 w-12 md:w-16 font-bold text-[9px] border px-1 text-center pt-[1px]`} style={{ 
                borderColor: log.type === 'SUCCESS' ? 'rgba(16, 185, 129, 0.2)' : 
                             log.type === 'WARN' ? 'rgba(245, 158, 11, 0.2)' : 
                             log.type === 'EXEC' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(163, 163, 163, 0.1)',
                color: log.type === 'SUCCESS' ? COLORS.brand : 
                       log.type === 'WARN' ? '#F59E0B' : 
                       log.type === 'EXEC' ? '#3B82F6' : COLORS.data,
                backgroundColor: log.type === 'SUCCESS' ? 'rgba(16, 185, 129, 0.05)' : 'transparent'
              }}>
                {log.type}
              </span>
              
              <span className="break-words min-w-0 leading-tight text-slate-300">
                {log.msg}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        {logs.length < TERMINAL_LOGS.length && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 pl-2"
          >
             <div className="w-1.5 h-3 animate-pulse bg-emerald-500/50" />
          </motion.div>
        )}
      </div>
    </div>
  );
};
