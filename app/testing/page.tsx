"use client"
import { showToast } from "@/components/toast"
import { Button } from "@/components/ui/button"
import { TestTube, CheckCircle, XCircle, Loader2, Wallet, User, RefreshCw } from "lucide-react"
import { useWallet } from "@/contexts/WalletContext"

export default function TestingPage() {
  const {
    isConnected,
    connectedWallet,
    isMetaMaskInstalled,
    handleConnectMetaMask,
    handleDisconnectWallet,
    handleChangeWallet,
  } = useWallet()

  const handleSuccessToast = () => {
    showToast("success", "Operation completed successfully!")
  }

  const handleErrorToast = () => {
    showToast("error", "Something went wrong. Please try again.")
  }

  const handleLoadingToast = () => {
    showToast("loading", "Processing your request...")
  }

  const testWalletConnect = async () => {
    if (!isConnected) {
      await handleConnectMetaMask()
    } else {
      showToast("success", "Wallet is already connected!")
    }
  }

  const testWalletDisconnect = () => {
    if (isConnected) {
      handleDisconnectWallet()
    } else {
      showToast("error", "No wallet connected to disconnect")
    }
  }

  const testWalletChange = async () => {
    if (isConnected) {
      await handleChangeWallet()
    } else {
      showToast("error", "Please connect a wallet first")
    }
  }

  return (
    <div className="min-h-screen text-white font-sans">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8 fade-in-delayed">
          <h1 className="text-4xl font-bold electric-cyan neon-text mb-2 font-[family-name:var(--font-space-grotesk)]">
            Testing Center
          </h1>
          <p className="text-gray-300 text-lg">Test various components and functionality</p>
        </div>

        {/* Toast Testing Section */}
        <div className="glass-card p-6 mb-8 floating-animation">
          <div className="flex items-center gap-3 mb-6">
            <TestTube className="w-6 h-6 electric-cyan pulse-glow" />
            <h2 className="text-xl font-semibold electric-cyan font-[family-name:var(--font-space-grotesk)]">
              Toast Notifications
            </h2>
          </div>

          <p className="text-gray-300 mb-6">Test different types of toast notifications</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              onClick={handleSuccessToast}
              className="glass-button bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 text-green-400 flex items-center gap-2 hover:electric-cyan-glow transition-all duration-300"
            >
              <CheckCircle className="w-4 h-4" />
              Success Toast
            </Button>

            <Button
              onClick={handleErrorToast}
              className="glass-button bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 flex items-center gap-2 hover:electric-cyan-glow transition-all duration-300"
            >
              <XCircle className="w-4 h-4" />
              Error Toast
            </Button>

            <Button
              onClick={handleLoadingToast}
              className="glass-button bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 electric-cyan flex items-center gap-2 hover:electric-cyan-glow transition-all duration-300"
            >
              <Loader2 className="w-4 h-4" />
              Loading Toast
            </Button>
          </div>
        </div>

        <div className="glass-card p-6 mb-8 slide-in-up">
          <div className="flex items-center gap-3 mb-6">
            <Wallet className="w-6 h-6 electric-cyan pulse-glow" />
            <h2 className="text-xl font-semibold electric-cyan font-[family-name:var(--font-space-grotesk)]">
              Wallet Integration
            </h2>
          </div>

          <p className="text-gray-300 mb-6">Test wallet connection functionality and global state</p>

          {/* Wallet Status Display */}
          <div className="glass-card p-4 mb-6">
            <h3 className="text-lg font-semibold electric-cyan mb-4">Current Wallet Status</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">MetaMask Installed:</span>
                <span className={isMetaMaskInstalled ? "text-green-400" : "text-red-400"}>
                  {isMetaMaskInstalled ? "Yes" : "No"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Connection Status:</span>
                <span className={isConnected ? "text-green-400" : "text-red-400"}>
                  {isConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Connected Address:</span>
                <span className="text-white font-mono">
                  {connectedWallet ? `${connectedWallet.slice(0, 6)}...${connectedWallet.slice(-4)}` : "None"}
                </span>
              </div>
            </div>
          </div>

          {/* Wallet Test Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              onClick={testWalletConnect}
              className="glass-button bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 flex items-center gap-2 hover:electric-cyan-glow transition-all duration-300"
            >
              <User className="w-4 h-4" />
              Test Connect
            </Button>

            <Button
              onClick={testWalletChange}
              className="glass-button bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 flex items-center gap-2 hover:electric-cyan-glow transition-all duration-300"
            >
              <RefreshCw className="w-4 h-4" />
              Test Change Wallet
            </Button>

            <Button
              onClick={testWalletDisconnect}
              className="glass-button bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 flex items-center gap-2 hover:electric-cyan-glow transition-all duration-300"
            >
              <XCircle className="w-4 h-4" />
              Test Disconnect
            </Button>
          </div>
        </div>

        {/* Placeholder for Future Tests */}
        <div className="glass-card p-6 fade-in-delayed">
          <h2 className="text-xl font-semibold electric-cyan mb-4 font-[family-name:var(--font-space-grotesk)]">
            Future Tests
          </h2>
          <p className="text-gray-300">Additional component tests will be added here...</p>
        </div>
      </div>
    </div>
  )
}
