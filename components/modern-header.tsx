"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X, LayoutDashboard, Star, LogIn, LogOut, Loader2, Wallet, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLORS } from "@/lib/theme";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAuth } from "@/contexts/auth-context";

interface NavItem {
  href: string;
  icon: React.ComponentType<any>;
  label: string;
}

const navigationItems: NavItem[] = [
   { href: "/demo-vault", icon: LayoutDashboard, label: "Demo" },
  { href: "/star-traders", icon: Star, label: "Star Traders" },
 
];

// Unified Auth Button Component
function UnifiedAuthButton() {
  const { connected, wallet } = useWallet();
  const { isAuthenticated, isLoading, user, signIn, signOut, openWalletModal } = useAuth();
  const [showDropdown, setShowDropdown] = useState(false);

  // State 1: Not connected → Show "Connect Wallet"
  if (!connected) {
    return (
      <button
        onClick={openWalletModal}
        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all hover:opacity-90"
        style={{ backgroundColor: COLORS.brand, color: '#000' }}
      >
        <Wallet size={16} />
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
        className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: COLORS.brand, color: '#000' }}
      >
        {isLoading ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <LogIn size={16} />
        )}
        {isLoading ? 'Signing In...' : 'Sign In'}
      </button>
    );
  }

  // State 3: Authenticated → Show wallet badge with dropdown
  const walletAddress = user?.wallet || '';
  const truncatedAddress = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
  const walletName = wallet?.adapter?.name || 'Wallet';

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all hover:opacity-90"
        style={{ backgroundColor: COLORS.brand, color: '#000' }}
      >
        {wallet?.adapter?.icon && (
          <img src={wallet.adapter.icon} alt="" className="w-4 h-4" />
        )}
        <span className="font-mono font-bold">{truncatedAddress}</span>
        <ChevronDown size={14} className={cn("transition-transform", showDropdown && "rotate-180")} />
      </button>

      {showDropdown && (
        <>
          {/* Backdrop to close dropdown */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowDropdown(false)}
          />
          
          {/* Dropdown menu */}
          <div 
            className="absolute right-0 top-full mt-2 w-48 rounded-lg border p-2 z-50"
            style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}
          >
            <div className="px-3 py-2 border-b mb-2" style={{ borderColor: COLORS.structure }}>
              <div className="text-xs opacity-50 mb-1">Connected with</div>
              <div className="text-sm font-medium" style={{ color: COLORS.text }}>{walletName}</div>
            </div>
            
            <button
              onClick={() => {
                signOut();
                setShowDropdown(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors hover:bg-white/5"
              style={{ color: '#EF4444' }}
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function ModernHeader() {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();
  const { connected } = useWallet();
  const { isAuthenticated, isLoading: authLoading, signIn, signOut, openWalletModal } = useAuth();

  return (
    <header className="fixed inset-x-4 top-6 z-50 flex items-center justify-center">
      <div
  className="w-full md:w-auto max-w-7xl glass-header px-6 py-3 flex items-center gap-6 md:gap-8 rounded-none"
  style={{
    backgroundColor: COLORS.surface,
    borderColor: COLORS.structure,
    borderWidth: "2px",
    borderStyle: "solid",
    boxShadow: "0 #050505", 
  }}
>

        {/* Left: Logo */}
        <Link href="/" aria-label="Stellalpha home" className="group">
          <div className="relative flex-shrink-0">
            <Image src="/stellalpha.png" alt="Stellalpha" width={36} height={36} className="w-9 h-9" />
            <div className="absolute inset-0 w-9 h-9 electric-cyan opacity-20 blur-sm"></div>
          </div>
        </Link>

        {/* Center: Navigation (desktop) */}
        <nav className="hidden md:flex items-center gap-6 ml-2" style={{ fontFamily: 'var(--font-space-grotesk), var(--font-sans)' }}>
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn("group inline-flex items-center gap-2 px-3 py-2 rounded-none")}
                style={{ color: active ? COLORS.brand : COLORS.text }}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {/* Unified Auth Button (Desktop) */}
          <div className="hidden md:block">
            <UnifiedAuthButton />
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-none bg-transparent text-gray-300"
            aria-label={isMobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMobileOpen}
            onClick={() => setIsMobileOpen((s) => !s)}
          >
            {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile menu panel */}
        {isMobileOpen && (
          <div
            className="md:hidden absolute left-4 right-4 top-full mt-3 glass-header rounded-none p-4"
            style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}
          >
            <nav className="flex flex-col gap-2" style={{ fontFamily: 'var(--font-space-grotesk), var(--font-sans)' }}>
              {navigationItems.map((item) => (
                <Link key={item.href} href={item.href} className="flex items-center gap-3 px-3 py-2 rounded-none" onClick={() => setIsMobileOpen(false)} style={{ color: COLORS.text }}>
                  <item.icon className="w-4 h-4" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              ))}
            </nav>

            <div className="mt-4 border-t pt-4 flex flex-col gap-2" style={{ borderColor: COLORS.structure }}>
              {!connected && (
                <button
                  onClick={() => { openWalletModal(); setIsMobileOpen(false); }}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg"
                  style={{ backgroundColor: COLORS.brand, color: '#000' }}
                >
                  <Wallet size={16} /> Connect Wallet
                </button>
              )}
              {connected && !isAuthenticated && (
                <button
                  onClick={() => { signIn(); setIsMobileOpen(false); }}
                  disabled={authLoading}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg"
                  style={{ backgroundColor: COLORS.brand, color: '#000' }}
                >
                  {authLoading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
                  {authLoading ? 'Signing In...' : 'Sign In'}
                </button>
              )}
              {isAuthenticated && (
                <button
                  onClick={() => { signOut(); setIsMobileOpen(false); }}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border"
                  style={{ borderColor: COLORS.structure, color: '#EF4444' }}
                >
                  <LogOut size={16} /> Sign Out
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
