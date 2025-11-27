"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { useVaultState, useInitializeVault, useDeposit, useWithdraw, useTogglePause, useVaultPda, useExecuteSwap, useDevnetSetupVaultAccounts, useDevnetMintTestTokens, useCheckJupiterRoute, useSimulateMainnetSwap } from "@/hooks/solana/useVault";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useNetwork } from "@/store/network";

export default function DevnetTestPage() {
  const { publicKey, connected } = useWallet();
  const vaultPda = useVaultPda(publicKey);
  const { data: vaultState, isLoading: isVaultLoading, refetch } = useVaultState();
  
  const initializeVault = useInitializeVault();
  const togglePause = useTogglePause();
  const deposit = useDeposit();
  const withdraw = useWithdraw();
  const setupVault = useDevnetSetupVaultAccounts();
  const mintTestTokens = useDevnetMintTestTokens();
  const { network, setNetwork } = useNetwork();

  const checkRoute = useCheckJupiterRoute();
  const simulateSwap = useSimulateMainnetSwap();
  const executeSwap = useExecuteSwap();

  const [amount, setAmount] = useState("0.1");

  const handleInitialize = () => {
    if (!publicKey) return;
    initializeVault.mutate(publicKey.toBase58());
  };

  const handleDeposit = () => {
    if (!amount) return;
    deposit.mutate({ amount: parseFloat(amount), isSol: true });
  };

  const handleWithdraw = () => {
    if (!amount) return;
    withdraw.mutate({ amount: parseFloat(amount), isSol: true });
  };

  const handleTogglePause = () => {
    togglePause.mutate();
  };

  const handleSwap = () => {
    if (!amount) return;
    // Convert SOL to lamports (atomic units) for Jupiter
    const amountIn = Math.floor(parseFloat(amount) * 1_000_000_000);
    executeSwap.mutate({ amountIn });
  };

  return (
    <div className="container mx-auto p-8 space-y-8 text-white">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Vault Test Interface</h1>
          <WalletConnectButton />
        </div>

        {/* Network Switcher */}
        <div className="flex items-center gap-4 bg-white/5 p-3 rounded-lg border border-white/10">
          <div className="flex gap-2">
            <Button 
              variant={network === "devnet" ? "default" : "ghost"}
              onClick={() => setNetwork("devnet")}
              className={network === "devnet" ? "bg-blue-600 hover:bg-blue-700" : "hover:bg-white/10"}
            >
              Devnet
            </Button>
            <Button 
              variant={network === "mainnet" ? "default" : "ghost"}
              onClick={() => setNetwork("mainnet")}
              className={network === "mainnet" ? "bg-purple-600 hover:bg-purple-700" : "hover:bg-white/10"}
            >
              Mainnet
            </Button>
          </div>
          <div className="h-6 w-px bg-white/20" />
          <span className="text-sm text-gray-300">
            Connected to: <span className="font-bold text-white">{network.toUpperCase()}</span> 
            <span className="text-gray-400 ml-1">
              {network === "devnet" ? "(Mock Flow)" : "(Jupiter Live Routes)"}
            </span>
          </span>
        </div>

        {/* Mainnet Testing Tools */}
        <div className="bg-purple-900/20 border border-purple-500/30 p-4 rounded-lg">
          <h3 className="text-purple-300 font-semibold mb-3">Mainnet Testing Tools</h3>
          <div className="flex gap-3">
            <Button 
              onClick={() => checkRoute.mutate()}
              disabled={checkRoute.isPending}
              variant="outline"
              className="border-purple-500/50 text-purple-300 hover:bg-purple-500/10"
            >
              {checkRoute.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "1. Check Jupiter Route"}
            </Button>
            <Button 
              onClick={() => simulateSwap.mutate()}
              disabled={simulateSwap.isPending}
              variant="outline"
              className="border-purple-500/50 text-purple-300 hover:bg-purple-500/10"
            >
              {simulateSwap.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "2. Simulate CPI Swap"}
            </Button>
            <Button 
              onClick={handleSwap}
              disabled={!vaultState || executeSwap.isPending || network !== "mainnet"}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {executeSwap.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "3. Execute Jupiter Swap"}
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            * Route Check and Simulation work without vault state. Execution requires initialized vault.
          </p>
        </div>
      </div>

      {connected && publicKey ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Vault State */}
          <Card className="bg-white/5 border-white/10 text-white">
            <CardHeader>
              <CardTitle>Vault State</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="text-gray-400 block text-sm">Vault PDA</span>
                <code className="bg-black/30 p-2 rounded block mt-1 text-xs font-mono break-all">
                  {vaultPda?.toString() || "Loading..."}
                </code>
              </div>
              
              {isVaultLoading ? (
                <div className="flex items-center gap-2 text-gray-400">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading on-chain state...
                </div>
              ) : vaultState ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-gray-400 block text-sm">Owner</span>
                      <span className="font-mono text-xs">{vaultState.owner.toString()}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-sm">Authority</span>
                      <span className="font-mono text-xs">{vaultState.authority.toString()}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-sm">Status</span>
                      <span className={`font-bold ${vaultState.isPaused ? "text-red-400" : "text-green-400"}`}>
                        {vaultState.isPaused ? "PAUSED" : "ACTIVE"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-sm">Trade Amount</span>
                      <span className="font-mono">{vaultState.tradeAmountLamports.toString()}</span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refetch()} className="w-full mt-4">
                    Refresh State
                  </Button>
                </>
              ) : (
                <div className="text-yellow-400 bg-yellow-400/10 p-4 rounded-lg">
                  Vault not initialized.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <Card className="bg-white/5 border-white/10 text-white">
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {!vaultState && (
                <Button 
                  onClick={handleInitialize} 
                  disabled={initializeVault.isPending}
                  className="w-full bg-cyan-500 hover:bg-cyan-600 text-black font-bold"
                >
                  {initializeVault.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Initialize Vault
                </Button>
              )}

              <div className="space-y-4 border-t border-white/10 pt-4">
                <h3 className="font-semibold text-gray-300">Funds</h3>
                <div className="flex gap-2">
                  <Input 
                    type="number" 
                    value={amount} 
                    onChange={(e) => setAmount(e.target.value)}
                    className="bg-black/20 border-white/10 text-white"
                  />
                  <Button 
                    onClick={handleDeposit}
                    disabled={!vaultState || deposit.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {deposit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Deposit SOL"}
                  </Button>
                  <Button 
                    onClick={handleWithdraw}
                    disabled={!vaultState || withdraw.isPending}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {withdraw.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Withdraw SOL"}
                  </Button>
                </div>
              </div>

              <div className="space-y-4 border-t border-white/10 pt-4">
                <h3 className="font-semibold text-gray-300">Controls</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    onClick={handleTogglePause}
                    disabled={!vaultState || togglePause.isPending}
                    variant="secondary"
                  >
                    {togglePause.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Toggle Pause"}
                  </Button>
                  <Button 
                    onClick={handleSwap}
                    disabled={!vaultState || executeSwap.isPending}
                    variant="secondary"
                    className={network === "mainnet" ? "bg-purple-600/20 hover:bg-purple-600/30 text-purple-300" : ""}
                  >
                    {executeSwap.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 
                      network === "mainnet" ? "Execute Jupiter Swap" : "Execute Mock Swap"
                    }
                  </Button>
                </div>
                
                {network === "devnet" ? (
                  <div className="pt-4 border-t border-white/10">
                     <Button 
                      onClick={() => setupVault.mutate()}
                      disabled={!vaultState || setupVault.isPending}
                      variant="outline"
                      className="w-full border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
                    >
                      {setupVault.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Setup Devnet Vault Accounts"}
                    </Button>
                     <Button 
                      onClick={() => mintTestTokens.mutate()}
                      disabled={!vaultState || mintTestTokens.isPending}
                      variant="outline"
                      className="w-full border-green-500/50 text-green-500 hover:bg-green-500/10 mt-2"
                    >
                      {mintTestTokens.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Mint Test Tokens"}
                    </Button>
                  </div>
                ) : (
                  <div className="pt-4 border-t border-white/10 text-center text-sm text-gray-500">
                    Devnet setup tools are disabled on Mainnet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="text-center py-20 text-gray-400 flex flex-col items-center gap-4">
          Please connect your wallet to proceed with {network === "devnet" ? "Devnet" : "Mainnet"} testing.
          <WalletConnectButton />
        </div>
      )}
    </div>
  );
}
