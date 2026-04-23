'use client';

import PageLoader from '@/components/PageLoader';
import { InfiniteScrollSentinel } from '@/components/InfiniteScrollSentinel';
import { CyberHistorySkeletonRows } from '@/components/cyber/history-skeleton';
import { MetricTile } from '@/components/cyber/metric-tile';
import { StatusBadge } from '@/components/cyber/status-badge';
import { InfoTooltip } from '@/components/cyber/tooltip';
import { TraderAvatar } from '@/components/cyber/trader-avatar';
import { CopyModelBadge } from '@/components/trading/copy-model-badge';
import { SolscanLink } from '@/components/trading/solscan-link';
import { TokenIcon } from '@/components/trading/token-icon';
import {
  formatCopyBuyModelConfigBadge,
  formatCopyBuyModelLabel,
} from '@/lib/copy-models/format';
import { CopyBuyModelConfig, CopyBuyModelKey } from '@/lib/copy-models/types';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAppKitAccount } from '@reown/appkit/react';
import { useAuth } from '@/contexts/auth-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { getDemoTradeCount } from '@/lib/demo-trade-stats';
import { COLORS } from '@/lib/theme';
import { 
  ArrowLeft, 
  ArrowRight,
  ArrowUpRight,
  RefreshCw, 
  Wallet, 
  Pause,
  Play,
  StopCircle,
  Clock,
  X,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// =============================================================================
// TYPES
// =============================================================================

interface Position {
  mint: string;
  symbol: string;
  name: string;
  logoURI: string | null;
  amount: number;
  avgCost: number;
  costBasis: number;
  currentPrice: number | null;
  currentValue: number | null;
  unrealizedPnL: number | null;
  unrealizedPercent: number | null;
  portfolioPercent: number | null;
  priceStale?: boolean;
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
  realized_pnl: number | null;
  latency_diff_ms: number | null;
  star_trade_signature: string;
  created_at: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'skipped';
  error_message: string | null;
  leader_in_amount: number | null;
  leader_out_amount: number | null;
  leader_usd_value: number | null;
}

interface PortfolioData {
  traderStateId: string;
  starTrader: string;
  createdAt: string;
  allocatedUsd: number;
  realizedPnlUsd: number;
  copyModelKey: CopyBuyModelKey;
  copyModelConfig: CopyBuyModelConfig;
  copyModelSummary: string;
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
  usdcBalance?: number;
}

interface TokenMeta {
  symbol: string;
  name: string;
  logoURI: string | null;
}

interface StarTraderSummary {
  wallet: string;
  name: string;
  image?: string;
}

// =============================================================================
// FORMATTING UTILITIES
// =============================================================================

function formatAmount(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  if (Math.abs(amount) >= 1000000) return (amount / 1000000).toFixed(2) + 'M';
  if (Math.abs(amount) >= 1000) return (amount / 1000).toFixed(2) + 'K';
  if (Math.abs(amount) >= 0.01) return amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
  if (amount === 0) return '0';
  
  // Use subscript notation for very small numbers: 0.0₈3436
  const absAmount = Math.abs(amount);
  const str = absAmount.toFixed(20); // Get full precision string
  const match = str.match(/^0\.0*([1-9]\d*)/);
  if (match) {
    const leadingZeros = str.indexOf(match[1]) - 2; // Count zeros after decimal
    const significantDigits = match[1].slice(0, 4); // Take first 4 significant digits
    const subscripts = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
    const subscriptNum = String(leadingZeros).split('').map(d => subscripts[parseInt(d)]).join('');
    return (amount < 0 ? '-' : '') + '0.0' + subscriptNum + significantDigits;
  }
  return amount.toFixed(6);
}

function formatUsd(amount: number | null): string {
  if (amount === null || amount === undefined) return '—';
  if (Math.abs(amount) < 1e-10) return '$0.00';
  if (Math.abs(amount) >= 1000000) return '$' + (amount / 1000000).toFixed(2) + 'M';
  if (Math.abs(amount) >= 1000) return '$' + (amount / 1000).toFixed(2) + 'K';
  if (Math.abs(amount) < 0.01 && amount !== 0) return '$' + amount.toFixed(4);
  return '$' + amount.toFixed(2);
}

function formatPrice(price: number | null): string {
  if (price === null || price === undefined) return '—';
  if (price >= 1000) return '$' + (price / 1000).toFixed(2) + 'K';
  if (price >= 1) return '$' + price.toFixed(2);
  if (price >= 0.01) return '$' + price.toFixed(4);
  if (price >= 0.0001) return '$' + price.toFixed(6);
  if (price === 0) return '$0.00';
  
  // Use subscript notation for very small prices: $0.0₈3436
  const str = price.toFixed(20);
  const match = str.match(/^0\.0*([1-9]\d*)/);
  if (match) {
    const leadingZeros = str.indexOf(match[1]) - 2;
    const significantDigits = match[1].slice(0, 4);
    const subscripts = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
    const subscriptNum = String(leadingZeros).split('').map(d => subscripts[parseInt(d)]).join('');
    return '$0.0' + subscriptNum + significantDigits;
  }
  return '$' + price.toFixed(8);
}

function formatLatency(ms: number | null): string {
  if (ms === null || ms === undefined) return '—';
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
  return ms.toFixed(0) + 'ms';
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  if (!Number.isFinite(date)) return '—';
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 'Unknown creation time';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// =============================================================================
// COMPONENTS
// =============================================================================

function PortfolioBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden min-w-[80px]">
        <div 
          className="h-full rounded-full"
          style={{ 
            width: `${Math.min(100, percent)}%`,
            background: 'linear-gradient(90deg, #10B981 0%, #34D399 100%)'
          }}
        />
      </div>
      <span className="font-mono text-xs font-medium min-w-[45px] text-right" style={{ color: COLORS.text }}>{percent.toFixed(1)}%</span>
    </div>
  );
}

