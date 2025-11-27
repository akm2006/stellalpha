"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  ArrowRight, 
  Zap, 
  Terminal, 
  Lock, 
  Cpu, FileText,
  Server,Coins,
  Activity,
  ShieldCheck,
  ExternalLink,
  Github,
  TrendingUp,
  Network,
  Code2
} from "lucide-react";

import { COLORS } from "@/lib/theme";

// --- CONSTANTS & DATA ---
const TERMINAL_LOGS = [
  { time: "14:20:01", type: "INFO", msg: "Initializing Watcher Agent [Solana-Devnet]..." },
  { time: "14:20:01", type: "SUCCESS", msg: "Geyser Plugin Stream Connected (WSS)" },
  { time: "14:20:02", type: "INFO", msg: "Monitoring 14 'Star Trader' Wallets." },
  { time: "14:20:03", type: "WARN", msg: "Signal: 8x...F29a swapped 500 USDC -> SOL" },
  { time: "14:20:03", type: "EXEC", msg: "Calculating Optimal Route via Jupiter Aggregator..." },
  { time: "14:20:04", type: "INFO", msg: "Route: ORCA -> RAYDIUM (Impact: <0.05%)" },
  { time: "14:20:04", type: "EXEC", msg: "Signing PDA Vault Instruction (CPI)..." },
  { time: "14:20:05", type: "SUCCESS", msg: "Trade Confirmed. Fee Payer: Relayer Service." },
];

const FEATURES = [
  {
    icon: Activity,
    label: "Watcher Latency",
    value: "< 400ms",
    description: "Real-time WebSocket surveillance detects Star Trader moves within the same block."
  },
  {
    icon: Zap,
    label: "Execution Engine",
    value: "Jupiter V6",
    description: "Smart routing across Solana's liquidity layer ensures minimal price impact."
  },
  {
    icon: ShieldCheck,
    label: "Custody Model",
    value: "PDA Vaults",
    description: "Funds are held in Program Derived Addresses. Only YOU can withdraw."
  },
  {
    icon: Cpu,
    label: "Fee Architecture",
    value: "Gasless Relayer",
    description: "Meta-transaction support allows seamless trading without managing SOL for gas."
  }
];

const METRICS = [
  { label: "Network", value: "Solana", change: "Integration Active" },
  { label: "Block Time", value: "~400ms", change: "Sub-second Finality" },
  { label: "Architecture", value: "Non-Custodial", change: "Anchor Framework" },
  { label: "Status", value: "Beta", change: "Devnet Live" },
];

const TEAM_MEMBERS = [
  {
    name: "Aakash Mandal",
    role: "Founder & Protocol Lead",
    context: "Core protocol design,EVM integration, relational architecture, and rapid DApp prototyping.",
    handle: "@aakashbeyond",
    link: "https://x.com/aakashbeyond"
  },
  {
    name: "Manobendra Mandal",
    role: "Co-Founder & Architect",
    context: "Backend systems, Solana integration, & Anchor Program development.",
    handle: "@manovmandal",
    link: "https://x.com/manovmandal" 
  },
];

// --- COMPONENTS ---

const LiveTerminal = () => {
  const [logs, setLogs] = useState<typeof TERMINAL_LOGS>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLogs((prevLogs) => {
        if (prevLogs.length >= TERMINAL_LOGS.length) return [];
        const nextLog = TERMINAL_LOGS[prevLogs.length];
        return nextLog ? [...prevLogs, nextLog] : prevLogs;
      });
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full h-full bg-canvas border border-structure rounded-none font-mono text-[10px] md:text-xs p-3 md:p-5 flex flex-col shadow-2xl">
      <div className="flex items-center justify-between mb-4 border-b border-structure pb-3 select-none">
        <div className="flex gap-2">
          <div className="w-2 h-2 rounded-full bg-structure" />
          <div className="w-2 h-2 rounded-full bg-structure" />
        </div>
        <div className="flex items-center gap-2.5" style={{ color: COLORS.brand }}>
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: COLORS.brand }}></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: COLORS.brand }}></span>
          </span>
          <span className="text-[9px] tracking-wider font-medium">LIVE_FEED :: SOLANA_DEVNET</span>
        </div>
      </div>
      
      {/* FIX: Added `min-w-0` to the parent container is implicit via flex, 
         but ensuring the children handle wrap correctly is key.
      */}
      <div className="space-y-3 flex-1 overflow-y-auto scrollbar-hide">
        {logs.map((log, i) => (
          <motion.div 
            key={i} 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            // FIX: Added min-w-0 here. This allows flex children to shrink/wrap.
            className="flex gap-2 md:gap-3 items-start min-w-0"
          >
            {/* Time: Prevent wrap */}
            <span className="shrink-0 whitespace-nowrap opacity-60" style={{ color: COLORS.data }}>
              [{log.time}]
            </span>
            
            {/* Type: Fixed width */}
            <span className={`shrink-0 w-12 md:w-14 font-semibold text-[9px]`} style={{ 
              color: log.type === 'SUCCESS' ? COLORS.brand : 
                     log.type === 'WARN' ? '#F59E0B' : 
                     log.type === 'EXEC' ? '#3B82F6' : COLORS.data
            }}>
              {log.type}
            </span>
            
            {/* Msg: Changed 'truncate' to 'break-words' so it wraps on mobile instead of breaking layout */}
            <span className="break-words min-w-0 leading-tight" style={{ color: COLORS.text }}>
              {log.msg}
            </span>
          </motion.div>
        ))}
        {logs.length < TERMINAL_LOGS.length && (
          <div className="w-1.5 h-3 animate-pulse inline-block ml-1" style={{ backgroundColor: COLORS.data }} />
        )}
      </div>
    </div>
  );
};

