'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
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


function TraderAvatar({ address }: { address: string }) {
  const hue = address.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
  const bgColor = `hsl(${hue}, 50%, 30%)`;
  
  return (
    <div 
      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
      style={{ backgroundColor: bgColor, color: '#fff' }}
    >
      {address.slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function DemoVaultPage() {
  const { connected } = useWallet();
  const { isAuthenticated, isLoading: authLoading, user, signIn, openWalletModal } = useAuth();
  const [vault, setVault] = useState<DemoVault | null>(null);
  const [traderStates, setTraderStates] = useState<TraderState[]>([]);
  const [tradeStats, setTradeStats] = useState<Record<string, TradeStats>>({});
  const [starTraders, setStarTraders] = useState<{ address: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
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
    }
  }, [walletAddress]);
  
  const fetchStarTraders = useCallback(async () => {
    try {
      const response = await fetch('/api/star-traders');
      const data = await response.json();
      setStarTraders((data.traders || []).map((t: any) => ({ address: t.wallet, name: t.name })));
    } catch {
      console.error('Failed to fetch star traders');
    }
  }, []);
  
  useEffect(() => {
    if (connected && walletAddress) {
      fetchVault();
      fetchStarTraders();
    }
  }, [connected, walletAddress, fetchVault, fetchStarTraders]);
  
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
      const pnlA = a.totalValue - Number(a.allocated_usd);
      const pnlB = b.totalValue - Number(b.allocated_usd);
      return pnlB - pnlA;
    });
  }, [traderStates]);
  
  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.canvas, color: COLORS.text, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <main className="w-full px-5 py-4 pt-24">
        
        {/* Not Connected */}
        {!connected && (
          <div className="border border-white/10 p-10 text-center" style={{ backgroundColor: COLORS.surface }}>
            <Wallet size={44} className="mx-auto mb-4" style={{ color: COLORS.brand }} />
            <h2 className="text-xl font-medium mb-3">Connect Your Wallet</h2>
            <p className="text-sm mb-5 leading-relaxed" style={{ color: COLORS.data }}>Connect your Solana wallet to create a demo vault with $1,000 virtual USD</p>
            <button
              onClick={openWalletModal}
              className="px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 flex items-center gap-2 mx-auto rounded"
              style={{ backgroundColor: COLORS.brand, color: '#000' }}
            >
              <Wallet size={16} />
              Connect Wallet
            </button>
          </div>
        )}
        
        {/* Connected but Not Authenticated */}
        {connected && !isAuthenticated && !authLoading && (
          <div className="border border-white/10 p-10 text-center" style={{ backgroundColor: COLORS.surface }}>
            <LogIn size={44} className="mx-auto mb-4" style={{ color: COLORS.brand }} />
            <h2 className="text-xl font-medium mb-3">Sign In Required</h2>
            <p className="text-sm mb-5 leading-relaxed" style={{ color: COLORS.data }}>
              Sign a message with your wallet to verify ownership.
            </p>
            <button
              onClick={signIn}
              disabled={authLoading}
              className="px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center gap-2 mx-auto rounded"
              style={{ backgroundColor: COLORS.brand, color: '#000' }}
            >
              {authLoading ? <Loader2 className="animate-spin" size={16} /> : <LogIn size={16} />}
              Sign In with Wallet
            </button>
          </div>
        )}
        
        {/* Auth Loading */}
        {connected && authLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={28} className="animate-spin" style={{ color: COLORS.brand }} />
              <span className="text-sm" style={{ color: COLORS.data }}>Verifying wallet ownership...</span>
            </div>
          </div>
        )}
        
        {/* No Vault */}
        {connected && isAuthenticated && !vault && !loading && (
          <div className="border border-white/10 p-10 text-center" style={{ backgroundColor: COLORS.surface }}>
            <TrendingUp size={44} className="mx-auto mb-4" style={{ color: COLORS.brand }} />
            <h2 className="text-xl font-medium mb-3">Deploy Demo Vault</h2>
            <p className="text-sm mb-5 leading-relaxed" style={{ color: COLORS.data }}>Start with $1,000 virtual USD</p>
            <button
              onClick={deployVault}
              disabled={deploying}
              className="px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50 rounded"
              style={{ backgroundColor: COLORS.brand, color: '#000' }}
            >
              {deploying ? 'Deploying...' : 'Deploy Vault ($1,000 USD)'}
            </button>
          </div>
        )}
        
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: COLORS.brand, borderTopColor: 'transparent' }} />
          </div>
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
        {connected && isAuthenticated && vault && (
          <>
            {/* Stats HUD */}
            <div className="border border-white/10 mb-3 flex items-stretch divide-x divide-white/10" style={{ backgroundColor: COLORS.surface }}>
              <div className="flex-1 px-6 py-4 bg-white/[0.03]">
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: COLORS.data }}>Unallocated</div>
                <div className="text-lg font-mono font-semibold" style={{ color: COLORS.text }}>{formatUsd(unallocated)}</div>
              </div>
              <div className="flex-1 px-6 py-4 bg-white/[0.03]">
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: COLORS.data }}>Allocated</div>
                <div className="text-lg font-mono font-semibold" style={{ color: COLORS.text }}>{formatUsd(totalAllocated)}</div>
              </div>
              <div className="flex-1 px-6 py-4 bg-white/[0.03]">
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: COLORS.data }}>Total Value</div>
                <div className="text-lg font-mono font-semibold" style={{ color: COLORS.text }}>{formatUsd(totalValue + unallocated)}</div>
              </div>
              <div className="flex-1 px-6 py-4 bg-white/[0.03]">
                <div className="text-xs uppercase tracking-wider mb-1" style={{ color: COLORS.data }}>PNL</div>
                <div className={`text-lg font-mono font-semibold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {totalPnl >= 0 ? '+' : ''}{formatUsd(totalPnl)}
                </div>
              </div>
            </div>

            {/* Description + Action Bar */}
            <div className="flex items-center justify-between mb-3 py-3 px-5 border border-white/10" style={{ backgroundColor: COLORS.surface }}>
              <p className="text-sm leading-relaxed" style={{ color: COLORS.data }}>
                <span className="font-medium" style={{ color: COLORS.text }}>Demo Vault</span> · Experience our autonomous copy-trading engine in a risk-free environment. Allocate virtual funds to Star Traders, track real-time performance, and master the platform before going live.
              </p>
              <div className="flex items-center gap-3 shrink-0 ml-8">
                <button
                  onClick={() => { setShowFollowModal(true); setAllocationUsd(Math.min(500, unallocated)); }}
                  disabled={unallocated < 10}
                  className="px-4 py-2 text-sm font-medium flex items-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-50 rounded"
                  style={{ backgroundColor: COLORS.brand, color: '#000' }}
                >
                  Create Trader State
                </button>
                <button
                  onClick={fetchVault}
                  className="px-4 py-2 text-sm font-medium flex items-center gap-2 border border-white/20 hover:bg-white/5 rounded transition-colors"
                  style={{ color: COLORS.text }}
                >
                  <RefreshCw size={14} /> Refresh
                </button>
                <button
                  onClick={deleteVault}
                  className="px-4 py-2 text-sm font-medium flex items-center gap-2 border border-red-500/50 text-red-400 hover:bg-red-500/10 rounded transition-colors"
                >
                  Delete Vault
                </button>
              </div>
            </div>

            {/* Trader States Table */}
            <div className="border border-white/10 overflow-hidden" style={{ backgroundColor: COLORS.surface }}>
              <div className="px-5 py-3 border-b border-white/10 bg-white/[0.02]">
                <h2 className="text-sm font-medium" style={{ color: COLORS.text }}>Trader States</h2>
              </div>
              
              {/* Table Header */}
              <div className="grid grid-cols-[50px_1fr_1.4fr_0.7fr_0.7fr_0.6fr_0.7fr_0.6fr_100px] gap-3 px-5 py-2.5 text-xs uppercase tracking-wider border-b border-white/10 font-mono bg-white/[0.04]" style={{ color: COLORS.data }}>
                <div>Rank</div>
                <div>Star Trader</div>
                <div>PnL (7D)</div>
                <div>ROI (Total)</div>
                <div>Win Rate</div>
                <div>Trades</div>
                <div>Allocated</div>
                <div>Status</div>
                <div></div>
              </div>
              
              {/* Table Rows */}
              <div className="divide-y divide-white/5">
                {rankedTraderStates.length === 0 ? (
                  <div className="text-center py-10 text-sm" style={{ color: COLORS.data }}>
                    No trader states. Create one to start copy trading.
                  </div>
                ) : (
                  rankedTraderStates.map((ts, index) => {
                    const rank = index + 1;
                    const pnl = ts.totalValue - Number(ts.allocated_usd);
                    const pnlPercent = ts.allocated_usd > 0 ? (pnl / ts.allocated_usd) * 100 : 0;
                    const isPositive = pnl >= 0;
                    const sparklineData = generateSparklineFromPnl(pnl, Number(ts.allocated_usd), ts.star_trader);
                    
                    // Get real trade stats
                    const stats = tradeStats[ts.id] || { completedCount: 0, failedCount: 0, totalRealizedPnl: 0 };
                    const totalTrades = stats.completedCount + stats.failedCount;
                    const winRate = totalTrades > 0 ? Math.round((stats.completedCount / totalTrades) * 100) : 0;
                    const roi = ts.allocated_usd > 0 ? (pnl / Number(ts.allocated_usd)) * 100 : 0;
                    
                    return (
                      <div 
                        key={ts.id} 
                        className={`grid grid-cols-[50px_1fr_1.4fr_0.7fr_0.7fr_0.6fr_0.7fr_0.6fr_100px] gap-3 px-5 py-3 items-center hover:bg-white/[0.04] transition-colors ${index % 2 === 1 ? 'bg-white/[0.02]' : ''}`}
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
                          <TraderAvatar address={ts.star_trader} />
                          <span className="font-mono text-sm" style={{ color: COLORS.text }}>
                            {ts.star_trader.slice(0, 8)}...
                          </span>
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
                        
                        {/* Win Rate */}
                        <div className="font-mono text-sm" style={{ color: COLORS.text }}>
                          {winRate}%
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
                        <div>
                          {ts.is_settled ? (
                            <span className="text-xs text-gray-400 flex items-center gap-1"><StopCircle size={12} /> Settled</span>
                          ) : ts.is_paused ? (
                            <span className="text-xs text-yellow-400 flex items-center gap-1"><Pause size={12} /> Paused</span>
                          ) : ts.is_initialized ? (
                            <span className="text-xs text-emerald-400 flex items-center gap-1">
                              <span className="w-2 h-2 bg-emerald-400 rounded-full"></span> Active
                            </span>
                          ) : ts.is_syncing ? (
                            <span className="text-xs text-blue-400 flex items-center gap-1"><RefreshCw size={12} className="animate-spin" /> Syncing</span>
                          ) : (
                            <span className="text-xs text-orange-400 flex items-center gap-1"><Clock size={12} /> Uninit</span>
                          )}
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