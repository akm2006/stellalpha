"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { useWallet } from "@/contexts/WalletContext"
import { Star, Home, Settings, TestTube, Menu, X, Wallet, Activity } from "lucide-react"
import { cn } from "@/lib/utils"

interface NavItem {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
}

const navigationItems: NavItem[] = [
  { href: "/", icon: Home, label: "Dashboard" },
  { href: "/command-center", icon: Settings, label: "Command Center" },
  { href: "/testing", icon: TestTube, label: "Testing" },
]

export default function ModernHeader() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const pathname = usePathname()
  const { 
    isConnected, 
    connectedWallet, 
    agentBalance,
    isAgentActive,
    handleConnectMetaMask 
  } = useWallet()

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen)

  return (
    <>
      <header className="glass-header fixed top-0 left-0 right-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative">
                <Star className="w-8 h-8 electric-cyan floating-animation" />
                <div className="absolute inset-0 w-8 h-8 electric-cyan opacity-30 blur-sm"></div>
              </div>
              <h1 className="text-2xl font-bold text-white neon-text font-[family-name:var(--font-space-grotesk)]">
                Stellalpha
              </h1>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-8">
              {navigationItems.map((item) => {
                const isActive = pathname === item.href
                const Icon = item.icon
                
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "nav-item flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300",
                      isActive 
                        ? "active text-electric-cyan" 
                        : "text-gray-300 hover:text-white"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </Link>
                )
              })}
            </nav>

            {/* Wallet & Agent Status */}
            <div className="hidden md:flex items-center gap-4">
              {isConnected ? (
                <div className="flex items-center gap-4">
                  {/* Agent Status */}
                  <div className="flex items-center gap-2 px-3 py-2 glass-card rounded-lg">
                    <Activity className={cn(
                      "w-4 h-4",
                      isAgentActive ? "text-green-400" : "text-gray-400"
                    )} />
                    <span className={cn(
                      "text-xs font-medium",
                      isAgentActive ? "text-green-400 status-active" : "text-gray-400"
                    )}>
                      {isAgentActive ? "Active" : "Inactive"}
                    </span>
                  </div>

                  {/* Wallet Info */}
                  <div className="glass-card px-4 py-2 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Wallet className="w-4 h-4 electric-cyan" />
                      <div className="text-right">
                        <p className="text-sm font-medium text-white font-mono">
                          {connectedWallet.slice(0, 6)}...{connectedWallet.slice(-4)}
                        </p>
                        <p className="text-xs electric-cyan">
                          {agentBalance} AVAX
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <Button 
                  onClick={handleConnectMetaMask}
                  className="electric-cyan-bg text-black font-bold hover:electric-cyan-glow transition-all duration-300 px-6 py-2"
                >
                  Connect Wallet
                </Button>
              )}
            </div>

            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMobileMenu}
              className="md:hidden glass-button"
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5 text-white" />
              ) : (
                <Menu className="w-5 h-5 text-white" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden glass-card mx-4 mb-4 rounded-lg slide-in-up">
            <div className="p-4 space-y-4">
              {/* Mobile Navigation */}
              <nav className="space-y-2">
                {navigationItems.map((item) => {
                  const isActive = pathname === item.href
                  const Icon = item.icon
                  
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
                  )
                })}
              </nav>

              {/* Mobile Wallet Section */}
              <div className="pt-4 border-t border-white/10">
                {isConnected ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">Wallet</span>
                      <span className="text-sm font-mono text-white">
                        {connectedWallet?.slice(0, 6)}...{connectedWallet?.slice(-4)}
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
                      <span className={cn(
                        "text-sm font-medium",
                        isAgentActive ? "text-green-400" : "text-gray-400"
                      )}>
                        {isAgentActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                ) : (
                  <Button 
                    onClick={() => {
                      handleConnectMetaMask()
                      setIsMobileMenuOpen(false)
                    }}
                    className="w-full electric-cyan-bg text-black font-bold"
                  >
                    Connect Wallet
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Spacer for fixed header */}
      <div className="h-20"></div>
    </>
  )
}