const FeatureCard = ({ feature, delay }: { feature: any, delay: number }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5, delay }}
    className="relative bg-surface border border-structure p-6 rounded-none group overflow-hidden"
    style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}
  >
    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" 
         style={{ background: `linear-gradient(135deg, ${COLORS.brand}05 0%, transparent 100%)` }} />
    
    <div className="relative z-10">
      <div className="flex items-start justify-between mb-5">
        <div className="p-2.5 bg-canvas border border-structure group-hover:border-brand/20 transition-all duration-300"
             style={{ backgroundColor: COLORS.canvas, borderColor: COLORS.structure }}>
          <feature.icon size={16} style={{ color: COLORS.data }} className="group-hover:text-brand transition-colors" />
        </div>
        <span className="text-[9px] font-mono tracking-widest" style={{ color: COLORS.data }}>
          {feature.value}
        </span>
      </div>
      
      <h3 className="text-sm font-medium mb-2.5 tracking-tight" style={{ color: COLORS.text }}>
        {feature.label}
      </h3>
      <p className="text-xs leading-relaxed" style={{ color: COLORS.data }}>
        {feature.description}
      </p>
    </div>
  </motion.div>
);

const MetricCard = ({ metric, delay }: { metric: any, delay: number }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5, delay }}
    className="bg-surface border border-structure p-6 group"
    style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}
  >
    <div className="flex flex-col h-full justify-between">
      <span className="text-[9px] font-mono tracking-widest mb-4" style={{ color: COLORS.data }}>
        {metric.label}
      </span>
      <div>
        <motion.div 
          initial={{ scale: 1 }}
          whileInView={{ scale: [1, 1.02, 1] }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: delay + 0.2 }}
          className="text-3xl font-medium mb-2 tracking-tight"
          style={{ color: COLORS.text }}
        >
          {metric.value}
        </motion.div>
        <p className="text-xs flex items-center gap-1.5" style={{ color: COLORS.brand }}>
          <Activity size={12} />
          {metric.change}
        </p>
      </div>
    </div>
  </motion.div>
);

const Button = ({ children, variant = "default", className = "", ...props }: any) => (
  <button 
    className={`inline-flex items-center justify-center font-medium tracking-tight transition-all duration-300 ${className}`}
    style={variant === "outline" 
      ? { borderColor: COLORS.structure, color: COLORS.data, backgroundColor: 'transparent' }
      : { backgroundColor: COLORS.brand, color: COLORS.canvas }
    }
    {...props}
  >
    {children}
  </button>
);

const BGPattern = () => (
  <div 
    className="absolute inset-0 opacity-[0.015]"
    style={{
      backgroundImage: `linear-gradient(${COLORS.structure} 1px, transparent 1px), linear-gradient(90deg, ${COLORS.structure} 1px, transparent 1px)`,
      backgroundSize: '32px 32px'
    }}
  />
);

