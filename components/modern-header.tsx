"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X, LayoutDashboard, Star, LogIn, LogOut, Loader2, Wallet, ChevronDown, Terminal, Command } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLORS } from "@/lib/theme";
import { useWallet } from "@solana/wallet-adapter-react";
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

// Unified Auth Button Component - Technical / Boxy Style
function UnifiedAuthButton() {
  const { connected, wallet } = useWallet();
  const { isAuthenticated, isLoading, user, signIn, signOut, openWalletModal } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);

  // Common button classes for the "Technical" look
  const btnBase = "h-9 px-4 flex items-center gap-2 text-xs font-mono uppercase tracking-wider transition-all border border-transparent hover:border-emerald-500/50 hover:bg-emerald-500/10 rounded-sm group relative overflow-hidden";
  const btnPrimary = "bg-emerald-500 text-black hover:bg-emerald-400 font-bold border-none hover:shadow-[0_0_10px_rgba(16,185,129,0.4)]";

  // State 1: Not connected → Show "Connect Wallet"
  if (!connected) {
    return (
      <button
        onClick={openWalletModal}
        className={cn(btnBase, btnPrimary)}
      >
        <Wallet size={14} className="group-hover:rotate-12 transition-transform" />
        Connect Wallet
      </button>
    );
  }

  // State 2: Connected but not authenticated → Show "Sign In"
  if (!isAuthenticated) {
    return (
      <button
        onClick={signIn}
        disabled={isLoading}
        className={cn(btnBase, btnPrimary, "disabled:opacity-50 disabled:cursor-not-allowed")}
      >
        {isLoading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <LogIn size={14} />
        )}
        {isLoading ? 'Authenticating...' : 'Sign In'}
      </button>
    );
  }

  // State 3: Authenticated → Show wallet badge with dropdown
  const walletAddress = user?.wallet || '';
  const truncatedAddress = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className={cn(btnBase, "bg-[#0A0A0A] border-white/10 text-emerald-400 hover:text-emerald-300 min-w-[140px]")}
      >
        {wallet?.adapter?.icon ? (
            <img src={wallet.adapter.icon} alt={wallet.adapter.name} className="w-4 h-4 mr-1" />
        ) : (
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
        )}
        <span className="font-mono">{truncatedAddress}</span>
        <ChevronDown size={12} className={cn("text-slate-500 transition-transform duration-300 ml-auto", showDropdown && "rotate-180")} />
      </button>

      {showDropdown && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowDropdown(false)}
          />
          
          <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute right-0 top-full mt-2 w-56 bg-[#050505] border border-white/10 shadow-xl z-50"
          >
            {/* Decorative corner accents */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-emerald-500/50" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-emerald-500/50" />
            <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-emerald-500/50" />
            <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-emerald-500/50" />

            <div className="p-3 border-b border-white/5">
              <div className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-1">Status</div>
              <div className="text-xs text-emerald-400 font-mono flex items-center gap-2">
                 <div className="w-1 h-1 bg-emerald-500" />
                 Connected
              </div>
            </div>
            
            <button
              onClick={() => {
                signOut();
                setShowDropdown(false);
              }}
              className="w-full flex items-center gap-2 px-4 py-3 text-xs font-mono uppercase tracking-wider text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut size={14} />
              Disconnect
            </button>
          </motion.div>
        </>
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
                    const active = pathname === item.href;
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
