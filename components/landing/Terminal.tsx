"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { COLORS } from "@/lib/theme";

const TERMINAL_LOGS = [
  { type: "INFO", msg: "Signal detected from curated wallet." },
  { type: "INFO", msg: "Applying Fixed % copy model." },
  { type: "EXEC", msg: "Initializing non-custodial vault execution." },
  { type: "EXEC", msg: "Verifying strategy-specific risk parameters." },
  { type: "WARN", msg: "Stale-buy guard: signal latency check failed." },
  { type: "EXEC", msg: "Routing intent through user-controlled vault." },
  { type: "INFO", msg: "Leader to Copy latency: 842ms." },
  { type: "SUCCESS", msg: "Execution complete. Custody remains local." },
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
    <div className="cyber-panel relative flex h-full w-full flex-col overflow-hidden bg-[#000000] p-4 font-mono text-[10px] md:p-6 md:text-xs border border-white/10">
      {/* Removed subtle gradient overlay for actual black terminal look */}
      
      <div className="cyber-table-header flex items-center justify-between mb-4 border-b border-white/5 px-4 py-2.5 select-none relative z-10 -mx-4 -mt-4 md:-mx-6 md:-mt-6 mb-6">
        <span className="text-[9px] uppercase tracking-[0.24em] text-white/50">
          terminal :: core_router
        </span>
        <div className="flex items-center gap-2.5">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[9px] tracking-wider font-medium text-emerald-400/80">STATUS_OK</span>
        </div>
      </div>
      
      <div className="space-y-3 flex-1 overflow-y-auto scrollbar-hide relative z-10">
        <AnimatePresence mode='popLayout'>
          {logs.map((log, i) => (
            <motion.div 
              key={`${i}-${log.msg.substring(0, 5)}`}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex gap-2 md:gap-3 items-start min-w-0"
            >
              <span className="shrink-0 whitespace-nowrap opacity-30 font-mono text-[9px] pt-0.5 text-slate-500">
                [{new Date().toLocaleTimeString('en-US', { hour12: false })}]
              </span>
              
              <span className={`shrink-0 w-12 md:w-16 font-bold text-[9px] border px-1 text-center pt-[1px] ${
                log.type === 'SUCCESS' ? 'border-emerald-500/30 text-emerald-500' : 
                log.type === 'WARN' ? 'border-amber-500/30 text-amber-500' : 
                log.type === 'EXEC' ? 'border-blue-500/30 text-blue-500' : 'border-white/10 text-slate-500'
              }`}>
                {log.type}
              </span>
              
              <span className="break-words min-w-0 leading-tight text-slate-300">
                {log.msg}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
        {logs.length < TERMINAL_LOGS.length && (
          <div className="flex items-center gap-2 pl-2">
             <div className="w-1.5 h-3 animate-pulse bg-emerald-500/30" />
          </div>
        )}
      </div>
    </div>
  );
};
