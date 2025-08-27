"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { X, Loader2, Save, ArrowDown, ArrowUp } from "lucide-react"
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
}

export default function CommandCenter() {
  const [tradeSize, setTradeSize] = useState("0.01");
  const [isSaving, setIsSaving] = useState(false);
  
  // Get all necessary state and functions directly from the WalletContext
  const { 
    isConnected, 
    connectedWallet, 
    smartAccountAddress, 
    followedStars, 
    isFollowedLoading, 
    unfollowStar 
  } = useWallet();

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [isMetricsLoading, setIsMetricsLoading] = useState(true);

  // --- DATA FETCHING HOOKS ---

  // Effect for fetching user settings (trade size)
  useEffect(() => {
    const fetchSettings = async () => {
        if (isConnected && smartAccountAddress) {
            try {
                const response = await fetch(`/api/settings?userSmartAccount=${smartAccountAddress}`);
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
  }, [isConnected, smartAccountAddress]);

  // Effect for fetching portfolio balance
  useEffect(() => {
    const fetchPortfolio = async () => {
      if (isConnected && smartAccountAddress) {
        setIsLoading(true)
        setError(null)
        try {
          const response = await fetch('/api/portfolio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userSmartAccount: smartAccountAddress }),
          });
          const result = await response.json();
          if (response.ok && result.success) {
            const holdingsWithValue = result.balances.map((b: Holding) => ({...b, value: 'N/A'}));
            setHoldings(holdingsWithValue);
          } else {
            throw new Error(result.error || "Failed to fetch portfolio.");
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
          setError(errorMessage);
          showToast(errorMessage, "error");
        } finally {
          setIsLoading(false)
        }
      } else {
        setHoldings([]);
      }
    };
    fetchPortfolio();
  }, [isConnected, smartAccountAddress]);

  // Effect for fetching performance metrics
  useEffect(() => {
    const fetchMetrics = async () => {
        if (isConnected && smartAccountAddress) {
            setIsMetricsLoading(true);
            try {
                const response = await fetch(`/api/performance?userSmartAccount=${smartAccountAddress}`);
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
  }, [isConnected, smartAccountAddress]);

  // --- HANDLER FUNCTIONS ---

  const handleSaveSettings = async () => {
    if (!isConnected || !smartAccountAddress) {
        showToast("Please connect your wallet to save settings.", "error");
        return;
    }
    if (!tradeSize || parseFloat(tradeSize) <= 0) {
        showToast("Please enter a valid trade size.", "error");
        return;
    }
    setIsSaving(true);
    const loadingToastId = showToast("Saving settings...", "loading");
    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userSmartAccount: smartAccountAddress, tradeSize }),
        });
        const result = await response.json();
        if (response.ok && result.success) {
            showToast(result.message, "success", loadingToastId);
        } else {
            throw new Error(result.error || "Failed to save settings.");
        }
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
        showToast(errorMessage, "error", loadingToastId);
    } finally {
        setIsSaving(false);
    }
  };

  const handleUnfollow = async (targetWallet: string) => {
    // Directly call the function from the context
    await unfollowStar(targetWallet);
  };

  const handleDeposit = () => {
    if (smartAccountAddress) {
        navigator.clipboard.writeText(smartAccountAddress);
        showToast("Smart Account address copied! Send AVAX to this address to deposit.", "success");
    } else {
        showToast("Please connect your wallet first.", "error");
    }
  };

  const handleWithdraw = async () => {
    if (!isConnected || !smartAccountAddress || !connectedWallet) {
        showToast("Please connect your wallet first.", "error");
        return;
    }
    const loadingToastId = showToast("Initiating full withdrawal...", "loading");
    try {
        const response = await fetch('/api/withdraw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                userSmartAccount: smartAccountAddress,
                destinationAddress: connectedWallet
            }),
        });
        const result = await response.json();
        if (response.ok && result.success) {
            showToast(result.message, "success", loadingToastId);
        } else {
            throw new Error(result.error || "Failed to initiate withdrawal.");
        }
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
        showToast(errorMessage, "error", loadingToastId);
    }
  };

  const nativeTokenBalance = holdings.find(h => h.token === 'AVAX')?.amount || '0.00';

  return (
    <div className="min-h-screen stellalpha-bg text-white font-sans">
      <header className="flex items-center justify-end p-6 border-b border-gray-800">
        <WalletHeader />
      </header>
      <main className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <Card className="glassmorphism-card">
              <CardHeader>
                <CardTitle className="text-xl font-[family-name:var(--font-space-grotesk)] text-white">
                  Followed Stars
                </CardTitle>
              </CardHeader>
              <CardContent>
                 <div className="space-y-3">
                   {isFollowedLoading ? (
                     Array.from({ length: 3 }).map((_, index) => (
                         <Skeleton key={index} className="h-12 w-full rounded-lg bg-gray-900/50" />
                     ))
                   ) : !isConnected ? (
                     <p className="text-gray-400 text-sm text-center py-4">Connect your wallet to see followed stars.</p>
                   ) : followedStars.length === 0 ? (
                     <p className="text-gray-400 text-sm text-center py-4">You are not following any stars.</p>
                   ) : (
                     followedStars.map((address, index) => (
                       <div
                         key={index}
                         className="flex items-center justify-between p-3 rounded-lg bg-gray-900/30 border border-gray-800/50"
                       >
                         <span className="text-gray-300 font-mono text-sm">
                           {address.slice(0, 6)}...{address.slice(-4)}
                         </span>
                         <Button
                           variant="ghost"
                           size="sm"
                           className="h-6 w-6 p-0 text-gray-400 hover:text-red-400 hover:bg-red-400/10"
                           onClick={() => handleUnfollow(address)}
                         >
                           <X className="w-4 h-4" />
                         </Button>
                       </div>
                     ))
                   )}
                 </div>
              </CardContent>
            </Card>

            <Card className="glassmorphism-card">
              <CardHeader>
                <CardTitle className="text-xl font-[family-name:var(--font-space-grotesk)] text-white">
                  Set Trade Size
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">AVAX per trade</label>
                  <Input
                    type="number"
                    placeholder="0.01"
                    value={tradeSize}
                    onChange={(e) => setTradeSize(e.target.value)}
                    className="bg-gray-900/50 border-gray-600 text-white placeholder-gray-400 focus:electric-cyan-border focus:ring-1 focus:ring-[#00F6FF] transition-all duration-300"
                    disabled={!isConnected}
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button
                  onClick={handleSaveSettings}
                  disabled={!isConnected || isSaving}
                  className="w-full electric-cyan-bg text-black font-bold hover:electric-cyan-glow-intense transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Save Trade Size
                </Button>
              </CardFooter>
            </Card>

            <Card className="glassmorphism-card">
              <CardHeader>
                <CardTitle className="text-xl font-[family-name:var(--font-space-grotesk)] text-white">
                  Smart Account Balance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-white font-[family-name:var(--font-space-grotesk)]">
                    {isLoading ? <Loader2 className="w-8 h-8 mx-auto animate-spin" /> : `${nativeTokenBalance} AVAX`}
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button
                    onClick={handleDeposit}
                    disabled={!isConnected}
                    className="flex-1 electric-cyan-bg text-black font-bold hover:electric-cyan-glow-intense transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowDown className="w-4 h-4 mr-2"/>
                    Deposit
                  </Button>
                  <Button
                    onClick={handleWithdraw}
                    disabled={!isConnected}
                    variant="outline"
                    className="flex-1 border-gray-600 bg-transparent text-white hover:bg-gray-800/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowUp className="w-4 h-4 mr-2"/>
                    Withdraw All
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="lg:col-span-2 space-y-6">
            <Card className="glassmorphism-card">
                <CardHeader>
                    <CardTitle className="text-2xl font-[family-name:var(--font-space-grotesk)] text-white">
                    Current Holdings
                    </CardTitle>
                </CardHeader>
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
                            Array.from({ length: 4 }).map((_, index) => (
                            <tr key={index} className="border-b border-gray-800/30">
                                <td className="py-4 px-2">
                                <div className="flex items-center gap-3">
                                    <Skeleton className="w-8 h-8 rounded-full bg-gray-900/50" />
                                    <Skeleton className="h-4 w-20 bg-gray-900/50" />
                                </div>
                                </td>
                                <td className="py-4 px-2"><Skeleton className="h-4 w-24 bg-gray-900/50" /></td>
                                <td className="py-4 px-2"><Skeleton className="h-4 w-20 bg-gray-900/50" /></td>
                            </tr>
                            ))
                        ) : !isConnected ? (
                            <tr>
                            <td colSpan={3} className="text-center py-10 text-gray-400">
                                Please connect your wallet to view holdings.
                            </td>
                            </tr>
                        ) : error ? (
                            <tr>
                            <td colSpan={3} className="text-center py-10 text-red-400">
                                Error: {error}
                            </td>
                            </tr>
                        ) : holdings.length === 0 ? (
                            <tr>
                            <td colSpan={3} className="text-center py-10 text-gray-400">
                                No holdings found in this Smart Account.
                            </td>
                            </tr>
                        ) : (
                            holdings.map((holding, index) => (
                            <tr key={index} className="border-b border-gray-800/30 hover:bg-gray-900/20 transition-colors">
                                <td className="py-4 px-2">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-gray-700/50 border border-gray-600/50 flex items-center justify-center font-bold text-sm">
                                    {holding.token.charAt(0)}
                                    </div>
                                    <span className="text-white font-medium">{holding.token}</span>
                                </div>
                                </td>
                                <td className="py-4 px-2 text-gray-300">{holding.amount}</td>
                                <td className="py-4 px-2 text-white font-medium">{holding.value}</td>
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
                    <CardHeader>
                        <CardTitle className="text-lg font-[family-name:var(--font-space-grotesk)] text-white">
                        Total Profit & Loss (AVAX)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isMetricsLoading ? <Skeleton className="h-8 w-24 bg-gray-900/50" /> : (
                            <div className={`text-2xl font-bold font-[family-name:var(--font-space-grotesk)] ${parseFloat(metrics?.totalPnl ?? '0') >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {parseFloat(metrics?.totalPnl ?? '0') >= 0 ? '+' : ''}{metrics?.totalPnl ?? '0.00'}
                            </div>
                        )}
                    </CardContent>
                </Card>
                <Card className="glassmorphism-card">
                    <CardHeader>
                        <CardTitle className="text-lg font-[family-name:var(--font-space-grotesk)] text-white">
                        Win Rate
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isMetricsLoading ? <Skeleton className="h-8 w-16 bg-gray-900/50" /> : (
                            <div className="text-2xl font-bold text-white font-[family-name:var(--font-space-grotesk)]">
                                {metrics?.winRate ?? '0'}%
                            </div>
                        )}
                    </CardContent>
                </Card>
                <Card className="glassmorphism-card">
                    <CardHeader>
                        <CardTitle className="text-lg font-[family-name:var(--font-space-grotesk)] text-white">
                        Best Performing Star
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isMetricsLoading ? <Skeleton className="h-6 w-32 bg-gray-900/50" /> : (
                            <div className="text-lg font-bold text-white font-mono">
                                {/* This will be implemented in a future step */}
                                N/A
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
