// In components/wallet-header.tsx
"use client"

import { Button } from "@/components/ui/button"
import { useWallet } from "@/contexts/WalletContext"

export default function WalletHeader() {
  const { 
    isConnected, 
    connectedWallet, 
    handleConnectMetaMask, 
  } = useWallet();

  if (isConnected && connectedWallet) {
    return (
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-white font-mono">
            {connectedWallet.slice(0, 6)}...{connectedWallet.slice(-4)}
          </p>
          <p className="text-xs text-gray-400">Connected (EOA)</p>
        </div>
      </div>
    )
  }

  return (
    <Button 
        onClick={handleConnectMetaMask}
        className="electric-cyan-bg text-black font-bold hover:electric-cyan-glow transition-all duration-300"
    >
        Connect Wallet
    </Button>
  )
}