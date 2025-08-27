"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { showToast } from "@/components/toast"
import { ethers } from "ethers"

// --- Interfaces and Types ---
interface WalletContextType {
  isConnected: boolean
  connectedWallet: string | null
  smartAccountAddress: string | null
  isMetaMaskInstalled: boolean
  followedStars: string[]
  isFollowedLoading: boolean
  handleConnectMetaMask: () => Promise<void>
  handleDisconnectWallet: () => void
  handleChangeWallet: () => Promise<void>
  handleCopyAddress: () => void
  handleViewOnExplorer: () => void
  followStar: (address: string) => Promise<void>
  unfollowStar: (address: string) => Promise<void>
}

interface EthereumProvider {
  request: (args: { method: string; params?: any[] }) => Promise<any>
  on: (event: string, handler: (args: any) => void) => void;
  removeListener: (event: string, handler: (args: any) => void) => void;
  isMetaMask?: boolean
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

const WalletContext = createContext<WalletContextType | undefined>(undefined)

// Avalanche C-Chain details
const AVALANCHE_CHAIN_ID = '0xa86a' // 43114 in hex
const AVALANCHE_NETWORK_PARAMS = {
    chainId: AVALANCHE_CHAIN_ID,
    chainName: 'Avalanche C-Chain',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
    rpcUrls: ['https://api.avax.network/ext/bc/C/rpc'],
    blockExplorerUrls: ['https://snowtrace.io/'],
};


export function WalletProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [connectedWallet, setConnectedWallet] = useState<string | null>(null);
  const [smartAccountAddress, setSmartAccountAddress] = useState<string | null>(null);
  const [isMetaMaskInstalled, setIsMetaMaskInstalled] = useState(false);
  const [followedStars, setFollowedStars] = useState<string[]>([]);
  const [isFollowedLoading, setIsFollowedLoading] = useState(false);

  // --- Core Logic ---

  const initializeSmartAccount = useCallback(async (ethereumProvider: any) => {
    try {
      const { ZeroXgaslessSmartAccount } = await import("@0xgasless/smart-account");
      const web3Provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await web3Provider.getSigner();
      const smartAccount = await ZeroXgaslessSmartAccount.create({
        signer: signer,
        chainId: 43114,
        bundlerUrl: `https://bundler.0xgasless.com/v1/43114`,
        paymasterUrl: `https://paymaster.0xgasless.com/v1/43114/rpc/${process.env.OXGASLESS_API_KEY!}`,
        ZeroXgaslessPaymasterApiKey: process.env.NEXT_PUBLIC_0XGASLESS_API_KEY!,
      });
      const sca = await smartAccount.getAddress();
      setSmartAccountAddress(sca);
      return sca;
    } catch (error) {
      console.error("Failed to initialize Smart Account:", error);
      showToast("Could not derive Smart Account address.", "error");
      return null;
    }
  }, []);