function signedUsd(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return '—';
  return `${amount >= 0 ? '+' : ''}${formatUsd(amount)}`;
}

function signedPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function TraderStateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isConnected } = useAppKitAccount();
  const { isAuthenticated, user, isLoading: authLoading } = useAuth();
  const { step: onboardingStep, setStep } = useOnboarding();
  const traderStateId = params.id as string;
  const walletAddress = user?.wallet || null;
  
  // State
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  // const [trades, setTrades] = useState<Trade[]>([]); // Replaced by hook
  const [starTraderProfile, setStarTraderProfile] = useState<StarTraderSummary | null>(null);
  const [tokenMeta, setTokenMeta] = useState<Record<string, TokenMeta>>({});
  const [loading, setLoading] = useState(true);
  const [hasCheckedData, setHasCheckedData] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [tradeStats, setTradeStats] = useState({ avgLatency: 0, totalRealizedPnl: 0, completedCount: 0, failedCount: 0, profitableCount: 0, lossCount: 0, profitFactor: 0 });
  const [totalTradeCount, setTotalTradeCount] = useState(0);

  // Tab state for Portfolio/Copy Trades switching
  const [activeTab, setActiveTab] = useState<'portfolio' | 'trades'>('portfolio');
  const [portfolioSort, setPortfolioSort] = useState<'value' | 'pnl' | 'weight'>('value');
  const [showDust, setShowDust] = useState(true);
  const [showStaleOnly, setShowStaleOnly] = useState(false);
  const [showWithdrawReview, setShowWithdrawReview] = useState(false);
  
  // =============================================================================
  // DATA FETCHING
  // =============================================================================
  
  // Ref for tokenMeta to avoid dependency loop in fetchTokenMetadata
  const tokenMetaRef = useRef<Record<string, TokenMeta>>({});
  
  useEffect(() => {
    tokenMetaRef.current = tokenMeta;
  }, [tokenMeta]);
  
  const fetchTokenMetadata = useCallback(async (mints: string[]) => {
    if (mints.length === 0) return;
    // Use ref to check existence without adding dependency
    const missing = mints.filter(m => !tokenMetaRef.current[m]);
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
  }, []); // Stable callback with no dependencies

  const fetchTradesPage = useCallback(async (cursor?: string) => {
     if (!walletAddress || !traderStateId) return { data: [], nextCursor: null };
     
     const url = new URL('/api/demo-vault/trades', window.location.origin);
     url.searchParams.set('wallet', walletAddress);
     url.searchParams.set('traderStateId', traderStateId);
     url.searchParams.set('pageSize', '50');
     if (cursor) url.searchParams.set('cursor', cursor);
     if (cursor) url.searchParams.set('includeSummary', '0');

     const res = await fetch(url.toString());
     const data = await res.json();
     
     if (data.error) throw new Error(data.error);

     // Update stats and total count from latest fetch
     if (data.stats) setTradeStats(data.stats);
     if (typeof data.pagination?.totalCount === 'number') {
       setTotalTradeCount(data.pagination.totalCount);
     }

     // Fetch metadata for new trades
     const mints = new Set<string>();
     data.trades?.forEach((t: Trade) => {
        if (t.token_in_mint) mints.add(t.token_in_mint);
        if (t.token_out_mint) mints.add(t.token_out_mint);
      });
      if (mints.size > 0) {
        fetchTokenMetadata(Array.from(mints));
      }

     return { 
       data: data.trades || [], 
       nextCursor: data.pagination?.nextCursor || null 
     };
  }, [walletAddress, traderStateId, fetchTokenMetadata]);

  const { 
    data: trades, 
    loading: infiniteLoading, 
    hasMore,
    error: tradesPaginationError,
    loadMore: loadMoreTrades,
    lastElementRef, 
    setData: setTrades,
    setCursor: setTradesCursor,
    setHasMore: setTradesHasMore
  } = useInfiniteScroll<Trade>({
    fetchData: fetchTradesPage,
    limit: 50,
    rootMargin: '0px 0px 280px 0px',
    throttleMs: 900
  });

  
  const fetchData = useCallback(async () => {
    if (!walletAddress || !traderStateId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // 1. Fetch Portfolio
      const portfolioRes = await fetch(
        `/api/demo-vault/portfolio?wallet=${walletAddress}&traderStateId=${traderStateId}`
      );
      const portfolioData = await portfolioRes.json();
      
      if (portfolioData.error) {
        setError(portfolioData.error);
        return;
      }
      
      setPortfolio(portfolioData);
      setStarTraderProfile(null);

       // 2. Fetch Initial Trades (Page 1) directly to populate stats/metadata immediately
       // We reuse the fetchTradesPage logic but call it manually to init the hook state
       const initialTradesRes = await fetchTradesPage();
       setTrades(initialTradesRes.data);
       setTradesCursor(initialTradesRes.nextCursor);
       setTradesHasMore(!!initialTradesRes.nextCursor);
      
      // Meta for portfolio
      const mints = new Set<string>();
      portfolioData.positions?.forEach((p: Position) => mints.add(p.mint));
       if (mints.size > 0) {
         await fetchTokenMetadata(Array.from(mints));
       }

      // 3. Fetch only the followed trader summary instead of the full leaderboard
      const traderRes = await fetch(`/api/star-traders/${portfolioData.starTrader}`);
      const traderData = await traderRes.json();
      if (traderRes.ok && traderData.trader) {
        setStarTraderProfile(traderData.trader);
      }
      
    } catch {
      setError('Failed to fetch data');
    } finally {
      setLoading(false);
      setHasCheckedData(true);
    }
  }, [walletAddress, traderStateId, fetchTradesPage, fetchTokenMetadata, setTrades, setTradesCursor, setTradesHasMore]);

  useEffect(() => {
    if (isConnected && walletAddress) {
      fetchData();
    }
  }, [isConnected, walletAddress, fetchData]);
  
  // =============================================================================
  // ACTIONS
  // =============================================================================
  
  const handleAction = async (action: 'initialize' | 'pause' | 'resume' | 'settle') => {
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

  // Modified: Direct Initialize (No Sync Modal)
  const handleInitClick = async () => {
    // Check balance warning
    const balance = portfolio?.usdcBalance || 0;
    if (balance < 10) {
      if (!confirm(`Your Available USDC ($${balance.toFixed(2)}) is low. Recommended: $100+. Continue?`)) {
        return;
      }
    }
    
    // Direct initialize action
    const initialized = await handleAction('initialize');
    if (initialized) {
      if (onboardingStep === 'INITIALIZE') {
          setStep('COMPLETE');
      }
      // Success feedback handled by UI state update
    }
  };
  
  const handleWithdraw = async () => {
    if (!walletAddress || !traderStateId) return;
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
  
  if (loading || authLoading || (isConnected && isAuthenticated && !hasCheckedData)) {
    return <PageLoader />;
  }
  
  if (!isConnected || !walletAddress) {
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
    realizedPnlUsd, unrealizedPnL, copyModelKey, copyModelConfig, copyModelSummary,
    createdAt,
  } = portfolio;
  
  const avgLatency = tradeStats.avgLatency;
  const totalTrades = getDemoTradeCount(tradeStats);
  
  const profitFactor = tradeStats.profitFactor || 0;
  const modelKey = (copyModelKey || 'current_ratio') as CopyBuyModelKey;
  const dustPositions = positions.filter((position) => (position.currentValue ?? 0) < 0.01 && position.mint !== 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v').length;
  const stalePriceCount = positions.filter((position) => position.priceStale || position.currentPrice === null).length;
  const currentValuePct = allocatedUsd > 0 ? Math.max(0, (portfolioValue / allocatedUsd) * 100) : 0;
  const wins = tradeStats.profitableCount || 0;
  const losses = tradeStats.lossCount || 0;
  const closedSellOutcomes = wins + losses;
  const shownPositions = positions
    .filter((position) => {
      const isDust = (position.currentValue ?? 0) < 0.01 && position.mint !== 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const isStale = position.priceStale || position.currentPrice === null;
      if (!showDust && isDust) return false;
      if (showStaleOnly && !isStale) return false;
      return true;
    })
    .sort((a, b) => {
      if (portfolioSort === 'pnl') return (b.unrealizedPnL ?? -Infinity) - (a.unrealizedPnL ?? -Infinity);
      if (portfolioSort === 'weight') return (b.portfolioPercent ?? -Infinity) - (a.portfolioPercent ?? -Infinity);
      return (b.currentValue ?? -Infinity) - (a.currentValue ?? -Infinity);
    });
  
  // =============================================================================
  // RENDER
  // =============================================================================
  
  return (
    <div className="cyber-vault-shell min-h-screen animate-in fade-in duration-700 text-white">
      <main className="cyber-vault-content w-full px-4 py-5 pt-20 sm:px-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/demo-vault"
            className="cyber-control group inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold transition active:scale-[0.98]"
          >
            <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
            Back to vault
          </Link>
          <div className="cyber-command text-[10px] text-white/35">Demo simulation · no real funds</div>
        </div>

        <section className="cyber-panel mb-4 border p-4 sm:p-5">
          <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr_auto] xl:items-center">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Trader State Health</h1>
                <StatusBadge isSettled={isSettled} isPaused={isPaused} isInitialized={isInitialized} />
                <code className="border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[11px] text-white/55">
                  {traderStateId.slice(0, 8)}...{traderStateId.slice(-4)}
                </code>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-3">
                <Link
                  href={`/star-traders/${starTrader}`}
                  className="cyber-panel-soft cyber-hover-slice group flex min-w-[220px] items-center gap-3 border px-3 py-2 transition"
                >
                  <TraderAvatar address={starTrader} image={starTraderProfile?.image} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{starTraderProfile?.name || 'Unknown Trader'}</div>
                    <div className="truncate font-mono text-[11px] text-white/40">{starTrader.slice(0, 6)}...{starTrader.slice(-4)}</div>
                  </div>
                  <ArrowUpRight size={13} className="ml-auto text-[#00FF85] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
                <CopyModelBadge modelKey={modelKey} config={copyModelConfig} summary={copyModelSummary} />
              </div>

              <div className="grid gap-2">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="cyber-command mb-1 flex items-center gap-1 text-[10px] text-emerald-300">
                      Current Value
                      <InfoTooltip>
                        <strong>Current Value</strong><br /><br />
                        Estimated demo value for this trader state, including USDC balance and priced open positions. Stale or unpriced tokens can make this estimate conservative.
                      </InfoTooltip>
                    </div>
                    <div className="font-mono text-3xl font-semibold tabular-nums sm:text-4xl">{formatUsd(portfolioValue)}</div>
                  </div>
                  <div className={`text-right font-mono text-sm font-semibold ${totalPnL >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    <div>{signedUsd(totalPnL)}</div>
                    <div>{signedPercent(totalPnLPercent)}</div>
                  </div>
                </div>
                <div className="h-3 overflow-hidden bg-white/10">
                  <div className="cyber-progress h-full bg-[#00FF85]/80" style={{ width: `${Math.min(100, currentValuePct)}%` }} />
                </div>
                <div className="flex flex-wrap justify-between gap-2 font-mono text-[11px] text-white/45">
                  <span>{formatUsd(allocatedUsd)} allocated</span>
                  <span>{Math.round(currentValuePct)}% of allocated value</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
              <MetricTile label="Avg Latency" value={formatLatency(avgLatency)} helper="Average copy delay">
                <div className="mt-2 flex items-center gap-1 text-xs text-white/45">
                  Detection to copy event.
                  <InfoTooltip>
                    <strong>Average Latency</strong><br /><br />
                    Average delay between the star trader transaction and the demo copy event recorded by the system.
                  </InfoTooltip>
                </div>
              </MetricTile>
              <MetricTile label="State Age" value={timeAgo(createdAt)} helper={`Created ${formatDateTime(createdAt)}`}>
                <div className="mt-2 flex items-center gap-1 text-xs text-white/45">
                  Time since setup.
                  <InfoTooltip>
                    <strong>State Age</strong><br /><br />
                    How long this trader state has existed. The exact creation time is shown above.
                  </InfoTooltip>
                </div>
              </MetricTile>
              <MetricTile label="Dust / Dead" value={dustPositions} tone={dustPositions > 0 ? 'warning' : 'neutral'} helper="Near-zero open positions">
                <div className="mt-2 flex items-center gap-1 text-xs text-white/45">
                  Low-value leftovers.
                  <InfoTooltip>
                    <strong>Dust / Dead Positions</strong><br /><br />
                    Positions with near-zero current value. These can happen after partial sells, rugs, or tokens that no longer price cleanly.
                  </InfoTooltip>
                </div>
              </MetricTile>
              <MetricTile label="Price Status" value={stalePriceCount ? `${stalePriceCount} stale` : 'Fresh'} tone={stalePriceCount ? 'warning' : 'positive'} helper="Based on available price data">
                <div className="mt-2 flex items-center gap-1 text-xs text-white/45">
                  Pricing freshness.
                  <InfoTooltip>
                    <strong>Price Status</strong><br /><br />
                    Shows whether open positions have fresh price data. Stale prices can make current value and unrealized PnL less reliable.
                  </InfoTooltip>
                </div>
              </MetricTile>
            </div>

            <div className="flex flex-wrap gap-2 xl:w-[260px] xl:flex-col">
              {!isInitialized && !isSettled && (
                <button
                  onClick={handleInitClick}
                  disabled={actionLoading}
                  className="cyber-action-primary border border-emerald-400/60 bg-emerald-400/12 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200 transition hover:bg-emerald-400/18 disabled:opacity-50"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2"><Play size={13} /> Start copying</span>
                </button>
              )}

              {isInitialized && !isSettled && (
                isPaused ? (
                  <button
                    onClick={() => handleAction('resume')}
                    disabled={actionLoading}
                    className="cyber-action-primary border border-emerald-400/60 bg-emerald-400/12 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200 transition hover:bg-emerald-400/18 disabled:opacity-50"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2"><Play size={13} /> Resume copying</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleAction('pause')}
                    disabled={actionLoading}
                    className="cyber-action-primary border border-amber-400/55 bg-amber-400/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-amber-200 transition hover:bg-amber-400/16 disabled:opacity-50"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2"><Pause size={13} /> Pause</span>
                  </button>
                )
              )}

              <button
                onClick={fetchData}
                disabled={loading || actionLoading}
                className="cyber-control inline-flex items-center justify-center gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/80 disabled:opacity-50"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>

              <button
                onClick={() => setShowWithdrawReview(true)}
                disabled={actionLoading}
                className="cyber-control border-red-400/45 bg-red-500/10 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-red-200 transition hover:border-red-300/70 hover:bg-red-500/16 disabled:opacity-50"
              >
                Withdraw
              </button>
            </div>
          </div>
        </section>

        <section className="mb-4 grid gap-3 lg:grid-cols-6">
          <MetricTile label="Allocated" value={formatUsd(allocatedUsd)}>
            <div className="mt-2 flex items-center gap-1 text-xs text-white/45">
              Funds reserved for this trader state.
              <InfoTooltip>
                <strong>Allocated Funds</strong><br /><br />
                Demo capital reserved for this one trader setup. It is separate from free cash in the main demo vault.
              </InfoTooltip>
            </div>
          </MetricTile>
          <MetricTile label="Total PnL" value={`${signedUsd(totalPnL)} (${signedPercent(totalPnLPercent)})`} tone={totalPnL >= 0 ? 'positive' : 'negative'}>
            <div className="mt-2 flex items-center gap-1 text-xs text-white/45">
              Realized plus unrealized result.
              <InfoTooltip>
                <strong>Total PnL</strong><br /><br />
                The full result for this setup: realized profit from completed sells plus the current paper result on open positions.
              </InfoTooltip>
            </div>
          </MetricTile>
          <MetricTile label="Realized" value={signedUsd(realizedPnlUsd)} tone={realizedPnlUsd >= 0 ? 'positive' : 'negative'} />
          <MetricTile label="Unrealized" value={signedUsd(unrealizedPnL)} tone={unrealizedPnL >= 0 ? 'positive' : 'negative'} />
          <MetricTile label="Profit Factor" value={`${profitFactor.toFixed(2)}x`} tone={profitFactor >= 1 ? 'positive' : 'negative'}>
            <div className="mt-2 flex items-center gap-1 text-xs text-white/45">
              Gross profit divided by gross loss.
              <InfoTooltip>
                <strong>Profit Factor</strong><br /><br />
                Shows whether profitable sells outweigh losing sells. Above 1.0 means gains are larger than losses.
              </InfoTooltip>
            </div>
          </MetricTile>
          <MetricTile
            label="Wins / Losses"
            value={(
              <span>
                <span className="text-emerald-300">{wins}</span>
                <span className="text-white/35"> / </span>
                <span className="text-red-300">{losses}</span>
              </span>
            )}
            helper={`${closedSellOutcomes} closed sell outcomes`}
          >
            <div className="mt-2 flex items-center gap-1 text-xs text-white/45">
              Completed sells only.
              <InfoTooltip>
                <strong>Wins / Losses</strong><br /><br />
                A win is a completed sell with realized profit. A loss is a completed sell with negative realized PnL. Buys, skipped trades, failed trades, and open positions are not counted here.
              </InfoTooltip>
            </div>
          </MetricTile>
        </section>

        <section className="cyber-panel border">
          <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setActiveTab('portfolio')}
                aria-current={activeTab === 'portfolio' ? 'page' : undefined}
                className={`cyber-control relative px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                  activeTab === 'portfolio'
                    ? '!border-[#00FF85] !bg-[#00FF85] !text-black shadow-[0_0_22px_rgba(0,255,133,0.2),inset_0_-2px_0_rgba(0,0,0,0.35)]'
                    : 'text-white/55'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  Portfolio ({shownPositions.length}/{positions.length})
                </span>
              </button>
              <button
                onClick={() => setActiveTab('trades')}
                aria-current={activeTab === 'trades' ? 'page' : undefined}
                className={`cyber-control relative px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                  activeTab === 'trades'
                    ? '!border-[#00FF85] !bg-[#00FF85] !text-black shadow-[0_0_22px_rgba(0,255,133,0.2),inset_0_-2px_0_rgba(0,0,0,0.35)]'
                    : 'text-white/55'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  Copy Trades ({typeof totalTradeCount === 'number' ? totalTradeCount : (totalTrades || trades.length)})
                </span>
              </button>
            </div>

            {activeTab === 'portfolio' && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="cyber-command text-[10px] text-white/45" htmlFor="position-sort">Sort</label>
                <select
                  id="position-sort"
                  value={portfolioSort}
                  onChange={(event) => setPortfolioSort(event.target.value as 'value' | 'pnl' | 'weight')}
                  className="cyber-control px-3 py-2 text-xs"
                >
                  <option value="value">Value</option>
                  <option value="pnl">PnL</option>
                  <option value="weight">Weight</option>
                </select>
                <button
                  onClick={() => setShowDust((value) => !value)}
                  className={`cyber-control px-3 py-2 text-xs uppercase tracking-[0.12em] ${showDust ? 'text-white/70' : 'border-emerald-400/60 text-emerald-200'}`}
                >
                  {showDust ? 'Hide dust' : 'Show dust'}
                </button>
                <InfoTooltip>
                  <strong>Dust positions</strong><br /><br />
                  Very small open positions can make this trader state look noisy. Hide dust to focus on positions that still have meaningful value.
                </InfoTooltip>
                <button
                  onClick={() => setShowStaleOnly((value) => !value)}
                  className={`cyber-control px-3 py-2 text-xs uppercase tracking-[0.12em] ${showStaleOnly ? 'border-amber-400/60 text-amber-200' : 'text-white/70'}`}
                >
                  Stale only
                </button>
                <InfoTooltip>
                  <strong>Stale prices</strong><br /><br />
                  Shows positions where current price data is missing or stale. These tokens may be dead, illiquid, or unavailable from the price source.
                </InfoTooltip>
              </div>
            )}
          </div>
          
          {activeTab === 'portfolio' && (
            <div>
              <div className="hidden md:block">
                <div className="cyber-table-header grid grid-cols-[minmax(190px,1.25fr)_0.8fr_0.8fr_0.8fr_0.8fr_1fr_1.05fr] gap-3 border-b border-white/10 px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-white/50">
                  <div>Token</div>
                  <div className="flex items-center gap-1">
                    Amount
                    <InfoTooltip>
                      <strong>Token Amount</strong><br /><br />
                      The quantity of this token currently held in this trader state.
                    </InfoTooltip>
                  </div>
                  <div className="flex items-center gap-1">
                    Avg Entry
                    <InfoTooltip>
                      <strong>Average Entry</strong><br /><br />
                      The weighted average price paid for the current open position.
                    </InfoTooltip>
                  </div>
                  <div className="flex items-center gap-1">
                    Price
                    <InfoTooltip>
                      <strong>Current Price</strong><br /><br />
                      Latest available market price. A dash means the price source could not value the token.
                    </InfoTooltip>
                  </div>
                  <div className="flex items-center gap-1">
                    Value
                    <InfoTooltip>
                      <strong>Position Value</strong><br /><br />
                      Estimated current USD value of this holding.
                    </InfoTooltip>
                  </div>
                  <div className="flex items-center gap-1">
                    PnL
                    <InfoTooltip>
                      <strong>Unrealized PnL</strong><br /><br />
                      Paper profit or loss on this open position compared with its cost basis.
                    </InfoTooltip>
                  </div>
                  <div className="flex items-center gap-1">
                    % Portfolio
                    <InfoTooltip>
                      <strong>Portfolio Weight</strong><br /><br />
                      How much of this trader state&apos;s current value is concentrated in this token.
                    </InfoTooltip>
                  </div>
                </div>

                <div>
                  {shownPositions.length === 0 ? (
                    <div className="px-5 py-12 text-center text-sm text-white/45">
                      No positions match the current filters.
                    </div>
                  ) : (
                    shownPositions.map((pos) => {
                      const meta = tokenMeta[pos.mint] || { symbol: pos.symbol, name: pos.name, logoURI: pos.logoURI };
                      const pnl = pos.unrealizedPnL;
                      const pnlPercent = pos.unrealizedPercent;
                      const isPositive = (pnl ?? 0) >= 0;
                      const isStale = pos.priceStale || pos.currentPrice === null;

                      return (
                        <div
                          key={pos.mint}
                          className="cyber-row grid grid-cols-[minmax(190px,1.25fr)_0.8fr_0.8fr_0.8fr_0.8fr_1fr_1.05fr] items-center gap-3 border-b border-white/[0.06] px-5 py-3"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <TokenIcon symbol={meta.symbol || pos.symbol} logoURI={meta.logoURI || pos.logoURI} />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">{meta.symbol || pos.symbol}</div>
                              <div className="truncate text-xs text-white/40">{meta.name || pos.name}</div>
                            </div>
                            {isStale && <span className="border border-amber-400/35 bg-amber-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-amber-300">stale</span>}
                          </div>
                          <div className="font-mono text-sm tabular-nums text-white/80">{formatAmount(pos.amount)}</div>
                          <div className="font-mono text-sm tabular-nums text-white/55">{formatPrice(pos.avgCost)}</div>
                          <div className="font-mono text-sm tabular-nums text-white/55">{formatPrice(pos.currentPrice)}</div>
                          <div className="font-mono text-sm font-semibold tabular-nums">{formatUsd(pos.currentValue)}</div>
                          <div className={`font-mono text-sm font-semibold tabular-nums ${isPositive ? 'text-emerald-300' : 'text-red-300'}`}>
                            {pnl !== null ? signedUsd(pnl) : '—'}
                            {pnlPercent !== null && <span className="ml-1 text-xs">({signedPercent(pnlPercent)})</span>}
                          </div>
                          <PortfolioBar percent={pos.portfolioPercent ?? 0} />
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="grid gap-3 p-3 md:hidden">
                {shownPositions.length === 0 ? (
                  <div className="cyber-panel-soft border px-4 py-10 text-center text-sm text-white/45">
                    No positions match the current filters.
                  </div>
                ) : (
                  shownPositions.map((pos) => {
                    const meta = tokenMeta[pos.mint] || { symbol: pos.symbol, name: pos.name, logoURI: pos.logoURI };
                    const pnl = pos.unrealizedPnL;
                    const pnlPercent = pos.unrealizedPercent;
                    const isPositive = (pnl ?? 0) >= 0;
                    const isStale = pos.priceStale || pos.currentPrice === null;

                    return (
                      <article key={pos.mint} className="cyber-panel-soft border p-4">
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <TokenIcon symbol={meta.symbol || pos.symbol} logoURI={meta.logoURI || pos.logoURI} />
                            <div className="min-w-0">
                              <div className="truncate text-base font-semibold">{meta.symbol || pos.symbol}</div>
                              <div className="truncate text-xs text-white/45">{meta.name || pos.name}</div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-base font-semibold">{formatUsd(pos.currentValue)}</div>
                            {isStale && <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-amber-300">stale price</div>}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="cyber-command mb-1 text-[10px] text-white/35">Amount</div>
                            <div className="font-mono">{formatAmount(pos.amount)}</div>
                          </div>
                          <div>
                            <div className="cyber-command mb-1 text-[10px] text-white/35">PnL</div>
                            <div className={`font-mono font-semibold ${isPositive ? 'text-emerald-300' : 'text-red-300'}`}>
                              {pnl !== null ? signedUsd(pnl) : '—'} {pnlPercent !== null ? `(${signedPercent(pnlPercent)})` : ''}
                            </div>
                          </div>
                          <div>
                            <div className="cyber-command mb-1 text-[10px] text-white/35">Avg / Price</div>
                            <div className="font-mono text-white/70">{formatPrice(pos.avgCost)} / {formatPrice(pos.currentPrice)}</div>
                          </div>
                          <div>
                            <div className="cyber-command mb-1 text-[10px] text-white/35">Weight</div>
                            <PortfolioBar percent={pos.portfolioPercent ?? 0} />
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'trades' && (
            <div>
              <div className="hidden md:block">
                <div className="cyber-table-header grid grid-cols-[88px_minmax(280px,2fr)_0.8fr_0.8fr_0.7fr_0.7fr_80px] gap-3 border-b border-white/10 px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-white/50">
                  <div>Type</div>
                  <div className="flex items-center gap-1">
                    Token Flow
                    <InfoTooltip>
                      <strong>Token Flow</strong><br /><br />
                      The simulated swap path for this copied trade. It may fall back to leader amounts when the demo trade did not complete.
                    </InfoTooltip>
                  </div>
                  <div className="flex items-center gap-1">
                    USD Value
                    <InfoTooltip>
                      <strong>USD Value</strong><br /><br />
                      Estimated trade size in USD. Failed trades may show the leader-side value instead.
                    </InfoTooltip>
                  </div>
                  <div className="flex items-center gap-1">
                    Profit
                    <InfoTooltip>
                      <strong>Realized Profit</strong><br /><br />
                      Profit or loss is shown on sell trades when the copied position closes or reduces.
                    </InfoTooltip>
                  </div>
                  <div className="flex items-center gap-1">
                    Latency
                    <InfoTooltip>
                      <strong>Copy Latency</strong><br /><br />
                      Time between the star trader transaction and the demo copy event detected by the system.
                    </InfoTooltip>
                  </div>
                  <div>Age</div>
                  <div>TX</div>
                </div>

                <div>
                  {trades.length === 0 ? (
                    <div className="px-5 py-12 text-center text-sm text-white/45">No copied trades yet.</div>
                  ) : (
                    trades.map((trade) => {
                      const isBuy = trade.type === 'buy';
                      const isFailed = trade.status === 'failed';
                      const pnl = trade.realized_pnl;
                      const isPositive = (pnl ?? 0) >= 0;
                      const inMeta = tokenMeta[trade.token_in_mint] || { symbol: trade.token_in_symbol, logoURI: null };
                      const outMeta = tokenMeta[trade.token_out_mint] || { symbol: trade.token_out_symbol, logoURI: null };
                      const displayInAmount = trade.token_in_amount ?? trade.leader_in_amount;
                      const displayOutAmount = trade.token_out_amount ?? trade.leader_out_amount;
                      const displayUsdValue = trade.usd_value ?? trade.leader_usd_value;

                      return (
                        <div
                          key={trade.id}
                          className={`cyber-row grid grid-cols-[88px_minmax(280px,2fr)_0.8fr_0.8fr_0.7fr_0.7fr_80px] items-center gap-3 border-b border-white/[0.06] px-5 py-3 ${isFailed ? 'bg-red-500/8' : ''}`}
                        >
                          <div>
                            {isFailed ? (
                              <span className="inline-flex items-center gap-1 border border-red-400/45 bg-red-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-300"><X size={10} /> Failed</span>
                            ) : isBuy ? (
                              <span className="inline-flex border border-emerald-400/45 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300">Buy</span>
                            ) : (
                              <span className="inline-flex border border-red-400/45 bg-red-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-300">Sell</span>
                            )}
                          </div>
                          <div className="flex min-w-0 items-center gap-2">
                            <TokenIcon symbol={inMeta.symbol || trade.token_in_symbol} logoURI={inMeta.logoURI} />
                            <span className="truncate font-mono text-sm text-white/80">{formatAmount(displayInAmount)} {inMeta.symbol || trade.token_in_symbol}</span>
                            <ArrowRight size={13} className="shrink-0 text-white/35" />
                            <TokenIcon symbol={outMeta.symbol || trade.token_out_symbol} logoURI={outMeta.logoURI} />
                            <span className="truncate font-mono text-sm text-white/80">{formatAmount(displayOutAmount)} {outMeta.symbol || trade.token_out_symbol}</span>
                          </div>
                          <div className="font-mono text-sm font-semibold">
                            {isFailed ? (
                              <div>
                                <div className="text-red-300">Failed</div>
                                {trade.error_message && (
                                  <div className="mt-1 max-w-[150px] truncate text-[10px] font-normal text-red-300/70" title={trade.error_message}>
                                    {trade.error_message}
                                  </div>
                                )}
                              </div>
                            ) : (
                              formatUsd(displayUsdValue)
                            )}
                          </div>
                          <div className={`font-mono text-sm font-semibold ${isBuy || pnl === null || isFailed ? 'text-white/45' : isPositive ? 'text-emerald-300' : 'text-red-300'}`}>
                            {isFailed || isBuy || pnl === null ? '—' : signedUsd(pnl)}
                          </div>
                          <div className="font-mono text-sm text-white/55">{formatLatency(trade.latency_diff_ms)}</div>
                          <div className="font-mono text-sm text-white/55">{timeAgo(trade.created_at)}</div>
                          <div>
                            {trade.star_trade_signature ? (
                              <SolscanLink signature={trade.star_trade_signature} />
                            ) : (
                              <span className="text-white/35">—</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="grid gap-3 p-3 md:hidden">
                {trades.length === 0 ? (
                  <div className="cyber-panel-soft border px-4 py-10 text-center text-sm text-white/45">No copied trades yet.</div>
                ) : (
                  trades.map((trade) => {
                    const isBuy = trade.type === 'buy';
                    const isFailed = trade.status === 'failed';
                    const pnl = trade.realized_pnl;
                    const isPositive = (pnl ?? 0) >= 0;
                    const inMeta = tokenMeta[trade.token_in_mint] || { symbol: trade.token_in_symbol, logoURI: null };
                    const outMeta = tokenMeta[trade.token_out_mint] || { symbol: trade.token_out_symbol, logoURI: null };
                    const displayInAmount = trade.token_in_amount ?? trade.leader_in_amount;
                    const displayOutAmount = trade.token_out_amount ?? trade.leader_out_amount;
                    const displayUsdValue = trade.usd_value ?? trade.leader_usd_value;

                    return (
                      <article key={trade.id} className={`cyber-panel-soft border p-4 ${isFailed ? 'border-red-400/35 bg-red-500/8' : ''}`}>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <span className={`inline-flex border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${isFailed ? 'border-red-400/45 bg-red-500/10 text-red-300' : isBuy ? 'border-emerald-400/45 bg-emerald-400/10 text-emerald-300' : 'border-red-400/45 bg-red-500/10 text-red-300'}`}>
                            {isFailed ? 'Failed' : isBuy ? 'Buy' : 'Sell'}
                          </span>
                          <span className="font-mono text-xs text-white/45">{timeAgo(trade.created_at)}</span>
                        </div>
                        <div className="mb-4 grid gap-2">
                          <div className="flex items-center gap-2">
                            <TokenIcon symbol={inMeta.symbol || trade.token_in_symbol} logoURI={inMeta.logoURI} />
                            <span className="min-w-0 truncate font-mono text-sm">{formatAmount(displayInAmount)} {inMeta.symbol || trade.token_in_symbol}</span>
                          </div>
                          <div className="pl-3 text-white/35"><ArrowRight size={14} /></div>
                          <div className="flex items-center gap-2">
                            <TokenIcon symbol={outMeta.symbol || trade.token_out_symbol} logoURI={outMeta.logoURI} />
                            <span className="min-w-0 truncate font-mono text-sm">{formatAmount(displayOutAmount)} {outMeta.symbol || trade.token_out_symbol}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="cyber-command mb-1 text-[10px] text-white/35">USD Value</div>
                            <div className="font-mono font-semibold">
                              {isFailed ? (
                                <div>
                                  <div className="text-red-300">Failed</div>
                                  {trade.error_message && (
                                    <div className="mt-1 line-clamp-2 text-[11px] font-normal leading-relaxed text-red-300/75" title={trade.error_message}>
                                      {trade.error_message}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                formatUsd(displayUsdValue)
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="cyber-command mb-1 text-[10px] text-white/35">Profit</div>
                            <div className={`font-mono font-semibold ${isBuy || pnl === null || isFailed ? 'text-white/45' : isPositive ? 'text-emerald-300' : 'text-red-300'}`}>
                              {isFailed || isBuy || pnl === null ? '—' : signedUsd(pnl)}
                            </div>
                          </div>
                          <div>
                            <div className="cyber-command mb-1 text-[10px] text-white/35">Latency</div>
                            <div className="font-mono text-white/70">{formatLatency(trade.latency_diff_ms)}</div>
                          </div>
                          <div>
                            <div className="cyber-command mb-1 text-[10px] text-white/35">Source</div>
                            {trade.star_trade_signature ? (
                              <SolscanLink signature={trade.star_trade_signature} compact />
                            ) : (
                              <span className="text-white/35">—</span>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}

              </div>

              <InfiniteScrollSentinel
                inputRef={lastElementRef}
                loading={infiniteLoading}
                hasMore={hasMore}
                error={tradesPaginationError ? `Could not load more copied trades. ${tradesPaginationError}` : undefined}
                onLoadMore={() => void loadMoreTrades()}
                loadMoreLabel="Load more trades"
                skeleton={<CyberHistorySkeletonRows ariaLabel="Loading more copied trades" />}
                endMessage={trades.length > 0 ? (
                  <div className="flex items-center justify-center gap-4 py-4 opacity-50">
                    <div className="h-px w-12 bg-white/10" />
                    <span className="cyber-command text-[10px] text-white/35">End of history</span>
                    <div className="h-px w-12 bg-white/10" />
                  </div>
                ) : undefined}
              />
            </div>
          )}
        </section>

        <AnimatePresence>
          {showWithdrawReview && (
            <motion.div
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 px-3 py-3 sm:items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="cyber-panel w-full max-w-2xl border bg-[#050505] p-5"
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 24, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="withdraw-review-title"
              >
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="cyber-command mb-2 text-[10px] text-red-300">Review before closing</div>
                    <h2 id="withdraw-review-title" className="text-xl font-semibold">Withdraw and close trader state</h2>
                    <p className="mt-2 text-sm leading-relaxed text-white/55">
                      This returns the current estimated value to your demo vault and removes this trader state. It cannot copy future trades after closing.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowWithdrawReview(false)}
                    className="cyber-icon-button border border-white/15 p-2 text-white/55 transition hover:border-white/35 hover:text-white"
                    aria-label="Close withdraw review"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="grid gap-2 border-y border-white/10 py-4 text-sm">
                  <div className="grid grid-cols-[140px_1fr] gap-3">
                    <span className="text-white/45">Trader</span>
                    <span className="font-semibold">{starTraderProfile?.name || `${starTrader.slice(0, 6)}...${starTrader.slice(-4)}`}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] gap-3">
                    <span className="text-white/45">Copy model</span>
                    <span>{formatCopyBuyModelLabel(modelKey)} · {formatCopyBuyModelConfigBadge(modelKey, copyModelConfig)}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] gap-3">
                    <span className="text-white/45">Estimated return</span>
                    <span className="font-mono font-semibold">{formatUsd(portfolioValue)}</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] gap-3">
                    <span className="text-white/45">Open positions</span>
                    <span>{positions.length} positions, including {dustPositions} near-zero positions</span>
                  </div>
                  <div className="grid grid-cols-[140px_1fr] gap-3">
                    <span className="text-white/45">Result</span>
                    <span>This setup and its copied trade history are removed from the vault.</span>
                  </div>
                </div>

                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setShowWithdrawReview(false)}
                    className="cyber-control px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/70"
                  >
                    Keep setup
                  </button>
                  <button
                    type="button"
                    onClick={handleWithdraw}
                    disabled={actionLoading}
                    className="cyber-action-primary border border-red-400/60 bg-red-500/14 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-red-100 transition hover:bg-red-500/20 disabled:opacity-50"
                  >
                    <span className="relative z-10 inline-flex items-center justify-center gap-2">
                      {actionLoading ? <Loader2 size={13} className="animate-spin" /> : <StopCircle size={13} />}
                      Withdraw and close
                    </span>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