const Footer = () => (
  <footer className="border-t py-12 px-6" style={{ borderColor: COLORS.structure, backgroundColor: COLORS.canvas }}>
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-12">
        <div className="max-w-md">
          <h3 className="text-lg font-medium mb-2" style={{ color: COLORS.text }}>StellAlpha</h3>
          <p className="text-xs leading-relaxed" style={{ color: COLORS.data }}>
            Non-custodial autonomous copy trading infrastructure . Copy high performance traders without compromising key security.
          </p>
        </div>
        <div className="flex gap-4">
          <a href="https://github.com/akm2006/stellalpha" target="_blank" rel="noopener noreferrer" 
             className="p-2.5 border transition-colors hover:border-brand/50"
             style={{ borderColor: COLORS.structure, color: COLORS.data }}>
            <Github size={16} />
          </a>
          <a href="https://x.com/stellphatrade" target="_blank" rel="noopener noreferrer"
             className="p-2.5 border transition-colors hover:border-brand/50"
             style={{ borderColor: COLORS.structure, color: COLORS.data }}>
            <ExternalLink size={16} />
          </a>
        </div>
      </div>
      
      <div className="pt-6 border-t flex flex-col md:flex-row justify-between items-center gap-4"
           style={{ borderColor: COLORS.structure }}>
        <div className="text-[10px] font-mono tracking-wider" style={{ color: COLORS.data }}>
          © 2025 StellAlpha Protocol. Open Source (MIT).
        </div>
        <div className="flex gap-6 text-[10px] font-mono" style={{ color: COLORS.data }}>
          <a href="https://github.com/akm2006/stellalpha" className="hover:text-brand transition-colors">Documentation</a>
          <a href="#" className="hover:text-brand transition-colors">Anchor IDL</a>
          <a href="#" className="hover:text-brand transition-colors">Terms</a>
        </div>
      </div>
    </div>
  </footer>
);

