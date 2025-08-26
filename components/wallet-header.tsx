"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown, Wallet, Copy, ExternalLink, LogOut } from "lucide-react"
import { useWallet } from "@/contexts/WalletContext"

interface WalletHeaderProps {
  className?: string
}

export default function WalletHeader({ className = "" }: WalletHeaderProps) {
  const {
    isConnected,
    connectedWallet,
    isMetaMaskInstalled,
    handleConnectMetaMask,
    handleDisconnectWallet,
    handleChangeWallet,
    handleCopyAddress,
    handleViewOnExplorer,
  } = useWallet()

  if (!isConnected) {
    return (
      <div className={className}>
        <Button
          onClick={handleConnectMetaMask}
          variant="outline"
          className="rounded-full border-gray-600 bg-transparent hover:electric-cyan-bg hover:text-black hover:border-transparent transition-all duration-300"
        >
          <Wallet className="w-4 h-4 mr-2" />
          {isMetaMaskInstalled ? "Connect MetaMask" : "Install MetaMask"}
        </Button>
      </div>
    )
  }

  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="rounded-full border-[#00F6FF] bg-[#00F6FF]/10 text-[#00F6FF] hover:bg-[#00F6FF] hover:text-black transition-all duration-300"
          >
            <Wallet className="w-4 h-4 mr-2" />
            {connectedWallet?.slice(0, 6)}...{connectedWallet?.slice(-4)}
            <ChevronDown className="w-4 h-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56 glassmorphism-card border-gray-600">
          <DropdownMenuItem onClick={handleCopyAddress} className="text-white hover:bg-gray-800/50 cursor-pointer">
            <Copy className="w-4 h-4 mr-2" />
            Copy Address
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleViewOnExplorer} className="text-white hover:bg-gray-800/50 cursor-pointer">
            <ExternalLink className="w-4 h-4 mr-2" />
            View on Etherscan
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-gray-600" />
          <DropdownMenuItem onClick={handleChangeWallet} className="text-white hover:bg-gray-800/50 cursor-pointer">
            <Wallet className="w-4 h-4 mr-2" />
            Change Wallet
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleDisconnectWallet}
            className="text-red-400 hover:bg-red-400/10 cursor-pointer"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
