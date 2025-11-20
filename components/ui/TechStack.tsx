"use client";

import React from "react";
import { Terminal, Database, Cpu, Network, Shield, Layers } from "lucide-react";
import { BGPattern } from "./bg-pattern";

export const TechStack = () => {
  return (
    <section className="relative py-32 px-4 bg-[#050508] border-b border-white/5 overflow-hidden">
      
      <BGPattern variant="grid" size={48} className="opacity-[0.06]" />
      
      <div className="relative z-10 max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16 border-b border-white/5 pb-8">
          <div className="max-w-2xl">
            <p className="text-[11px] font-mono text-cyan-500 uppercase tracking-widest mb-3">
              Dependency Graph
            </p>
            <h2 className="text-3xl md:text-4xl font-medium text-white tracking-tight font-[family-name:var(--font-space-grotesk)]">
              Core Infrastructure.
            </h2>
          </div>
          <div className="font-mono text-[10px] text-gray-500 text-right">
            <p>PROTOCOL_VERSION: <span className="text-white">v1.2.0-beta</span></p>
            <p>LAST_AUDIT: <span className="text-emerald-500">PASSED</span></p>
          </div>
        </div>

        {/* Infrastructure Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-white/10 border border-white/10 rounded-xl overflow-hidden">

          {/* Item 1: Solana */}
          <div className="bg-[#08080A] p-8 group hover:bg-[#0C0C0E] transition-all duration-300">
            <div className="flex justify-between items-start mb-6">
               <div className="p-2.5 rounded bg-white/5 border border-white/5 text-white group-hover:text-[#00FFA3] group-hover:border-[#00FFA3]/20 transition-colors">
                 {/* Use an SVG or Lucide Icon */}
                 <Cpu size={20} />
               </div>
               <span className="font-mono text-[10px] text-gray-600">v1.18.11</span>
            </div>
            <h3 className="text-lg font-medium text-white mb-2 font-[family-name:var(--font-space-grotesk)]">Solana SVM</h3>
            <p className="text-[13px] text-gray-400 leading-relaxed mb-4">
              High-throughput parallel execution environment processing 4,000+ TPS with 400ms finality.
            </p>
            <div className="flex items-center gap-2">
               <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-mono text-gray-500 uppercase">L1 Chain</span>
               <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-mono text-gray-500 uppercase">Sealevel</span>
            </div>
          </div>

          {/* Item 2: Anchor */}
          <div className="bg-[#08080A] p-8 group hover:bg-[#0C0C0E] transition-all duration-300">
            <div className="flex justify-between items-start mb-6">
               <div className="p-2.5 rounded bg-white/5 border border-white/5 text-white group-hover:text-blue-400 group-hover:border-blue-400/20 transition-colors">
                 <Shield size={20} />
               </div>
               <span className="font-mono text-[10px] text-gray-600">v0.29.0</span>
            </div>
            <h3 className="text-lg font-medium text-white mb-2 font-[family-name:var(--font-space-grotesk)]">Anchor Framework</h3>
            <p className="text-[13px] text-gray-400 leading-relaxed mb-4">
              Rust-based secure smart contract framework enforcing PDA constraints and instruction validation.
            </p>
            <div className="flex items-center gap-2">
               <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-mono text-gray-500 uppercase">Security</span>
               <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-mono text-gray-500 uppercase">IDL</span>
            </div>
          </div>

          {/* Item 3: Jupiter */}
          <div className="bg-[#08080A] p-8 group hover:bg-[#0C0C0E] transition-all duration-300">
            <div className="flex justify-between items-start mb-6">
               <div className="p-2.5 rounded bg-white/5 border border-white/5 text-white group-hover:text-[#C7F284] group-hover:border-[#C7F284]/20 transition-colors">
                 <Network size={20} />
               </div>
               <span className="font-mono text-[10px] text-gray-600">API v6</span>
            </div>
            <h3 className="text-lg font-medium text-white mb-2 font-[family-name:var(--font-space-grotesk)]">Jupiter Aggregator</h3>
            <p className="text-[13px] text-gray-400 leading-relaxed mb-4">
              Liquidity aggregation engine providing optimal split-route execution via Cross-Program Invocation.
            </p>
            <div className="flex items-center gap-2">
               <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-mono text-gray-500 uppercase">Routing</span>
               <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-mono text-gray-500 uppercase">CPI</span>
            </div>
          </div>

          {/* Item 4: Helius / RPC */}
          <div className="bg-[#08080A] p-8 group hover:bg-[#0C0C0E] transition-all duration-300">
            <div className="flex justify-between items-start mb-6">
               <div className="p-2.5 rounded bg-white/5 border border-white/5 text-white group-hover:text-orange-400 group-hover:border-orange-400/20 transition-colors">
                 <Layers size={20} />
               </div>
               <span className="font-mono text-[10px] text-gray-600">Geyser</span>
            </div>
            <h3 className="text-lg font-medium text-white mb-2 font-[family-name:var(--font-space-grotesk)]">Helius RPC</h3>
            <p className="text-[13px] text-gray-400 leading-relaxed mb-4">
              Enterprise-grade RPC nodes with Geyser plugins for millisecond-latency transaction monitoring.
            </p>
            <div className="flex items-center gap-2">
               <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-mono text-gray-500 uppercase">Ingress</span>
               <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-mono text-gray-500 uppercase">WebSockets</span>
            </div>
          </div>

          {/* Item 5: LangChain */}
          <div className="bg-[#08080A] p-8 group hover:bg-[#0C0C0E] transition-all duration-300">
            <div className="flex justify-between items-start mb-6">
               <div className="p-2.5 rounded bg-white/5 border border-white/5 text-white group-hover:text-purple-400 group-hover:border-purple-400/20 transition-colors">
                 <Terminal size={20} />
               </div>
               <span className="font-mono text-[10px] text-gray-600">v0.1.0</span>
            </div>
            <h3 className="text-lg font-medium text-white mb-2 font-[family-name:var(--font-space-grotesk)]">LangChain</h3>
            <p className="text-[13px] text-gray-400 leading-relaxed mb-4">
              Orchestration framework for the AI intent engine, mapping natural language to blockchain transactions.
            </p>
            <div className="flex items-center gap-2">
               <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-mono text-gray-500 uppercase">Agents</span>
               <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-mono text-gray-500 uppercase">LLM</span>
            </div>
          </div>

          {/* Item 6: Upstash */}
          <div className="bg-[#08080A] p-8 group hover:bg-[#0C0C0E] transition-all duration-300">
            <div className="flex justify-between items-start mb-6">
               <div className="p-2.5 rounded bg-white/5 border border-white/5 text-white group-hover:text-emerald-400 group-hover:border-emerald-400/20 transition-colors">
                 <Database size={20} />
               </div>
               <span className="font-mono text-[10px] text-gray-600">Serverless</span>
            </div>
            <h3 className="text-lg font-medium text-white mb-2 font-[family-name:var(--font-space-grotesk)]">Upstash Redis</h3>
            <p className="text-[13px] text-gray-400 leading-relaxed mb-4">
              Low-latency ephemeral state layer for managing user sessions, chat history, and watcher signals.
            </p>
            <div className="flex items-center gap-2">
               <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-mono text-gray-500 uppercase">Storage</span>
               <span className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] font-mono text-gray-500 uppercase">Cache</span>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};