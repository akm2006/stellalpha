"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Home, Settings, Menu, X, Wallet, LayoutDashboard, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLORS } from "@/lib/theme";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

interface NavItem {
  href: string;
  icon: React.ComponentType<any>;
  label: string;
}

const navigationItems: NavItem[] = [
   { href: "/demo-vault", icon: LayoutDashboard, label: "Demo" },
  { href: "/star-traders", icon: Star, label: "Star Traders" },
 
];

export default function ModernHeader() {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();

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
          {/* Styled Wallet Button */}
          <div className="wallet-button-wrapper">
            <WalletMultiButton 
              style={{
                backgroundColor: COLORS.surface,
                border: `1px solid ${COLORS.structure}`,
                borderRadius: '8px',
                padding: '10px 16px',
                fontSize: '14px',
                fontWeight: 500,
                color: COLORS.text,
                height: 'auto',
                lineHeight: 'normal',
                transition: 'all 0.2s ease',
              }}
            />
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

            <div className="mt-4 border-t pt-4 flex flex-col gap-2">
              <div className="mt-4 border-t pt-4">
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
