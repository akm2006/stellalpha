"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X, LayoutDashboard, Star, LogIn, Loader2, Wallet, Terminal, Command, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLORS } from "@/lib/theme";
import { useAppKit, useAppKitAccount, useWalletInfo } from "@reown/appkit/react";
import { useAuth } from "@/contexts/auth-context";
import { motion, AnimatePresence } from "framer-motion";

interface NavItem {
  href: string;
  icon: React.ComponentType<any>;
  label: string;
}

const navigationItems: NavItem[] = [
  { href: "/demo-vault", icon: LayoutDashboard, label: "Demo Vault" },
  { href: "/star-traders", icon: Star, label: "Star Traders" },

];

// Unified Auth Button Component - Professional / Technical / Cyberpunk Style
function UnifiedAuthButton() {
  const { isConnected, address } = useAppKitAccount();
  const { open } = useAppKit();
  const { walletInfo } = useWalletInfo();
  const { isAuthenticated, isLoading, signIn } = useAuth();

  // "Technical" Button Base
  const btnBase = "h-9 px-4 flex items-center gap-2 text-xs font-mono uppercase tracking-wider transition-all rounded-sm border backdrop-blur-md relative overflow-hidden group";

  // State 1: Not connected → "Connect Wallet" (Sleek, Professional)
  if (!isConnected) {
    return (
      <button
        onClick={() => open()}
        className={cn(
          btnBase,
          "bg-emerald-500/5 border-emerald-500/20 text-emerald-500",
          "hover:bg-emerald-500/10 hover:border-emerald-500/50 hover:text-emerald-400 hover:shadow-[0_0_15px_rgba(16,185,129,0.15)]",
          "active:scale-[0.98]"
        )}
      >
        <Wallet size={14} className="group-hover:rotate-12 transition-transform duration-300" />
        <span className="font-semibold">Connect Wallet</span>
      </button>
    );
  }

  // Connected states
  const truncatedAddress = address ? `${address.slice(0, 4)}...${address.slice(-4)}` : '';

  return (
    <div className="flex items-center gap-3">
      {/* Wallet Button */}
      <button
        onClick={() => open({ view: "Account" })}
        className={cn(
          btnBase,
          "bg-[#0A0A0A] border-white/10 text-slate-300 gap-2.5",
          "hover:border-white/20 hover:text-white hover:bg-white/5"
        )}
      >
        <div className="flex items-center justify-center w-4 h-4 rounded-full overflow-hidden bg-white/5 p-0.5">
          {walletInfo?.icon ? (
            <img src={walletInfo.icon} alt={walletInfo.name} className="w-full h-full object-cover" />
          ) : (
            <Wallet size={10} className="text-slate-400" />
          )}
        </div>
        <span className="font-mono text-xs">{truncatedAddress}</span>
      </button>

      {/* State 2: Connected but not verified → "Verify" Action */}
      {!isAuthenticated && (
        <button
          onClick={signIn}
          disabled={isLoading}
          className={cn(
            btnBase,
            isLoading
              ? "bg-amber-500/5 border-amber-500/10 text-amber-500/50 cursor-not-allowed"
              : "bg-amber-500/5 border-amber-500/20 text-amber-500 hover:bg-amber-500/10 hover:border-amber-500/50 hover:shadow-[0_0_15px_rgba(245,158,11,0.15)]"
          )}
        >
          {isLoading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          )}
          <span className="font-semibold">{isLoading ? 'Verifying...' : 'Verify'}</span>
        </button>
      )}

      {/* State 3: Authenticated → Simple Professional Icon */}
      {isAuthenticated && (
        <div
          className="flex items-center justify-center w-9 h-9 rounded-sm border border-emerald-500/20 bg-emerald-500/5 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.1)] group relative"
          title="Identity Verified"
        >
          <div className="absolute inset-0 bg-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity blur-md" />
          <ShieldCheck size={16} strokeWidth={2.5} />
        </div>
      )}
    </div>
  );
}

const LOGO_PATHS = [
  "M187.43 331.101L368.93 196.101L443.93 175.601L301.93 282.101L162.43 384.101L187.43 331.101Z",
  "M268.43 176.101L373.43 193.601L441.43 176.101L286.93 148.601L268.43 176.101Z",
  "M221.93 0.601471L286.93 149.101L268.43 177.101L221.93 76.6015V0.601471Z",
  "M155.43 148.601L222.93 1.60147L220.93 76.1015L175.43 176.601L155.43 148.601Z",
  "M0.929932 174.601L154.93 148.601L174.93 176.101L74.4299 193.601L0.929932 174.601Z",
  "M122.43 272.101L0.929932 176.101L73.4299 194.101L136.93 243.101L122.43 272.101Z",
  "M367.93 432.101L309.43 312.101L284.43 330.601L320.43 405.101L367.93 432.101Z",
  "M122.93 402.601L76.4299 431.601L222.43 133.101V201.101L122.93 402.601Z",
  "M245.93 248.101L222.43 201.101V133.101L270.43 228.101L245.93 248.101Z"
];

