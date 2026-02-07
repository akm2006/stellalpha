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
        className={cn(btnBase, "bg-[#0A0A0A] border-white/10 text-emerald-400 hover:text-emerald-300")}
      >
        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
        <span className="font-mono">{truncatedAddress}</span>
        <ChevronDown size={12} className={cn("text-slate-500 transition-transform duration-300", showDropdown && "rotate-180")} />
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
            <Link href="/" aria-label="Stellalpha home" className="flex items-center gap-3 group h-full pr-8 border-r border-white/5 md:border-transparent lg:border-white/5">
                <div className="relative w-8 h-8 flex items-center justify-center bg-emerald-500/10 rounded-sm border border-emerald-500/20 group-hover:border-emerald-500/40 transition-colors">
                    <Image src="/stellalpha.png" alt="Stellalpha" width={24} height={24} className="w-5 h-5 opacity-90 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="hidden lg:flex flex-col">
                    <span className="text-sm font-bold tracking-tight text-white leading-none">STELLALPHA</span>
                    <span className="text-[9px] font-mono text-emerald-500/60 uppercase tracking-widest leading-none mt-0.5 group-hover:text-emerald-400 transition-colors">Protocol</span>
                </div>
            </Link>

            {/* Desktop Navigation - The "Grid" */}
            <nav className="hidden md:flex items-center h-full ml-8">
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
            
            {/* System Status / Network Indicator (Desktop) */}
            <div className="hidden lg:flex items-center gap-2 text-[10px] font-mono text-slate-500 uppercase tracking-wider px-4 border-l border-white/5 h-full">
                <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                    <span>System Normal</span>
                </div>
            </div>

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