export default function HomePage() {
  return (
    <div className="min-h-screen font-sans overflow-x-hidden" style={{ backgroundColor: COLORS.canvas, color: COLORS.text }}>
      
       <section className="relative pt-16 md:pt-24 pb-12 md:pb-20 px-6 border-b" style={{ borderColor: COLORS.structure }}>
      <BGPattern />
      
      <div className="max-w-7xl mx-auto relative z-10">
        
        {/* Status Badge */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2.5 px-3 py-2 border mb-8 md:mb-12"
          style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}
        >
          <span className="flex h-1.5 w-1.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" 
                  style={{ backgroundColor: COLORS.brand }}></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5" 
                  style={{ backgroundColor: COLORS.brand }}></span>
          </span>
          <span className="text-[9px] font-mono font-medium tracking-widest" style={{ color: COLORS.data }}>
            SOLANA SVM INTEGRATION ACTIVE
          </span>
        </motion.div>

        {/* FIX: Changed `gap-20` to `gap-12 lg:gap-20` for better mobile spacing.
          FIX: Added `grid-cols-1` explicitly for mobile.
        */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          
          {/* Left Content */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="space-y-6 md:space-y-8"
          >
            <div className="space-y-4">
              <h1 className="display text-4xl sm:text-5xl md:text-6xl font-medium tracking-tight leading-[1.1]" 
                  style={{ color: COLORS.text }}>
                Autonomous Copy Trading without Custody
              </h1>
              <div className="h-px w-16" style={{ backgroundColor: COLORS.brand }}></div>
            </div>
            
            <p className="text-sm md:text-base leading-relaxed max-w-xl" style={{ color: COLORS.data }}>
              Mirror star traders instantly without compromising security. 
              Your keys, your funds, our execution.
            </p>

            <div className="flex flex-wrap gap-3">
              <a href="/dashboard">
                <Button className="h-11 px-7 text-sm font-medium hover:opacity-90 w-full sm:w-auto">
                  LAUNCH_TERMINAL
                  <ArrowRight size={14} className="ml-2" />
                </Button>
              </a>
              <a href="/whitepaper.pdf" target="_blank" rel="noopener noreferrer">
                <button 
                  className="h-11 px-7 text-sm font-medium border transition-all hover:opacity-80 w-full sm:w-auto"
                  style={{ 
                    borderColor: COLORS.structure, 
                    backgroundColor: COLORS.surface,
                    color: COLORS.text 
                  }}
                >
                  <span className="flex items-center justify-center gap-2">
                    <FileText size={14} />
                    VIEW_WHITEPAPER
                  </span>
                </button>
              </a>
            </div>

            {/* Powered By Section */}
             <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="pt-8 mt-8 border-t"
              style={{ borderColor: COLORS.structure }}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                <span className="text-xs font-mono tracking-wider opacity-60" style={{ color: COLORS.data }}>
                  POWERED BY
                </span> 
                <div className="flex items-center gap-5"> 
                  {/* Solana Logo */}
                   <div className="flex items-center gap-2.5 opacity-70 hover:opacity-100 transition-opacity cursor-pointer">
                    <img src="/solana.png" alt="Solana" className="h-5 w-5 object-contain" />
                    <span className="text-sm font-medium" style={{ color: COLORS.text }}>Solana</span>
                  </div>
                   
                  {/* Jupiter Logo */}
                 <div className="flex items-center gap-2.5 opacity-70 hover:opacity-100 transition-opacity cursor-pointer">
                    <img src="/jupiter.png" alt="Jupiter" className="h-5 w-5 object-contain" />
                    <span className="text-sm font-medium" style={{ color: COLORS.text }}>Jupiter</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div> 

          {/* Right Content (Terminal) */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            // FIX: Changed fixed height to responsive height `h-[320px] md:h-[460px]`
            className="relative h-[320px] md:h-[460px] w-full"
          >
            <div className="absolute -inset-px opacity-20 pointer-events-none" 
                 style={{ background: `linear-gradient(to bottom, ${COLORS.structure}, transparent)` }} />
            <LiveTerminal />
          </motion.div>
        </div>
      </div>
    </section>
      {/* --- 2. METRICS OVERVIEW (Truthful Data) --- */}
      <section className="py-16 px-6 border-b" style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}>
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px" style={{ backgroundColor: COLORS.structure }}>
            {METRICS.map((metric, idx) => (
              <MetricCard key={metric.label} metric={metric} delay={idx * 0.1} />
            ))}
          </div>
        </div>
      </section>

      {/* --- 3. TECHNICAL ARCHITECTURE --- */}
      <section className="py-24 px-6 relative overflow-hidden border-b" style={{ borderColor: COLORS.structure }}>
        <motion.div 
          animate={{ backgroundPosition: ['0% 0%', '100% 100%'] }}
          transition={{ duration: 20, repeat: Infinity, repeatType: 'reverse', ease: 'linear' }}
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `radial-gradient(circle at center, ${COLORS.structure} 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        />
        
        <div className="max-w-7xl mx-auto relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-16"
          >
            <h2 className="text-3xl font-medium mb-3 tracking-tight" style={{ color: COLORS.text }}>
              Technical Architecture
            </h2>
            <p className="text-sm font-mono tracking-widest" style={{ color: COLORS.data }}>
              EXECUTION PIPELINE
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((feature, idx) => (
              <FeatureCard key={feature.label} feature={feature} delay={idx * 0.1} />
            ))}
          </div>

          {/* Technical Diagram */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-16 border p-8"
            style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}
          >
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="p-3 border" style={{ borderColor: COLORS.structure }}>
                  <Network size={20} style={{ color: COLORS.brand }} />
                </div>
                <div>
                  <h3 className="text-sm font-medium mb-1" style={{ color: COLORS.text }}>
                    Cross-Program Invocation (CPI)
                  </h3>
                  <p className="text-xs" style={{ color: COLORS.data }}>
                    Direct vault-to-DEX execution via Anchor programs. No intermediate custody.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ShieldCheck size={16} style={{ color: COLORS.brand }} />
                <span className="text-xs font-mono" style={{ color: COLORS.data }}>
                  SECURED BY ANCHOR • AUDIT PENDING
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* --- 4. PROTOCOL DETAILS (Token & Roadmap) --- */}
      <section className="py-24 px-6 border-b" style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}>
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16">
          
          {/* Token Utility */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <Coins size={18} style={{ color: COLORS.brand }} />
              <span className="text-[9px] font-mono tracking-widest" style={{ color: COLORS.data }}>
                TOKEN UTILITY
              </span>
            </div>
            
            <h2 className="text-2xl font-medium mb-4 tracking-tight" style={{ color: COLORS.text }}>
              Protocol Governance & Economic Model
            </h2>
            
            <p className="text-sm leading-relaxed mb-8" style={{ color: COLORS.data }}>
              The native token serves as the coordination mechanism for protocol upgrades and provides 
              tangible utility for active participants through fee discounts and priority execution.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {['Fee Reduction', 'Priority Queue', 'Governance Rights', 'Premium Features'].map((item) => (
                <div key={item} className="px-4 py-3 border text-xs font-mono text-center transition-all hover:border-brand/50"
                     style={{ borderColor: COLORS.structure, color: COLORS.data, backgroundColor: COLORS.canvas }}>
                  {item}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Roadmap */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="text-[9px] font-mono tracking-widest mb-6 block" style={{ color: COLORS.data }}>
              DEVELOPMENT ROADMAP
            </span>
            
            <div className="space-y-8 border-l pl-6 ml-1" style={{ borderColor: COLORS.structure }}>
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="relative"
              >
                <motion.div 
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="absolute -left-[27px] top-2 w-2 h-2 rounded-full" 
                  style={{ backgroundColor: COLORS.brand, boxShadow: `0 0 8px ${COLORS.brand}` }}
                />
                <span className="text-[10px] font-mono mb-1 block" style={{ color: COLORS.brand }}>
                  DEC 2025 — IN PROGRESS
                </span>
                <h4 className="text-sm font-medium mb-1.5" style={{ color: COLORS.text }}>Solana Integration</h4>
                <p className="text-xs leading-relaxed" style={{ color: COLORS.data }}>
                  Anchor program deployment and PDA vault architecture. Full mainnet beta launch.
                </p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="relative opacity-60"
              >
                <div className="absolute -left-[27px] top-2 w-2 h-2 rounded-full" 
                     style={{ backgroundColor: COLORS.structure }} />
                <span className="text-[10px] font-mono mb-1 block" style={{ color: COLORS.data }}>
                  Q1 2026 — PLANNED
                </span>
                <h4 className="text-sm font-medium mb-1.5" style={{ color: COLORS.text }}>Token Generation</h4>
                <p className="text-xs leading-relaxed" style={{ color: COLORS.data }}>
                  TGE, centralized exchange listings, and community incentive programs.
                </p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="relative opacity-40"
              >
                <div className="absolute -left-[27px] top-2 w-2 h-2 rounded-full" 
                     style={{ backgroundColor: COLORS.structure }} />
                <span className="text-[10px] font-mono mb-1 block" style={{ color: COLORS.data }}>
                  Q2 2026 — RESEARCH
                </span>
                <h4 className="text-sm font-medium mb-1.5" style={{ color: COLORS.text }}>Automation Suite</h4>
                <p className="text-xs leading-relaxed" style={{ color: COLORS.data }}>
                  Grid trading, DCA modules, and advanced conditional triggers.
                </p>
              </motion.div>
            </div>
          </motion.div>

        </div>
      </section>

      {/* --- 5. TEAM --- */}
      <section className="py-24 px-6 border-b" style={{ borderColor: COLORS.structure }}>
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mb-12"
          >
            <h2 className="text-3xl font-medium mb-3 tracking-tight" style={{ color: COLORS.text }}>
              Core Contributors
            </h2>
            <p className="text-sm font-mono tracking-widest" style={{ color: COLORS.data }}>
              PROTOCOL DEVELOPMENT TEAM
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-4">
            {TEAM_MEMBERS.map((member, idx) => (
              <motion.div 
                key={member.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="p-6 border group relative overflow-hidden"
                style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}
              >
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" 
                     style={{ background: `linear-gradient(135deg, ${COLORS.brand}05 0%, transparent 100%)` }} />
                
                <div className="relative z-10 flex items-start justify-between">
                  <div>
                    <h4 className="text-base font-medium mb-1" style={{ color: COLORS.text }}>
                      {member.name}
                    </h4>
                    <p className="text-xs font-mono mb-3" style={{ color: COLORS.data }}>
                      {member.role}
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: COLORS.data }}>
                      {member.context}
                    </p>
                  </div>
                  <a href={member.link} target="_blank" rel="noopener noreferrer" 
                     className="transition-all duration-300 group-hover:rotate-0"
                     style={{ color: COLORS.data }}>
                    <ArrowRight size={14} className="-rotate-45 group-hover:rotate-0 transition-transform duration-300 hover:text-brand" />
                  </a>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* --- 6. FINAL CTA --- */}
      <section className="py-24 px-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto text-center"
        >
          <h2 className="text-3xl font-medium mb-4 tracking-tight" style={{ color: COLORS.text }}>
            Open Source. Verifiable.
          </h2>
          <p className="text-sm leading-relaxed mb-10 max-w-xl mx-auto" style={{ color: COLORS.data }}>
            Our smart contracts and execution logic are publicly available. Review our cryptographic 
            constraints and security architecture on GitHub before deploying capital.
          </p>
          <div className="flex justify-center gap-4">
            <a href="https://github.com/akm2006/stellalpha" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="h-11 px-7 text-xs font-mono border hover:border-brand/50 hover:text-brand group">
                <Github size={14} className="mr-2 group-hover:rotate-12 transition-transform duration-300" />
                VIEW_SOURCE_CODE
              </Button>
            </a>
            <a href="#" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="h-11 px-7 text-xs font-mono border hover:border-brand/50 hover:text-brand group">
                <Code2 size={14} className="mr-2 group-hover:scale-110 transition-transform duration-300" />
                API_DOCUMENTATION
              </Button>
            </a>
          </div>
        </motion.div>
      </section>

      <Footer />
    </div>
  );
}