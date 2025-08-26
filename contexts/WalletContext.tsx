"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { showToast } from "@/components/toast"

interface WalletContextType {
  isConnected: boolean
  connectedWallet: string | null
  isMetaMaskInstalled: boolean
  handleConnectMetaMask: () => Promise<void>
  handleDisconnectWallet: () => void
  handleChangeWallet: () => Promise<void>
  handleCopyAddress: () => void
  handleViewOnExplorer: () => void
}

interface EthereumProvider {
  request: (args: { method: string; params?: any[] }) => Promise<any>
  isMetaMask?: boolean
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

const WalletContext = createContext<WalletContextType | undefined>(undefined)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [connectedWallet, setConnectedWallet] = useState<string | null>(null)
  const [isMetaMaskInstalled, setIsMetaMaskInstalled] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum?.isMetaMask) {
      setIsMetaMaskInstalled(true)
    }
  }, [])

  const checkConnection = async () => {
    try {
      if (!window.ethereum) return
      const accounts = await window.ethereum.request({ method: "eth_accounts" })
      if (accounts && accounts.length > 0) {
        setIsConnected(true)
        setConnectedWallet(accounts[0])
      }
    } catch (error) {
      console.error("Error checking connection:", error)
    }
  }

  const handleConnectMetaMask = async () => {
    if (!window.ethereum?.isMetaMask) {
      showToast("MetaMask is not installed. Please install MetaMask to continue.", "error")
      return
    }

    const loadingToastId = showToast("Connecting to MetaMask...", "loading");

    try {
      await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });

      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      if (accounts && accounts.length > 0) {
        setIsConnected(true)
        setConnectedWallet(accounts[0])
        showToast("Successfully connected to MetaMask", "success", loadingToastId);
      }
    } catch (error: any) {
      if (error.code === 4001) {
        showToast("Connection rejected by user", "error", loadingToastId);
      } else {
        showToast("Failed to connect to MetaMask", "error", loadingToastId);
        console.error("Error connecting to MetaMask:", error);
      }
    }
  }

  const handleDisconnectWallet = () => {
    setIsConnected(false)
    setConnectedWallet(null)
    showToast("Wallet disconnected", "success")
  }

  const handleChangeWallet = async () => {
    if (!window.ethereum) {
      showToast("MetaMask is not installed" ,"error" )
      return
    }

    const loadingToastId = showToast("Opening wallet selection...", "loading")

    try {
      await window.ethereum.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      })

      const accounts = await window.ethereum.request({ method: "eth_accounts" })

      if (accounts.length > 0) {
        setConnectedWallet(accounts[0])
        showToast("Wallet changed successfully", "success", loadingToastId)
      }
    } catch (error: any) {
      if (error.code === 4001) {
        showToast("Wallet change cancelled by user", "error", loadingToastId)
      } else {
        showToast("Failed to change wallet", "error", loadingToastId)
      }
      console.error("Error changing wallet:", error)
    }
  }

  const handleCopyAddress = () => {
    if (connectedWallet) {
      navigator.clipboard.writeText(connectedWallet)
      showToast( "Address copied to clipboard","success",)
    }
  }

  const handleViewOnExplorer = () => {
    if (connectedWallet) {
      window.open(`https://etherscan.io/address/${connectedWallet}`, "_blank")
    }
  }

  const value: WalletContextType = {
    isConnected,
    connectedWallet,
    isMetaMaskInstalled,
    handleConnectMetaMask,
    handleDisconnectWallet,
    handleChangeWallet,
    handleCopyAddress,
    handleViewOnExplorer,
  }

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider")
  }
  return context
}
