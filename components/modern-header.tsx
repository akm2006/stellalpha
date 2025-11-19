// components/modern-header.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/contexts/WalletContext";
import {
  Home,
  Settings,
  Menu,
  X,
  Activity,
  LogOut,
  Replace,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

const navigationItems: NavItem[] = [
  { href: "/dashboard", icon: Home, label: "Dashboard" },
  { href: "/command-center", icon: Settings, label: "Command Center" },
];

const AnimatedNavLink = ({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) => {
  const defaultTextColor = "text-gray-300";
  const hoverTextColor = "text-white";
  const textSizeClass = "text-sm";

  return (
    <Link
      href={href}
      className={`group relative inline-block overflow-hidden h-5 min-w-max items-center ${textSizeClass}`}
    >
      <div className="flex flex-col transition-transform duration-400 ease-out transform group-hover:-translate-y-1/2">
        <span className={defaultTextColor}>{children}</span>
        <span className={hoverTextColor}>{children}</span>
      </div>
    </Link>
  );
};

export default function ModernHeader() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [headerShapeClass, setHeaderShapeClass] = useState("rounded-full");
  const shapeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const pathname = usePathname();
  const {
    isConnected,
    connectedWallet,
    agentBalance,
    isAgentActive,
    handleConnectMetaMask,
    handleDisconnectWallet,
    handleChangeWallet,
  } = useWallet();

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  useEffect(() => {
    if (shapeTimeoutRef.current) {
      clearTimeout(shapeTimeoutRef.current);
    }

    if (isMobileMenuOpen) {
      setHeaderShapeClass("rounded-xl");
    } else {
      shapeTimeoutRef.current = setTimeout(() => {
        setHeaderShapeClass("rounded-full");
      }, 300);
    }

    return () => {
      if (shapeTimeoutRef.current) {
        clearTimeout(shapeTimeoutRef.current);
      }
    };
  }, [isMobileMenuOpen]);

  const ConnectWalletButton = ({ onClick }: { onClick: () => void }) => {
    return (
      <button
        onClick={onClick}
        className={cn(
          "group h-10 px-4 flex items-center justify-center rounded-full transition-all duration-300 ease-in-out",
          "w-10 hover:w-40",
          "bg-cyan-400/20 border border-[#333] text-gray-300",
          "hover:border-cyan-400/60 hover:bg-[linear-gradient(90deg,rgba(0,246,255,0.70)_10%,rgba(255,255,255,0.20)_90%)] hover:text-white"
        )}
      >
        <div className="flex p-1 items-center space-x-2 w-full justify-center">
          
          <Wallet className="w-5 mx-1 h-5 bg-blue flex-shrink-0" />
      
          <span className="text-sm font-medium w-0 overflow-hidden opacity-0 transition-all duration-300 ease-in-out group-hover:w-full group-hover:opacity-100">
            Connect Wallet
          </span>
        </div>
      </button>
    );
  };

  return (
    <>
      <header
        className={cn(
          `fixed top-6 left-1/2 transform -translate-x-1/2 z-50
         flex flex-col items-center
         px-6 py-3 backdrop-blur-sm
         border border-[#333] bg-[#1f1f1f57]
         w-[calc(100%-2rem)] md:w-auto
         transition-[border-radius] duration-0 ease-in-out`,
          headerShapeClass
        )}
      >
        <div className="flex items-center min-w-max justify-between w-full gap-x-6 md:gap-x-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <Image
                src="/stellalpha.png"
                alt="Stellalpha logo"
                width={32}
                height={32}
                className="w-8 h-8 floating-animation"
              />
              <div className="absolute inset-0 w-8 h-8 electric-cyan opacity-30 blur-sm"></div>
            </div>
            <h1 className="text-xl font-bold text-white neon-text">
              Stellalpha
            </h1>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            {navigationItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <AnimatedNavLink key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-2",
                      isActive ? "text-electric-cyan" : "text-gray-300"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </div>
                </AnimatedNavLink>
              );
            })}
          </nav>

          <div className="hidden md:flex items-center min-w-max gap-4">
            {isConnected && connectedWallet ? (
              <div className="flex items-center gap-4">
                {/* Agent Status */}
                <div className="flex items-center gap-2 px-3 py-2 glass-card rounded-lg">
                  <Activity
                    className={cn(
                      "w-4 h-4",
                      isAgentActive ? "text-green-400" : "text-gray-400"
                    )}
                  />
                  <span
                    className={cn(
                      "text-xs font-medium",
                      isAgentActive
                        ? "text-green-400 status-active"
                        : "text-gray-400"
                    )}
                  >
                    {isAgentActive ? "Active" : "Inactive"}
                  </span>
                </div>

                {/* Wallet Info Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div className="glass-card px-4 py-2 rounded-lg cursor-pointer hover:border-electric-cyan/50 border border-transparent transition-colors">
                      <div className="flex items-center gap-3">
                        <Image
                          src="/avax.png"
                          alt="AVAX logo"
                          width={20}
                          height={20}
                        />
                        <div className="text-right">
                          <p className="text-sm font-medium text-white font-mono">
                            {connectedWallet.slice(0, 6)}...
                            {connectedWallet.slice(-4)}
                          </p>
                          <p className="text-xs electric-cyan">
                            {agentBalance} AVAX
                          </p>
                        </div>
                      </div>
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="glass-card mr-6">
                    <DropdownMenuItem
                      onClick={handleChangeWallet}
                      className="cursor-pointer"
                    >
                      <Replace className="w-4 h-4 mr-2" />
                      <span className="text-white">Change Wallet</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleDisconnectWallet}
                      className="cursor-pointer text-red-400 focus:text-red-400"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      <span>Disconnect</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <ConnectWalletButton onClick={handleConnectMetaMask} />
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden flex items-center justify-center w-8 h-8 text-gray-300 focus:outline-none"
            onClick={toggleMobileMenu}
            aria-label={isMobileMenuOpen ? "Close Menu" : "Open Menu"}
          >
            {isMobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        <div
          className={`md:hidden flex flex-col items-center w-full transition-all ease-in-out duration-300 overflow-hidden
                         ${
                           isMobileMenuOpen
                             ? "max-h-[1000px] opacity-100 pt-4"
                             : "max-h-0 opacity-0 pt-0 pointer-events-none"
                         }`}
        >
          <nav className="flex flex-col items-center space-y-4 text-base w-full">
            {navigationItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-300",
                    isActive
                      ? "bg-white/10 text-electric-cyan border border-electric-cyan/30"
                      : "text-gray-300 hover:text-white hover:bg-white/5"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex flex-col items-center space-y-4 mt-4 w-full">
            {isConnected && connectedWallet ? (
              <div className="space-y-3 w-full">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Wallet</span>
                  <span className="text-sm font-mono text-white">
                    {connectedWallet?.slice(0, 6)}...
                    {connectedWallet?.slice(-4)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Balance</span>
                  <span className="text-sm electric-cyan font-medium">
                    {agentBalance} AVAX
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Agent</span>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      isAgentActive ? "text-green-400" : "text-gray-400"
                    )}
                  >
                    {isAgentActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="pt-3 border-t border-white/10 space-y-2">
                  <Button
                    onClick={() => {
                      handleChangeWallet();
                      setIsMobileMenuOpen(false);
                    }}
                    variant="ghost"
                    className="w-full justify-start"
                  >
                    <Replace className="w-4 text-white h-4 mr-2" /> Change
                    Wallet
                  </Button>
                  <Button
                    onClick={() => {
                      handleDisconnectWallet();
                      setIsMobileMenuOpen(false);
                    }}
                    variant="ghost"
                    className="w-full justify-start text-red-400 hover:text-red-400"
                  >
                    <LogOut className="w-4 h-4 mr-2" /> Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <ConnectWalletButton onClick={handleConnectMetaMask} />
            )}
          </div>
        </div>
      </header>
      <div className="" />
    </>
  );
}
