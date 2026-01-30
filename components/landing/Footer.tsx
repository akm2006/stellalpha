"use client";

import React from "react";
import { Github, ExternalLink } from "lucide-react";

export const Footer = () => (
  <footer className="border-t border-white/5 py-12 px-6 bg-[#050505]">
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8 mb-12">
        <div className="max-w-md">
          <h3 className="text-lg font-medium mb-2 text-white">StellAlpha</h3>
          <p className="text-xs leading-relaxed text-slate-500">
            Non-custodial autonomous copy trading infrastructure . Copy high performance traders without compromising key security.
          </p>
        </div>
        <div className="flex gap-4">
          <a href="https://github.com/akm2006/stellalpha" target="_blank" rel="noopener noreferrer" 
             className="p-2.5 border border-white/10 rounded-lg transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/5 text-slate-400 hover:text-emerald-400">
            <Github size={18} />
          </a>
          <a href="https://x.com/stellphatrade" target="_blank" rel="noopener noreferrer"
             className="p-2.5 border border-white/10 rounded-lg transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/5 text-slate-400 hover:text-emerald-400">
            <ExternalLink size={18} />
          </a>
        </div>
      </div>
      
      <div className="pt-6 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="text-[10px] font-mono tracking-wider text-slate-600">
          © 2025 StellAlpha Protocol. Open Source (MIT).
        </div>
        <div className="flex gap-6 text-[10px] font-mono text-slate-500">
          <a href="https://github.com/akm2006/stellalpha" className="hover:text-emerald-400 transition-colors">Documentation</a>
          <a href="#" className="hover:text-emerald-400 transition-colors">Anchor IDL</a>
          <a href="#" className="hover:text-emerald-400 transition-colors">Terms</a>
        </div>
      </div>
    </div>
  </footer>
);