  const fetchFollowedStars = useCallback(async (sca: string) => {
    if (!sca) return;
    setIsFollowedLoading(true);
    try {
      const response = await fetch('/api/followed-stars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userSmartAccount: sca }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        setFollowedStars(result.followedWallets);
      } else {
        throw new Error(result.error || "Failed to fetch followed stars.");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      showToast(errorMessage, "error");
    } finally {
      setIsFollowedLoading(false);
    }
  }, []);

  const updateWalletStateAndData = useCallback(async (accounts: string[]) => {
    if (accounts.length > 0) {
      const account = accounts[0];
      setIsConnected(true);
      setConnectedWallet(account);
      const sca = await initializeSmartAccount(window.ethereum);
      if (sca) {
        await fetchFollowedStars(sca);
      }
    } else {
      setIsConnected(false);
      setConnectedWallet(null);
      setSmartAccountAddress(null);
      setFollowedStars([]);
    }
  }, [initializeSmartAccount, fetchFollowedStars]);

  const switchToAvalanche = async () => {
    if (!window.ethereum) return false;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: AVALANCHE_CHAIN_ID }],
      });
      return true;
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [AVALANCHE_NETWORK_PARAMS],
          });
          return true;
        } catch (addError) {
          console.error("Failed to add Avalanche network:", addError);
          return false;
        }
      }
      return false;
    }
  };

  // --- Public Handler Functions ---

  const handleConnectMetaMask = async () => {
    if (!window.ethereum?.isMetaMask) {
      showToast("MetaMask is not installed.", "error");
      return;
    }
    const loadingToastId = showToast("Please check your MetaMask...", "loading");
    try {
      const switched = await switchToAvalanche();
      if (!switched) {
        showToast("Please switch to the Avalanche network.", "error", loadingToastId);
        return;
      }
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      await updateWalletStateAndData(accounts);
      showToast("Successfully connected wallet", "success", loadingToastId);
    } catch (error: any) {
      const message = error.code === 4001 ? "Connection rejected by user" : "Failed to connect to MetaMask";
      showToast(message, "error", loadingToastId);
    }
  }

  const handleDisconnectWallet = useCallback(() => {
    setIsConnected(false);
    setConnectedWallet(null);
    setSmartAccountAddress(null);
    setFollowedStars([]);
    showToast("Wallet disconnected", "success");
  }, []);

  const handleChangeWallet = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_requestPermissions',
        params: [{ eth_accounts: {} }],
      });
    } catch (error: any) {
      if (error.code !== 4001) {
        showToast("Failed to open wallet selection.", "error");
      }
    }
  }

  const followStar = async (address: string) => {
    if (!isConnected || !smartAccountAddress) {
      showToast("Please connect your wallet first.", "error");
      return;
    }
    const loadingToastId = showToast("Following star...", "loading");
    try {
      const response = await fetch('/api/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userSmartAccount: smartAccountAddress, targetWallet: address }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        showToast(result.message, "success", loadingToastId);
        setFollowedStars(prev => [...prev, address]);
      } else {
        throw new Error(result.error || "Failed to follow star.");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      showToast(errorMessage, "error", loadingToastId);
    }
  };

  const unfollowStar = async (address: string) => {
    if (!isConnected || !smartAccountAddress) {
      showToast("Please connect your wallet first.", "error");
      return;
    }
    const loadingToastId = showToast("Unfollowing star...", "loading");
    try {
      const response = await fetch('/api/unfollow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userSmartAccount: smartAccountAddress, targetWallet: address }),
      });
      const result = await response.json();
      if (response.ok && result.success) {
        showToast(result.message, "success", loadingToastId);
        setFollowedStars(prev => prev.filter(star => star !== address));
      } else {
        throw new Error(result.error || "Failed to unfollow star.");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      showToast(errorMessage, "error", loadingToastId);
    }
  };

  const handleCopyAddress = () => {
    if (smartAccountAddress) {
      navigator.clipboard.writeText(smartAccountAddress);
      showToast("Smart Account address copied!", "success");
    }
  }

  const handleViewOnExplorer = () => {
    if (smartAccountAddress) {
      window.open(`https://snowtrace.io/address/${smartAccountAddress}`, "_blank");
    }
  }

  // Effect to set up MetaMask event listeners
  useEffect(() => {
    if (typeof window.ethereum !== 'undefined') {
      setIsMetaMaskInstalled(true);
      
      const handleAccountsChanged = (accounts: string[]) => {
        console.log("MetaMask account changed.");
        updateWalletStateAndData(accounts);
      };
      
      const handleChainChanged = () => window.location.reload();
      const handleDisconnect = () => handleDisconnectWallet();

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
      window.ethereum.on('disconnect', handleDisconnect);

      return () => {
        if (window.ethereum?.removeListener) {
            window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
            window.ethereum.removeListener('chainChanged', handleChainChanged);
            window.ethereum.removeListener('disconnect', handleDisconnect);
        }
      };
    }
  }, [updateWalletStateAndData, handleDisconnectWallet]);

  const value: WalletContextType = {
    isConnected,
    connectedWallet,
    smartAccountAddress,
    isMetaMaskInstalled,
    followedStars,
    isFollowedLoading,
    handleConnectMetaMask,
    handleDisconnectWallet,
    handleChangeWallet,
    handleCopyAddress,
    handleViewOnExplorer,
    followStar,
    unfollowStar,
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
