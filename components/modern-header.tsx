// components/modern-header.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import { Home, Settings, Menu, X, LogOut, Replace, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLORS } from "@/lib/theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  href: string;
  icon: React.ComponentType<any>;
  label: string;
}

const navigationItems: NavItem[] = [
  { href: "/dashboard", icon: Home, label: "Dashboard" },
  { href: "/command-center", icon: Settings, label: "Command Center" },
];

export default function ModernHeader() {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();

  const {
    isConnected,
    connectedWallet,
    agentBalance,
    handleConnectMetaMask,
    handleDisconnectWallet,
    handleChangeWallet,
  } = useWallet();

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

        <div className="ml-auto flex items-center gap-4">
          {/* Wallet area */}
          {isConnected && connectedWallet ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="glass-button px-3 py-2 rounded-none flex items-center gap-3 cursor-pointer"
                    style={{ borderColor: COLORS.structure, backgroundColor: COLORS.surface }}
                >
                  <div className="flex items-center gap-3">
                    <Image src="/avax.png" alt="AVAX" width={20} height={20} />
                    <div className="text-right">
                      <div className="text-sm font-mono" style={{ color: COLORS.text }}>{connectedWallet.slice(0, 6)}...{connectedWallet.slice(-4)}</div>
                      <div className="text-xs" style={{ color: COLORS.brand }}>{agentBalance} AVAX</div>
                    </div>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="glass-card mr-6" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
                <DropdownMenuItem onClick={handleChangeWallet} className="cursor-pointer">
                  <Replace className="w-4 h-4 mr-2" /> <span>Change Wallet</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleDisconnectWallet} className="cursor-pointer text-red-400">
                  <LogOut className="w-4 h-4 mr-2" /> <span>Disconnect</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
              <button
                onClick={handleConnectMetaMask}
                className="glass-button flex items-center gap-3 px-4 py-2 rounded-none md:text-sm font-medium"
                style={{ backgroundColor: COLORS.brand, color: COLORS.canvas, borderColor: COLORS.brand, fontFamily: 'var(--font-space-grotesk), var(--font-sans)' }}
              >
                <Wallet className="w-4 h-4" />
                <span className="hidden md:inline">Connect Wallet</span>
              </button>
          )}

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

            <div className="mt-4 border-t pt-4 flex flex-col gap-2">
              {isConnected && connectedWallet ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">{connectedWallet.slice(0, 6)}...{connectedWallet.slice(-4)}</span>
                    <span className="text-sm electric-cyan">{agentBalance} AVAX</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" className="flex-1" onClick={() => { handleChangeWallet(); setIsMobileOpen(false); }}>
                      <Replace className="w-4 h-4 mr-2" /> Change
                    </Button>
                    <Button variant="ghost" className="flex-1 text-red-400" onClick={() => { handleDisconnectWallet(); setIsMobileOpen(false); }}>
                      <LogOut className="w-4 h-4 mr-2" /> Disconnect
                    </Button>
                  </div>
                </>
              ) : (
                <Button onClick={() => { handleConnectMetaMask(); setIsMobileOpen(false); }} className="w-full" style={{ fontFamily: 'var(--font-space-grotesk), var(--font-sans)' }}>
                  <Wallet className="w-4 h-4 mr-2" /> Connect Wallet
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
