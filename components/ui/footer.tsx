"use client";
import Link from "next/link";
import Image from "next/image";
import { Github, Twitter, FileText, Shield, ExternalLink, Terminal } from "lucide-react";

export const Footer = () => {
  return (
    <footer className="relative z-10 py-16 px-4 bg-[#050508] border-t border-white/5">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-4 gap-12 mb-16">
          
          {/* Column 1: Brand & Identity */}
          <div className="md:col-span-2 space-y-6 pr-8">
            <div className="flex items-center gap-3">
              <div className="relative w-8 h-8">
                 <Image 
                   src="/stellalpha.png" 
                   alt="StellAlpha" 
                   width={32} 
                   height={32} 
                   className="w-full h-full object-contain opacity-90"
                 />
              </div>
              <h3 className="text-xl font-medium text-white tracking-tight font-[family-name:var(--font-space-grotesk)]">
                StellAlpha
              </h3>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed max-w-sm font-light">
              A non-custodial execution layer for Solana. 
              Automating DeFi strategies via PDA vaults and Jupiter CPI 
              without compromising sovereign ownership.
            </p>
            
            <div className="flex items-center gap-5 pt-4">
               {/* Socials - Clean & Minimal */}
               <a href="https://x.com/AakashM88827113" target="_blank" className="text-gray-500 hover:text-white transition-colors" aria-label="Twitter">
                 <Twitter size={18} />
               </a>
               <a href="https://github.com/akm2006/stellalpha" target="_blank" className="text-gray-500 hover:text-white transition-colors" aria-label="GitHub">
                 <Github size={18} />
               </a>
               <a href="https://dorahacks.io/buidl/32072" target="_blank" className="opacity-50 hover:opacity-100 transition-opacity" aria-label="DoraHacks">
                  <div className="w-5 h-5 rounded-sm overflow-hidden bg-gray-800 grayscale hover:grayscale-0 transition-all">
                    <img src="/dorahacks.jpg" alt="DoraHacks" className="w-full h-full object-cover" />
                  </div>
               </a>
            </div>
          </div>

          {/* Column 2: Developers */}
          <div>
            <h4 className="text-[11px] font-mono text-cyan-500 uppercase tracking-widest mb-6">Developers</h4>
            <ul className="space-y-4 text-sm text-gray-400">
              <li>
                <a href="https://github.com/akm2006/stellalpha" target="_blank" className="hover:text-white flex items-center gap-2 transition-colors group">
                  GitHub Repository 
                  <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              </li>
              <li>
                <Link href="#" className="hover:text-white transition-colors">
                  Architecture Spec
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-white transition-colors">
                  Anchor IDL
                </Link>
              </li>
               <li>
                <a href="https://github.com/0xgasless/agentkit" target="_blank" className="hover:text-white transition-colors">
                  AgentKit SDK
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Protocol Status */}
          <div>
            <h4 className="text-[11px] font-mono text-emerald-500 uppercase tracking-widest mb-6">Network Status</h4>
            <ul className="space-y-4 text-sm text-gray-400">
              <li>
                <span className="flex items-center gap-2 cursor-default text-emerald-400/80">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  Devnet Active
                </span>
              </li>
              <li>
                <span className="flex items-center gap-2 cursor-default text-gray-500">
                   <Shield size={14} />
                   Audit Pending
                </span>
              </li>
              <li className="pt-2">
                <Link href="/dashboard" className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-white/10 bg-white/5 text-xs text-white hover:bg-white/10 transition-colors">
                  <Terminal size={12} />
                  Launch Terminal
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
           <p className="text-[10px] text-gray-600 font-mono uppercase tracking-wide">
             © 2025 StellAlpha Protocol. Open Source (MIT).
           </p>
           <div className="flex items-center gap-6 text-[10px] text-gray-600 font-mono uppercase tracking-wide">
              <span>v1.2.0-beta</span>
              <div className="w-1 h-1 rounded-full bg-gray-700" />
              <span>Solana SVM</span>
              <div className="w-1 h-1 rounded-full bg-gray-700" />
              <span>Latency: ~400ms</span>
           </div>
        </div>

      </div>
    </footer>
  );
};