function NavbarLogo() {
  return (
    <motion.svg
      width="40"
      height="40"
      viewBox="0 0 445 436"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-10 h-10 filter drop-shadow-[0_0_8px_rgba(1,181,92,0.3)]"
    >
      <defs>
        <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#01B55C" />
          <stop offset="100%" stopColor="#00FF85" />
        </linearGradient>
      </defs>
      {LOGO_PATHS.map((d, i) => (
        <motion.path
          key={i}
          d={d}
          stroke="url(#logoGradient)"
          strokeWidth="2"
          fill="url(#logoGradient)"
          fillOpacity="1"
          variants={{
            hidden: {
              pathLength: 0,
              fillOpacity: 0,
              opacity: 0
            },
            visible: {
              pathLength: 1,
              fillOpacity: 1,
              opacity: 1,
              transition: {
                duration: 1.5,
                ease: "easeInOut",
                delay: i * 0.05
              }
            },
            hover: {
              // "Disappear and Form"
              pathLength: [1, 0, 0, 1],
              fillOpacity: [1, 0, 0, 1],
              opacity: [1, 0, 0, 1],
              transition: {
                duration: 0.8,
                ease: "easeInOut",
                times: [0, 0.3, 0.35, 1], // Quick vanish, slight pause, smooth draw
                delay: i * 0.03 // Ripple reconstruct
              }
            }
          }}
        />
      ))}
    </motion.svg>
  );
}

export default function ModernHeader() {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Fixed "Command Strip" Header */}
      <header className="fixed top-0 inset-x-0 z-50 bg-[#050505]/95 backdrop-blur-sm border-b border-white/10 h-16">
        <div className="max-w-[1920px] mx-auto h-full flex items-center justify-between pl-6 pr-6 md:pr-8">

          {/* Left: Branding & Logo */}
          <div className="flex items-center h-full">
            <Link
              href="/"
              aria-label="Stellalpha home"
              className="flex items-center gap-3 group h-full pr-8 border-r border-white/5 md:border-transparent lg:border-white/5"
            >
              <motion.div
                className="relative flex items-center justify-center transform-gpu"
                initial="hidden"
                animate="visible"
                whileHover="hover"
              >
                <NavbarLogo />

                {/* Unified Text Animation Container */}
                <div className="hidden lg:flex flex-col justify-center h-full ml-3">
                  <div className="flex items-baseline overflow-visible">
                    <motion.span
                      className="text-xl font-bold tracking-tight text-white leading-none relative"
                      style={{ fontFamily: 'var(--font-space-grotesk), sans-serif' }}
                      variants={{
                        hidden: { opacity: 0, filter: "blur(10px)", x: -10 },
                        visible: {
                          opacity: 1,
                          filter: "blur(0px)",
                          x: 0,
                          transition: { duration: 0.8, ease: "easeOut", delay: 0.2 }
                        },
                        hover: {
                          opacity: [1, 0, 1],
                          filter: ["blur(0px)", "blur(10px)", "blur(0px)"],
                          transition: {
                            duration: 0.6,
                            times: [0, 0.4, 1],
                            delay: 0.1
                          }
                        }
                      }}
                    >
                      STELLALPHA
                    </motion.span>
                    <motion.span
                      className="text-sm font-mono font-medium ml-0.5"
                      variants={{
                        hidden: { opacity: 0, x: -10 },
                        visible: {
                          opacity: 0.5,
                          x: 0,
                          color: "#10B981",
                          transition: { duration: 0.8, ease: "easeOut", delay: 0.4 }
                        },
                        hover: {
                          opacity: [0.5, 0, 1],
                          y: [0, -5, 0],
                          color: ["#10B981", "#34D399", "#34D399"],
                          transition: {
                            duration: 0.6,
                            times: [0, 0.4, 1],
                            delay: 0.2
                          }
                        }
                      }}
                    >
                      .xyz
                    </motion.span>
                  </div>
                </div>
              </motion.div>
            </Link>

            {/* Desktop Navigation - The "Grid" */}
            <nav className="hidden md:flex items-center h-full ml-6">
              {navigationItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "relative h-full px-6 flex items-center gap-2 text-xs font-mono uppercase tracking-widest transition-all",
                      "hover:bg-white/[0.02] hover:text-emerald-400 group border-l border-transparent first:border-l-white/5 border-r border-white/5",
                      active ? "text-emerald-400 bg-white/[0.02]" : "text-slate-400"
                    )}
                  >
                    {/* Active Indicator Line */}
                    {active && (
                      <motion.div
                        layoutId="navbar-active"
                        className="absolute bottom-0 left-0 right-0 h-[2px] bg-emerald-500"
                      />
                    )}

                    {/* Hover Brackets Effect */}
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-emerald-500/50 mr-[-5px]">[</span>
                    <span>{item.label}</span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-emerald-500/50 ml-[-5px]">]</span>
                  </Link>
                )
              })}
            </nav>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-6 h-full">

            {/* Auth Button */}
            <div className="hidden md:block">
              <UnifiedAuthButton />
            </div>

            {/* Mobile Menu Toggle */}
            <button
              className="md:hidden flex flex-col items-center justify-center w-10 h-10 border border-white/10 bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 transition-all rounded-sm"
              onClick={() => setIsMobileOpen(!isMobileOpen)}
            >
              {isMobileOpen ? <X size={18} /> : <Terminal size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Terminal Menu */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="fixed top-16 left-0 right-0 bg-[#050505] border-b border-white/10 overflow-hidden z-40"
          >
            <nav className="flex flex-col">
              {navigationItems.map((item, idx) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className="flex items-center gap-4 px-6 py-4 border-b border-white/5 hover:bg-emerald-500/5 transition-colors group"
                >
                  <span className="text-xs font-mono text-emerald-500/50">0{idx + 1}</span>
                  <span className="text-sm font-mono uppercase tracking-wider text-slate-300 group-hover:text-emerald-400 transition-colors">
                    {item.label}
                  </span>
                  <div className="ml-auto opacity-0 group-hover:opacity-100 text-emerald-500 transition-opacity">
                    <Command size={14} />
                  </div>
                </Link>
              ))}

              <div className="p-6 border-b border-white/5 bg-white/[0.02]">
                <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-3">Authentication</div>
                <UnifiedAuthButton />
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
