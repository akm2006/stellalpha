"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ArrowRightCircle as ArrowUpRightCircle,
  ArrowDownLeftFromCircle as ArrowDownLeftCircle,
  ExternalLink,
} from "lucide-react"
import WalletHeader from "@/components/wallet-header"
import { useWallet } from "@/contexts/WalletContext";
import { showToast } from "@/components/toast";
import { Skeleton } from "@/components/ui/skeleton"
import { formatDistanceToNow } from 'date-fns';

interface Signal {
  id: string;
  type: 'buy' | 'sell' | 'swap';
  action: string;
  wallet: string;
  timestamp: string;
  txHash: string;
}

export default function StellaphaaDashboard() {
  const [address, setAddress] = useState("")
  // Get isConnected and the followStar function from the context
  const { isConnected, followStar } = useWallet();
  const [signalLog, setSignalLog] = useState<Signal[]>([]);
  const [isLogLoading, setIsLogLoading] = useState(true);

  useEffect(() => {
    const fetchSignals = async () => {
      // Don't set loading to true on refetch to avoid flashing
      if (isLogLoading) {
        try {
          const response = await fetch('/api/signals');
          const data = await response.json();
          if (data.success) {
            setSignalLog(data.signals);
          } else {
            throw new Error("Failed to fetch signals");
          }
        } catch (error) {
          console.error("Failed to fetch signal log", error);
          showToast("Could not load signal log.", "error");
        } finally {
          setIsLogLoading(false);
        }
      }
    };

    fetchSignals();
    // Poll for new signals every 30 seconds
    const interval = setInterval(fetchSignals, 30000);
    return () => clearInterval(interval);
  }, [isLogLoading]); // Rerunning the effect is not needed on every render


  const handleActivateAgent = async () => {
    if (!address) {
        showToast("Please enter a valid address to follow.", "error");
        return;
    }
    // Directly call the followStar function from the context.
    // It already handles loading toasts and state updates.
    await followStar(address);
    setAddress(""); // Clear input after submission
  };

  return (
    <div className="min-h-screen stellalpha-bg text-white font-sans">
      <header className="flex items-center justify-between p-6 border-b border-gray-800">
        <div></div>
        <WalletHeader />
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-8">
        <Card className="glassmorphism-card">
          <CardHeader>
            <CardTitle className="text-2xl font-[family-name:var(--font-space-grotesk)] text-white">
              Follow a Star
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Input
                type="text"
                placeholder="Paste Avalanche C-Chain address (0x...)"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="bg-gray-900/50 border-gray-600 text-white placeholder-gray-400 focus:electric-cyan-border focus:ring-1 focus:ring-[#00F6FF] transition-all duration-300"
              />
            </div>
            <Button
              onClick={handleActivateAgent}
              disabled={!address || !isConnected}
              className="w-full electric-cyan-bg text-black font-bold hover:electric-cyan-glow-intense transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Activate Agent
            </Button>
          </CardContent>
        </Card>

        <Card className="glassmorphism-card">
          <CardHeader>
            <CardTitle className="text-2xl font-[family-name:var(--font-space-grotesk)] text-white">
              Signal Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isLogLoading ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-20 w-full rounded-lg bg-gray-900/50" />
                ))
              ) : signalLog.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <p>No recent signals from followed stars.</p>
                  <p className="text-xs mt-1">The log will update automatically when a followed star makes a trade.</p>
                </div>
              ) : (
                signalLog.map((signal) => (
                  <div
                    key={signal.id}
                    className={`flex items-center justify-between p-4 rounded-lg bg-gray-900/30 border border-gray-800/50 hover:border-gray-700/50 transition-colors duration-200 ${
                      signal.type === "buy" ? "transaction-buy" : "transaction-sell"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center">
                        {signal.type === "buy" ? (
                          <ArrowUpRightCircle className="w-6 h-6 text-green-400" />
                        ) : (
                          <ArrowDownLeftCircle className="w-6 h-6 text-red-400" />
                        )}
                      </div>
                      <div className="w-8 h-8 rounded-full bg-gray-700/50 border border-gray-600/50"></div>
                      <div className="space-y-1">
                        <p className="text-white font-medium">{signal.action}</p>
                        <p className="text-gray-400 text-sm">
                          From wallet {signal.wallet.slice(0, 6)}...{signal.wallet.slice(-4)}
                        </p>
                      </div>
                    </div>
                    <a 
                      href={`https://snowtrace.io/tx/${signal.txHash}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-gray-500 hover:text-electric-cyan transition-colors"
                    >
                      <span className="text-sm hidden sm:inline">{formatDistanceToNow(new Date(signal.timestamp), { addSuffix: true })}</span>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
