"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card"
import { X, Loader2, Save, Power, AlertTriangle, PowerOff } from "lucide-react"
import { useWallet } from "@/contexts/WalletContext"
import { showToast } from "@/components/toast"
import { Skeleton } from "@/components/ui/skeleton"

interface Holding {
  token: string;
  amount: string;
  value?: string;
}

interface PerformanceMetrics {
    totalPnl: string;
    winRate: string;
    bestStar: string;
}

export default function CommandCenter() {
  const [tradeSize, setTradeSize] = useState("0.01");
  const [isSaving, setIsSaving] = useState(false);
  const [privateKey, setPrivateKey] = useState("");
  const [isActivating, setIsActivating] = useState(false);

  const {
    isConnected,
    connectedWallet,
    agentBalance,
    isAgentActive,
    followedStars,
    isFollowedLoading,
    unfollowStar,
    activateAgent,
    deactivateAgent // Import the new function
  } = useWallet();

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [isMetricsLoading, setIsMetricsLoading] = useState(true);

  // --- DATA FETCHING HOOKS (Using connectedWallet) ---

  useEffect(() => {
    const fetchSettings = async () => {
        if (isConnected && connectedWallet) {
            try {
                const response = await fetch(`/api/settings?userWallet=${connectedWallet}`);
                const data = await response.json();
                if (data.success && data.settings.tradeSize) {
                    setTradeSize(data.settings.tradeSize);
                }
            } catch (error) {
                console.error("Failed to fetch user settings", error);
            }
        }
    };
    fetchSettings();
  }, [isConnected, connectedWallet]);

  useEffect(() => {
    const fetchPortfolio = async () => {
      if (isConnected && connectedWallet) {
        setIsLoading(true);
        setError(null);
        try {
          const response = await fetch('/api/portfolio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userSmartAccount: connectedWallet }),
          });
          const result = await response.json();
          if (response.ok && result.success) {
            setHoldings(result.balances.map((b: Holding) => ({...b, value: 'N/A'})));
          } else {
            throw new Error(result.error || "Failed to fetch portfolio.");
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
          setError(errorMessage);
        } finally {
          setIsLoading(false);
        }
      } else {
        setHoldings([]);
      }
    };
    fetchPortfolio();
  }, [isConnected, connectedWallet]);

  useEffect(() => {
    const fetchMetrics = async () => {
        if (isConnected && connectedWallet) {
            setIsMetricsLoading(true);
            try {
                const response = await fetch(`/api/performance?userSmartAccount=${connectedWallet}`);
                const data = await response.json();
                if (data.success) {
                    setMetrics(data.metrics);
                }
            } catch (error) {
                console.error("Failed to fetch performance metrics", error);
            } finally {
                setIsMetricsLoading(false);
            }
        } else {
            setMetrics(null);
        }
    };
    fetchMetrics();
  }, [isConnected, connectedWallet]);

  // --- HANDLER FUNCTIONS ---

  const handleSaveSettings = async () => {
    if (!isConnected || !connectedWallet) return;
    setIsSaving(true);
    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userWallet: connectedWallet, tradeSize }),
        });
        if (!response.ok) throw new Error("Server responded with an error.");
        showToast("Trade size saved!", "success");
    } catch (error) {
        showToast("Failed to save settings.", "error");
    } finally {
        setIsSaving(false);
    }
  };

  const handleActivateAgent = async () => {
      if (!privateKey) {
          showToast("Please enter your private key.", "error");
          return;
      }
      setIsActivating(true);
      const success = await activateAgent(privateKey);
      if (success) {
          showToast("Agent activated! Monitoring blockchain...", "success");
      }
      setIsActivating(false);
  };

  const nativeTokenBalance = agentBalance;

  return (
    <div className="min-h-screen text-white font-sans">
      <main className="max-w-7xl mx-auto p-6">
        <div className="mb-8 fade-in-delayed">
          <h1 className="text-4xl font-bold electric-cyan neon-text mb-2 font-[family-name:var(--font-space-grotesk)]">
            Command Center
          </h1>
          <p className="text-gray-300 text-lg">Manage your trading agent and portfolio settings</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <Card className="glass-card border-0 text-white pulse-glow">
                <CardHeader>
                    <CardTitle className="electric-cyan">Agent Control & Wallet Balance</CardTitle>
                    <CardDescription className="pt-2 text-gray-300">
                        {isAgentActive ? "Your autonomous agent is active." : "Activate your agent to start copy-trading."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-center text-3xl font-bold mb-4 electric-cyan neon-text">
                        {isConnected ? `${nativeTokenBalance} AVAX` : 'N/A'}
                    </div>
                    {!isConnected ? (
                        <p className="text-center text-gray-400 py-4">Connect your wallet to activate.</p>
                    ) : isAgentActive ? (
                        <div className="text-center text-green-400 font-bold status-active pl-3">Status: Active</div>
                    ) : (
                        <div className="space-y-3">
                            <div className="p-3 glass-card bg-red-500/10 text-red-300 text-xs rounded-lg flex items-center gap-2 border border-red-500/20">
                                <AlertTriangle className="w-4 h-4"/>
                                <span>For demo only. Use a burner wallet.</span>
                            </div>
                            <Input
                                type="password"
                                placeholder="Enter Private Key for connected wallet"
                                value={privateKey}
                                onChange={(e) => setPrivateKey(e.target.value)}
                                className="glass-input border-0 text-white placeholder-gray-400"
                            />
                        </div>
                    )}
                </CardContent>
                {isConnected && !isAgentActive && (
                    <CardFooter>
                        <Button
                          onClick={handleActivateAgent}
                          disabled={isActivating || !privateKey}
                          className="w-full electric-cyan-bg text-black font-bold hover:electric-cyan-glow transition-all duration-300"
                        >
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
            <Card className="glass-card border-0 text-white floating-animation">
              <CardHeader>
                <CardTitle className="electric-cyan">Followed Stars</CardTitle>
                <CardDescription className="text-gray-300">Wallets you're copying trades from</CardDescription>
              </CardHeader>
              <CardContent>
                 <div className="space-y-3">
                   {isFollowedLoading ? <div className="h-12 w-full glass-card shimmer rounded-lg" />
                   : !isConnected ? <p className="text-center text-gray-400 py-4">Connect wallet to see stars.</p>
                   : followedStars.length === 0 ? <p className="text-center text-gray-400 py-4">Not following any stars.</p>
                   : followedStars.map((address) => (
                       <div key={address} className="flex items-center justify-between p-3 rounded-lg glass-card hover:electric-cyan-glow transition-all duration-300">
                         <span className="font-mono text-sm">{address.slice(0, 6)}...{address.slice(-4)}</span>
                         <Button
                           variant="ghost"
                           size="sm"
                           onClick={() => unfollowStar(address)}
                           className="glass-button hover:bg-red-500/20 hover:text-red-400"
                         >
                           <X className="w-4 h-4" />
                         </Button>
                       </div>
                     ))
                   }
                 </div>
              </CardContent>
            </Card>

            <Card className="glass-card border-0 text-white slide-in-up">
              <CardHeader>
                <CardTitle className="electric-cyan">Set Trade Size</CardTitle>
                <CardDescription className="text-gray-300">Amount of AVAX to use per trade</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">AVAX per trade</label>
                  <Input
                    type="number"
                    value={tradeSize}
                    onChange={(e) => setTradeSize(e.target.value)}
                    disabled={!isConnected}
                    className="glass-input border-0 text-white placeholder-gray-400"
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  onClick={handleSaveSettings}
                  disabled={!isConnected || isSaving}
                  className="w-full electric-cyan-bg text-black font-bold hover:electric-cyan-glow transition-all duration-300"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Trade Size
                </Button>
              </CardFooter>
            </Card>

            

          </div>
          <div className="lg:col-span-2 space-y-6">
            <Card className="glass-card border-0 text-white slide-in-up">
              <CardHeader>
                <CardTitle className="electric-cyan">Current Holdings</CardTitle>
                <CardDescription className="text-gray-300">Your current token balances</CardDescription>
              </CardHeader>
              <CardContent>
                 <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                        <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-2 text-gray-300 font-medium">Token</th>
                            <th className="text-left py-3 px-2 text-gray-300 font-medium">Amount</th>
                            <th className="text-left py-3 px-2 text-gray-300 font-medium">Current Value</th>
                        </tr>
                        </thead>
                        <tbody>
                        {isLoading ? (
                            <tr><td colSpan={3}><div className="h-12 w-full glass-card shimmer rounded-lg"/></td></tr>
                        ) : !isConnected ? (
                            <tr><td colSpan={3} className="text-center py-12 text-gray-400">Connect wallet to view.</td></tr>
                        ) : error ? (
                            <tr><td colSpan={3} className="text-center py-12 text-red-400">Error: {error}</td></tr>
                        ) : holdings.length === 0 ? (
                            <tr><td colSpan={3} className="text-center py-12 text-gray-400">No holdings found.</td></tr>
                        ) : (
                            holdings.map((holding) => (
                            <tr key={holding.token} className="border-b border-white/5 hover:bg-white/5 transition-colors duration-300">
                                <td className="py-4 px-2 text-white font-medium">{holding.token}</td>
                                <td className="py-4 px-2 text-gray-300">{holding.amount}</td>
                                <td className="py-4 px-2 text-gray-300">{holding.value}</td>
                            </tr>
                            ))
                        )}
                        </tbody>
                    </table>
                    </div>
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="glass-card border-0 text-white hover:electric-cyan-glow transition-all duration-300">
                    <CardHeader><CardTitle className="electric-cyan">Total P&L</CardTitle></CardHeader>
                    <CardContent>
                        {isMetricsLoading ? <div className="h-8 w-24 glass-card shimmer rounded"/> : (
                           <div className={`text-2xl font-bold ${parseFloat(metrics?.totalPnl ?? '0') >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {parseFloat(metrics?.totalPnl ?? '0') >= 0 ? '+' : ''}{metrics?.totalPnl ?? '0.00'}
                            </div>
                        )}
                    </CardContent>
                </Card>
                <Card className="glass-card border-0 text-white hover:electric-cyan-glow transition-all duration-300">
                    <CardHeader><CardTitle className="electric-cyan">Win Rate</CardTitle></CardHeader>
                    <CardContent>
                        {isMetricsLoading ? <div className="h-8 w-16 glass-card shimmer rounded"/> : (
                            <div className="text-2xl font-bold text-white">{metrics?.winRate ?? '0'}%</div>
                        )}
                    </CardContent>
                </Card>
                <Card className="glass-card border-0 text-white hover:electric-cyan-glow transition-all duration-300">
                    <CardHeader><CardTitle className="electric-cyan">Best Performing Star</CardTitle></CardHeader>
                    <CardContent>
                        {isMetricsLoading ? <div className="h-6 w-32 glass-card shimmer rounded"/> : (
                            <div className="text-lg font-mono text-white">
                                {metrics?.bestStar && metrics.bestStar !== 'N/A'
                                    ? `${metrics.bestStar.slice(0, 6)}...${metrics.bestStar.slice(-4)}`
                                    : 'N/A'}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}