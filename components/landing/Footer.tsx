"use client";

import React from "react";
import { Github } from "lucide-react";

const XLogo = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const DoraHacksLogo = ({ size = 16 }: { size?: number }) => (
  <span
    className="flex items-center justify-center rounded-sm bg-white p-0.5"
    style={{ width: size + 4, height: size + 4 }}
  >
    <img
      src="https://cdn.dorahacks.io/static/files/189f8f1398ad4732d09ce824ea48afa3.png"
      alt="DoraHacks"
      className="h-full w-full object-contain"
    />
  </span>
);

const FOOTER_LINKS = [
  {
    label: "Main Repo",
    href: "https://github.com/akm2006/stellalpha",
    icon: Github,
  },
  {
    label: "Vault Repo",
    href: "https://github.com/akm2006/stellalpha_vault",
    icon: Github,
  },
  {
    label: "DoraHacks",
    href: "https://dorahacks.io/buidl/32072",
    icon: DoraHacksLogo,
  },
  {
    label: "X",
    href: "https://x.com/stellalpha_",
    icon: XLogo,
  },
];

export const Footer = () => (
  <footer className="border-t border-white/5 bg-[#050505] px-6 py-12">
    <div className="mx-auto flex max-w-7xl flex-col gap-8 md:flex-row md:items-end md:justify-between">
      <div className="max-w-md">
        <h3 className="mb-2 text-lg font-medium text-white">Stellalpha</h3>
        <p className="text-xs leading-relaxed text-slate-500">
          Non-custodial autonomous copy trading infrastructure. Copy high-performance
          traders without compromising key security.
        </p>
      </div>

      <div className="md:text-right">
        <div className="flex flex-wrap gap-3 md:justify-end">
          {FOOTER_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-mono uppercase tracking-[0.16em] text-slate-400 transition-colors hover:border-emerald-500/30 hover:bg-emerald-500/5 hover:text-emerald-400"
            >
              <link.icon size={15} />
              <span>{link.label}</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  </footer>
);
