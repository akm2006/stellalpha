"use client";

import React from "react";
import {
  Zap,
  MessageCircle,
  Shield,
  Wallet,
  Users,
  Bot,
  CheckCircle,Terminal,ArrowRight
} from "lucide-react";
import { StellaHero } from "@/components/ui/hero";
import { Footer } from "@/components/ui/footer";
import { TechStack } from "@/components/ui/TechStack";
import { Lock, Eye, FileCode, AlertTriangle } from "lucide-react";
export default function HomePage() {
  return (
    
    <div className="min-h-screen">
      {/* Hero Section */}
      <StellaHero />

    {/* Core Architecture / System Spec Section */}
      <section className="relative py-32 px-4 bg-[#050508] border-b border-white/5 overflow-hidden">
        
        {/* Technical Background Elements */}
        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.03]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-px bg-gradient-to-r from-transparent via-cyan-900/50 to-transparent" />

        <div className="relative z-10 max-w-6xl mx-auto">
          
          {/* Section Header - Technical Spec Style */}
          <div className="mb-20 flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-cyan-500 mb-3">
                <div className="w-2 h-2 rounded-sm bg-cyan-500" />
                <span className="text-[11px] font-mono uppercase tracking-widest">System Architecture v1.2</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-medium text-white tracking-tight font-[family-name:var(--font-space-grotesk)]">
                Non-Custodial Execution Layer.
              </h2>
              <p className="text-lg text-gray-400 mt-4 leading-relaxed font-light text-balance">
                StellAlpha leverages the <strong>Solana Virtual Machine (SVM)</strong> to enable atomic, composable copy-trading. 
                Architecture utilizes Program Derived Addresses for strictly deterministic fund management.
              </p>
            </div>
            
            {/* System Stats / Specs */}
            <div className="flex gap-8 font-mono text-[10px] text-gray-500 uppercase tracking-wider">
               <div>
                 <p className="mb-1">Finality</p>
                 <p className="text-white text-sm">~400ms</p>
               </div>
               <div>
                 <p className="mb-1">Security</p>
                 <p className="text-white text-sm">Audited (Anchor)</p>
               </div>
               <div>
                 <p className="mb-1">Execution</p>
                 <p className="text-white text-sm">Jupiter CPI</p>
               </div>
            </div>
          </div>

          {/* Architecture Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/10 border border-white/10 rounded-2xl overflow-hidden">
            
            {/* Module 1: Vaults */}
            <div className="md:col-span-2 bg-[#08080A] p-10 group relative hover:bg-[#0C0C0E] transition-colors">
              <div className="absolute top-6 right-6 opacity-20 group-hover:opacity-100 transition-opacity">
                 <Shield className="w-6 h-6 text-gray-400" />
              </div>
              
              <div className="h-full flex flex-col justify-between space-y-12">
                <div className="space-y-4">
                   <h3 className="text-xl font-medium text-white">Program Derived Vaults (PDA)</h3>
                   <p className="text-sm text-gray-400 leading-7 max-w-lg">
                     User assets are held in <strong>Program Derived Addresses</strong> deterministically seeded by the user's public key. 
                     Unlike standard EOA hot wallets, these vaults have no private keys and can only sign transactions 
                     authorized by the on-chain Anchor program constraints.
                   </p>
                </div>
                
                {/* Visual Micro-interaction */}
                <div className="font-mono text-[10px] text-gray-600 p-3 border border-white/5 rounded bg-black/50 w-fit">
                   seeds = [b"vault", user_pubkey, bump]
                </div>
              </div>
            </div>

            {/* Module 2: Signal Processing */}
            <div className="bg-[#08080A] p-10 group hover:bg-[#0C0C0E] transition-colors border-t md:border-t-0 border-white/5">
                <div className="space-y-4">
                   <div className="w-8 h-8 rounded bg-cyan-900/20 flex items-center justify-center text-cyan-500 mb-6">
                      <Zap className="w-4 h-4" />
                   </div>
                   <h3 className="text-lg font-medium text-white">Low-Latency RPC Stream</h3>
                   <p className="text-sm text-gray-400 leading-7">
                     Watcher nodes utilize <strong>Geyser Plugins</strong> and high-throughput WebSocket subscriptions (`logsSubscribe`) to ingest Star Trader transactions within the same block slot they occur.
                   </p>
                </div>
            </div>

            {/* Module 3: Execution Engine */}
            <div className="bg-[#08080A] p-10 group hover:bg-[#0C0C0E] transition-colors border-t border-white/5">
                <div className="space-y-4">
                   <div className="w-8 h-8 rounded bg-green-900/20 flex items-center justify-center text-green-500 mb-6">
                      <Terminal className="w-4 h-4" />
                   </div>
                   <h3 className="text-lg font-medium text-white">Jupiter CPI Integration</h3>
                   <p className="text-sm text-gray-400 leading-7">
                     Routes are calculated off-chain for optimal pricing, then executed on-chain via <strong>Cross-Program Invocation (CPI)</strong> to the Jupiter V6 program. This ensures atomic execution and slippage protection.
                   </p>
                </div>
            </div>

            {/* Module 4: Relayer */}
            <div className="md:col-span-2 bg-[#08080A] p-10 group hover:bg-[#0C0C0E] transition-colors border-t border-white/5">
               <div className="flex flex-col md:flex-row gap-8 justify-between items-start">
                  <div className="space-y-4 max-w-md">
                     <h3 className="text-xl font-medium text-white">Meta-Transaction Relayer</h3>
                     <p className="text-sm text-gray-400 leading-7">
                       To abstract gas management, a dedicated Relayer Service acts as the transaction <strong>Fee Payer</strong>. 
                       The User Vault signs as the <em>Authority</em>, while the Relayer covers SOL fees, enabling a seamless "Gasless" UX.
                     </p>
                  </div>
                  
                  {/* Diagrammatic Representation */}
                  <div className="flex items-center gap-3 font-mono text-[10px] text-gray-500 mt-4 md:mt-0">
                     <span className="px-2 py-1 border border-white/10 rounded bg-white/5 text-gray-300">Relayer (Signer)</span>
                     <ArrowRight className="w-3 h-3 text-gray-700" />
                     <span className="px-2 py-1 border border-white/10 rounded bg-white/5 text-gray-300">Vault (Authority)</span>
                     <ArrowRight className="w-3 h-3 text-gray-700" />
                     <span className="px-2 py-1 border border-white/10 rounded bg-white/5 text-green-400/80">Jupiter V6</span>
                  </div>
               </div>
            </div>

          </div>
        </div>
      </section>
  {/* Deployment Workflow / How It Works */}
      <section className="relative py-32 px-4 bg-[#050508] border-b border-white/5 overflow-hidden">
        <div className="relative z-10 max-w-6xl mx-auto">
          
          <div className="flex flex-col md:flex-row justify-between items-end mb-20 gap-6 border-b border-white/5 pb-8">
            <div className="max-w-2xl">
              <p className="text-[11px] font-mono text-cyan-500 uppercase tracking-widest mb-3">
                Operational Sequence
              </p>
              <h2 className="text-3xl md:text-4xl font-medium text-white tracking-tight font-[family-name:var(--font-space-grotesk)]">
                Vault Deployment Workflow.
              </h2>
            </div>
            <div className="text-right hidden md:block">
              <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">Estimated Setup</p>
              <p className="text-xl font-medium text-white font-mono">~45s</p>
            </div>
          </div>

          {/* Workflow Grid */}
          <div className="grid md:grid-cols-3 gap-8 relative">
             {/* Connector Lines (Desktop Only) */}
             <div className="hidden md:block absolute top-12 left-[16%] w-[33%] h-[1px] bg-gradient-to-r from-cyan-900/50 to-transparent z-0" />
             <div className="hidden md:block absolute top-12 right-[16%] w-[33%] h-[1px] bg-gradient-to-r from-transparent to-cyan-900/50 z-0" />

            {/* Step 1 */}
            <div className="relative z-10 group">
              <div className="w-full h-full p-1 rounded-2xl bg-gradient-to-b from-white/5 to-transparent">
                <div className="h-full bg-[#08080A] p-8 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-center justify-between mb-6">
                     <div className="w-10 h-10 rounded bg-white/5 flex items-center justify-center border border-white/10 text-white font-mono">1</div>
                     <Wallet className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors" />
                  </div>
                  
                  <div className="mb-2 font-mono text-[10px] text-gray-600 bg-white/5 w-fit px-2 py-1 rounded">
                    POST /auth/connect
                  </div>
                  <h3 className="text-lg font-medium text-white mb-3">Establish Session</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    Authenticate via Solana Wallet Adapter (Phantom/Solflare). This derives your public key for PDA seed generation.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative z-10 group">
              <div className="w-full h-full p-1 rounded-2xl bg-gradient-to-b from-white/5 to-transparent">
                <div className="h-full bg-[#08080A] p-8 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-center justify-between mb-6">
                     <div className="w-10 h-10 rounded bg-cyan-900/20 flex items-center justify-center border border-cyan-500/30 text-cyan-400 font-mono">2</div>
                     <Users className="w-5 h-5 text-gray-500 group-hover:text-cyan-400 transition-colors" />
                  </div>
                  
                  <div className="mb-2 font-mono text-[10px] text-gray-600 bg-white/5 w-fit px-2 py-1 rounded">
                    FN select_target_trader()
                  </div>
                  <h3 className="text-lg font-medium text-white mb-3">Configure Strategy</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    Select a Star Trader from the registry. Define your execution constraints: Max Slippage (bps), Daily Volume, and Token Whitelist.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative z-10 group">
              <div className="w-full h-full p-1 rounded-2xl bg-gradient-to-b from-white/5 to-transparent">
                <div className="h-full bg-[#08080A] p-8 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-center justify-between mb-6">
                     <div className="w-10 h-10 rounded bg-white/5 flex items-center justify-center border border-white/10 text-white font-mono">3</div>
                     <Shield className="w-5 h-5 text-gray-500 group-hover:text-green-400 transition-colors" />
                  </div>
                  
                  <div className="mb-2 font-mono text-[10px] text-gray-600 bg-white/5 w-fit px-2 py-1 rounded">
                    IX initialize_vault
                  </div>
                  <h3 className="text-lg font-medium text-white mb-3">Deploy Vault</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    Sign a single transaction to deploy your PDA Vault and deposit initial capital. The Relayer takes over execution monitoring immediately.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Video Section - "Terminal Window" Style */}
          <div className="mt-32">
            <div className="flex items-center gap-4 mb-8 border-b border-white/5 pb-4">
               <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-white/10" />
                  <div className="w-3 h-3 rounded-full bg-white/10" />
                  <div className="w-3 h-3 rounded-full bg-white/10" />
               </div>
               <p className="text-[11px] font-mono text-gray-500 uppercase tracking-widest">
                 System_Demo.mp4
               </p>
            </div>
            
            <div className="relative rounded-lg border border-white/10 bg-black shadow-2xl overflow-hidden">
               {/* Overlay Grid for video */}
               <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.1] pointer-events-none z-10" />
               
               <iframe
                className="w-full aspect-video relative z-0 grayscale hover:grayscale-0 transition-all duration-700 ease-in-out"
                src="https://www.youtube.com/embed/yPQ_Yd2hufo?rel=0&modestbranding=1&controls=1&autoplay=0"
                title="System Demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>

        </div>
      </section>

   {/* Platform Capabilities / Features */}
      <section className="relative py-32 px-4 bg-[#050508] border-b border-white/5 overflow-hidden">
        
        {/* Radial Gradient Background */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-blue-900/5 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative z-10 max-w-6xl mx-auto">
          
          {/* Header */}
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-4xl font-medium text-white tracking-tight font-[family-name:var(--font-space-grotesk)] mb-4">
              Capabilities.
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed font-light">
              Beyond simple copy-trading. StellAlpha provides a complete suite of 
              autonomous tools for the sovereign DeFi user.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 gap-8">
            
            {/* Feature 1: AI Agent */}
            <div className="group relative p-8 rounded-2xl bg-[#08080A] border border-white/5 hover:border-white/10 transition-all duration-300 overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-100 transition-opacity duration-500">
                 <MessageCircle className="w-16 h-16 text-cyan-900/40" />
              </div>
              
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-lg bg-cyan-500/10 flex items-center justify-center mb-6 border border-cyan-500/20 text-cyan-400">
                   <Bot className="w-6 h-6" />
                </div>
                
                <h3 className="text-xl font-medium text-white mb-3">Intent-Based AI Agent</h3>
                <p className="text-sm text-gray-400 leading-7 mb-6">
                  Manage your vault via natural language. The integrated LangChain agent translates conversational intents 
                  ("Swap 5 SOL to USDC", "Check PnL") into verifiable on-chain transactions.
                </p>

                {/* Mock Chat Interface */}
                <div className="mt-auto rounded-lg bg-black/50 border border-white/5 p-4 font-mono text-[10px] space-y-2">
                   <div className="flex gap-2 text-gray-500">
                      <span>&gt;</span>
                      <span>Simulate copy-trade performance for wallet 8x...F2a9</span>
                   </div>
                   <div className="flex gap-2 text-cyan-400">
                      <span>AI:</span>
                      <span>Based on 30d history, wallet 8x...F2a9 has a 12% win rate. Simulation complete.</span>
                   </div>
                </div>
              </div>
            </div>

            {/* Feature 2: Aggregation */}
            <div className="group relative p-8 rounded-2xl bg-[#08080A] border border-white/5 hover:border-white/10 transition-all duration-300 overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-100 transition-opacity duration-500">
                 <Zap className="w-16 h-16 text-purple-900/40" />
              </div>
              
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-lg bg-purple-500/10 flex items-center justify-center mb-6 border border-purple-500/20 text-purple-400">
                   <Zap className="w-6 h-6" />
                </div>
                
                <h3 className="text-xl font-medium text-white mb-3">Universal Liquidity Access</h3>
                <p className="text-sm text-gray-400 leading-7 mb-6">
                  Powered by Jupiter Aggregator, StellAlpha accesses 100% of Solana's liquidity. 
                  Whether it's Raydium, Orca, or Meteora, your vault executes at the best possible price, atomic and slippage-protected.
                </p>

                {/* Route Visualization */}
                <div className="mt-auto rounded-lg bg-black/50 border border-white/5 p-4 flex items-center justify-between gap-2">
                   <div className="flex flex-col items-center gap-1">
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-white">SOL</div>
                   </div>
                   <div className="h-px flex-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent relative">
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#08080A] px-2 text-[9px] text-gray-500 font-mono">
                        JUPITER ROUTE
                      </div>
                   </div>
                   <div className="flex flex-col items-center gap-1">
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-white">USDC</div>
                   </div>
                </div>
              </div>
            </div>

          </div>

          {/* Secondary Features List */}
          <div className="mt-8 grid md:grid-cols-3 gap-px bg-white/5 border border-white/5 rounded-xl overflow-hidden">
             <div className="bg-[#08080A] p-6 flex items-center gap-4 hover:bg-[#0C0C0E] transition-colors">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                <div>
                   <h4 className="text-sm font-medium text-white">Zero Key Sharing</h4>
                   <p className="text-xs text-gray-500 mt-1">Your private keys never leave your wallet.</p>
                </div>
             </div>
             <div className="bg-[#08080A] p-6 flex items-center gap-4 hover:bg-[#0C0C0E] transition-colors">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                <div>
                   <h4 className="text-sm font-medium text-white">Gasless Transactions</h4>
                   <p className="text-xs text-gray-500 mt-1">Relayer covers SOL fees for all vault ops.</p>
                </div>
             </div>
             <div className="bg-[#08080A] p-6 flex items-center gap-4 hover:bg-[#0C0C0E] transition-colors">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                <div>
                   <h4 className="text-sm font-medium text-white">Verifiable On-Chain</h4>
                   <p className="text-xs text-gray-500 mt-1">Every trade is auditable via block explorers.</p>
                </div>
             </div>
          </div>

        </div>
      </section>
      <TechStack />

      {/* Security Architecture / Risk Management Engine */}
      <section className="relative py-32 px-4 bg-[#050508] border-b border-white/5 overflow-hidden">
        
        <div className="relative z-10 max-w-6xl mx-auto">
          
          {/* Header */}
          <div className="mb-20 max-w-3xl">
            <p className="text-[11px] font-mono text-emerald-500 uppercase tracking-widest mb-3">
              Risk Management Engine
            </p>
            <h2 className="text-3xl md:text-4xl font-medium text-white tracking-tight font-[family-name:var(--font-space-grotesk)] mb-6">
              Trustless by Design.
            </h2>
            <p className="text-lg text-gray-400 leading-relaxed font-light text-balance">
              StellAlpha eliminates the single point of failure inherent in traditional trading bots. 
              Security is enforced mathematically by the Solana runtime, not by trusting our backend.
            </p>
          </div>

          {/* Security Grid */}
          <div className="grid md:grid-cols-2 gap-6">
            
            {/* Card 1: PDA Sovereignty */}
            <div className="p-8 rounded-xl bg-[#08080A] border border-white/5 hover:border-white/10 transition-all group">
               <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center mb-6 text-white group-hover:text-cyan-400 transition-colors">
                 <Lock className="w-6 h-6" />
               </div>
               <h3 className="text-lg font-medium text-white mb-3">Cryptographic Sovereignty</h3>
               <p className="text-sm text-gray-400 leading-7 mb-6">
                 Your vault is a <strong>Program Derived Address (PDA)</strong>. By protocol definition, it has no private key. 
                 Only the <code>stellalpha_vault</code> program can authorize transfers, and only when strictly defined constraints are met.
               </p>
               <div className="p-3 rounded bg-black/50 border border-white/5 font-mono text-[10px] text-gray-500">
                 <span>constraint = vault.owner == user.key()</span>
               </div>
            </div>

            {/* Card 2: Execution Bounds */}
            <div className="p-8 rounded-xl bg-[#08080A] border border-white/5 hover:border-white/10 transition-all group">
               <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center mb-6 text-white group-hover:text-purple-400 transition-colors">
                 <Shield className="w-6 h-6" />
               </div>
               <h3 className="text-lg font-medium text-white mb-3">Deterministic Execution</h3>
               <p className="text-sm text-gray-400 leading-7 mb-6">
                 Every trade instruction carries hard-coded slippage and price impact limits. 
                 The on-chain program verifies these parameters <em>before</em> invoking Jupiter. If the market moves against you, the transaction reverts instantly.
               </p>
               <div className="p-3 rounded bg-black/50 border border-white/5 font-mono text-[10px] text-gray-500">
                 <span>require!(slippage &lt;= settings.max_slippage)</span>
               </div>
            </div>

            {/* Card 3: Visibility */}
            <div className="p-8 rounded-xl bg-[#08080A] border border-white/5 hover:border-white/10 transition-all group">
               <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center mb-6 text-white group-hover:text-emerald-400 transition-colors">
                 <Eye className="w-6 h-6" />
               </div>
               <h3 className="text-lg font-medium text-white mb-3">Total Observability</h3>
               <p className="text-sm text-gray-400 leading-7 mb-6">
                 Unlike opaque CEX order books, every StellAlpha action emits a verifiable on-chain event. 
                 Auditors and users can reconstruct the entire trading history directly from the Solana ledger.
               </p>
               <div className="p-3 rounded bg-black/50 border border-white/5 font-mono text-[10px] text-gray-500">
                 <span>emit!(CopyTradeExecutedEvent &#123; ... &#125;)</span>
               </div>
            </div>

            {/* Card 4: Fee Abstraction */}
            <div className="p-8 rounded-xl bg-[#08080A] border border-white/5 hover:border-white/10 transition-all group">
               <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center mb-6 text-white group-hover:text-blue-400 transition-colors">
                 <FileCode className="w-6 h-6" />
               </div>
               <h3 className="text-lg font-medium text-white mb-3">Permissioned Relayer</h3>
               <p className="text-sm text-gray-400 leading-7 mb-6">
                 The Relayer service acts strictly as a <strong>Fee Payer</strong>. It holds the SOL required for network fees but holds 
                 <strong> zero authority</strong> to withdraw assets or alter strategy parameters.
               </p>
               <div className="p-3 rounded bg-black/50 border border-white/5 font-mono text-[10px] text-gray-500">
                 <span>tx.feePayer = relayer.publicKey</span>
               </div>
            </div>

          </div>

          {/* Operational Status Banner */}
          <div className="mt-16 p-6 rounded-lg border border-yellow-500/20 bg-yellow-500/5 flex flex-col md:flex-row items-start gap-6">
             <div className="p-3 rounded-full bg-yellow-500/10 text-yellow-500">
                <AlertTriangle className="w-5 h-5" />
             </div>
             <div>
                <h4 className="text-sm font-medium text-white mb-2 uppercase tracking-wide">Devnet Environment Active</h4>
                <p className="text-sm text-gray-400 leading-relaxed max-w-2xl">
                   The protocol is currently deployed on <strong>Solana Devnet</strong> for stress testing. 
                   Smart contracts are pending final audit. Please do not deposit Mainnet assets until the 
                   <strong> v1.0.0-stable</strong> release tag is published.
                </p>
             </div>
             <div className="md:ml-auto flex items-center gap-4 pt-2">
                <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500 uppercase tracking-wider">
                   <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
                   Audit: Pending
                </div>
             </div>
          </div>

        </div>
      </section>
      <Footer />
    </div>
  );
}