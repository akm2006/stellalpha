'use client';

import PageLoader from '@/components/PageLoader';


import { createPortal } from 'react-dom';

import { useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAppKitAccount } from '@reown/appkit/react';
import { useAuth } from '@/contexts/auth-context';
import { useOnboarding } from '@/contexts/onboarding-context';
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
  CheckCircle,
  ExternalLink,
  X,
  Loader2,
  Info,
  TrendingUp,
  TrendingDown,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SkeletonRow } from '@/components/SkeletonRow';

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
  status: 'queued' | 'processing' | 'completed' | 'failed';
  error_message: string | null;
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
  usdcBalance?: number;
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
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// =============================================================================
// COMPONENTS
// =============================================================================

function TokenIcon({ symbol, logoURI }: { symbol: string; logoURI?: string | null }) {
  const [imgError, setImgError] = useState(false);
  
  if (logoURI && !imgError) {
    return (
      <img 
        src={logoURI}
        alt={symbol}
        className="w-7 h-7 rounded-full"
        onError={() => setImgError(true)}
      />
    );
  }
  
  return (
    <div 
      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
      style={{ backgroundColor: '#262626', color: '#fff' }}
    >
      {symbol?.charAt(0) || '?'}
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

// Portfolio Progress Bar - Professional Style
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
  const [starTraders, setStarTraders] = useState<{ address: string; name: string; image?: string }[]>([]);
  const [tokenMeta, setTokenMeta] = useState<Record<string, TokenMeta>>({});
  const [loading, setLoading] = useState(true);
  const [hasCheckedData, setHasCheckedData] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [tradeStats, setTradeStats] = useState({ avgLatency: 0, totalRealizedPnl: 0, completedCount: 0, failedCount: 0, profitableCount: 0, lossCount: 0, profitFactor: 0 });
  const [totalTradeCount, setTotalTradeCount] = useState(0);

  // Tab state for Portfolio/Copy Trades switching
  const [activeTab, setActiveTab] = useState<'portfolio' | 'trades'>('portfolio');
  
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

     const res = await fetch(url.toString());
     const data = await res.json();
     
     if (data.error) throw new Error(data.error);

     // Update stats and total count from latest fetch
     if (data.stats) setTradeStats(data.stats);
     if (data.pagination) setTotalTradeCount(data.pagination.totalCount);

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
    lastElementRef, 
    setData: setTrades,
    setCursor: setTradesCursor,
    setHasMore: setTradesHasMore
  } = useInfiniteScroll<Trade>({
    fetchData: fetchTradesPage,
    limit: 50,
    rootMargin: '100px', // Explicit strict triggering
    throttleMs: 500
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
      
    } catch {
      setError('Failed to fetch data');
    } finally {
      setLoading(false);
      setHasCheckedData(true);
    }
  }, [walletAddress, traderStateId, fetchTradesPage, fetchTokenMetadata, setTrades, setTradesCursor, setTradesHasMore]);

  
  const fetchStarTraders = useCallback(async () => {
    try {
      const response = await fetch('/api/star-traders');
      const data = await response.json();
      setStarTraders((data.traders || []).map((t: any) => ({ address: t.wallet, name: t.name, image: t.image })));
    } catch {
      // Silent error
    }
  }, []);

  useEffect(() => {
    if (isConnected && walletAddress) {
      fetchData();
      fetchStarTraders();
    }
  }, [isConnected, walletAddress, fetchData, fetchStarTraders]);
  
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
        // handled by UI state update
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
    if (!walletAddress || !traderStateId || !confirm('Withdraw all funds and delete this trader state?')) return;
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
    realizedPnlUsd, unrealizedPnL
  } = portfolio;
  
  const avgLatency = tradeStats.avgLatency;
  const totalTrades = tradeStats.completedCount + tradeStats.failedCount;
  
  // Win Rate = Profitable / (Profitable + Loss)
  const totalClosedTrades = (tradeStats.profitableCount || 0) + (tradeStats.lossCount || 0);
  const winRate = totalClosedTrades > 0 ? Math.round(((tradeStats.profitableCount || 0) / totalClosedTrades) * 100) : 0;
  const profitFactor = tradeStats.profitFactor || 0;
  
  // =============================================================================
  // RENDER
  // =============================================================================
  
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
      <main className="w-full px-5 py-4 pt-20">
        
        {/* Back Button */}
        <Link 
          href="/demo-vault"
          className="group inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-white/10 rounded hover:bg-white/5 transition-all duration-200 mb-4 hover:border-white/20 active:scale-[0.98]"
          style={{ color: COLORS.text }}
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform duration-200" /> Back
        </Link>
        
        {/* ===== CONTROL DECK ROW 1: Header - Responsive ===== */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-3 py-3 px-4 sm:px-5 border border-white/10 bg-white/[0.02] animate-fade-up" style={{ backgroundColor: COLORS.surface }}>
          {/* Top Row: Title + Status + UUID */}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-lg sm:text-xl font-semibold" style={{ color: COLORS.text }}>Trader State</h1>
            {isSettled ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider font-medium rounded border border-gray-500/30 bg-gray-500/10 text-gray-400">
                <StopCircle size={10} /> Settled
              </span>
            ) : isPaused ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider font-medium rounded border border-yellow-500/30 bg-yellow-500/10 text-yellow-400">
                <Pause size={10} /> Paused
              </span>
            ) : isInitialized ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider font-medium rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <CheckCircle size={10} /> Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] uppercase tracking-wider font-medium rounded border border-orange-500/30 bg-orange-500/10 text-orange-400">
                <Clock size={10} /> Pending
              </span>
            )}
            {/* UUID */}
            <div className="flex items-center gap-2 px-2 py-1 bg-white/[0.02] border border-white/10 rounded">
              <span className="text-[10px] uppercase tracking-wider" style={{ color: COLORS.data }}>ID:</span>
              <code className="font-mono text-[10px] sm:text-xs" style={{ color: COLORS.text }}>{traderStateId.slice(0, 8)}...{traderStateId.slice(-4)}</code>
            </div>
          </div>
          
          {/* Middle Row: Following Badge */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: COLORS.data }}>Following:</span>
            <Link 
              href={`/star-traders/${starTrader}`}
              className="flex items-center gap-2 px-2 sm:px-3 py-1.5 bg-white/[0.03] border border-white/10 rounded hover:bg-white/5 transition-all duration-200 hover:scale-[1.02] group"
            >
              <div className="transition-transform duration-200 group-hover:scale-110">
                <TraderAvatar 
                  address={starTrader} 
                  image={starTraders.find(t => t.address === starTrader)?.image}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-semibold text-xs sm:text-sm truncate" style={{ color: COLORS.text }}>
                   {starTraders.find(t => t.address === starTrader)?.name || 'Unknown Trader'}
                </span>
                <span className="font-mono text-[10px] opacity-60 truncate" style={{ color: COLORS.data }}>
                  {starTrader.slice(0, 4)}...{starTrader.slice(-4)}
                </span>
              </div>
              <ArrowUpRight size={12} style={{ color: COLORS.brand }} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-200 ml-1" />
            </Link>
          </div>
          
          {/* Right: Action Buttons - Professional Outline Style */}
          <div className="flex items-center gap-2">
            {!isInitialized && !isSettled && (
              <div className="flex items-center gap-1">
                <button 
                  onClick={handleInitClick} 
                  disabled={actionLoading} 
                  className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 shadow-lg ${
                    onboardingStep === 'INITIALIZE' 
                      ? 'bg-emerald-500 text-white border-emerald-400 hover:bg-emerald-600 shadow-emerald-500/20 ring-2 ring-emerald-400 ring-offset-2 ring-offset-black animate-pulse' 
                      : 'shadow-emerald-500/10'
                  }`} 
                  style={onboardingStep === 'INITIALIZE' ? {} : { 
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderColor: 'rgba(16, 185, 129, 0.5)',
                    color: '#10B981'
                  }}
                >
                  <span className="flex items-center gap-1.5"><Play size={12} /> Initialize</span>
                </button>
                <InfoTooltip>
                  <strong>Initialize Copy Engine</strong><br/><br/>
                  Activates the Copy Engine. The bot will use your available USDC (Vault Balance) to mirror <strong>new</strong> trades from this trader.<br/><br/>
                  Funds remain in your control.
                </InfoTooltip>
              </div>
            )}
            
            {isInitialized && !isSettled && (
              isPaused ? (
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handleAction('resume')} 
                    disabled={actionLoading} 
                    className="px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 shadow-lg shadow-emerald-500/10"
                    style={{ 
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      borderColor: 'rgba(16, 185, 129, 0.5)',
                      color: '#10B981'
                    }}
                  >
                    <span className="flex items-center gap-1.5"><Play size={12} /> Resume</span>
                  </button>
                  <InfoTooltip>
                    <strong>Resume Copy Trading</strong><br/><br/>
                    Re-enables automatic trade mirroring. Any open positions will be managed again, and new trades from the star trader will be copied.
                  </InfoTooltip>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handleAction('pause')} 
                    disabled={actionLoading} 
                    className="px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 shadow-lg shadow-amber-500/10"
                    style={{ 
                      backgroundColor: 'rgba(245, 158, 11, 0.1)',
                      borderColor: 'rgba(245, 158, 11, 0.5)',
                      color: '#F59E0B'
                    }}
                  >
                    <span className="flex items-center gap-1.5"><Pause size={12} /> Pause</span>
                  </button>
                  <InfoTooltip>
                    <strong>Pause Copy Trading</strong><br/><br/>
                    Temporarily stops copying new trades. Existing positions remain open but will not be modified by the auto-trader until resumed.
                  </InfoTooltip>
                </div>
              )
            )}
            
            <div className="flex items-center gap-1">
              <button 
                onClick={handleWithdraw} 
                disabled={actionLoading} 
                className="px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 hover:bg-red-500/20"
                style={{ 
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  borderColor: 'rgba(239, 68, 68, 0.5)',
                  color: '#EF4444'
                }}
              >
                Withdraw
              </button>
              <InfoTooltip>
                <strong>Withdraw & Close</strong><br/><br/>
                Sells all open positions to USDC and returns funds to your main vault balance. This permanently closes this trader state.
              </InfoTooltip>
            </div>
          </div>
        </div>
        
        {/* ===== CONTROL DECK ROW 2: Stats HUD Strip ===== */}
        <div className="border border-white/10 mb-4 overflow-x-auto animate-fade-up delay-100" style={{ backgroundColor: COLORS.surface }}>
          <div className="flex items-stretch divide-x divide-white/10 min-w-[700px]">
            <div className="flex-1 px-5 py-4 bg-white/[0.03] text-center transition-colors duration-300 hover:bg-white/[0.06]">
              <div className="text-xs uppercase tracking-wider mb-1.5" style={{ color: COLORS.data }}>Allocated</div>
              <div className="text-lg font-mono font-semibold" style={{ color: COLORS.text }}>{formatUsd(allocatedUsd)}</div>
            </div>
            <div className="flex-1 px-5 py-4 bg-white/[0.03] text-center">
              <div className="text-xs uppercase tracking-wider mb-1.5" style={{ color: COLORS.data }}>Portfolio Value</div>
              <div className="text-lg font-mono font-semibold" style={{ color: COLORS.text }}>{formatUsd(portfolioValue)}</div>
            </div>
            <div className="flex-1 px-5 py-4 bg-white/[0.03] text-center">
              <div className="text-xs uppercase tracking-wider mb-1.5" style={{ color: COLORS.data }}>Total PNL</div>
              <div className={`text-lg font-mono font-semibold ${totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totalPnL >= 0 ? '+' : ''}{formatUsd(totalPnL)} ({totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(1)}%)
              </div>
              {/* Realized/Unrealized - Stacked for centering */}
              <div className="flex justify-center gap-4 mt-2 text-sm font-mono">
                <span style={{ color: COLORS.data }}>
                  Realized: <span className={`font-semibold ${realizedPnlUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{realizedPnlUsd >= 0 ? '+' : ''}{formatUsd(realizedPnlUsd)}</span>
                </span>
                <span style={{ color: COLORS.data }}>
                  Unrealized: <span className={`font-semibold ${unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{unrealizedPnL >= 0 ? '+' : ''}{formatUsd(unrealizedPnL)}</span>
                </span>
              </div>
            </div>
            <div className="flex-1 px-5 py-4 bg-white/[0.03] text-center">
              <div className="text-xs uppercase tracking-wider mb-1.5 flex items-center justify-center gap-1" style={{ color: COLORS.data }}>
                Profit Factor
                <InfoTooltip>
                  <strong>Profit Factor</strong><br/><br/>
                  Efficiency metric: Total Gross Profit / Total Gross Loss. &gt; 1.0 is profitable.
                </InfoTooltip>
              </div>
              <div className={`text-lg font-mono font-semibold ${profitFactor >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                {profitFactor.toFixed(2)}x
              </div>
            </div>
            <div className="flex-1 px-5 py-4 bg-white/[0.03] text-center">
              <div className="text-xs uppercase tracking-wider mb-1.5 flex items-center justify-center gap-1" style={{ color: COLORS.data }}>
                Trades
                <InfoTooltip>
                  <strong>Win / Loss Count</strong><br/><br/>
                  <span className="text-emerald-400">Green</span>: Profitable trades<br/>
                  <span className="text-red-400">Red</span>: Loss trades
                </InfoTooltip>
              </div>
              <div className="text-lg font-mono font-semibold" style={{ color: COLORS.text }}>
                {/* Wins / Losses Breakdown */}
                <span className="text-emerald-400">{tradeStats.profitableCount}</span>
                <span className="text-white/30 mx-2">/</span>
                <span className="text-red-400">{tradeStats.lossCount}</span>
              </div>
            </div>
            <div className="flex-1 px-5 py-4 bg-white/[0.03] text-center">
              <div className="text-xs uppercase tracking-wider mb-1.5 flex items-center justify-center gap-1" style={{ color: COLORS.data }}>
                Avg Latency
                <InfoTooltip>
                  <strong>Copy Trade Latency</strong><br/><br/>
                  Time difference between the Star Trader&apos;s transaction and your Vault&apos;s copy execution.<br/><br/>
                  ⚠️ <strong>Simulation Mode:</strong> This demo performs <strong>no on-chain interactions</strong>. It simulates trades via database sync to show you how the logic works.<br/><br/>
                  In production, we leverage Solana&apos;s <strong>~400ms block times</strong> for near-instant copy execution.
                </InfoTooltip>
              </div>
              <div className="text-lg font-mono font-semibold" style={{ color: COLORS.text }}>{formatLatency(avgLatency)}</div>
            </div>
          </div>
        </div>
        
        {/* ===== TAB SWITCHER ===== */}
        <div className="border border-white/10 overflow-hidden animate-fade-up delay-200" style={{ backgroundColor: COLORS.surface }}>
          <div className="px-5 py-3 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setActiveTab('portfolio')}
                className={`px-4 py-2 text-sm font-medium rounded-t transition-all duration-200 ${activeTab === 'portfolio' ? 'bg-white/[0.05] border-b-2' : 'hover:bg-white/[0.03] opacity-70 hover:opacity-100'}`}
                style={{ 
                  color: activeTab === 'portfolio' ? COLORS.text : COLORS.data,
                  borderColor: activeTab === 'portfolio' ? COLORS.brand : 'transparent'
                }}
              >
                Portfolio ({positions.length})
              </button>
              <button 
                onClick={() => setActiveTab('trades')}
                className={`px-4 py-2 text-sm font-medium rounded-t transition-all duration-200 ${activeTab === 'trades' ? 'bg-white/[0.05] border-b-2' : 'hover:bg-white/[0.03] opacity-70 hover:opacity-100'}`}
                style={{ 
                  color: activeTab === 'trades' ? COLORS.text : COLORS.data,
                  borderColor: activeTab === 'trades' ? COLORS.brand : 'transparent'
                }}
              >
                Copy Trades ({totalTradeCount || trades.length})
              </button>
            </div>
            <button 
              onClick={fetchData} 
              disabled={loading}
              className="group px-3 py-1.5 text-xs border border-white/20 rounded hover:bg-white/5 transition-all duration-200 active:scale-[0.98] flex items-center gap-1.5 disabled:opacity-50" 
              style={{ color: COLORS.text }}
            >
              <RefreshCw size={12} className={loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} /> Refresh
            </button>
          </div>
          
          {/* ===== PORTFOLIO TAB ===== */}
          {activeTab === 'portfolio' && (
            <div className="overflow-x-auto">
              {/* Table Header */}
              <div className="grid grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.8fr_1fr_1.2fr] gap-2 px-5 py-2.5 text-[11px] uppercase tracking-wider border-b border-white/10 font-mono bg-white/[0.04] min-w-[700px]" style={{ color: COLORS.data }}>
                <div>Token</div>
                <div className="flex items-center gap-1">
                  Amount
                  <InfoTooltip>
                    <strong>Token Amount</strong><br/><br/>
                    The total quantity of this token currently held in your trader state portfolio.
                  </InfoTooltip>
                </div>
                <div className="flex items-center gap-1">
                  Avg Entry
                  <InfoTooltip>
                    <strong>Average Entry Price</strong><br/><br/>
                    The weighted average cost per token for your current position.<br/><br/>
                    = Total Cost Basis / Token Amount
                  </InfoTooltip>
                </div>
                <div className="flex items-center gap-1">
                  Price
                  <InfoTooltip>
                    <strong>Current Price</strong><br/><br/>
                    The real-time market price of the token.<br/><br/>
                    Fetched from Jupiter/Birdeye APIs.
                  </InfoTooltip>
                </div>
                <div className="flex items-center gap-1">
                  Value
                  <InfoTooltip>
                    <strong>Position Value</strong><br/><br/>
                    The current USD value of this holding.<br/><br/>
                    = Token Amount × Current Price
                  </InfoTooltip>
                </div>
                <div className="flex items-center gap-1">
                  PNL
                  <InfoTooltip>
                    <strong>Unrealized Profit/Loss</strong><br/><br/>
                    The paper profit or loss on this open position.<br/><br/>
                    = (Current Price - Avg Entry) × Token Amount
                  </InfoTooltip>
                </div>
                <div className="flex items-center gap-1">
                  % Portfolio
                  <InfoTooltip>
                    <strong>Portfolio Weight</strong><br/><br/>
                    How much of your total trader state value is in this token.<br/><br/>
                    = Position Value / Total Portfolio Value
                  </InfoTooltip>
                </div>
              </div>
              
              {/* Table Rows */}
              <div className="max-h-[500px] overflow-y-auto divide-y divide-white/5">
                {positions.length === 0 ? (
                  <div className="text-center py-10 text-sm" style={{ color: COLORS.data }}>No positions</div>
                ) : (
                  positions.map((pos, index) => {
                    const meta = tokenMeta[pos.mint] || { symbol: pos.symbol, name: pos.name, logoURI: pos.logoURI };
                    const pnl = pos.unrealizedPnL;
                    const pnlPercent = pos.unrealizedPercent;
                    const isPositive = (pnl ?? 0) >= 0;
                    
                    return (
                      <div 
                        key={pos.mint} 
                        className={`grid grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_0.8fr_1fr_1.2fr] gap-2 px-5 py-3 items-center hover:bg-white/[0.04] transition-colors min-w-[700px] ${index % 2 === 1 ? 'bg-white/[0.02]' : ''}`}
                      >
                        {/* Token */}
                        <div className="flex items-center gap-2">
                          <TokenIcon symbol={meta.symbol || pos.symbol} logoURI={meta.logoURI || pos.logoURI} />
                          <div>
                            <div className="font-medium text-sm" style={{ color: COLORS.text }}>{meta.symbol || pos.symbol}</div>
                            <div className="text-xs truncate max-w-[100px]" style={{ color: COLORS.data }}>{meta.name || pos.name}</div>
                          </div>
                        </div>
                        {/* Amount */}
                        <div className="font-mono text-sm" style={{ color: COLORS.text }}>{formatAmount(pos.amount)}</div>
                        {/* Avg Entry */}
                        <div className="font-mono text-sm" style={{ color: COLORS.data }}>{formatPrice(pos.avgCost)}</div>
                        {/* Price */}
                        <div className="font-mono text-sm" style={{ color: COLORS.data }}>{formatPrice(pos.currentPrice)}</div>
                        {/* Value */}
                        <div className="font-mono text-sm font-medium" style={{ color: COLORS.text }}>{formatUsd(pos.currentValue)}</div>
                        {/* PNL */}
                        <div className={`font-mono text-sm font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pnl !== null ? `${isPositive ? '+' : ''}${formatUsd(pnl)}` : '—'}
                          {pnlPercent !== null && <span className="text-xs ml-1">({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%)</span>}
                        </div>
                        {/* % Portfolio with Progress Bar */}
                        <PortfolioBar percent={pos.portfolioPercent ?? 0} />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
          
          {/* ===== COPY TRADES TAB ===== */}
          {activeTab === 'trades' && (
            <div className="overflow-x-auto">
              {/* Table Header */}
              <div className="grid grid-cols-[70px_2fr_0.8fr_0.8fr_0.6fr_0.6fr_70px] gap-2 px-5 py-2.5 text-[11px] uppercase tracking-wider border-b border-white/10 font-mono bg-white/[0.04] min-w-[700px]" style={{ color: COLORS.data }}>
                <div>Type</div>
                <div>Token In → Token Out</div>
                <div>USD Value</div>
                <div>Profit</div>
                <div className="flex items-center gap-1">
                  Latency
                  <InfoTooltip>
                    <strong>Copy Trade Latency</strong><br/><br/>
                    Time difference between the Star Trader&apos;s transaction and your Vault&apos;s copy execution.<br/><br/>
                    ⚠️ <strong>Simulation Mode:</strong> This demo performs <strong>no on-chain interactions</strong>. It simulates trades via database sync to show you how the logic works.<br/><br/>
                    In production, we leverage Solana&apos;s <strong>~400ms block times</strong> for near-instant copy execution.
                  </InfoTooltip>
                </div>
                <div>Age</div>
                <div>Actions</div>
              </div>
              
              {/* Table Rows */}
              <div className="max-h-[500px] overflow-y-auto divide-y divide-white/5">
                {trades.length === 0 ? (
                  <div className="text-center py-10 text-sm" style={{ color: COLORS.data }}>No trades yet</div>
                ) : (
                  trades.map((trade, index) => {
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
                      <motion.div 
                        key={trade.id}
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-50px" }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className={`grid grid-cols-[70px_2fr_0.8fr_0.8fr_0.6fr_0.6fr_70px] gap-2 px-5 py-3 items-center transition-colors min-w-[700px] ${
                          isFailed 
                            ? 'bg-red-500/10 hover:bg-red-500/15 border-l-2 border-red-500' 
                            : `${index % 2 === 1 ? 'bg-white/[0.02]' : ''} hover:bg-white/[0.04]`
                        }`}
                      >
                        {/* Type Badge */}
                        <div>
                          {isFailed ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider border border-red-500/50 bg-red-500/10 text-red-400">
                              <X size={10} /> Failed
                            </span>
                          ) : isBuy ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider border border-emerald-500/50 bg-emerald-500/10 text-emerald-400">
                              Buy
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider border border-red-500/50 bg-red-500/10 text-red-400">
                              Sell
                            </span>
                          )}
                        </div>
                        
                        {/* Token Flow with Icons */}
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            <TokenIcon symbol={inMeta.symbol || trade.token_in_symbol} logoURI={inMeta.logoURI} />
                            <span className="font-mono text-sm" style={{ color: COLORS.text }}>
                              {formatAmount(displayInAmount)} <span className="font-bold ml-1 px-1.5 py-0.5 rounded bg-white/10 text-white">{inMeta.symbol || trade.token_in_symbol}</span>
                            </span>
                          </div>
                          <ArrowRight size={14} style={{ color: COLORS.data }} />
                          <div className="flex items-center gap-1.5">
                            <TokenIcon symbol={outMeta.symbol || trade.token_out_symbol} logoURI={outMeta.logoURI} />
                            <span className="font-mono text-sm" style={{ color: COLORS.text }}>
                              {formatAmount(displayOutAmount)} <span className="font-bold ml-1 px-1.5 py-0.5 rounded bg-white/10 text-white">{outMeta.symbol || trade.token_out_symbol}</span>
                            </span>
                          </div>
                        </div>
                        
                        {/* USD Value / Error */}
                        <div className="font-mono text-sm">
                          {isFailed ? (
                            <div>
                              <div className="text-red-400 font-semibold">Failed</div>
                              {trade.error_message && (
                                <div className="text-[10px] text-red-400/70 truncate max-w-[120px]" title={trade.error_message}>
                                  {trade.error_message.length > 20 ? trade.error_message.slice(0, 20) + '...' : trade.error_message}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: COLORS.text }}>{formatUsd(displayUsdValue)}</span>
                          )}
                        </div>
                        
                        {/* Profit */}
                        <div className={`font-mono text-sm font-medium ${isBuy || pnl === null || isFailed ? '' : isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isFailed ? '—' : isBuy ? '—' : pnl !== null ? `${isPositive ? '+' : ''}${formatUsd(pnl)}` : '—'}
                        </div>
                        
                        {/* Latency */}
                        <div className="font-mono text-sm" style={{ color: COLORS.data }}>{formatLatency(trade.latency_diff_ms)}</div>
                        
                        {/* Age */}
                        <div className="font-mono text-sm" style={{ color: COLORS.data }}>{timeAgo(trade.created_at)}</div>
                        
                        {/* Actions */}
                        <div>
                          {trade.star_trade_signature ? (
                            <a 
                              href={`https://solscan.io/tx/${trade.star_trade_signature}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs font-medium hover:underline"
                              style={{ color: '#22D3EE' }}
                            >
                              TX <ExternalLink size={10} />
                            </a>
                          ) : (
                            <span style={{ color: COLORS.data }}>—</span>
                          )}
                        </div>
                      </motion.div>
                    );
                  })
                )}
              
                {/* Sentinel / Loading State - MOVED INSIDE SCROLLABLE CONTAINER */}
                <div ref={lastElementRef} className="py-2 min-h-[40px]">
                  {infiniteLoading && (
                    <div className="flex flex-col">
                       {[...Array(3)].map((_, i) => (
                          <SkeletonRow key={`skeleton-${i}`} />
                       ))}
                    </div>
                  )}
                  {!hasMore && trades.length > 0 && (
                    <div className="flex items-center justify-center gap-4 py-4 opacity-50">
                      <div className="h-px w-12 bg-white/10" />
                      <span className="text-[10px] text-gray-500 uppercase tracking-widest font-medium">End of History</span>
                      <div className="h-px w-12 bg-white/10" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        
      </main>
    </div>
  );
}
