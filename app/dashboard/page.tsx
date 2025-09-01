"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Image from "next/image"; 
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
import { Rss, ExternalLink, X, Loader2, Power, AlertTriangle, PowerOff, ArrowRight, Coins, Copy } from "lucide-react";


interface Signal {
  id: string;
  action: string;
  starWallet: string;
  timestamp: string;
  txHash: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  amountSwapped: string;
}

export default function DashboardPage() {
  const [starToFollow, setStarToFollow] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [isActivating, setIsActivating] = useState(false);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoadingSignals, setIsLoadingSignals] = useState(false);

  const {
    isConnected,
    connectedWallet,
    isAgentActive,
    followedStars,
    isFollowedLoading,
    unfollowStar,
    followStar,
    activateAgent,
    deactivateAgent
  } = useWallet();

  const fetchSignals = useCallback(async () => {
    if (!isConnected || !connectedWallet) {
        return;
    };
    setIsLoadingSignals(true);
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

  const tokenInfoMap: { [key: string]: { name: string; logo: string } } = {
    "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7": { name: "USDT", logo: "/usdt.png" },
    "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7": { name: "WAVAX", logo: "/avax.png" },
    // using hardcoded data for test, ideally fetch from a reliable source
  };

  const parseActionForTokens = (action: string) => {
    // Extract token addresses and amounts from action string
    const tokenRegex = /0x[a-fA-F0-9]{40}/g;
    const amountRegex = /Swapped\s+([\d.]+)\s+of\s+token\s+0x[a-fA-F0-9]{40}\s+for\s+0x[a-fA-F0-9]{40}/;
    
    const addresses = action.match(tokenRegex) || [];
    const amountMatch = action.match(amountRegex);
    const amount = amountMatch ? amountMatch[1] : '';
    
    return {
      fromTokenAddress: addresses[0] || '',
      toTokenAddress: addresses[1] || '',
      amount: amount
    };
  };

  const getTokenInfo = (address?: string) => {
    if (!address) {
      return { name: 'N/A', logo: '', showGenericIcon: true, fullAddress: '' };
    }
    const addressLower = address.toLowerCase();
    const tokenInfo = tokenInfoMap[addressLower];
    
    if (tokenInfo) {
      return { ...tokenInfo, showGenericIcon: false, fullAddress: address };
    } else {
      // Return the actual token address with generic icon
      return { 
        name: `${address.slice(0, 6)}...${address.slice(-4)}`, 
        logo: '', 
        showGenericIcon: true,
        fullAddress: address
      };
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Address copied to clipboard!", "success");
    } catch (error) {
      showToast("Failed to copy address", "error");
    }
  };
  
  useEffect(() => {
    if (isConnected) {
      fetchSignals();
      const interval = setInterval(fetchSignals, 10000);
      return () => clearInterval(interval);
    } else {
        setSignals([]);
    }
  }, [isConnected, fetchSignals]);

  const handleFollow = () => {
    if (!starToFollow) {
      showToast("Please enter a wallet address.", "error");
      return;
    }
    followStar(starToFollow);
    setStarToFollow("");
  };

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
      <div className="relative z-10 min-h-screen flex flex-col">
        <main className="flex-grow max-w-7xl w-full mx-auto p-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
              <Card className="glass-card border-0 text-white floating-animation">
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
                      className="glass-input border-0 text-white placeholder-gray-400"
                    />
                    <Button onClick={handleFollow} disabled={!isConnected || !starToFollow} className="electric-cyan-bg text-black font-bold hover:electric-cyan-glow transition-all duration-300">Follow</Button>
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

              <Card className="glass-card border-0 electric-cyan floating-animation">
                <CardHeader>
                  <CardTitle>2. Activate Agent</CardTitle>
                  <CardDescription className="text-white">
                    {isAgentActive ? "Your autonomous agent is active." : "Provide your private key to start the agent."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                    {isAgentActive ? (
                        <div className="text-center text-green-400 font-bold p-4 status-active pl-3">Agent Status: Active</div>
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
                                className="glass-input border-0 text-white placeholder-gray-400"
                            />
                        </div>
                    )}
                </CardContent>
                 {isConnected && !isAgentActive && (
                    <CardFooter>
                        <Button onClick={handleActivateAgent} disabled={isActivating || !privateKey} className="w-full electric-cyan-bg text-black font-bold hover:electric-cyan-glow transition-all duration-300">
                            {isActivating ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <Power className="w-4 h-4 mr-2"/>}
                            Verify & Activate
                        </Button>
                    </CardFooter>
                )}
                {isAgentActive && (
                    <CardFooter>
                        <Button
                          onClick={deactivateAgent}
                          className="w-full glass-button bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 flex items-center gap-2 hover:electric-cyan-glow transition-all duration-300"
                        >
                            <PowerOff className="w-4 h-4 mr-2"/>
                            Deactivate Agent
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
                  {isLoadingSignals ? Array.from({length: 5}).map((_, i) => <Skeleton key={i} className="h-20 w-full bg-white/5"/>)
                   : !isConnected ? <p className="text-gray-400 text-center py-8">Connect your wallet to see agent activity.</p>
                   : signals.length === 0 ? <p className="text-gray-400 text-center py-8">No signals yet. Waiting for a followed star to make a swap.</p>
                   : signals.map(signal => {
                      const parsedTokens = parseActionForTokens(signal.action);
                      const fromTokenAddress = parsedTokens.fromTokenAddress || signal.fromTokenAddress;
                      const toTokenAddress = parsedTokens.toTokenAddress || signal.toTokenAddress;
                      const swapAmount = parsedTokens.amount || signal.amountSwapped;
                      
                      const fromToken = getTokenInfo(fromTokenAddress);
                      const toToken = getTokenInfo(toTokenAddress);
                      
                      return (
                        <div key={signal.id} className="p-4 bg-white/5 rounded-lg border border-white/10 animate-fade-in space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 font-mono text-lg text-white">
                                    <div className="flex items-center gap-2">
                                      <span className="text-cyan-400 font-semibold">{swapAmount}</span>
                                      {fromToken.showGenericIcon ? (
                                        <Coins className="w-5 h-5 text-gray-400" />
                                      ) : fromToken.logo ? (
                                        <Image src={fromToken.logo} alt={fromToken.name} width={20} height={20} className="rounded-full" />
                                      ) : (
                                        <Coins className="w-5 h-5 text-gray-400" />
                                      )}
                                      <span 
                                        className="text-gray-400" 
                                        title={fromToken.fullAddress}
                                      >
                                        {fromToken.name}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => copyToClipboard(fromToken.fullAddress)}
                                        className="h-6 w-6 text-gray-500 hover:text-cyan-400 transition-colors"
                                      >
                                        <Copy className="w-3 h-3" />
                                      </Button>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-cyan-400" />
                                    <div className="flex items-center gap-2">
                                      {toToken.showGenericIcon ? (
                                        <Coins className="w-5 h-5 text-gray-400" />
                                      ) : toToken.logo ? (
                                        <Image src={toToken.logo} alt={toToken.name} width={20} height={20} className="rounded-full" />
                                      ) : (
                                        <Coins className="w-5 h-5 text-gray-400" />
                                      )}
                                      <span 
                                        className="text-gray-400"
                                        title={toToken.fullAddress}
                                      >
                                        {toToken.name}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => copyToClipboard(toToken.fullAddress)}
                                        className="h-6 w-6 text-gray-500 hover:text-cyan-400 transition-colors"
                                      >
                                        <Copy className="w-3 h-3" />
                                      </Button>
                                    </div>
                                </div>
                                <a
                                    href={`https://testnet.snowtrace.io/tx/${signal.txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                                >
                                    View Tx <ExternalLink className="w-3 h-3"/>
                                </a>
                            </div>
                            <div className="text-xs text-gray-500 flex justify-between items-center border-t border-white/10 pt-2">
                                <span>Star: <span className="font-mono text-gray-400">{signal.starWallet.slice(0, 10)}...</span></span>
                                <span>{new Date(signal.timestamp).toLocaleString()}</span>
                            </div>
                        </div>
                      )
                   })
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