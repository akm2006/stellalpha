// In contexts/AgentContext.tsx
"use client";

import { createContext, useContext, useState, type ReactNode } from 'react';
import { ethers } from 'ethers';
import { showToast } from '@/components/toast';

interface AgentContextType {
  agentAddress: string | null;
  agentBalance: string;
  isAgentActive: boolean;
  activateAgent: (privateKey: string, starWallet: string) => Promise<boolean>;
  fetchBalance: (address: string) => Promise<void>;
}

const AgentContext = createContext<AgentContextType | undefined>(undefined);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [agentBalance, setAgentBalance] = useState("0.00");
  const [isAgentActive, setIsAgentActive] = useState(false);

  const activateAgent = async (privateKey: string, starWallet: string): Promise<boolean> => {
    try {
      if (!privateKey.startsWith('0x')) {
        privateKey = `0x${privateKey}`;
      }

      const userWallet = new ethers.Wallet(privateKey);
      const userWalletAddress = userWallet.address;
      setAgentAddress(userWalletAddress);

      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPrivateKey: privateKey,
          starWallet,
          userWallet: userWalletAddress,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to activate agent.");
      }
      
      setIsAgentActive(true);
      await fetchBalance(userWalletAddress);
      return true;
    } catch (error: any) {
        console.error("Activation failed:", error);
        showToast(error.message, "error");
        setIsAgentActive(false);
        return false;
    }
  };

  const fetchBalance = async (address: string) => {
    const rpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL!;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const balanceWei = await provider.getBalance(address);
    setAgentBalance(ethers.formatEther(balanceWei).slice(0, 8));
  };

  const value = { agentAddress, agentBalance, isAgentActive, activateAgent, fetchBalance };

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgent() {
  const context = useContext(AgentContext);
  if (context === undefined) {
    throw new Error("useAgent must be used within an AgentProvider");
  }
  return context;
}