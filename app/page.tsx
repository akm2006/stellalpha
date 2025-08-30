"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { useWallet } from "@/contexts/WalletContext";
import { showToast } from "@/components/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Rss, ExternalLink, X, Loader2, Power, AlertTriangle } from "lucide-react";
import ParticlesBackground from "@/components/particles-background";

interface Signal {
  id: string;
  action: string;
  starWallet: string; // The backend agent provides this key
  timestamp: string;
  txHash: string;
}

export default function DashboardPage() {
  const [starToFollow, setStarToFollow] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [isActivating, setIsActivating] = useState(false);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoadingSignals, setIsLoadingSignals] = useState(true);

  // Get all the live state and functions from our working WalletContext
  const {
    isConnected,
    connectedWallet,
    isAgentActive,
    followedStars,
    isFollowedLoading,
    unfollowStar,
    followStar,
    activateAgent,
  } = useWallet();

  const fetchSignals = useCallback(async () => {
    if (!isConnected || !connectedWallet) {
        setIsLoadingSignals(false);
        return;
    };
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
  }, [isConnected, connectedWallet]);

  // This hook polls for new signals every 10 seconds
  useEffect(() => {
    if (isAgentActive) {
      // Only start polling when the agent is active
      fetchSignals();
      const interval = setInterval(fetchSignals, 10000);
      return () => clearInterval(interval);
    }
  }, [isAgentActive, fetchSignals]);

  // Handler to connect the "Follow" button to our context
  const handleFollow = () => {
    if (!starToFollow) {
      showToast("Please enter a wallet address.", "error");
      return;
    }
    followStar(starToFollow);
    setStarToFollow("");
  };

  // Handler to connect the "Activate Agent" button to our context
  const handleActivateAgent = async () => {
    if (!privateKey) {
      showToast("Please enter your private key to activate.", "error");
      return;
    }
    setIsActivating(true);
    const success = await activateAgent(privateKey);
    if (success) {
      showToast("Agent activated! Monitoring blockchain...", "success");
    }
    setIsActivating(false);
  };

  return (
    <>
      <ParticlesBackground />
      <div className="relative z-10 min-h-screen flex flex-col">
        
        
        <main className="flex-grow max-w-7xl w-full mx-auto p-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column */}
            <div className="lg:col-span-1 space-y-6">
              <Card  className="glass-card border-0 text-white floating-animation">
                <CardHeader>
                  <CardTitle className="electric-cyan">1. Follow a Star</CardTitle>
                  <CardDescription className="text-white">Enter a wallet address to begin tracking.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      placeholder="0x..."
                      value={starToFollow}
                      onChange={(e) => setStarToFollow(e.target.value)}
                      disabled={!isConnected}
                      className="input-base"
                    />
                    <Button onClick={handleFollow} disabled={!isConnected || !starToFollow} className="button-primary electric-cyan-bg text-black font-bold hover:electric-cyan-glow transition-all duration-300">Follow</Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-card border-0 text-white">
                <CardHeader><CardTitle>Followed Stars</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-40 overflow-y-auto pr-2">
                    {isFollowedLoading ? <Skeleton className="h-12 w-full bg-white/5" />
                     : !isConnected ? <p className="text-center text-gray-400">Connect wallet to see stars.</p>
                     : followedStars.length === 0 ? <p className="text-center text-gray-400">You are not following any stars.</p>
                     : followedStars.map((address) => (
                         <div key={address} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                           <span className="font-mono text-sm">{address.slice(0, 8)}...{address.slice(-4)}</span>
                           <Button variant="ghost" size="icon" onClick={() => unfollowStar(address)} className="h-7 w-7 text-gray-400 hover:text-red-400"><X className="w-4 h-4" /></Button>
                         </div>
                       ))
                     }
                  </div>
                </CardContent>
              </Card>

              <Card  className="glass-card border-0 electric-cyan floating-animation">
                <CardHeader>
                  <CardTitle>2. Activate Agent</CardTitle>
                  <CardDescription className="text-white">
                    {isAgentActive ? "Your autonomous agent is active." : "Provide your private key to start the agent."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                    {isAgentActive ? (
                        <div className="text-center text-green-400 font-bold p-4">Agent Status: Active</div>
                    ) : !isConnected ? (
                        <p className="text-center text-gray-400">Connect wallet to activate.</p>
                    ) : (
                        <div className="space-y-3">
                            <div className="p-3 bg-red-900/30 text-red-300 text-xs rounded-lg flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0"/>
                                <span>For demo only. Use a burner wallet. The key is sent to the backend.</span>
                            </div>
                            <Input
                                type="password"
                                placeholder="Enter Private Key for connected wallet"
                                value={privateKey}
                                onChange={(e) => setPrivateKey(e.target.value)}
                                disabled={!isConnected}
                            />
                        </div>
                    )}
                </CardContent>
                {isConnected && !isAgentActive && (
                    <CardFooter>
                        <Button onClick={handleActivateAgent} disabled={isActivating || !privateKey} className="w-full button-primary electric-cyan-bg text-black font-bold hover:electric-cyan-glow transition-all duration-300">
                            {isActivating ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <Power className="w-4 h-4 mr-2"/>}
                            Verify & Activate
                        </Button>
                    </CardFooter>
                )}
              </Card>
            </div>

            {/* Right Column */}
            <div className="lg:col-span-2 space-y-6">
              <Card className="glass-card h-full">
                <CardHeader>
                  <CardTitle className="flex items-center electric-cyan gap-2"><Rss /> Real-Time Activity Log</CardTitle>
                  <CardDescription className="text-white">Autonomous trades executed by your agent will appear here.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                  {isLoadingSignals ? Array.from({length: 5}).map((_, i) => <Skeleton key={i} className="h-16 w-full bg-white/5"/>)
                   : !isConnected ? <p className="text-gray-400 text-center py-8">Connect your wallet to see agent activity.</p>
                   : signals.length === 0 ? <p className="text-gray-400 text-center py-8">No signals yet. Activate your agent and wait for a followed star to make a swap.</p>
                   : signals.map(signal => (
                      <div key={signal.id} className="p-4 bg-white/5 rounded-lg border border-white/10 animate-fade-in">
                          <p className="font-semibold text-white">{signal.action}</p>
                          <div className="text-xs text-gray-400 mt-1 flex justify-between items-center">
                              <span>Star: <span className="font-mono">{signal.starWallet.slice(0,10)}...</span></span>
                              <a 
                                  href={`https://testnet.snowtrace.io/tx/${signal.txHash}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 hover:text-electric-cyan transition-colors"
                              >
                                  View Tx <ExternalLink className="w-3 h-3"/>
                              </a>
                          </div>
                      </div>
                   ))
                  }
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </>
  )
}