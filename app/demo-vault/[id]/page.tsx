'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAuth } from '@/contexts/auth-context';
import { COLORS } from '@/lib/theme';
import { 
  ArrowLeft, 
  ArrowRight,
  ArrowUpRight,
  RefreshCw, 
  Wallet, 
  BarChart3, 
  Pause,
  Play,
  StopCircle,
  Trash2,
  Clock,
  CheckCircle,
  ExternalLink,
  X,
  Loader2,
  LogIn
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

interface Position {
  mint: string;
  symbol: string;
  name: string;
  logoURI: string | null;
  amount: number;
  avgCost: number;           // WAC: Weighted Average Cost (from API)
  costBasis: number;         // amount × avgCost
  currentPrice: number | null;
  currentValue: number | null;
  unrealizedPnL: number | null;  // (currentPrice - avgCost) × amount
  unrealizedPercent: number | null;
  portfolioPercent: number | null;
}

interface Trade {
  id: string;
  type: 'buy' | 'sell';
  token_in_mint: string;
  token_in_symbol: string;
  token_in_amount: number | null;
  token_out_mint: string;
  token_out_symbol: string;
  token_out_amount: number | null;
  usd_value: number | null;
  realized_pnl: number | null;  // Only for sells
  latency_diff_ms: number | null;
  star_trade_signature: string;
  created_at: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
  // Leader trade info (always populated)
  leader_in_amount: number | null;
  leader_out_amount: number | null;
  leader_usd_value: number | null;
}

interface PortfolioData {
  traderStateId: string;
  starTrader: string;
  allocatedUsd: number;
  realizedPnlUsd: number;
  isInitialized: boolean;
  isPaused: boolean;
  isSettled: boolean;
  positions: Position[];
  portfolioValue: number;
  totalCostBasis: number;
  totalPnL: number;
  totalPnLPercent: number;
  unrealizedPnL: number;
  hasStalePrices: boolean;
}

interface TokenMeta {
  symbol: string;
  name: string;
  logoURI: string | null;
}

// =============================================================================
// FORMATTING UTILITIES
// =============================================================================

function formatAmount(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  if (Math.abs(amount) >= 1000000) return (amount / 1000000).toFixed(2) + 'M';
  if (Math.abs(amount) >= 1000) return (amount / 1000).toFixed(2) + 'K';
  if (Math.abs(amount) < 0.01 && amount !== 0) return amount.toFixed(6);
  return amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatUsd(amount: number | null): string {
  if (amount === null || amount === undefined) return '—';
  // Treat very tiny values as zero (floating point precision fix)
  if (Math.abs(amount) < 1e-10) return '$0.00';
  if (Math.abs(amount) >= 1000000) return '$' + (amount / 1000000).toFixed(2) + 'M';
  if (Math.abs(amount) >= 1000) return '$' + (amount / 1000).toFixed(2) + 'K';
  // Handle small amounts properly (but real values, not floating point errors)
  if (Math.abs(amount) < 0.01 && amount !== 0) return '$' + amount.toFixed(4);
  return '$' + amount.toFixed(2);
}

function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return '—';
  if (price >= 1000) return '$' + (price / 1000).toFixed(2) + 'K';
  if (price >= 1) return '$' + price.toFixed(2);
  if (price >= 0.01) return '$' + price.toFixed(4);
  if (price >= 0.0001) return '$' + price.toFixed(6);
  if (price >= 0.00000001) return '$' + price.toFixed(8);
  if (price === 0) return '$0.00';
  return '$' + price.toExponential(2);
}

function formatPnl(pnl: number | null): { text: string; color: string } {
  if (pnl === null) return { text: '—', color: COLORS.data };
  const isPositive = pnl >= 0;
  const text = isPositive ? `+${formatUsd(pnl)}` : `-${formatUsd(Math.abs(pnl))}`;
  return { text, color: isPositive ? '#10B981' : '#EF4444' };
}

function formatLatency(ms: number | null): string {
  if (ms === null || ms === undefined) return '—';
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
  return ms.toFixed(0) + 'ms';
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// =============================================================================
// TOKEN ICON COMPONENT
// =============================================================================

function TokenIcon({ symbol, logoURI }: { symbol: string; logoURI?: string | null }) {
  const [imgError, setImgError] = useState(false);
  
  if (logoURI && !imgError) {
    return (
      <img 
        src={logoURI}
        alt={symbol}
        className="w-6 h-6 rounded-full"
        onError={() => setImgError(true)}
      />
    );
  }
  
  return (
    <div 
      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
      style={{ backgroundColor: COLORS.structure, color: COLORS.text }}
    >
      {symbol?.charAt(0) || '?'}
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function TraderStateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { connected } = useWallet();
  const { isAuthenticated, user, signIn, isLoading: authLoading } = useAuth();
  const traderStateId = params.id as string;
  // Use authenticated wallet address instead of raw connected wallet
  const walletAddress = user?.wallet || null;
  
  // State
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tokenMeta, setTokenMeta] = useState<Record<string, TokenMeta>>({});
  const [activeTab, setActiveTab] = useState<'portfolio' | 'trades'>('portfolio');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state
  const [tradesPage, setTradesPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, totalCount: 0, totalPages: 0 });
  const [tradeStats, setTradeStats] = useState({ avgLatency: 0, totalRealizedPnl: 0, completedCount: 0, failedCount: 0 });
  
  // Init Modal State
  const [showInitModal, setShowInitModal] = useState(false);
  const [previewPortfolio, setPreviewPortfolio] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // =============================================================================
  // DATA FETCHING
  // =============================================================================
  
  const fetchTokenMetadata = useCallback(async (mints: string[]) => {
    if (mints.length === 0) return;
    
    // Filter out mints we already have
    const missing = mints.filter(m => !tokenMeta[m] && m !== 'SOL');
    if (missing.length === 0) return;
    
    try {
      const response = await fetch(`/api/tokens?mints=${missing.join(',')}`);
      if (response.ok) {
        const data = await response.json();
        if (data && typeof data === 'object') {
          setTokenMeta(prev => ({ ...prev, ...data }));
        }
      }
    } catch (err) {
      console.error('Failed to fetch token metadata:', err);
    }
  }, [tokenMeta]);
  
  const fetchData = useCallback(async () => {
    if (!walletAddress || !traderStateId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Fetch portfolio
      const portfolioRes = await fetch(
        `/api/demo-vault/portfolio?wallet=${walletAddress}&traderStateId=${traderStateId}`
      );
      const portfolioData = await portfolioRes.json();
      
      if (portfolioData.error) {
        setError(portfolioData.error);
        return;
      }
      
      setPortfolio(portfolioData);
      
      // Fetch trades with pagination
      const tradesRes = await fetch(
        `/api/demo-vault/trades?wallet=${walletAddress}&traderStateId=${traderStateId}&page=${tradesPage}&pageSize=20`
      );
      const tradesData = await tradesRes.json();
      setTrades(tradesData.trades || []);
      setPagination(tradesData.pagination || { page: 1, pageSize: 20, totalCount: 0, totalPages: 0 });
      setTradeStats(tradesData.stats || { avgLatency: 0, totalRealizedPnl: 0, completedCount: 0, failedCount: 0 });
      
      // Collect all mints for metadata fetching
      const mints = new Set<string>();
      portfolioData.positions?.forEach((p: Position) => mints.add(p.mint));
      tradesData.trades?.forEach((t: Trade) => {
        if (t.token_in_mint) mints.add(t.token_in_mint);
        if (t.token_out_mint) mints.add(t.token_out_mint);
      });
      
      if (mints.size > 0) {
        await fetchTokenMetadata(Array.from(mints));
      }
      
    } catch {
      setError('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [walletAddress, traderStateId, tradesPage, fetchTokenMetadata]);
  
  useEffect(() => {
    if (connected && walletAddress) {
      fetchData();
    }
  }, [connected, walletAddress, fetchData]);
  
  // =============================================================================
  // ACTIONS
  // =============================================================================
  
  const handleAction = async (action: 'sync' | 'initialize' | 'pause' | 'resume' | 'settle') => {
    if (!walletAddress || !traderStateId) return;
    setActionLoading(true);
    
    try {
      const response = await fetch('/api/demo-vault/follow', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress, traderStateId, action })
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      await fetchData();
      return true;
    } catch (e: any) {
      setError(e.message || `Failed to ${action}`);
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const handleInitClick = async () => {
    if (!portfolio?.starTrader) return;
    setShowInitModal(true);
    setPreviewLoading(true);
    
    try {
      const res = await fetch(`/api/portfolio?wallet=${portfolio.starTrader}`);
      const data = await res.json();
      
      const allTokens = [...(data.tokens || [])];
      
      if (data.solBalance && data.solBalance.totalValue > 1) {
        allTokens.unshift({
           mint: 'SOL',
           symbol: 'SOL', 
           name: 'Solana',
           logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
           ...data.solBalance,
           isNative: true
        });
      }
      
      setPreviewPortfolio(allTokens);
    } catch {
      // Empty on fail
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmInit = async () => {
    const synced = await handleAction('sync');
    if (!synced) return;
    
    const initialized = await handleAction('initialize');
    if (initialized) {
      setShowInitModal(false);
    }
  };
  
  const handleWithdraw = async () => {
    if (!walletAddress || !traderStateId || !confirm('Withdraw all funds?')) return;
    setActionLoading(true);
    
    try {
      const response = await fetch(
        `/api/demo-vault/follow?wallet=${walletAddress}&traderStateId=${traderStateId}`, 
        { method: 'DELETE' }
      );
      const data = await response.json();
      if (data.error) setError(data.error);
      else router.push('/demo-vault');
    } catch {
      setError('Failed to withdraw');
    } finally {
      setActionLoading(false);
    }
  };
  
  // =============================================================================
  // LOADING / ERROR STATES
  // =============================================================================
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.canvas }}>
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: COLORS.brand, borderTopColor: 'transparent' }} />
      </div>
    );
  }
  
  if (!connected || !walletAddress) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.canvas, color: COLORS.text }}>
        <div className="text-center">
          <Wallet size={48} className="mx-auto mb-4 opacity-50" />
          <p>Connect your wallet to view trader state</p>
        </div>
      </div>
    );
  }
  
  if (error || !portfolio) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.canvas, color: COLORS.text }}>
        <div className="text-center">
          <p style={{ color: '#EF4444' }}>{error || 'Not found'}</p>
          <Link href="/demo-vault" className="mt-4 inline-flex items-center gap-1" style={{ color: COLORS.brand }}>
            <ArrowLeft size={14} /> Back to Vault
          </Link>
        </div>
      </div>
    );
  }
  
  // =============================================================================
  // COMPUTED VALUES
  // =============================================================================
  
  const { 
    positions, portfolioValue, totalPnL, totalPnLPercent, 
    allocatedUsd, starTrader, isPaused, isSettled, isInitialized, 
    realizedPnlUsd, unrealizedPnL 
  } = portfolio;
  
  // Use stats from API (calculated from ALL trades, not just current page)
  const avgLatency = tradeStats.avgLatency;
  
  // Win rate can still be calculated from visible trades for now
  // (or you could add to API stats later)
  const sellTrades = trades.filter(t => t.type === 'sell');
  const profitableSells = sellTrades.filter(t => t.realized_pnl !== null && t.realized_pnl > 0).length;
  const winRate = sellTrades.length > 0 ? (profitableSells / sellTrades.length) * 100 : 0;
  
  // =============================================================================
  // RENDER
  // =============================================================================
  
  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: COLORS.canvas, color: COLORS.text }}>
      {/* Responsive Back Button */}
      <div className="fixed top-16 left-0 right-0 z-40 px-4 py-2 md:hidden bg-[#050505]/80 backdrop-blur-md border-b border-[#262626]">
        <Link 
          href="/demo-vault"
          className="flex items-center gap-2 text-sm font-medium p-2"
          style={{ color: COLORS.text }}
        >
          <ArrowLeft size={16} /> Back
        </Link>
      </div>

      <Link 
        href="/demo-vault"
        className="hidden md:flex fixed top-4 left-4 z-50 items-center justify-center gap-2 text-sm font-medium transition-all duration-200"
        style={{ 
          width: '200px',
          height: '48px',
          borderRadius: '8px',
          border: `1px solid ${COLORS.structure}`,
          backgroundColor: COLORS.surface,
          color: COLORS.text,
        }}
      >
        <ArrowLeft size={16} /> Back to Demo Vault
      </Link>

      <main className="max-w-6xl mx-auto px-4 md:px-6 py-12 pt-32 md:pt-20">
        {/* Header */}
        <div className="mb-8">
          
          {/* Main Title Row */}
          <div className="flex flex-col md:flex-row md:items-start justify-between mb-6 gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl md:text-3xl font-semibold text-white">Trader State</h1>
                {isSettled ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-500/10 text-gray-400 border border-gray-500/20 flex items-center gap-1.5">
                    <StopCircle size={12} /> Settled
                  </span>
                ) : isPaused ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 flex items-center gap-1.5">
                    <Pause size={12} /> Paused
                  </span>
                ) : isInitialized ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                    <CheckCircle size={12} /> Active
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center gap-1.5">
                    <Clock size={12} /> Pending
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs md:text-sm font-mono opacity-50 break-all">
                <span>UUID:</span>
                <span>{traderStateId}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {!isInitialized && !isSettled && (
                <button 
                  onClick={handleInitClick} 
                  disabled={actionLoading} 
                  className="px-4 py-2 text-sm font-medium flex items-center gap-2 rounded transition-colors hover:opacity-90 disabled:opacity-50 w-full md:w-auto justify-center" 
                  style={{ backgroundColor: '#10B981', color: '#000' }}
                >
                  <CheckCircle size={14} /> Initialize Copy Trading
                </button>
              )}
              
              {isInitialized && !isSettled && (
                isPaused ? (
                  <button onClick={() => handleAction('resume')} disabled={actionLoading} className="px-4 py-2 text-sm flex items-center gap-2 border hover:opacity-80 disabled:opacity-50" style={{ borderColor: COLORS.brand, color: COLORS.brand }}>
                    <Play size={14} /> Resume
                  </button>
                ) : (
                  <button onClick={() => handleAction('pause')} disabled={actionLoading} className="px-4 py-2 text-sm flex items-center gap-2 border hover:opacity-80 disabled:opacity-50" style={{ borderColor: '#F59E0B', color: '#F59E0B' }}>
                    <Pause size={14} /> Pause
                  </button>
                )
              )}
              
              {isPaused && !isSettled && (
                <button onClick={() => handleAction('settle')} disabled={actionLoading} className="px-4 py-2 text-sm flex items-center gap-2 border hover:opacity-80 disabled:opacity-50" style={{ borderColor: '#6B7280', color: '#6B7280' }}>
                  <StopCircle size={14} /> Settle
                </button>
              )}
              
              <button onClick={handleWithdraw} disabled={actionLoading} className="px-4 py-2 text-sm flex items-center gap-2 border hover:opacity-80 disabled:opacity-50" style={{ borderColor: '#EF4444', color: '#EF4444' }}>
                <Trash2 size={14} /> Withdraw
              </button>
            </div>
          </div>

          {/* Follow Info Card */}
          <div className="p-4 rounded-lg border bg-white/[0.02]" style={{ borderColor: COLORS.structure }}>
            <div className="text-[10px] uppercase tracking-wider font-semibold opacity-50 mb-3 block">Following Star Trader</div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-4 w-full sm:w-auto">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0" style={{ backgroundColor: COLORS.structure, color: COLORS.text }}>
                  {starTrader.charAt(0)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm truncate" style={{ color: COLORS.text }}>{starTrader}</span>
                    <a 
                      href={`https://solscan.io/account/${starTrader}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 hover:bg-white/5 rounded transition-colors shrink-0"
                      title="View on Solscan"
                    >
                      <ArrowUpRight size={14} style={{ color: COLORS.data }} />
                    </a>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <Link
                      href={`/star-traders/${starTrader}`}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                      style={{ color: COLORS.brand }}
                    >
                      View Star Trader Profile <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Stats Cards - Responsive Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
          <div className="p-5 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
            <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: COLORS.data }}>Allocated</div>
            <div className="text-xl font-semibold" style={{ color: COLORS.text }}>{formatUsd(allocatedUsd)}</div>
          </div>
          <div className="p-5 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
            <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: COLORS.data }}>Portfolio Value</div>
            <div className="text-xl font-semibold" style={{ color: COLORS.brand }}>{formatUsd(portfolioValue)}</div>
          </div>
          <div className="p-5 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
            <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: COLORS.data }}>Total PnL</div>
            <div className="text-xl font-semibold" style={{ color: totalPnL >= 0 ? '#10B981' : '#EF4444' }}>
              {totalPnL >= 0 ? '+' : ''}{formatUsd(totalPnL)} ({totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(1)}%)
            </div>
            <div className="text-xs mt-1 flex flex-col xl:flex-row xl:gap-3 gap-1" style={{ color: COLORS.data }}>
              <span>Realized: <span style={{ color: realizedPnlUsd >= 0 ? '#10B981' : '#EF4444' }}>{realizedPnlUsd >= 0 ? '+' : ''}{formatUsd(realizedPnlUsd)}</span></span>
              <span>Unrealized: <span style={{ color: unrealizedPnL >= 0 ? '#10B981' : '#EF4444' }}>{unrealizedPnL >= 0 ? '+' : ''}{formatUsd(unrealizedPnL)}</span></span>
            </div>
          </div>
          <div className="p-5 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
            <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: COLORS.data }}>Trades</div>
            <div className="text-xl font-semibold" style={{ color: COLORS.text }}>{trades.length}</div>
            <div className="text-xs mt-1" style={{ color: COLORS.data }}>Win Rate: {winRate.toFixed(0)}%</div>
          </div>
          <div className="p-5 border col-span-2 md:col-span-1" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
            <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: COLORS.data }}>Avg Latency</div>
            <div className="text-xl font-semibold" style={{ color: COLORS.text }}>{formatLatency(avgLatency)}</div>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('portfolio')}
            className="px-5 py-2.5 text-sm font-medium flex items-center gap-2"
            style={{
              backgroundColor: activeTab === 'portfolio' ? COLORS.surface : 'transparent',
              color: activeTab === 'portfolio' ? COLORS.brand : COLORS.data,
              borderBottom: activeTab === 'portfolio' ? `2px solid ${COLORS.brand}` : '2px solid transparent'
            }}
          >
            <Wallet size={16} /> Portfolio ({positions.length})
          </button>
          <button
            onClick={() => setActiveTab('trades')}
            className="px-5 py-2.5 text-sm font-medium flex items-center gap-2"
            style={{
              backgroundColor: activeTab === 'trades' ? COLORS.surface : 'transparent',
              color: activeTab === 'trades' ? COLORS.brand : COLORS.data,
              borderBottom: activeTab === 'trades' ? `2px solid ${COLORS.brand}` : '2px solid transparent'
            }}
          >
            <BarChart3 size={16} /> Trades ({trades.length})
          </button>
          <button onClick={fetchData} className="ml-auto px-3 py-1.5 text-xs border hover:opacity-80" style={{ borderColor: COLORS.structure, color: COLORS.brand }}>
            <RefreshCw size={12} className="inline mr-1" /> Refresh
          </button>
        </div>
        
        {/* ============================================================================= */}
        {/* PORTFOLIO TAB */}
        {/* ============================================================================= */}
        {activeTab === 'portfolio' && (
          <div className="border overflow-hidden" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: COLORS.structure }}>
              <div>
                <h2 className="font-medium" style={{ color: COLORS.text }}>Portfolio</h2>
                <p className="text-xs" style={{ color: COLORS.data }}>Real-time holdings and performance tracking</p>
              </div>
              <div className="text-lg font-medium" style={{ color: COLORS.brand }}>{formatUsd(portfolioValue)}</div>
            </div>
            
            <div className="grid grid-cols-7 gap-4 px-6 py-3 text-xs font-mono uppercase tracking-wider border-b" style={{ color: COLORS.data, borderColor: COLORS.structure }}>
              <div>Token</div>
              <div>Amount</div>
              <div>Avg Entry</div>
              <div>Price</div>
              <div>Value</div>
              <div>PnL</div>
              <div>% Portfolio</div>
            </div>
            
            <div className="max-h-[500px] overflow-y-auto">
              {positions.length === 0 ? (
                <div className="text-center py-12" style={{ color: COLORS.data }}>No positions</div>
              ) : (
                positions.map(pos => {
                  const meta = tokenMeta[pos.mint] || { symbol: pos.symbol, name: pos.name, logoURI: pos.logoURI };
                  const pnl = formatPnl(pos.unrealizedPnL);
                  
                  return (
                    <div key={pos.mint} className="grid grid-cols-7 gap-4 items-center px-6 py-3 hover:bg-white/[0.02] border-b" style={{ borderColor: COLORS.structure }}>
                      <div className="flex items-center gap-2">
                        <TokenIcon symbol={meta.symbol || pos.symbol} logoURI={meta.logoURI || pos.logoURI} />
                        <div>
                          <div style={{ color: COLORS.text }} className="font-medium">{meta.symbol || pos.symbol}</div>
                          <div className="text-xs truncate max-w-[100px]" style={{ color: COLORS.data }}>{meta.name || pos.name}</div>
                        </div>
                      </div>
                      <div style={{ color: COLORS.text }}>{formatAmount(pos.amount)}</div>
                      <div style={{ color: COLORS.data }}>{formatPrice(pos.avgCost)}</div>
                      <div style={{ color: COLORS.data }}>{formatPrice(pos.currentPrice)}</div>
                      <div style={{ color: COLORS.brand }} className="font-medium">{formatUsd(pos.currentValue)}</div>
                      <div style={{ color: pnl.color }} className="font-medium">
                        {pnl.text}
                        {pos.unrealizedPercent !== null && (
                          <span className="text-xs ml-1">({pos.unrealizedPercent >= 0 ? '+' : ''}{pos.unrealizedPercent.toFixed(1)}%)</span>
                        )}
                      </div>
                      <div style={{ color: COLORS.text }}>{pos.portfolioPercent !== null ? `${pos.portfolioPercent.toFixed(1)}%` : '—'}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
        
        {/* ============================================================================= */}
        {/* TRADES TAB */}
        {/* ============================================================================= */}
        {activeTab === 'trades' && (
          <div className="border overflow-hidden" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: COLORS.structure }}>
              <h2 className="font-medium" style={{ color: COLORS.text }}>Copy Trades</h2>
              <p className="text-xs" style={{ color: COLORS.data }}>Complete history of copy-trading actions</p>
            </div>
            
            <div className="grid grid-cols-8 gap-4 px-6 py-3 text-xs font-mono uppercase tracking-wider border-b" style={{ color: COLORS.data, borderColor: COLORS.structure }}>
              <div>Type</div>
              <div className="col-span-2">Token In → Token Out</div>
              <div>USD Value</div>
              <div>Profit</div>
              <div>Latency</div>
              <div>Age</div>
              <div>Actions</div>
            </div>
            
            <div className="max-h-[500px] overflow-y-auto">
              {trades.length === 0 ? (
                <div className="text-center py-12" style={{ color: COLORS.data }}>No trades yet</div>
              ) : (
                trades.map(trade => {
                  const isBuy = trade.type === 'buy';
                  // WAC: Only sells have PnL
                  const tradePnl = isBuy ? { text: '—', color: COLORS.data } : formatPnl(trade.realized_pnl);
                  
                  // Get token metadata
                  const inMeta = tokenMeta[trade.token_in_mint] || { symbol: trade.token_in_symbol, logoURI: null };
                  const outMeta = tokenMeta[trade.token_out_mint] || { symbol: trade.token_out_symbol, logoURI: null };
                  
                  // For failed/incomplete trades, show leader amounts as fallback
                  const isFailed = trade.status === 'failed';
                  const isIncomplete = !trade.token_in_amount || !trade.token_out_amount;
                  
                  // Use copy amounts if available, otherwise leader amounts
                  const displayInAmount = trade.token_in_amount ?? trade.leader_in_amount;
                  const displayOutAmount = trade.token_out_amount ?? trade.leader_out_amount;
                  const displayUsdValue = trade.usd_value ?? trade.leader_usd_value;
                  
                  return (
                    <div key={trade.id} className="grid grid-cols-8 gap-4 items-center px-6 py-3 hover:bg-white/[0.02] border-b" style={{ borderColor: COLORS.structure }}>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded text-xs font-medium" style={{ 
                          backgroundColor: isBuy ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', 
                          color: isBuy ? '#10B981' : '#EF4444' 
                        }}>
                          {isBuy ? 'Buy' : 'Sell'}
                        </span>
                        {/* Status Badge */}
                        {isFailed && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-400" title={trade.error_message || 'Copy failed'}>
                            ✗
                          </span>
                        )}
                        {isIncomplete && !isFailed && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-500/20 text-yellow-400">
                            ⏳
                          </span>
                        )}
                      </div>
                      <div className="col-span-2 flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <TokenIcon symbol={inMeta.symbol || trade.token_in_symbol} logoURI={inMeta.logoURI} />
                          <span style={{ color: isIncomplete && !isFailed ? COLORS.data : COLORS.text }}>
                            {formatAmount(displayInAmount)} {inMeta.symbol || trade.token_in_symbol}
                            {isIncomplete && <span className="text-[10px] opacity-50 ml-1">(leader)</span>}
                          </span>
                        </div>
                        <ArrowRight size={14} style={{ color: COLORS.data }} />
                        <div className="flex items-center gap-1.5">
                          <TokenIcon symbol={outMeta.symbol || trade.token_out_symbol} logoURI={outMeta.logoURI} />
                          <span style={{ color: isIncomplete && !isFailed ? COLORS.data : COLORS.text }}>
                            {formatAmount(displayOutAmount)} {outMeta.symbol || trade.token_out_symbol}
                          </span>
                        </div>
                      </div>
                      <div style={{ color: isFailed ? '#EF4444' : COLORS.brand }} className="font-medium">
                        {isFailed ? 'Failed' : formatUsd(displayUsdValue)}
                      </div>
                      <div style={{ color: tradePnl.color }} className="font-medium">{tradePnl.text}</div>
                      <div style={{ color: COLORS.data }}>{formatLatency(trade.latency_diff_ms)}</div>
                      <div style={{ color: COLORS.data }}>{timeAgo(trade.created_at)}</div>
                      <div>
                        {trade.star_trade_signature ? (
                           <a 
                             href={`https://solscan.io/tx/${trade.star_trade_signature}`} 
                             target="_blank" 
                             rel="noopener noreferrer"
                             className="flex items-center gap-1 text-xs hover:underline"
                             style={{ color: COLORS.brand }}
                           >
                             TX <ExternalLink size={10} />
                           </a>
                        ) : (
                          <span style={{ color: COLORS.data }}>—</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-3 border-t" style={{ borderColor: COLORS.structure }}>
                <div className="text-xs" style={{ color: COLORS.data }}>
                  Showing {trades.length} of {pagination.totalCount} trades
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTradesPage(p => Math.max(1, p - 1))}
                    disabled={tradesPage === 1}
                    className="px-3 py-1.5 rounded text-xs font-medium transition-all disabled:opacity-40"
                    style={{ 
                      backgroundColor: tradesPage === 1 ? COLORS.structure : COLORS.brand + '20',
                      color: tradesPage === 1 ? COLORS.data : COLORS.brand
                    }}
                  >
                    ← Prev
                  </button>
                  <span className="text-xs px-3" style={{ color: COLORS.text }}>
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setTradesPage(p => Math.min(pagination.totalPages, p + 1))}
                    disabled={tradesPage >= pagination.totalPages}
                    className="px-3 py-1.5 rounded text-xs font-medium transition-all disabled:opacity-40"
                    style={{ 
                      backgroundColor: tradesPage >= pagination.totalPages ? COLORS.structure : COLORS.brand + '20',
                      color: tradesPage >= pagination.totalPages ? COLORS.data : COLORS.brand
                    }}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* ============================================================================= */}
        {/* INIT MODAL */}
        {/* ============================================================================= */}
        {showInitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-md border rounded-lg shadow-xl overflow-hidden" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
              <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: COLORS.structure }}>
                <h3 className="font-bold flex items-center gap-2" style={{ color: COLORS.text }}>
                  <RefreshCw size={16} /> Sync & Initialize
                </h3>
                <button onClick={() => setShowInitModal(false)} className="hover:opacity-70">
                  <X size={20} style={{ color: COLORS.data }} />
                </button>
              </div>
              
              <div className="p-6">
                <p className="text-sm mb-4" style={{ color: COLORS.data }}>
                  Sync your demo vault with the Star Trader&apos;s current portfolio.
                </p>
                
                <div className="mb-6">
                  <div className="text-xs font-mono uppercase mb-2" style={{ color: COLORS.data }}>Assets to be copied:</div>
                  <div className="border rounded max-h-40 overflow-y-auto" style={{ borderColor: COLORS.structure, backgroundColor: COLORS.canvas }}>
                    {previewLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 size={24} className="animate-spin" style={{ color: COLORS.brand }} />
                      </div>
                    ) : (
                      (() => {
                        const filtered = previewPortfolio.filter((t: any) => (t.holdingPercent || 0) >= 0.1);
                        const alloc = allocatedUsd || 0;
                        
                        return filtered.length === 0 ? (
                          <div className="p-4 text-center text-xs" style={{ color: COLORS.data }}>No assets found.</div>
                        ) : (
                          <div className="divide-y" style={{ borderColor: COLORS.structure }}>
                            {filtered.map((token: any) => {
                              const percent = token.holdingPercent || 0;
                              const projectedValue = (percent / 100) * alloc;
                              const projectedBalance = token.pricePerToken ? (projectedValue / token.pricePerToken) : 0;
                              
                              return (
                                <div key={token.mint} className="flex items-center justify-between p-2 text-sm">
                                  <div className="flex items-center gap-2">
                                    <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-[10px] overflow-hidden">
                                      {token.logoURI ? <img src={token.logoURI} alt="" /> : token.symbol[0]}
                                    </div>
                                    <div>
                                      <div style={{ color: COLORS.text }}>{token.symbol}</div>
                                      <div className="text-[10px]" style={{ color: COLORS.data }}>{percent.toFixed(2)}%</div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div style={{ color: COLORS.text }}>{formatUsd(projectedValue)}</div>
                                    <div className="text-[10px]" style={{ color: COLORS.data }}>{formatAmount(projectedBalance)}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()
                    )}
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowInitModal(false)}
                    className="flex-1 py-2 rounded text-sm font-medium border transition-colors hover:bg-white/5"
                    style={{ borderColor: COLORS.structure, color: COLORS.text }}
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={confirmInit}
                    disabled={actionLoading}
                    className="flex-1 py-2 rounded text-sm font-medium transition-colors hover:opacity-90 flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#10B981', color: '#000' }}
                  >
                    {actionLoading ? <Loader2 size={14} className="animate-spin" /> : 'Confirm & Initialize'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
