"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useWallet } from "@/contexts/WalletContext"
import { showToast } from "@/components/toast"
import { Skeleton } from "@/components/ui/skeleton"
import WalletHeader from "@/components/wallet-header"
import { Rss, ExternalLink } from "lucide-react"

interface Signal {
  id: string;
  action: string;
  star: string;
  timestamp: string;
  txHash: string;
}

export default function DashboardPage() {
  const [starToFollow, setStarToFollow] = useState("")
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoadingSignals, setIsLoadingSignals] = useState(true);

  // Use our fully refactored EOA-based context
  const { 
    isConnected,
    connectedWallet,
    followStar
  } = useWallet();

  const fetchSignals = useCallback(async () => {
    if (isConnected && connectedWallet) {
      try {
        const response = await fetch(`/api/signals?userWallet=${connectedWallet}`);
        const data = await response.json();
        if (data.success) {
          setSignals(data.signals);
        }
      } catch (error) {
        console.error("Failed to fetch signals", error);
      } finally {
        setIsLoadingSignals(false);
      }
    }
  }, [isConnected, connectedWallet]);

  // Effect to fetch signals periodically
  useEffect(() => {
    fetchSignals(); // Fetch on component load
    const interval = setInterval(fetchSignals, 10000); // Poll for new signals every 10 seconds
    return () => clearInterval(interval);
  }, [fetchSignals]);


  const handleFollow = () => {
    if (!starToFollow) {
      showToast("Please enter a wallet address.", "error");
      return;
    }
    followStar(starToFollow);
    setStarToFollow(""); // Clear input after following
  };

  return (
    <div className="min-h-screen stellalpha-bg text-white font-sans">
      <header className="flex items-center justify-end p-6 border-b border-gray-800">
        <WalletHeader />
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card className="glassmorphism-card">
            <CardHeader>
              <CardTitle className="text-xl">Follow a Star</CardTitle>
              <CardDescription>Enter a wallet address to start copying their trades.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Input
                placeholder="0x..."
                value={starToFollow}
                onChange={e => setStarToFollow(e.target.value)}
                disabled={!isConnected}
                className="bg-gray-900/50 border-gray-600"
              />
              <Button onClick={handleFollow} disabled={!isConnected || !starToFollow}>Follow</Button>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="glassmorphism-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Rss/> Agent Activity Log</CardTitle>
              <CardDescription>Autonomous trades executed by your agent will appear here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto">
                {isLoadingSignals ? (
                  Array.from({length: 3}).map((_, i) => <Skeleton key={i} className="h-16 w-full bg-gray-900/50"/>)
                ) : !isConnected ? (
                  <p className="text-gray-400 text-center py-8">Connect your wallet to see agent activity.</p>
                ) : signals.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">No signals yet. Activate your agent and wait for a followed star to make a swap.</p>
                ) : (
                  signals.map(signal => (
                    <div key={signal.id} className="p-4 bg-gray-900/30 rounded-lg border border-gray-800/50 animate-fade-in">
                        <p className="font-semibold">{signal.action}</p>
                        <div className="text-xs text-gray-400 mt-1 flex justify-between items-center">
                            <span>Star: <span className="font-mono">{signal.star.slice(0,10)}...</span></span>
                            <a 
                                href={`https://testnet.snowtrace.io/tx/${signal.id}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 hover:text-electric-cyan transition-colors"
                            >
                                View Tx <ExternalLink className="w-3 h-3"/>
                            </a>
                        </div>
                    </div>
                 ))
                )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}