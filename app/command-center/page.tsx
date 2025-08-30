"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card"
import { X, Loader2, Save, Power, AlertTriangle } from "lucide-react"
import WalletHeader from "@/components/wallet-header"
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
    activateAgent
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
                const response = await fetch(`/api/performance?userWallet=${connectedWallet}`);
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
        await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userWallet: connectedWallet, tradeSize }),
        });
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
          showToast("Agent activated successfully! Monitoring blockchain...", "success");
      }
      setIsActivating(false);
  };

  const nativeTokenBalance = agentBalance;

  return (
    <div className="min-h-screen stellalpha-bg text-white font-sans">
      <header className="flex items-center justify-end p-6 border-b border-gray-800">
        <WalletHeader />
      </header>
      <main className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            
            <Card className="glassmorphism-card">
              <CardHeader><CardTitle>Followed Stars</CardTitle></CardHeader>
              <CardContent>
                 <div className="space-y-3">
                   {isFollowedLoading ? <Skeleton className="h-12 w-full" />
                   : !isConnected ? <p className="text-center text-gray-400">Connect wallet to see stars.</p>
                   : followedStars.length === 0 ? <p className="text-center text-gray-400">Not following any stars.</p>
                   : followedStars.map((address) => (
                       <div key={address} className="flex items-center justify-between p-3 rounded-lg bg-gray-900/30">
                         <span className="font-mono text-sm">{address.slice(0, 6)}...{address.slice(-4)}</span>
                         <Button variant="ghost" size="sm" onClick={() => unfollowStar(address)}><X className="w-4 h-4" /></Button>
                       </div>
                     ))
                   }
                 </div>
              </CardContent>
            </Card>

            <Card className="glassmorphism-card">
              <CardHeader><CardTitle>Set Trade Size</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">AVAX per trade</label>
                  <Input type="number" value={tradeSize} onChange={(e) => setTradeSize(e.target.value)} disabled={!isConnected} className="bg-gray-900/50 border-gray-600 text-white"/>
                </div>
              </CardContent>
              <CardFooter>
                <Button onClick={handleSaveSettings} disabled={!isConnected || isSaving} className="w-full electric-cyan-bg text-black font-bold">
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Trade Size
                </Button>
              </CardFooter>
            </Card>

            <Card className="glassmorphism-card">
                <CardHeader>
                    <CardTitle>Agent Control & Wallet Balance</CardTitle>
                    <CardDescription className="pt-2">
                        {isAgentActive ? "Your autonomous agent is active." : "Activate your agent to start copy-trading."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-center text-3xl font-bold mb-4">
                        {isConnected ? `${nativeTokenBalance} AVAX` : 'N/A'}
                    </div>
                    {!isConnected ? (
                        <p className="text-center text-gray-400">Connect your wallet to activate.</p>
                    ) : isAgentActive ? (
                        <div className="text-center text-green-400 font-bold">Status: Active</div>
                    ) : (
                        <div className="space-y-3">
                            <div className="p-2 bg-red-900/50 text-red-300 text-xs rounded-lg flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4"/>
                                <span>For demo only. Use a burner wallet.</span>
                            </div>
                            <Input
                                type="password"
                                placeholder="Enter Private Key for connected wallet"
                                value={privateKey}
                                onChange={(e) => setPrivateKey(e.target.value)}
                            />
                        </div>
                    )}
                </CardContent>
                {isConnected && !isAgentActive && (
                    <CardFooter>
                        <Button onClick={handleActivateAgent} disabled={isActivating || !privateKey} className="w-full electric-cyan-bg text-black font-bold">
                            {isActivating ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <Power className="w-4 h-4 mr-2"/>}
                            Verify & Activate
                        </Button>
                    </CardFooter>
                )}
            </Card>

          </div>
          <div className="lg:col-span-2 space-y-6">
            <Card className="glassmorphism-card">
              <CardHeader><CardTitle>Current Holdings</CardTitle></CardHeader>
              <CardContent>
                 <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                        <tr className="border-b border-gray-800/50">
                            <th className="text-left py-3 px-2 text-gray-400 font-medium">Token</th>
                            <th className="text-left py-3 px-2 text-gray-400 font-medium">Amount</th>
                            <th className="text-left py-3 px-2 text-gray-400 font-medium">Current Value</th>
                        </tr>
                        </thead>
                        <tbody>
                        {isLoading ? (
                            <tr><td colSpan={3}><Skeleton className="h-12 w-full"/></td></tr>
                        ) : !isConnected ? (
                            <tr><td colSpan={3} className="text-center py-10 text-gray-400">Connect wallet to view.</td></tr>
                        ) : error ? (
                            <tr><td colSpan={3} className="text-center py-10 text-red-400">Error: {error}</td></tr>
                        ) : holdings.length === 0 ? (
                            <tr><td colSpan={3} className="text-center py-10 text-gray-400">No holdings found.</td></tr>
                        ) : (
                            holdings.map((holding) => (
                            <tr key={holding.token} className="border-b border-gray-800/30">
                                <td className="py-4 px-2">{holding.token}</td>
                                <td className="py-4 px-2">{holding.amount}</td>
                                <td className="py-4 px-2">{holding.value}</td>
                            </tr>
                            ))
                        )}
                        </tbody>
                    </table>
                    </div>
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="glassmorphism-card">
                    <CardHeader><CardTitle>Total P&L</CardTitle></CardHeader>
                    <CardContent>
                        {isMetricsLoading ? <Skeleton className="h-8 w-24"/> : (
                           <div className={`text-2xl font-bold ${parseFloat(metrics?.totalPnl ?? '0') >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {parseFloat(metrics?.totalPnl ?? '0') >= 0 ? '+' : ''}{metrics?.totalPnl ?? '0.00'}
                            </div>
                        )}
                    </CardContent>
                </Card>
                <Card className="glassmorphism-card">
                    <CardHeader><CardTitle>Win Rate</CardTitle></CardHeader>
                    <CardContent>
                        {isMetricsLoading ? <Skeleton className="h-8 w-16"/> : (
                            <div className="text-2xl font-bold">{metrics?.winRate ?? '0'}%</div>
                        )}
                    </CardContent>
                </Card>
                <Card className="glassmorphism-card">
                    <CardHeader><CardTitle>Best Performing Star</CardTitle></CardHeader>
                    <CardContent>
                        {isMetricsLoading ? <Skeleton className="h-6 w-32"/> : (
                            <div className="text-lg font-mono">
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