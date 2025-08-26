"use client"

import { useState } from "react"
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

export default function StellaphaaDashboard() {
  const [address, setAddress] = useState("")
  const { isConnected, connectedWallet: userSmartAccount } = useWallet();

  const signalLogData = [
    {
      id: 1,
      type: "buy",
      action: "Bought 500 $PEPE",
      wallet: "0x742d35Cc6634C0532925a3b8D404d3aaBf5b9884",
      timestamp: "3m ago",
    },
    {
      id: 2,
      type: "sell",
      action: "Sold 1000 $DOGE",
      wallet: "0x8ba1f109551bD432803012645Hac136c22C501e",
      timestamp: "7m ago",
    },
    {
      id: 3,
      type: "buy",
      action: "Bought 250 $SHIB",
      wallet: "0x742d35Cc6634C0532925a3b8D404d3aaBf5b9884",
      timestamp: "12m ago",
    },
    {
      id: 4,
      type: "sell",
      action: "Sold 750 $LINK",
      wallet: "0x8ba1f109551bD432803012645Hac136c22C501e",
      timestamp: "25m ago",
    },
  ]

  const handleActivateAgent = async () => {
    if (!address || !userSmartAccount) {
      showToast("Please connect your wallet and enter an address to follow.", "error");
      return;
    }

    // Capture the loading toast ID
    const loadingToastId = showToast("Activating agent...", "loading");

    try {
      const response = await fetch('/api/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userSmartAccount: userSmartAccount,
          targetWallet: address,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        // Replace loading toast with success
        showToast(result.message || "Agent activated!", "success", loadingToastId);
        setAddress(""); // Clear input on success
      } else {
        // Replace loading toast with error
        showToast(result.error || "Failed to activate agent.", "error", loadingToastId);
      }
    } catch (error) {
      console.error("Activation Error:", error);
      // Replace loading toast with error
      showToast((error as Error).message, "error", loadingToastId);
    }
  };

  return (
    <div className="min-h-screen stellalpha-bg text-white font-sans">
      <header className="flex items-center justify-between p-6 border-b border-gray-800">
        <div></div>
        <WalletHeader />
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto p-6 space-y-8">
        {/* Control Panel Card */}
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
                placeholder="Paste Ethereum address (0x...)"
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

        {/* Signal Log Card */}
        <Card className="glassmorphism-card">
          <CardHeader>
            <CardTitle className="text-2xl font-[family-name:var(--font-space-grotesk)] text-white">
              Signal Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {signalLogData.map((signal) => (
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
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-sm">{signal.timestamp}</span>
                    <ExternalLink className="w-4 h-4 text-gray-500" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
