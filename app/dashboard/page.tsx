"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { ShadowModeToggle } from "@/components/ShadowModeToggle";
import { useVaultState, useInitializeVault, useDeposit, useWithdraw, useTogglePause, useVaultPda } from "@/hooks/solana/useVault";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, RefreshCw, Play, Pause, ArrowDown, ArrowUp, Wallet, Shield } from "lucide-react";
import { toast } from "sonner";

export default function DashboardPage() {
  const { publicKey, connected } = useWallet();
  const vaultPda = useVaultPda(publicKey);
  const { data: vaultState, isLoading: isVaultLoading, refetch: refetchVault } = useVaultState();
  
  const initializeVault = useInitializeVault();
  const togglePause = useTogglePause();
  const deposit = useDeposit();
  const withdraw = useWithdraw();

  const [amount, setAmount] = useState("");
  const [signals, setSignals] = useState<any[]>([]);
  const [isLoadingSignals, setIsLoadingSignals] = useState(false);

  const fetchSignals = useCallback(async () => {
    if (!publicKey) return;
    setIsLoadingSignals(true);
    try {
      const response = await fetch(`/api/signals?userWallet=${publicKey.toBase58()}`);
      const data = await response.json();
      if (data.success) {
        setSignals(data.signals);
      }
    } catch (error) {
      console.error("Failed to fetch signals", error);
    } finally {
      setIsLoadingSignals(false);
    }
  }, [publicKey]);

  useEffect(() => {
    if (connected) {
      fetchSignals();
      const interval = setInterval(fetchSignals, 10000);
      return () => clearInterval(interval);
    }
  }, [connected, fetchSignals]);

  const handleInitialize = async () => {
    if (!publicKey) return;
    // For now, using the user as authority. In production, this might be the agent's key.
    // The user instruction says "initialize_vault(ctx, authority)".
    // We'll pass the user's pubkey as authority for now, or a specific agent pubkey if known.
    // Let's use the user's pubkey as the authority for simplicity in this demo.
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

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6">
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
          Welcome to Stellalpha
        </h1>
        <p className="text-gray-400">Connect your Solana wallet to get started.</p>
        <WalletConnectButton />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 font-mono text-sm mt-1">
            Vault: {vaultPda?.toString() || "Loading..."}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <ShadowModeToggle />
          <WalletConnectButton />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Vault Status Card */}
        <Card className="glass-card border-0 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-cyan-400" />
              Vault Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isVaultLoading ? (
              <Skeleton className="h-24 w-full bg-white/5" />
            ) : vaultState ? (
              <div className="space-y-2">
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                  <span className="text-gray-400">Status</span>
                  <span className={`font-bold ${vaultState.isPaused ? "text-yellow-400" : "text-green-400"}`}>
                    {vaultState.isPaused ? "Paused" : "Active"}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                  <span className="text-gray-400">Trade Amount</span>
                  <span className="font-mono">{vaultState.tradeAmountLamports.toString()} Lamports</span>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => togglePause.mutate()}
                    disabled={togglePause.isPending}
                    className="w-full border-cyan-500/30 hover:bg-cyan-500/10"
                  >
                    {togglePause.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : vaultState.isPaused ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                    {vaultState.isPaused ? "Resume" : "Pause"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 space-y-4">
                <p className="text-gray-400">No vault found for this wallet.</p>
                <Button 
                  onClick={handleInitialize} 
                  disabled={initializeVault.isPending}
                  className="electric-cyan-bg text-black font-bold w-full"
                >
                  {initializeVault.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Initialize Vault
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions Card */}
        <Card className="glass-card border-0 text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-purple-400" />
              Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Input
                type="number"
                placeholder="Amount (SOL)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="glass-input border-white/10"
              />
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  onClick={handleDeposit}
                  disabled={!vaultState || deposit.isPending || !amount}
                  className="bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30"
                >
                  {deposit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDown className="w-4 h-4 mr-2" />}
                  Deposit
                </Button>
                <Button 
                  onClick={handleWithdraw}
                  disabled={!vaultState || withdraw.isPending || !amount}
                  className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30"
                >
                  {withdraw.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4 mr-2" />}
                  Withdraw
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Signals Feed */}
        <Card className="glass-card border-0 text-white md:col-span-2 lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Live Signals</span>
              <Button variant="ghost" size="icon" onClick={fetchSignals} disabled={isLoadingSignals}>
                <RefreshCw className={`w-4 h-4 ${isLoadingSignals ? "animate-spin" : ""}`} />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
            {isLoadingSignals && signals.length === 0 ? (
              <Skeleton className="h-12 w-full bg-white/5" />
            ) : signals.length > 0 ? (
              signals.map((signal, idx) => (
                <div key={idx} className="p-3 bg-white/5 rounded-lg text-sm border border-white/10">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>{new Date(signal.timestamp || Date.now()).toLocaleTimeString()}</span>
                    <span className="font-mono">{signal.action}</span>
                  </div>
                  <div className="font-mono text-cyan-400 truncate">
                    {signal.txHash || "Pending..."}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-4">No signals yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}