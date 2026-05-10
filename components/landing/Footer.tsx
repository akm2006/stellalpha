"use client";

import React from "react";
import { FileText, Github } from "lucide-react";

const XLogo = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const StellalphaLogo = () => (
    <svg
      width="24"
      height="24"
      viewBox="0 0 445 436"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-emerald-500"
    >
      <path d="M187.43 331.101L368.93 196.101L443.93 175.601L301.93 282.101L162.43 384.101L187.43 331.101Z" fill="currentColor" />
      <path d="M268.43 176.101L373.43 193.601L441.43 176.101L286.93 148.601L268.43 176.101Z" fill="currentColor" />
      <path d="M221.93 0.601471L286.93 149.101L268.43 177.101L221.93 76.6015V0.601471Z" fill="currentColor" />
      <path d="M155.43 148.601L222.93 1.60147L220.93 76.1015L175.43 176.601L155.43 148.601Z" fill="currentColor" />
      <path d="M0.929932 174.601L154.93 148.601L174.93 176.101L74.4299 193.601L0.929932 174.601Z" fill="currentColor" />
      <path d="M122.43 272.101L0.929932 176.101L73.4299 194.101L136.93 243.101L122.43 272.101Z" fill="currentColor" />
      <path d="M367.93 432.101L309.43 312.101L284.43 330.601L320.43 405.101L367.93 432.101Z" fill="currentColor" />
      <path d="M122.93 402.601L76.4299 431.601L222.43 133.101V201.101L122.93 402.601Z" fill="currentColor" />
      <path d="M245.93 248.101L222.43 201.101V133.101L270.43 228.101L245.93 248.101Z" fill="currentColor" />
    </svg>
);

const FOOTER_LINKS = [
  { label: "Github", href: "https://github.com/akm2006/stellalpha", icon: Github },
  { label: "Vault Repo", href: "https://github.com/akm2006/stellalpha_vault", icon: Github, dev: true },
  { label: "X", href: "https://x.com/stellalpha_", icon: XLogo },
  { label: "Whitepaper", href: "/whitepaper.pdf", icon: FileText },
];

export const Footer = () => (
  <footer className="w-full border-t border-white/5 bg-[#050505] px-6 py-12">
    <div className="mx-auto flex max-w-7xl flex-col gap-10 md:flex-row md:items-start md:justify-between">
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <StellalphaLogo />
          <span className="text-xl font-semibold tracking-tighter text-white uppercase">Stellalpha</span>
        </div>
        <p className="max-w-sm text-xs leading-relaxed text-slate-500 font-mono uppercase tracking-wider">
          Non-custodial execution layer for curated Solana strategies. 
          Precision intent replication with strategy-aware capital control.
        </p>
      </div>

      <div className="flex flex-col gap-8 md:flex-row md:gap-16">
        <div className="space-y-6">
          <h4 className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-400">Links</h4>
          <div className="flex flex-wrap gap-3">
            {FOOTER_LINKS.map((link) => (
              <div key={link.label} className="flex flex-col items-start gap-1">
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 border border-white/5 bg-white/[0.02] px-4 py-2 text-[10px] font-mono uppercase tracking-widest text-slate-400 transition-all hover:border-emerald-500/30 hover:bg-emerald-500/5 hover:text-emerald-400 cyber-panel-soft w-fit"
                >
                  <link.icon size={14} />
                  <span>{link.label}</span>
                </a>
                {link.dev && (
                  <span className="text-[7px] font-mono text-amber-500/60 uppercase tracking-[0.2em] pl-1">
                    [ IN DEVELOPMENT ]
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="text-[10px] font-mono text-slate-600 uppercase tracking-widest pt-4">
            © {new Date().getFullYear()} Stellalpha Protocol
          </div>
        </div>
      </div>
    </div>
  </footer>
);
