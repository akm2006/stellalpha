// In contexts/WalletContext.tsx
"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { showToast } from "@/components/toast"
import { ethers } from "ethers"
import React from "react"


interface WalletContextType {
  
  isConnected: boolean
  connectedWallet: string | null

  
  isAgentActive: boolean
  agentBalance: string


  followedStars: string[]
  isFollowedLoading: boolean

  isMetaMaskInstalled: boolean;
  handleConnectMetaMask: () => Promise<void>
  handleDisconnectWallet: () => void;
  handleChangeWallet: () => Promise<void>;
  activateAgent: (privateKey: string) => Promise<boolean>
  deactivateAgent: () => Promise<void>;
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

const CHAIN_ID_HEX = `0x${parseInt(process.env.NEXT_PUBLIC_CHAIN_ID!, 10).toString(16)}`;

const FUJI_NETWORK_PARAMS = {
    chainId: CHAIN_ID_HEX,
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
  const [isMetaMaskInstalled, setIsMetaMaskInstalled] = useState(false);
  // --- MODIFIED: fetchBalance now calls the internal API ---
  const fetchBalance = useCallback(async (address: string) => {
    if (!address) return;
    try {
        const response = await fetch('/api/portfolio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userSmartAccount: address }),
        });
        const result = await response.json();
        if (response.ok && result.success && result.balances.length > 0) {
            // Find the AVAX balance from the response
            const avaxBalance = result.balances.find((b: {token: string}) => b.token === 'AVAX');
            if (avaxBalance) {
                setAgentBalance(parseFloat(avaxBalance.amount).toFixed(4));
            }
        } else {
             throw new Error(result.error || "Failed to parse portfolio balance.");
        }
    } catch (error) {
        console.error("Failed to fetch balance via API:", error);
    }
  }, []);
  useEffect(() => {
  // Check if MetaMask is installed
  const checkMetaMask = () => {
    if (typeof window !== 'undefined') {
      setIsMetaMaskInstalled(!!window.ethereum?.isMetaMask);
    }
  };
  
  checkMetaMask();
}, []);
  // Poll for balance every 15 seconds when the wallet is connected
  useEffect(() => {
    if (isConnected && connectedWallet) {
      fetchBalance(connectedWallet); // Initial fetch
      const interval = setInterval(() => {
        fetchBalance(connectedWallet);
      }, 15000);

      return () => clearInterval(interval);
    }
  }, [isConnected, connectedWallet, fetchBalance]);


  const fetchFollowedStars = useCallback(async (walletAddress: string) => {
    if (!walletAddress) return;
    setIsFollowedLoading(true);
    try {
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
             params: [{ chainId: CHAIN_ID_HEX }],
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

  const handleDisconnectWallet = useCallback(() => {
    updateWalletState([]);
    showToast("Wallet disconnected", "success");
  }, [updateWalletState]);

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
                starWallet: followedStars[0],
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

  const deactivateAgent = useCallback(async () => {
    try {
      const response = await fetch('/api/agent', { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to deactivate agent on the server.");
      }
      setIsAgentActive(false);
      showToast("Agent deactivated.", "success");
    } catch (error: any) {
      console.error(error);
      showToast(error.message, "error");
    }
  }, []);


  const followStar = async (address: string) => {
    if (!connectedWallet) {
        showToast("Please connect wallet to follow.", "error");
        return;
    };
    try {
        const response = await fetch('/api/follow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userWallet: connectedWallet.toLowerCase(), targetWallet: address.toLowerCase() }),
        });
        if(response.ok) {
            setFollowedStars(prev => [...new Set([...prev, address])]);
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
    isMetaMaskInstalled,
    isConnected,
    connectedWallet,
    agentBalance,
    isAgentActive,
    followedStars,
    isFollowedLoading,
    handleConnectMetaMask,
    handleDisconnectWallet,
    handleChangeWallet,
    activateAgent,
    deactivateAgent,
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