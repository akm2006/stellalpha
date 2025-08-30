"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useWallet } from "@/contexts/WalletContext"
import { showToast } from "@/components/toast"
import { Skeleton } from "@/components/ui/skeleton"
import { Rss, ExternalLink } from "lucide-react"
import { Activity, Wallet } from "lucide-react"

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
    <div className="min-h-screen text-white font-sans">
      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-8 fade-in-delayed">
        <div className="lg:col-span-1">
          <Card className="glass-card border-0 text-white floating-animation">
            <CardHeader>
              <CardTitle className="text-xl electric-cyan">Follow a Star</CardTitle>
              <CardDescription className="text-gray-300">Enter a wallet address to start copying their trades.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Input
                placeholder="0x..."
                value={starToFollow}
                onChange={e => setStarToFollow(e.target.value)}
                disabled={!isConnected}
                className="glass-input border-0 text-white placeholder-gray-400"
              />
              <Button 
                onClick={handleFollow} 
                disabled={!isConnected || !starToFollow}
                className="glass-button text-white hover:electric-cyan-glow"
              >
                Follow
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card className="glass-card border-0 text-white slide-in-up">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 electric-cyan">
                <Rss className="pulse-glow"/> 
                Agent Activity Log
              </CardTitle>
              <CardDescription className="text-gray-300">
                Autonomous trades executed by your agent will appear here.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto">
                {isLoadingSignals ? (
                  Array.from({length: 3}).map((_, i) => (
                    <div key={i} className="h-16 w-full glass-card shimmer rounded-lg"></div>
                  ))
                ) : !isConnected ? (
                  <div className="text-center py-12">
                    <Wallet className="w-12 h-12 mx-auto text-gray-500 mb-4" />
                    <p className="text-gray-400">Connect your wallet to see agent activity.</p>
                  </div>
                ) : signals.length === 0 ? (
                  <div className="text-center py-12">
                    <Activity className="w-12 h-12 mx-auto text-gray-500 mb-4" />
                    <p className="text-gray-400">No signals yet. Activate your agent and wait for a followed star to make a swap.</p>
                  </div>
                ) : (
                  signals.map(signal => (
                    <div key={signal.id} className="p-4 glass-card rounded-lg slide-in-up hover:electric-cyan-glow transition-all duration-300">
                        <p className="font-semibold text-white">{signal.action}</p>
                        <div className="text-xs text-gray-300 mt-2 flex justify-between items-center">
                            <span>Star: <span className="font-mono">{signal.star.slice(0,10)}...</span></span>
                            <a 
                                href={`https://testnet.snowtrace.io/tx/${signal.id}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 hover:electric-cyan transition-all duration-300 glass-button px-2 py-1 rounded"
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