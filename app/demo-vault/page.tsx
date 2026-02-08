'use client';

import PageLoader from '@/components/PageLoader';
import { useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useAppKitAccount } from '@reown/appkit/react';
import { useAuth } from '@/contexts/auth-context';
import { COLORS } from '@/lib/theme';
import { 
  Wallet, 
  TrendingUp, 
  RefreshCw, 
  Clock,
  AlertCircle,
  Pause,
  StopCircle,
  DollarSign,
  LogIn,
  Loader2,
  Crown,
  ExternalLink,
  Info,
  X,
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface Position {
  token_mint: string;
  token_symbol: string;
  size: number;
  cost_usd: number;
}

interface TraderState {
  id: string;
  star_trader: string;
  allocated_usd: number;
  realized_pnl_usd: number;
  is_syncing: boolean;
  is_initialized: boolean;
  is_paused: boolean;
  is_settled: boolean;
  positions: Position[];
  totalValue: number;
  positionCount: number;
}

interface TradeStats {
  completedCount: number;
  failedCount: number;
  totalRealizedPnl: number;
  profitableCount?: number;
  lossCount?: number;
  profitFactor?: number;
}

interface DemoVault {
  id: string;
  user_wallet: string;
  balance_usd: number;
}

function formatUsd(amount: number): string {
  if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(2) + 'M';
  if (amount >= 1000) return '$' + (amount / 1000).toFixed(2) + 'K';
  return '$' + amount.toFixed(2);
}

// Generate volatile sparkline based on PnL direction with seeded randomness
function generateSparklineFromPnl(pnl: number, allocatedUsd: number, seed: string) {
  const data = [];
  const steps = 14;
  
  // Create seeded random from trader address to keep consistent
  let seedNum = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const seededRandom = () => {
    seedNum = (seedNum * 9301 + 49297) % 233280;
    return seedNum / 233280;
  };
  
  const isPositive = pnl >= 0;
  let value = 50; // Start at middle
  
  for (let i = 0; i <= steps; i++) {
    // Add volatile movements
    const volatility = 8 + seededRandom() * 12; // 8-20% swings
    const trend = isPositive ? 0.15 : -0.15; // Slight bias
    const change = (seededRandom() - 0.5 + trend) * volatility;
    
    value = Math.max(10, Math.min(90, value + change));
    data.push({ value });
  }
  
  // Ensure end matches overall direction
  const lastIdx = data.length - 1;
  if (isPositive && data[lastIdx].value < data[0].value + 5) {
    data[lastIdx].value = data[0].value + 15 + seededRandom() * 20;
  } else if (!isPositive && data[lastIdx].value > data[0].value - 5) {
    data[lastIdx].value = data[0].value - 15 - seededRandom() * 20;
  }
  
  return data;
}

// Sparkline with area glow effect
function Sparkline({ data, isPositive, id }: { data: { value: number }[]; isPositive: boolean; id: string }) {
  const color = isPositive ? '#10B981' : '#EF4444';
  const gradientId = `gradient-${id}`;
  
  // Find min/max for proper scaling
  const values = data.map(d => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  
  // Scale data to 0-100 range
  const scaledData = data.map(d => ({
    value: ((d.value - minVal) / range) * 80 + 10 // 10-90 range
  }));
  
  // Create SVG path
  const width = 80;
  const height = 28;
  const points = scaledData.map((d, i) => ({
    x: (i / (scaledData.length - 1)) * width,
    y: height - (d.value / 100) * height
  }));
  
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  
  return (
    <div className="w-20 h-7">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Area fill with gradient */}
        <path d={areaPath} fill={`url(#${gradientId})`} />
        {/* Line with glow */}
        <path 
          d={linePath} 
          fill="none" 
          stroke={color} 
          strokeWidth="1.5"
          style={{ filter: `drop-shadow(0 0 2px ${color})` }}
        />
      </svg>
    </div>
  );
}


function TraderAvatar({ address, image }: { address: string; image?: string }) {
  const hue = address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
  const bgColor = `hsl(${hue}, 50%, 30%)`;
  
  if (image) {
    return (
      <img 
        src={image} 
        alt={address}
        className="w-8 h-8 rounded-full object-cover shrink-0"
        style={{ border: '1px solid rgba(255,255,255,0.1)' }}
      />
    );
  }

  return (
    <div 
      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
      style={{ backgroundColor: bgColor, color: '#fff' }}
    >
      {address.slice(0, 2).toUpperCase()}
    </div>
  );
}

// Info Tooltip Component
function InfoTooltip({ children }: { children: ReactNode }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  const updateTooltipPosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const tooltipWidth = 256; // w-64 = 16rem = 256px
      let left = rect.left + rect.width / 2;
      
      // Clamp to viewport edges
      const minLeft = tooltipWidth / 2 + 8;
      const maxLeft = window.innerWidth - tooltipWidth / 2 - 8;
      left = Math.max(minLeft, Math.min(maxLeft, left));
      
      setTooltipPosition({
        top: rect.bottom + 10,
        left
      });
    }
  };
  
  const handleMouseEnter = () => {
    updateTooltipPosition();
    setShowTooltip(true);
  };
  
  useEffect(() => {
    if (showTooltip) {
      updateTooltipPosition();
      const handleScroll = () => updateTooltipPosition();
      const handleResize = () => updateTooltipPosition();
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleResize);
      };
    }
  }, [showTooltip]);
  
  return (
    <>
      <div className="relative inline-flex items-center">
        <button
          ref={buttonRef}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={() => setShowTooltip(false)}
          className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-white/20 hover:bg-white/5 transition-colors"
          style={{ color: COLORS.data }}
          type="button"
        >
          <Info size={12} />
        </button>
      </div>
      {showTooltip && typeof window !== 'undefined' && createPortal(
        <div 
          className="fixed w-64 p-3 rounded border shadow-lg pointer-events-auto"
          style={{ 
            backgroundColor: COLORS.surface, 
            borderColor: COLORS.structure,
            zIndex: 99999,
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            transform: 'translate(-50%, 0)',
            marginTop: '8px'
          }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <div className="text-xs leading-relaxed" style={{ color: COLORS.text }}>
            {children}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// Alert Bubble Component for Non-Active States
function StatusAlertBubble({ 
  status, 
  onClose 
}: { 
  status: 'paused' | 'uninitialized' | 'stopped'; 
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const config = {
    uninitialized: {
      color: '#F97316', // Orange-500
      bg: '#FFF7ED',    // Orange-50
      border: '#FDBA74', // Orange-300
      title: 'Action Required',
      text: 'This trader state is created but not running. Click "View" then "Initialize" to start copying trades.'
    },
    paused: {
      color: '#EAB308', // Yellow-500
      bg: '#FEFCE8',    // Yellow-50
      border: '#FDE047', // Yellow-300
      title: 'Copying Paused',
      text: 'New trades are not being copied. Existing positions remain open. Click "View" to resume.'
    },
    stopped: {
      color: '#EF4444', // Red-500
      bg: '#FEF2F2',    // Red-50
      border: '#FCA5A5', // Red-300
      title: 'State Stopped',
      text: 'This state is fully stopped. Please withdraw any remaining funds to your main vault.'
    }
  };

  const style = config[status];

  return (
    <div 
      className="absolute z-50 flex items-start px-3 py-2 rounded-lg shadow-xl animate-in fade-in zoom-in slide-in-from-bottom-2 duration-300"
      style={{ 
        backgroundColor: COLORS.surface,
        border: `1px solid ${style.color}`,
        color: COLORS.text,
        right: '100%', // Position to the LEFT of the element
        marginRight: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: '260px', // Wider for more info
        boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
        zIndex: 100
      }}
    >
      {/* Triangle pointer (Right side pointing to element) */}
      <div 
        className="absolute w-3 h-3 border-r border-t transform rotate-45"
        style={{ 
          backgroundColor: COLORS.surface,
          borderColor: style.color,
          borderLeft: 'transparent',
          borderBottom: 'transparent',
          right: '-7px', // On the right edge
          top: '50%',
          marginTop: '-6px'
        }}
      />
      
      <div className="flex-1 mr-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: style.color }}>
          {style.title}
        </h4>
        <p className="text-[10px] leading-relaxed opacity-90 w-full font-medium">
          {style.text}
        </p>
      </div>
      
      <button 
        onClick={(e) => { e.stopPropagation(); setVisible(false); onClose(); }}
        className="p-1 hover:bg-black/5 rounded transition-colors -mr-1 -mt-1 shrink-0"
        style={{ color: style.color }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

export default function DemoVaultPage() {
  const { isConnected } = useAppKitAccount();
  const { isAuthenticated, isLoading: authLoading, user, signIn, openWalletModal } = useAuth();
  const [vault, setVault] = useState<DemoVault | null>(null);
  const [traderStates, setTraderStates] = useState<TraderState[]>([]);
  const [tradeStats, setTradeStats] = useState<Record<string, TradeStats>>({});
  const [starTraders, setStarTraders] = useState<{ address: string; name: string; image?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasCheckedVault, setHasCheckedVault] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [following, setFollowing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFollowModal, setShowFollowModal] = useState(false);
  const [selectedTrader, setSelectedTrader] = useState<string | null>(null);
  const [allocationUsd, setAllocationUsd] = useState(500);
  
  const walletAddress = user?.wallet || null;
  
  const fetchVault = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/demo-vault?wallet=${walletAddress}`);
      const data = await response.json();
      if (data.exists) {
        setVault(data.vault);
        setTraderStates(data.traderStates || []);
        
        // Fetch trade stats for each trader state
        const statsPromises = (data.traderStates || []).map(async (ts: TraderState) => {
          try {
            const statsRes = await fetch(`/api/demo-vault/trades?wallet=${walletAddress}&traderStateId=${ts.id}&pageSize=1`);
            const statsData = await statsRes.json();
            return { id: ts.id, stats: statsData.stats };
          } catch {
            return { id: ts.id, stats: { completedCount: 0, failedCount: 0, totalRealizedPnl: 0 } };
          }
        });
        
        const statsResults = await Promise.all(statsPromises);
        const statsMap: Record<string, TradeStats> = {};
        statsResults.forEach(r => { statsMap[r.id] = r.stats; });
        setTradeStats(statsMap);
      } else {
        setVault(null);
        setTraderStates([]);
        setTradeStats({});
      }
    } catch {
      setError('Failed to fetch vault');
    } finally {
      setLoading(false);
      setHasCheckedVault(true);
    }
  }, [walletAddress]);
  
  const fetchStarTraders = useCallback(async () => {
    try {
      const response = await fetch('/api/star-traders');
      const data = await response.json();
      setStarTraders((data.traders || []).map((t: any) => ({ address: t.wallet, name: t.name, image: t.image, })));
    } catch {
      console.error('Failed to fetch star traders');
    }
  }, []);
  
  // Handle ?follow= query param from star-traders page (client-side only)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const followParam = params.get('follow');
    
    if (followParam && starTraders.length > 0 && vault) {
      // Check if we're not already following this trader
      const alreadyFollowing = traderStates.some(ts => ts.star_trader === followParam);
      if (!alreadyFollowing) {
        const availableBalance = Number(vault?.balance_usd || 0);
        setSelectedTrader(followParam);
        setShowFollowModal(true);
        setAllocationUsd(Math.min(500, availableBalance));
        // Clear the URL param after handling
        window.history.replaceState({}, '', '/demo-vault');
      }
    }
  }, [starTraders, vault, traderStates]);
  
  useEffect(() => {
    if (isConnected && walletAddress) {
      fetchVault();
      fetchStarTraders();
    }
  }, [isConnected, walletAddress, fetchVault, fetchStarTraders]);
  
  const deployVault = async () => {
    if (!walletAddress) return;
    setDeploying(true);
    setError(null);
    try {
      const response = await fetch('/api/demo-vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress })
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        await fetchVault();
      }
    } catch {
      setError('Failed to deploy vault');
    } finally {
      setDeploying(false);
    }
  };
  
  const followTrader = async () => {
    if (!walletAddress || !selectedTrader) return;
    setFollowing(true);
    setError(null);
    try {
      const response = await fetch('/api/demo-vault/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress, starTrader: selectedTrader, allocationUsd })
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setShowFollowModal(false);
        setSelectedTrader(null);
        await fetchVault();
      }
    } catch {
      setError('Failed to create trader state');
    } finally {
      setFollowing(false);
    }
  };
  
  const deleteVault = async () => {
    if (!walletAddress || !confirm('Delete entire demo vault?')) return;
    try {
      await fetch(`/api/demo-vault?wallet=${walletAddress}`, { method: 'DELETE' });
      setVault(null);
      setTraderStates([]);
      setTradeStats({});
    } catch {
      setError('Failed to delete vault');
    }
  };
  
  const unallocated = Number(vault?.balance_usd || 0);
  const totalAllocated = traderStates.reduce((sum, ts) => sum + Number(ts.allocated_usd || 0), 0);
  const totalValue = traderStates.reduce((sum, ts) => sum + Number(ts.totalValue || 0), 0);
  const totalPnl = totalValue - totalAllocated;

  const rankedTraderStates = useMemo(() => {
    return [...traderStates].sort((a, b) => {
      const allocatedA = Number(a.allocated_usd) || 1; // Avoid div by zero
      const allocatedB = Number(b.allocated_usd) || 1;
      
      const roiA = ((a.totalValue - Number(a.allocated_usd)) / allocatedA) * 100;
      const roiB = ((b.totalValue - Number(b.allocated_usd)) / allocatedB) * 100;
      
      return roiB - roiA; // Sort by ROI descending
    });
  }, [traderStates]);
  
  return (
    <div className="min-h-screen animate-in fade-in duration-700" style={{ backgroundColor: COLORS.canvas, color: COLORS.text, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style jsx global>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-up {
          animation: fadeUp 0.5s ease-out forwards;
        }
        .delay-100 { animation-delay: 100ms; }
        .delay-200 { animation-delay: 200ms; }
        .delay-300 { animation-delay: 300ms; }
      `}</style>
      <main className="w-full px-5 py-4 pt-24">
        
        {/* Not Connected */}
        {!isConnected && (
          <div className="border border-white/10 p-10 text-center animate-fade-up" style={{ backgroundColor: COLORS.surface }}>
            <Wallet size={44} className="mx-auto mb-4" style={{ color: COLORS.brand }} />
            <h2 className="text-xl font-medium mb-3">Connect Your Wallet</h2>
            <p className="text-sm mb-5 leading-relaxed" style={{ color: COLORS.data }}>Connect your Solana wallet to create a demo vault with $1,000 virtual USD</p>
            <button
              onClick={openWalletModal}
              className="px-6 py-2.5 text-sm font-medium transition-all duration-200 hover:opacity-90 hover:scale-105 active:scale-95 flex items-center gap-2 mx-auto rounded shadow-lg shadow-emerald-500/20"
              style={{ backgroundColor: COLORS.brand, color: '#000' }}
            >
              <Wallet size={16} />
              Connect Wallet
            </button>
          </div>
        )}
        
        {/* Connected but Not Authenticated */}
        {isConnected && !isAuthenticated && !authLoading && (
          <div className="border border-white/10 p-10 text-center animate-fade-up" style={{ backgroundColor: COLORS.surface }}>
            <LogIn size={44} className="mx-auto mb-4" style={{ color: COLORS.brand }} />
            <h2 className="text-xl font-medium mb-3">Sign In Required</h2>
            <p className="text-sm mb-5 leading-relaxed" style={{ color: COLORS.data }}>
              Sign a message with your wallet to verify ownership.
            </p>
            <button
              onClick={signIn}
              disabled={authLoading}
              className="px-6 py-2.5 text-sm font-medium transition-all duration-200 hover:opacity-90 hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-2 mx-auto rounded shadow-lg shadow-emerald-500/20"
              style={{ backgroundColor: COLORS.brand, color: '#000' }}
            >
              {authLoading ? <Loader2 className="animate-spin" size={16} /> : <LogIn size={16} />}
              Sign In with Wallet
            </button>
          </div>
        )}
        
        {/* Auth Loading */}
        {isConnected && authLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={28} className="animate-spin" style={{ color: COLORS.brand }} />
              <span className="text-sm" style={{ color: COLORS.data }}>Verifying wallet ownership...</span>
            </div>
          </div>
        )}
        
        {/* No Vault */}
        {isConnected && isAuthenticated && !vault && !loading && hasCheckedVault && (
          <div className="max-w-4xl mx-auto animate-fade-up">
            <div className="border border-white/10 overflow-hidden" style={{ backgroundColor: COLORS.surface }}>
              {/* Hero Section */}
              <div className="p-8 sm:p-12 text-center border-b border-white/10 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none" 
                  style={{ background: `radial-gradient(circle at center, ${COLORS.brand} 0%, transparent 70%)` }} 
                />
                <TrendingUp size={48} className="mx-auto mb-6 relative z-10" style={{ color: COLORS.brand }} />
                <h2 className="text-2xl sm:text-3xl font-medium mb-4 relative z-10">Start Your Risk-Free Trading Journey</h2>
                <p className="text-sm sm:text-base leading-relaxed max-w-2xl mx-auto relative z-10" style={{ color: COLORS.data }}>
                  Experience the power of automated copy-trading with a virtual portfolio. 
                  Test strategies and follow top performers without risking real capital.
                </p>
              </div>

              {/* Features Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/10">
                <div className="p-6 text-center hover:bg-white/[0.04] transition-colors duration-300 group">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4 bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform duration-300">
                    <DollarSign size={20} />
                  </div>
                  <h3 className="font-medium mb-2" style={{ color: COLORS.text }}>$1,000 Virtual Balance</h3>
                  <p className="text-xs leading-relaxed" style={{ color: COLORS.data }}>
                    Start with a pre-funded virtual wallet to allocate across multiple traders.
                  </p>
                </div>
                
                <div className="p-6 text-center hover:bg-white/[0.04] transition-colors duration-300 group">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4 bg-orange-500/10 text-orange-400 group-hover:scale-110 transition-transform duration-300">
                    <Crown size={20} />
                  </div>
                  <h3 className="font-medium mb-2" style={{ color: COLORS.text }}>Copy Top Traders</h3>
                  <p className="text-xs leading-relaxed" style={{ color: COLORS.data }}>
                    Automatically mirror the moves of successful star traders in real-time.
                  </p>
                </div>

                <div className="p-6 text-center hover:bg-white/[0.04] transition-colors duration-300 group">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4 bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform duration-300">
                    <TrendingUp size={20} />
                  </div>
                  <h3 className="font-medium mb-2" style={{ color: COLORS.text }}>Real-Time Analytics</h3>
                  <p className="text-xs leading-relaxed" style={{ color: COLORS.data }}>
                    Track your PnL, ROI, and win rates in a completely isolated environment.
                  </p>
                </div>
              </div>

              {/* Action Area */}
              <div className="p-8 text-center bg-white/[0.02]">
                <button
                  onClick={deployVault}
                  disabled={deploying}
                  className="px-8 py-3 text-sm font-semibold transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 rounded shadow-lg shadow-emerald-500/20"
                  style={{ backgroundColor: COLORS.brand, color: '#000' }}
                >
                  {deploying ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      Initializing Vault...
                    </span>
                  ) : (
                    'Deploy Demo Vault & Start Trading'
                  )}
                </button>
                <p className="mt-4 text-xs" style={{ color: COLORS.data }}>
                  Takes less than 10 seconds • No gas fees • No real funds required
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Loading */}
        {(loading || (isConnected && isAuthenticated && !hasCheckedVault)) && (
          <PageLoader />
        )}
        
        {/* Error */}
        {error && (
          <div className="border border-red-500/50 px-4 py-3 mb-3 flex items-center gap-3 text-sm text-red-400 bg-red-500/10">
            <AlertCircle size={18} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-lg">×</button>
          </div>
        )}
        
        {/* ===== VAULT DASHBOARD ===== */}
        {isConnected && isAuthenticated && vault && (
          <>
            {/* Stats HUD - Responsive */}
            <div className="border border-white/10 mb-3 grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/10 animate-fade-up" style={{ backgroundColor: COLORS.surface }}>
              <div className="px-4 sm:px-6 py-3 sm:py-4 bg-white/[0.03] border-b border-white/10 sm:border-b-0 transition-colors duration-300 hover:bg-white/[0.06]">
                <div className="text-[10px] sm:text-xs uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: COLORS.data }}>
                  Unallocated
                  <InfoTooltip>
                    <strong>Unallocated</strong> is your available demo vault balance not yet assigned to any trader state.<br/><br/>
                    Use "Create Trader State" to allocate these funds to follow a star trader.
                  </InfoTooltip>
                </div>
                <div className="text-base sm:text-lg font-mono font-semibold" style={{ color: COLORS.text }}>{formatUsd(unallocated)}</div>
              </div>
              <div className="px-4 sm:px-6 py-3 sm:py-4 bg-white/[0.03] border-b border-white/10 sm:border-b-0 transition-colors duration-300 hover:bg-white/[0.06]">
                <div className="text-[10px] sm:text-xs uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: COLORS.data }}>
                  Allocated
                  <InfoTooltip>
                    <strong>Allocated</strong> is the total amount distributed across all your trader states.<br/><br/>
                    Each trader state receives a portion that is used to copy trades from the star trader you're following.
                  </InfoTooltip>
                </div>
                <div className="text-base sm:text-lg font-mono font-semibold" style={{ color: COLORS.text }}>{formatUsd(totalAllocated)}</div>
              </div>
              <div className="px-4 sm:px-6 py-3 sm:py-4 bg-white/[0.03] transition-colors duration-300 hover:bg-white/[0.06]">
                <div className="text-[10px] sm:text-xs uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: COLORS.data }}>
                  Total Value
                  <InfoTooltip>
                    <strong>Total Value</strong> is the current worth of your entire demo vault.<br/><br/>
                    = Unallocated + Current portfolio value of all trader states (including unrealized gains/losses)
                  </InfoTooltip>
                </div>
                <div className="text-base sm:text-lg font-mono font-semibold" style={{ color: COLORS.text }}>{formatUsd(totalValue + unallocated)}</div>
              </div>
              <div className="px-4 sm:px-6 py-3 sm:py-4 bg-white/[0.03] transition-colors duration-300 hover:bg-white/[0.06]">
                <div className="text-[10px] sm:text-xs uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: COLORS.data }}>
                  PNL
                  <InfoTooltip>
                    <strong>PNL (Profit/Loss)</strong> shows how much you've gained or lost across all trader states.<br/><br/>
                    Green = profit, Red = loss. This includes both realized (closed) and unrealized (open) positions.
                  </InfoTooltip>
                </div>
                <div className={`text-base sm:text-lg font-mono font-semibold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {totalPnl >= 0 ? '+' : ''}{formatUsd(totalPnl)}
                </div>
              </div>
            </div>

            {/* Description + Action Bar - Responsive */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-3 py-3 px-4 sm:px-5 border border-white/10 animate-fade-up delay-100" style={{ backgroundColor: COLORS.surface }}>
              <p className="text-xs sm:text-sm leading-relaxed hidden sm:block" style={{ color: COLORS.data }}>
                <span className="font-medium" style={{ color: COLORS.text }}>Demo Vault</span> · Autonomous copy-trading in a risk-free environment.
              </p>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setShowFollowModal(true); setAllocationUsd(Math.min(500, unallocated)); }}
                    disabled={unallocated < 10}
                    className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium flex items-center gap-2 transition-all duration-200 hover:opacity-90 hover:scale-105 active:scale-95 disabled:opacity-50 rounded shadow-lg shadow-emerald-500/20"
                    style={{ backgroundColor: COLORS.brand, color: '#000' }}
                  >
                    <span className="hidden sm:inline">Create</span> Trader State
                  </button>
                  <InfoTooltip>
                    <strong>Create Trader State</strong> allocates a portion of your demo vault funds to follow a star trader.<br/><br/>
                    • Each trader state has <strong>isolated funds</strong> - losses in one don't affect others<br/>
                    • Set your allocation amount (min $10)<br/>
                    • Once created, trades are automatically copied from the star trader
                  </InfoTooltip>
                </div>
                <button
                  onClick={fetchVault}
                  className="group px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium flex items-center gap-2 border border-white/20 hover:bg-white/5 rounded transition-all duration-200 active:scale-[0.98]"
                  style={{ color: COLORS.text }}
                >
                  <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" /> <span className="hidden sm:inline">Refresh</span>
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={deleteVault}
                    className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium flex items-center gap-2 border border-red-500/50 text-red-400 hover:bg-red-500/10 rounded transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <span className="hidden sm:inline">Delete</span> Vault
                  </button>
                  <InfoTooltip>
                    <strong>Delete Vault</strong> permanently removes your entire demo vault.<br/><br/>
                    ⚠️ <strong>Warning:</strong> This action cannot be undone!<br/>
                    • All trader states will be deleted<br/>
                    • All allocation history will be lost<br/>
                    • You can create a new vault anytime
                  </InfoTooltip>
                </div>
              </div>
            </div>

            {/* Trader States Table - Responsive with horizontal scroll */}
            <div className="border border-white/10 overflow-hidden animate-fade-up delay-200" style={{ backgroundColor: COLORS.surface }}>
              <div className="px-4 sm:px-5 py-3 border-b border-white/10 bg-white/[0.02]">
                <h2 className="text-sm font-medium" style={{ color: COLORS.text }}>Trader States</h2>
              </div>
              
              {/* Horizontal scroll container for table */}
              <div className="overflow-x-auto">
                {/* Table Header */}
                <div className="grid grid-cols-[50px_1fr_1.4fr_0.7fr_0.7fr_0.6fr_0.7fr_0.6fr_100px] gap-3 px-4 sm:px-5 py-2.5 text-[10px] sm:text-xs uppercase tracking-wider border-b border-white/10 font-mono bg-white/[0.04] min-w-[900px]" style={{ color: COLORS.data }}>
                  <div className="flex items-center gap-1">
                    Rank
                    <InfoTooltip>
                       <strong>ROI Ranking</strong><br/><br/>
                       Traders are ranked by their <strong>Return on Investment (ROI)</strong>.<br/><br/>
                       This levels the playing field, showing who is most efficient with their allocated capital, regardless of position size.
                    </InfoTooltip>
                  </div>
                  <div>Star Trader</div>
                  <div className="flex items-center gap-1">
                    PnL (7D)
                    <InfoTooltip>
                       <strong>7-Day PnL</strong><br/><br/>
                       Net profit or loss generated by this trader in the last week.
                    </InfoTooltip>
                  </div>
                  <div className="flex items-center gap-1">
                    ROI (Total)
                    <InfoTooltip>
                       <strong>Total ROI</strong><br/><br/>
                       (Current Value - Allocated) / Allocated<br/><br/>
                       The percentage return on your initial investment since you started following this trader.
                    </InfoTooltip>
                  </div>
                  <div className="flex items-center gap-1">
                    Profit Factor
                    <InfoTooltip>
                       <strong>Profit Factor</strong><br/><br/>
                       Industry standard efficiency metric: (Gross Profit / Gross Loss).<br/><br/>
                       &gt; 1.0 means profitable. Higher is better.
                    </InfoTooltip>
                  </div>
                  <div className="flex items-center gap-1">
                    Trades
                    <InfoTooltip>
                       <strong>Total Trades</strong><br/><br/>
                       Number of buy/sell execution cycles completed by this trader state.
                    </InfoTooltip>
                  </div>
                  <div className="flex items-center gap-1">
                    Allocated
                    <InfoTooltip>
                       <strong>Allocated Capital</strong><br/><br/>
                       The amount of virtual USD you have assigned to this trader to use for copy-trading.
                    </InfoTooltip>
                  </div>
                  <div className="flex items-center gap-1">
                    Status
                    <InfoTooltip>
                      <strong>Trader State Status:</strong><br/><br/>
                      🟢 <strong>Active</strong> - Copy trading is running. New trades will be automatically copied.<br/><br/>
                      ⏸️ <strong>Paused</strong> - Temporarily stopped. No new trades copied, but positions remain.<br/><br/>
                      🟠 <strong>Uninitialized</strong> - Pending setup. You need to initialize the vault to start copy trading.<br/><br/>
                      🔴 <strong>Stopped</strong> - Fully stopped. Use withdraw to reclaim funds.
                    </InfoTooltip>
                  </div>
                  <div></div>
                </div>
              
              {/* Table Rows */}
              <div className="divide-y divide-white/5">
                {rankedTraderStates.length === 0 ? (
                  <div className="p-8 sm:p-12 text-center" style={{ color: COLORS.data }}>
                    <div className="max-w-3xl mx-auto">
                      <div className="mb-8">
                        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 bg-white/[0.03] border border-white/10">
                          <Crown size={32} style={{ color: COLORS.brand }} />
                        </div>
                        <h3 className="text-xl font-medium mb-3" style={{ color: COLORS.text }}>Start Copy Trading</h3>
                        <p className="text-sm leading-relaxed max-w-lg mx-auto">
                          You haven't created any trader states yet. Allocate funds to follow a star trader and automatically mirror their trades.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                        <div className="p-4 rounded border border-white/5 bg-white/[0.02]">
                          <div className="text-xs uppercase tracking-wider mb-2 font-medium" style={{ color: COLORS.brand }}>Step 1</div>
                          <div className="text-sm font-medium mb-1" style={{ color: COLORS.text }}>Browse Traders</div>
                          <div className="text-xs" style={{ color: COLORS.data }}>Find top performers suited to your style</div>
                        </div>
                        <div className="p-4 rounded border border-white/5 bg-white/[0.02]">
                          <div className="text-xs uppercase tracking-wider mb-2 font-medium" style={{ color: COLORS.brand }}>Step 2</div>
                          <div className="text-sm font-medium mb-1" style={{ color: COLORS.text }}>Allocate Funds</div>
                          <div className="text-xs" style={{ color: COLORS.data }}>Set your investment amount (min $10)</div>
                        </div>
                        <div className="p-4 rounded border border-white/5 bg-white/[0.02]">
                          <div className="text-xs uppercase tracking-wider mb-2 font-medium" style={{ color: COLORS.brand }}>Step 3</div>
                          <div className="text-sm font-medium mb-1" style={{ color: COLORS.text }}>Monitor Results</div>
                          <div className="text-xs" style={{ color: COLORS.data }}>Track PnL and manage your positions</div>
                        </div>
                      </div>

                      <button
                        onClick={() => { setShowFollowModal(true); setAllocationUsd(Math.min(500, unallocated)); }}
                        className="px-6 py-2.5 text-sm font-medium transition-transform hover:scale-105 active:scale-95 rounded shadow-lg shadow-emerald-500/10"
                        style={{ backgroundColor: COLORS.brand, color: '#000' }}
                      >
                        Create First Trader State
                      </button>
                    </div>
                  </div>
                ) : (
                  rankedTraderStates.map((ts, index) => {
                    const rank = index + 1;
                    const pnl = ts.totalValue - Number(ts.allocated_usd);
                    const pnlPercent = ts.allocated_usd > 0 ? (pnl / ts.allocated_usd) * 100 : 0;
                    const isPositive = pnl >= 0;
                    const sparklineData = generateSparklineFromPnl(pnl, Number(ts.allocated_usd), ts.star_trader);
                    
                    // Get real trade stats
                    const stats = tradeStats[ts.id] || { completedCount: 0, failedCount: 0, totalRealizedPnl: 0, profitableCount: 0, lossCount: 0 };
                    
                    // Profit Factor provided by API or default to 0
                    const profitFactor = stats.profitFactor ?? 0;
                    const totalTrades = stats.completedCount + stats.failedCount;
                    const roi = ts.allocated_usd > 0 ? (pnl / Number(ts.allocated_usd)) * 100 : 0;
                    
                    return (
                      <div 
                        key={ts.id} 
                        className={`grid grid-cols-[50px_1fr_1.4fr_0.7fr_0.7fr_0.6fr_0.7fr_0.6fr_100px] gap-3 px-4 sm:px-5 py-3 items-center hover:bg-white/[0.04] transition-colors min-w-[900px] ${index % 2 === 1 ? 'bg-white/[0.02]' : ''}`}
                      >
                        {/* Rank */}
                        <div className="flex items-center gap-1 font-mono text-sm">
                          {rank === 1 ? (
                            <Crown size={16} className="text-yellow-400" />
                          ) : (
                            <span style={{ color: COLORS.data }}>#{rank}</span>
                          )}
                        </div>
                        
                        {/* Star Trader */}
                        <div className="flex items-center gap-3">
                          <TraderAvatar 
                            address={ts.star_trader} 
                            image={starTraders.find(t => t.address === ts.star_trader)?.image}
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-sm truncate" style={{ color: COLORS.text }}>
                              {starTraders.find(t => t.address === ts.star_trader)?.name || 'Unknown Trader'}
                            </span>
                            <span className="font-mono text-[10px] opacity-60 truncate" style={{ color: COLORS.data }}>
                              {ts.star_trader.slice(0, 6)}...
                            </span>
                          </div>
                        </div>
                        
                        {/* PnL with Sparkline */}
                        <div className="flex items-center gap-3">
                          <Sparkline data={sparklineData} isPositive={isPositive} id={ts.id} />
                          <div className={`font-mono text-sm ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isPositive ? '+' : ''}{formatUsd(pnl)} ({isPositive ? '+' : ''}{pnlPercent.toFixed(1)}%)
                          </div>
                        </div>
                        
                        {/* ROI */}
                        <div className={`font-mono text-sm ${roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
                        </div>
                        
                        {/* Profit Factor */}
                        <div className={`font-mono text-sm ${profitFactor >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {profitFactor.toFixed(2)}x
                        </div>
                        
                        {/* Total Trades */}
                        <div className="font-mono text-sm" style={{ color: COLORS.text }}>
                          {totalTrades}
                        </div>
                        
                        {/* Allocated */}
                        <div className="font-mono text-sm" style={{ color: COLORS.text }}>
                          {formatUsd(ts.allocated_usd)}
                        </div>
                        
                        {/* Status */}
                        <div className="relative">
                          {(() => {
                            if (ts.is_settled) {
                              return (
                                <div className="relative inline-flex flex-col items-start gap-1">
                                  <span className="text-xs text-gray-400 flex items-center gap-1"><StopCircle size={12} /> Settled</span>
                                  <StatusAlertBubble status="stopped" onClose={() => {}} />
                                </div>
                              );
                            } 
                            if (ts.is_paused) {
                              return (
                                <div className="relative inline-flex flex-col items-start gap-1">
                                  <span className="text-xs text-yellow-400 flex items-center gap-1"><Pause size={12} /> Paused</span>
                                  <StatusAlertBubble status="paused" onClose={() => {}} />
                                </div>
                              );
                            }
                            if (ts.is_initialized) {
                              return (
                                <span className="text-xs text-emerald-400 flex items-center gap-1">
                                  <span className="w-2 h-2 bg-emerald-400 rounded-full"></span> Active
                                </span>
                              );
                            }
                            if (ts.is_syncing) {
                              return (
                                <span className="text-xs text-blue-400 flex items-center gap-1"><RefreshCw size={12} className="animate-spin" /> Syncing</span>
                              );
                            }
                            return (
                              <div className="relative inline-flex flex-col items-start gap-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-medium rounded border border-orange-500/30 bg-orange-500/10 text-orange-400">
                                    <Clock size={10} /> Uninit
                                  </span>
                                </div>
                                <StatusAlertBubble status="uninitialized" onClose={() => {}} />
                              </div>
                            );
                          })()}
                        </div>
                        
                        {/* View Button */}
                        <div>
                          <Link 
                            href={`/demo-vault/${ts.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-white/20 rounded hover:bg-white/5 transition-colors"
                            style={{ color: COLORS.text }}
                          >
                            View <ExternalLink size={12} />
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              </div>{/* End horizontal scroll */}
            </div>
          </>
        )}
        
        {/* Create Trader State Modal */}
        {showFollowModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="w-full max-w-md p-6 border border-white/10" style={{ backgroundColor: COLORS.surface }}>
              <h2 className="text-lg font-medium mb-2" style={{ color: COLORS.text }}>Create Trader State</h2>
              <p className="text-sm mb-5 leading-relaxed" style={{ color: COLORS.data }}>
                Allocate USD to follow a star trader. Each state has isolated funds.
              </p>
              
              <div className="mb-4">
                <label className="block text-sm mb-2" style={{ color: COLORS.data }}>Star Trader</label>
                <select
                  value={selectedTrader || ''}
                  onChange={(e) => setSelectedTrader(e.target.value)}
                  className="w-full p-3 text-sm border border-white/10 rounded"
                  style={{ backgroundColor: COLORS.canvas, color: COLORS.text }}
                >
                  <option value="">Select trader...</option>
                  {starTraders
                    .filter(t => !traderStates.some(ts => ts.star_trader === t.address))
                    .map(t => (
                      <option key={t.address} value={t.address}>{t.name} ({t.address.slice(0, 8)}...)</option>
                    ))}
                </select>
              </div>
              
              <div className="mb-6">
                <label className="block text-sm mb-2" style={{ color: COLORS.data }}>Allocation (USD)</label>
                <div className="flex items-center gap-2">
                  <DollarSign size={18} style={{ color: COLORS.data }} />
                  <input
                    type="number"
                    min="10"
                    max={unallocated}
                    step="10"
                    value={allocationUsd}
                    onChange={(e) => setAllocationUsd(Math.min(Number(e.target.value), unallocated))}
                    className="flex-1 p-3 text-sm border border-white/10 rounded font-mono"
                    style={{ backgroundColor: COLORS.canvas, color: COLORS.text }}
                  />
                </div>
                <p className="text-xs mt-2" style={{ color: COLORS.data }}>
                  Available: <span className="font-mono">{formatUsd(unallocated)}</span> • Min: $10
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={followTrader}
                  disabled={!selectedTrader || following || allocationUsd > unallocated || allocationUsd < 10}
                  className="flex-1 py-3 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 rounded"
                  style={{ backgroundColor: COLORS.brand, color: '#000' }}
                >
                  {following ? 'Creating...' : `Allocate ${formatUsd(allocationUsd)}`}
                </button>
                <button
                  onClick={() => { setShowFollowModal(false); setSelectedTrader(null); }}
                  className="px-6 py-3 text-sm border border-white/10 hover:bg-white/5 rounded transition-colors"
                  style={{ color: COLORS.text }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}