"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { showToast } from "@/components/toast"
import { ethers } from "ethers"
import React from "react"

// --- This is the definitive interface for our context ---
interface WalletContextType {
  // Wallet State
  isConnected: boolean
  connectedWallet: string | null
  
  // Agent State
  isAgentActive: boolean
  agentBalance: string
  
  // Data State
  followedStars: string[]
  isFollowedLoading: boolean
  
  // Functions
  handleConnectMetaMask: () => Promise<void>
  activateAgent: (privateKey: string) => Promise<boolean>
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

const FUJI_CHAIN_ID = '0xa869' // 43113 in hex
const FUJI_NETWORK_PARAMS = {
    chainId: FUJI_CHAIN_ID,
    chainName: 'Avalanche Fuji C-Chain',
    nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
    rpcUrls: [process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL!],
    blockExplorerUrls: ['https://testnet.snowtrace.io/'],
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [connectedWallet, setConnectedWallet] = useState<string | null>(null)
  const [agentBalance, setAgentBalance] = useState("0.00")
  const [isAgentActive, setIsAgentActive] = useState(false)
  const [followedStars, setFollowedStars] = useState<string[]>([])
  const [isFollowedLoading, setIsFollowedLoading] = useState(false)

  const fetchBalance = useCallback(async (address: string) => {
    try {
        const rpcUrl = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL!;
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const balanceWei = await provider.getBalance(address);
        setAgentBalance(ethers.formatEther(balanceWei).slice(0, 8));
    } catch (error) {
        console.error("Failed to fetch balance:", error);
        setAgentBalance("0.00");
    }
  }, []);
  
  const fetchFollowedStars = useCallback(async (walletAddress: string) => {
    if (!walletAddress) return;
    setIsFollowedLoading(true);
    try {
      // API now uses `userWallet` query param
      const response = await fetch(`/api/followed-stars?userWallet=${walletAddress.toLowerCase()}`);
      const data = await response.json();
      if (data.success) {
        setFollowedStars(data.followedWallets);
      }
    } catch (error) {
      console.error("Failed to fetch followed stars", error);
    } finally {
      setIsFollowedLoading(false);
    }
  }, []);

  const updateWalletState = useCallback(async (accounts: string[]) => {
    if (accounts.length > 0) {
      const account = accounts[0];
      setIsConnected(true);
      setConnectedWallet(account);
      await fetchBalance(account);
      await fetchFollowedStars(account);
    } else {
      setIsConnected(false);
      setConnectedWallet(null);
      setAgentBalance("0.00");
      setIsAgentActive(false);
      setFollowedStars([]);
    }
  }, [fetchBalance, fetchFollowedStars]);
  
  const switchToFuji = async (): Promise<boolean> => {
    if (!window.ethereum) return false;
    try {
        await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: FUJI_CHAIN_ID }],
        });
        return true;
    } catch (switchError: any) {
        if (switchError.code === 4902) {
            try {
                await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [FUJI_NETWORK_PARAMS] });
                return true;
            } catch (addError) { return false; }
        }
        return false;
    }
  };

  const handleConnectMetaMask = async () => {
    if (!window.ethereum) {
      showToast("Please install MetaMask!", "error");
      return;
    }
    try {
      const switched = await switchToFuji();
      if (!switched) {
          showToast("Please switch to the Fuji Testnet in MetaMask.", "error");
          return;
      }
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      updateWalletState(accounts);
      showToast("Wallet Connected", "success");
    } catch (error) {
      showToast("Failed to connect wallet.", "error");
    }
  };

  const activateAgent = async (privateKey: string): Promise<boolean> => {
    if (!connectedWallet || followedStars.length === 0) {
        showToast("Please connect your wallet and follow at least one star.", "error");
        return false;
    }
    try {
        let pk = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
        const walletFromKey = new ethers.Wallet(pk);
        if (walletFromKey.address.toLowerCase() !== connectedWallet.toLowerCase()) {
            throw new Error("Private key does not match the connected wallet address.");
        }

        const response = await fetch('/api/agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userPrivateKey: pk,
                starWallet: followedStars[0], // Using the first followed star to initialize
                userWallet: connectedWallet.toLowerCase(),
            }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || "Failed to activate agent.");
        }
        setIsAgentActive(true);
        return true;
    } catch (error: any) {
        showToast(error.message, "error");
        setIsAgentActive(false);
        return false;
    }
  };
  
  const followStar = async (address: string) => {
    if (!connectedWallet) return;
    try {
        const response = await fetch('/api/follow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userWallet: connectedWallet.toLowerCase(), targetWallet: address.toLowerCase() }),
        });
        if(response.ok) {
            setFollowedStars(prev => [...new Set([...prev, address])]); // Avoid duplicates
            showToast("Successfully followed star!", "success");
        } else {
            throw new Error("Failed to follow star.");
        }
    } catch (error) {
        showToast("Failed to follow star.", "error");
    }
  };

  const unfollowStar = async (address: string) => {
    if (!connectedWallet) return;
    try {
        const response = await fetch('/api/unfollow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userWallet: connectedWallet.toLowerCase(), targetWallet: address.toLowerCase() }),
        });
        if (response.ok) {
            setFollowedStars(prev => prev.filter(star => star.toLowerCase() !== address.toLowerCase()));
            showToast("Unfollowed star.", "success");
        } else {
            throw new Error("Failed to unfollow star.");
        }
    } catch (error) {
        showToast("Failed to unfollow star.", "error");
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => updateWalletState(accounts);
      const handleChainChanged = () => window.location.reload();

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        if (window.ethereum?.removeListener) {
            window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
            window.ethereum.removeListener('chainChanged', handleChainChanged);
        }
      };
    }
  }, [updateWalletState]);

  const value = {
    isConnected,
    connectedWallet,
    agentBalance,
    isAgentActive,
    followedStars,
    isFollowedLoading,
    handleConnectMetaMask,
    activateAgent,
    followStar,
    unfollowStar,
  };

  return <WalletContext.Provider value={value as WalletContextType}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}