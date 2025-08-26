"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { X } from "lucide-react"
import WalletHeader from "@/components/wallet-header"
import { useWallet } from "@/contexts/WalletContext"

export default function CommandCenter() {
  const [tradeSize, setTradeSize] = useState("")
  const [followedStars] = useState([
    "0x742d35Cc6634C0532925a3b8D404d3aaBf5b9884",
    "0x8ba1f109551bD432803012645Hac136c22C501e",
    "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
  ])
  const { isConnected } = useWallet()

  const holdingsData = [
    {
      token: "Ethereum",
      amount: "2.45 ETH",
      value: "$6,125.50",
    },
    {
      token: "PEPE",
      amount: "1,500,000 PEPE",
      value: "$1,875.25",
    },
    {
      token: "DOGE",
      amount: "5,000 DOGE",
      value: "$425.00",
    },
    {
      token: "SHIB",
      amount: "10,000,000 SHIB",
      value: "$89.50",
    },
  ]

  return (
    <div className="min-h-screen stellalpha-bg text-white font-sans">
      <header className="flex items-center justify-end p-6 border-b border-gray-800">
        <WalletHeader />
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Settings */}
          <div className="lg:col-span-1 space-y-6">
            {/* Followed Stars Card */}
            <Card className="glassmorphism-card">
              <CardHeader>
                <CardTitle className="text-xl font-[family-name:var(--font-space-grotesk)] text-white">
                  Followed Stars
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {followedStars.map((address, index) => (
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
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Set Trade Size Card */}
            <Card className="glassmorphism-card">
              <CardHeader>
                <CardTitle className="text-xl font-[family-name:var(--font-space-grotesk)] text-white">
                  Set Trade Size
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">ETH per trade</label>
                  <Input
                    type="number"
                    placeholder="0.01"
                    value={tradeSize}
                    onChange={(e) => setTradeSize(e.target.value)}
                    className="bg-gray-900/50 border-gray-600 text-white placeholder-gray-400 focus:electric-cyan-border focus:ring-1 focus:ring-[#00F6FF] transition-all duration-300"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Smart Account Card */}
            <Card className="glassmorphism-card">
              <CardHeader>
                <CardTitle className="text-xl font-[family-name:var(--font-space-grotesk)] text-white">
                  Smart Account Balance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-white font-[family-name:var(--font-space-grotesk)]">
                    1.25 ETH
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button
                    disabled={!isConnected}
                    className="flex-1 electric-cyan-bg text-black font-bold hover:electric-cyan-glow-intense transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Deposit
                  </Button>
                  <Button
                    disabled={!isConnected}
                    variant="outline"
                    className="flex-1 border-gray-600 bg-transparent text-white hover:bg-gray-800/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Withdraw
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Portfolio & Analytics */}
          <div className="lg:col-span-2 space-y-6">
            {/* Current Holdings Table */}
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
                      {holdingsData.map((holding, index) => (
                        <tr key={index} className="border-b border-gray-800/30 hover:bg-gray-900/20 transition-colors">
                          <td className="py-4 px-2">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gray-700/50 border border-gray-600/50"></div>
                              <span className="text-white font-medium">{holding.token}</span>
                            </div>
                          </td>
                          <td className="py-4 px-2 text-gray-300">{holding.amount}</td>
                          <td className="py-4 px-2 text-white font-medium">{holding.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Performance Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Total P&L Card */}
              <Card className="glassmorphism-card">
                <CardHeader>
                  <CardTitle className="text-lg font-[family-name:var(--font-space-grotesk)] text-white">
                    Total Profit & Loss
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-400 font-[family-name:var(--font-space-grotesk)]">
                    +$1,250.75
                  </div>
                </CardContent>
              </Card>

              {/* Win Rate Card */}
              <Card className="glassmorphism-card">
                <CardHeader>
                  <CardTitle className="text-lg font-[family-name:var(--font-space-grotesk)] text-white">
                    Win Rate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white font-[family-name:var(--font-space-grotesk)]">78%</div>
                </CardContent>
              </Card>

              {/* Best Performing Star Card */}
              <Card className="glassmorphism-card">
                <CardHeader>
                  <CardTitle className="text-lg font-[family-name:var(--font-space-grotesk)] text-white">
                    Best Performing Star
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-bold text-white font-mono">0xAbc...123</div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
