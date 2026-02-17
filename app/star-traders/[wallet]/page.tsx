'use client';

import PageLoader from '@/components/PageLoader';


import { createPortal } from 'react-dom';
import { useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { 
  ArrowLeft, 
  ArrowRight, 
  ArrowUpRight, 
  RefreshCw, 
  Wallet, 
  BarChart3, 
  Info, 
  ExternalLink,
  Copy,
  Check,
  UserPlus,
  UserCheck,
  Loader2
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useOnboarding } from '@/contexts/onboarding-context';

// =============================================================================
// TYPES
// =============================================================================

interface TraderStats {
  totalPnl: number;
  pnl7d?: number;
  pnl7dPercent?: number;
  winRate: number;
  wins: number;
  losses: number;
  tradesCount: number;
  profitFactor: number;
  followerCount?: number;
  totalAllocated?: number;
  totalVolume?: number;
}
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { SkeletonRow } from '@/components/SkeletonRow';
import { InfiniteScrollSentinel } from '@/components/InfiniteScrollSentinel';
import { motion } from 'framer-motion';

interface Trade {
  signature: string;
  type: 'buy' | 'sell';
  tokenMint: string;
  tokenSymbol: string;
  tokenInMint: string;
  tokenInSymbol: string;
  tokenInAmount: number;
  tokenOutMint: string;
  tokenOutSymbol: string;
  tokenOutAmount: number;
  usdValue: number;
  timestamp: number;
  source: string;
  gas: number;
  realizedPnl: number | null;
  avgCostBasis: number | null;
  latencyMs?: number | null;
}

interface PortfolioToken {
  mint: string;
  symbol: string;
  name: string;
  logoURI: string | null;
  balance: number;
  decimals: number;
  pricePerToken: number | null;
  totalValue: number | null;
  holdingPercent: number | null;
  isNative: boolean;
  isDust: boolean;
}

interface SolBalance {
  balance: number;
  pricePerToken: number | null;
  totalValue: number | null;
  holdingPercent: number | null;
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
  if (amount === 0) return '0';
  if (Math.abs(amount) >= 1000000) return (amount / 1000000).toFixed(2) + 'M';
  if (Math.abs(amount) >= 1000) return (amount / 1000).toFixed(2) + 'K';
  
  // Use subscript notation for very small numbers: 0.0₈3436
  if (Math.abs(amount) < 0.01) {
    const absAmount = Math.abs(amount);
    const str = absAmount.toFixed(20);
    const match = str.match(/^0\.0*([1-9]\d*)/);
    if (match) {
      const leadingZeros = str.indexOf(match[1]) - 2;
      const significantDigits = match[1].slice(0, 4);
      const subscripts = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
      const subscriptNum = String(leadingZeros).split('').map(d => subscripts[parseInt(d)]).join('');
      return (amount < 0 ? '-' : '') + '0.0' + subscriptNum + significantDigits;
    }
  }
  
  return amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatUsd(amount: number | null): string {
  if (amount === null) return '—';
  if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(2) + 'M';
  if (amount >= 1000) return '$' + (amount / 1000).toFixed(2) + 'K';
  if (amount >= 1) return '$' + amount.toFixed(2);
  if (amount >= 0.01) return '$' + amount.toFixed(2);
  if (amount >= 0.0001) return '$' + amount.toFixed(4);
  if (amount >= 0.000001) return '$' + amount.toFixed(6);
  if (amount > 0) return '$' + amount.toExponential(2);
  return '$0.00';
}

function formatPnl(pnl: number | null): { text: string; color: string } {
  if (pnl === null) return { text: '—', color: COLORS.data };
  const isPositive = pnl >= 0;
  const formatted = isPositive ? `+$${formatAmount(pnl)}` : `-$${formatAmount(Math.abs(pnl))}`;
  return { text: formatted, color: isPositive ? '#10B981' : '#EF4444' };
}

function timeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// function calculateStats(trades: Trade[]): TraderStats { ... } // Removed to rely on server side stats

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
        className="w-10 h-10 rounded-full object-cover shrink-0"
        style={{ border: '1px solid rgba(255,255,255,0.1)' }}
      />
    );
  }

  return (
    <div 
      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 border-2 border-white/5"
      style={{ backgroundColor: bgColor, color: '#fff' }}
    >
      {address.slice(0, 2).toUpperCase()}
    </div>
  );
}

// Portfolio Progress Bar
function PortfolioBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden min-w-[60px]">
        <div 
          className="h-full rounded-full transition-all duration-500"
          style={{ 
            width: `${Math.min(100, percent)}%`,
            background: 'linear-gradient(90deg, #10B981 0%, #34D399 100%)'
          }}
        />
      </div>
      <span className="font-mono text-xs font-medium min-w-[40px] text-right" style={{ color: COLORS.text }}>{percent.toFixed(1)}%</span>
    </div>
  );
}

// Enhanced InfoTooltip to support custom triggers
function InfoTooltip({ children, trigger }: { children: ReactNode; trigger?: ReactNode }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  
  const updateTooltipPosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const tooltipWidth = 256;
      let left = rect.left + rect.width / 2;
      
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
      <div 
        ref={triggerRef}
        className="relative inline-flex items-center"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {trigger ? (
          trigger
        ) : (
          <button
            className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-white/20 hover:bg-white/5 transition-colors"
            style={{ color: COLORS.data }}
            type="button"
          >
            <Info size={12} />
          </button>
        )}
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

export default function TraderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const wallet = params.wallet as string;
  const { user, isAuthenticated } = useAuth();
  const { step: onboardingStep, setStep } = useOnboarding();
  
  const [activeTab, setActiveTab] = useState<'trades' | 'portfolio'>('trades');
  // const [trades, setTrades] = useState<Trade[]>([]); // Replaced by useInfiniteScroll
  const [portfolioTokens, setPortfolioTokens] = useState<PortfolioToken[]>([]);
  const [solBalance, setSolBalance] = useState<SolBalance | null>(null);
  const [totalPortfolioValue, setTotalPortfolioValue] = useState(0);
  const [tokenMeta, setTokenMeta] = useState<Record<string, TokenMeta>>({});
  const [loading, setLoading] = useState(true);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<TraderStats | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDust, setShowDust] = useState(false);
  const [traderName, setTraderName] = useState('Star Trader');
  const [traderImage, setTraderImage] = useState<string | undefined>(undefined);
  const [isFollowing, setIsFollowing] = useState(false);
  
  const fetchTokenMetadata = async (mints: string[]) => {
    if (mints.length === 0) return;
    try {
      const response = await fetch(`/api/tokens?mints=${mints.join(',')}`);
      const data = await response.json();
      if (data) {
        if (!data['SOL']) {
          data['SOL'] = {
            symbol: 'SOL',
            name: 'Solana',
            logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
          };
        }
        setTokenMeta(prev => ({ ...prev, ...data }));
      }
    } catch (err) {
      console.error('Failed to fetch token metadata:', err);
    }
  };

  const fetchTraderProfile = async () => {
    try {
      const url = user?.wallet 
        ? `/api/star-traders?userWallet=${user.wallet}`
        : '/api/star-traders';
      const response = await fetch(url);
      const data = await response.json();
      if (data.traders) {
        const trader = data.traders.find((t: any) => t.wallet === wallet);
        if (trader) {
          if (trader.name) setTraderName(trader.name);
          if (trader.image) setTraderImage(trader.image);
          setIsFollowing(!!trader.isFollowing);
          if (trader.stats) setStats(trader.stats);
        }
      }
    } catch (err) {
      console.error('Failed to fetch trader profile:', err);
    }
  };
  
  const fetchTrades = useCallback(async (cursor?: string): Promise<{ data: Trade[], nextCursor: string | null }> => {
    try {
      const url = new URL('/api/trades', window.location.origin);
      url.searchParams.set('wallet', wallet);
      url.searchParams.set('limit', '50');
      if (cursor) url.searchParams.set('cursor', cursor);
      
      const res = await fetch(url.toString());
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);

      // Fetch metadata for new trades
      const mints = new Set<string>();
      data.data.forEach((t: Trade) => {
        if (t.tokenInMint) mints.add(t.tokenInMint);
        if (t.tokenOutMint) mints.add(t.tokenOutMint);
      });
      if (mints.size > 0) await fetchTokenMetadata(Array.from(mints));

      return {
        data: data.data || [],
        nextCursor: data.nextCursor
      };
    } catch (e) {
      console.error(e);
      return { data: [], nextCursor: null };
    }
  }, [wallet]);

  const { 
    data: trades, 
    loading: infiniteLoading, 
    hasMore, 
    lastElementRef 
  } = useInfiniteScroll<Trade>({
    fetchData: fetchTrades,
    limit: 50
  });

  const fetchMainData = async () => {
    try {
       await fetchTraderProfile();
       // Trades are now handled by infinite scroll
    } catch (e: any) {
      setError(e.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const fetchPortfolioData = async () => {
    setPortfolioLoading(true);
    try {
      const portfolioRes = await fetch(`/api/portfolio?wallet=${wallet}`);
      const portfolioData = await portfolioRes.json();
      
      if (portfolioData.error) {
        // Don't block UI on portfolio error, just log it or maybe set a partial error state?
        // for now we just don't set data
        console.error('Portfolio fetch error:', portfolioData.error);
      } else {
        setPortfolioTokens(portfolioData.tokens || []);
        setSolBalance(portfolioData.solBalance || null);
        setTotalPortfolioValue(portfolioData.totalPortfolioValue || 0);
        
        // Metadata for portfolio
        const mints = new Set<string>();
        portfolioData.tokens?.forEach((t: PortfolioToken) => mints.add(t.mint));
        if (mints.size > 0) await fetchTokenMetadata(Array.from(mints));
      }
    } catch (e) {
      console.error('Failed to fetch portfolio:', e);
    } finally {
      setPortfolioLoading(false);
    }
  };

  const refreshData = () => {
    setLoading(true);
    setError(null);
    fetchMainData();
    fetchPortfolioData();
  };
  
  useEffect(() => {
    if (wallet) {
      refreshData();
    }
  }, [wallet, user?.wallet]);

  const copyAddress = () => {
    navigator.clipboard.writeText(wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  // Filter tokens
  const displayTokens = showDust ? portfolioTokens : portfolioTokens.filter(t => !t.isDust);
  const dustCount = portfolioTokens.filter(t => t.isDust).length;

  const handleFollow = () => {
    if (!isAuthenticated) {
      router.push('/demo-vault');
      return;
    }
    
    // If in onboarding TOUR step, advance to ALLOCATE
    if (onboardingStep === 'TOUR') {
      setStep('ALLOCATE');
    }

    router.push(`/demo-vault?follow=${wallet}`);
  };
  
  if (loading) {
    return <PageLoader />;
  }

  return (
    <div className="min-h-screen font-sans tracking-tight animate-in fade-in duration-700" style={{ backgroundColor: COLORS.canvas, color: COLORS.text, fontFamily: 'Inter, system-ui, sans-serif' }}>
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
          href="/star-traders"
          className="group inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-white/10 rounded hover:bg-white/5 transition-all duration-200 mb-4 hover:border-white/20 active:scale-[0.98]"
          style={{ color: COLORS.text }}
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform duration-200" /> Back
        </Link>
        
        {/* ===== CONTROL DECK ROW 1: Header ===== */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-3 py-4 px-5 border border-white/10 bg-white/[0.02] animate-fade-up" style={{ backgroundColor: COLORS.surface }}>
          {/* Trader Identity */}
          <div className="flex items-center gap-4">
            <div className="transition-transform duration-300 hover:scale-105">
              <TraderAvatar address={wallet} image={traderImage} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h1 className="text-xl font-semibold" style={{ color: COLORS.text }}>{traderName}</h1>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm opacity-60" style={{ color: COLORS.data }}>
                  {wallet.slice(0, 6)}...{wallet.slice(-6)}
                </span>
                <button 
                  onClick={copyAddress}
                  className="p-1.5 hover:bg-white/10 rounded transition-all duration-200 active:scale-90 group"
                  style={{ color: copied ? '#10B981' : COLORS.data }}
                  title="Copy Address"
                >
                  {copied ? (
                    <Check size={12} className="animate-in zoom-in duration-200" />
                  ) : (
                    <Copy size={12} className="group-hover:text-white transition-colors" />
                  )}
                </button>
                <a 
                  href={`https://solscan.io/account/${wallet}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 hover:bg-white/10 rounded transition-all duration-200 hover:scale-110 active:scale-90 group"
                  style={{ color: COLORS.data }}
                  title="View on Solscan"
                >
                  <ExternalLink size={12} className="group-hover:text-white transition-colors" />
                </a>
              </div>
            </div>
          </div>
          
          {/* Actions: Follow + Analyze */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Analyze Button */}
            <div className="flex items-center gap-2">
               <div className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-right mr-2" style={{ color: COLORS.data }}>
                  <div className="flex items-center gap-1">
                    <InfoTooltip>
                      <strong>Recent History Analysis</strong><br/><br/>
                      This analysis is generated based on the last 100 on-chain trades.<br/><br/>
                      For a complete historical analysis including all past transactions, please view the full profile on GMGN.
                    </InfoTooltip>
                    <span>Analysis based on recent trades. Use GMGN for full history.</span>
                  </div>
                </div>
              <a 
                href={`https://gmgn.ai/sol/address/${wallet}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 px-4 py-2 rounded-lg border transition-all hover:bg-emerald-500/10 hover:border-emerald-500/30"
                style={{ 
                  borderColor: COLORS.structure, 
                  backgroundColor: 'rgba(16, 185, 129, 0.05)',
                  color: COLORS.text 
                }}
              >
                <img src="https://gmgn.ai/static/GMGNLogoDark.svg" alt="GMGN" className="h-4 w-auto opacity-70 group-hover:opacity-100 transition-opacity" />
                <span className="text-xs font-semibold tracking-wide hidden sm:inline">ANALYZE</span>
                <ArrowUpRight size={12} className="text-emerald-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </a>
            </div>

            {/* Follow Button */}
            {isFollowing ? (
              <button 
                className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 border border-cyan-400/50 cursor-default"
                style={{ backgroundColor: 'rgba(34, 211, 238, 0.10)', color: '#22D3EE' }}
              >
                <UserCheck size={14} />
                Following
              </button>
            ) : (
              <button 
                onClick={handleFollow}
                className="px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all duration-200 hover:opacity-90 hover:scale-105 active:scale-95 shadow-lg shadow-cyan-500/20"
                style={{ backgroundColor: '#22D3EE', color: '#000' }}
              >
                <UserPlus size={14} />
                Follow
              </button>
            )}
          </div>
        </div>
        
        {/* ===== CONTROL DECK ROW 2: Stats HUD Strip ===== */}
        {stats && (
          <div className="border border-white/10 mb-4 overflow-x-auto animate-fade-up delay-100" style={{ backgroundColor: COLORS.surface }}>
            <div className="flex items-stretch divide-x divide-white/10 min-w-[700px]">
              <div className="flex-1 px-5 py-4 bg-white/[0.03] text-center transition-colors duration-300 hover:bg-white/[0.06]">
                <div className="flex items-center justify-center gap-1.5 mb-1.5">
                   <div className="text-xs uppercase tracking-wider" style={{ color: COLORS.data }}>Total PNL (7D)</div>
                   <InfoTooltip>
                      <strong>7-Day Profit/Loss</strong><br/><br/>
                      Calculated from realized trades within the last 7 days. Does not include unrealized positions.
                   </InfoTooltip>
                </div>
                <div className={`text-lg font-mono font-semibold ${stats.pnl7d !== undefined ? (stats.pnl7d >= 0 ? 'text-emerald-400' : 'text-red-400') : (stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}`}>
                  {stats.pnl7d !== undefined 
                    ? (stats.pnl7d >= 0 ? '+' : '') + formatAmount(stats.pnl7d)
                    : (stats.totalPnl >= 0 ? '+' : '') + formatAmount(stats.totalPnl)
                  }
                </div>
              </div>
              
              <div className="flex-1 px-5 py-4 bg-white/[0.03] text-center transition-colors duration-300 hover:bg-white/[0.06]">
                <div className="flex items-center justify-center gap-1.5 mb-1.5">
                   <div className="text-xs uppercase tracking-wider" style={{ color: COLORS.data }}>Win Rate</div>
                   <InfoTooltip>
                      <strong>Win Rate</strong><br/><br/>
                      Percentage of profitable trades out of total closed trades in the fetched history.<br/>
                      Based on last 1000 trades.
                   </InfoTooltip>
                </div>
                <div className="text-lg font-mono font-semibold" style={{ color: COLORS.brand }}>
                  {stats.winRate}%
                </div>
              </div>
              
              <div className="flex-1 px-5 py-4 bg-white/[0.03] text-center transition-colors duration-300 hover:bg-white/[0.06]">
                 <div className="flex items-center justify-center gap-1.5 mb-1.5">
                   <div className="text-xs uppercase tracking-wider" style={{ color: COLORS.data }}>Profit Factor</div>
                   <InfoTooltip>
                      <strong>Profit Factor</strong><br/><br/>
                      Measures trading efficiency: (Total Gains / Total Losses).<br/>
                      &gt; 1.0 means profitable. &gt; 2.0 is excellent. Based on last 1000 trades.
                   </InfoTooltip>
                </div>
                <div className={`text-lg font-mono font-semibold ${stats.profitFactor >= 1.5 ? 'text-emerald-400' : stats.profitFactor >= 1 ? 'text-emerald-200' : 'text-gray-400'}`}>
                  {stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2)}x
                </div>
              </div>

              <div className="flex-1 px-5 py-4 bg-white/[0.03] text-center transition-colors duration-300 hover:bg-white/[0.06]">
                 <div className="flex items-center justify-center gap-1.5 mb-1.5">
                   <div className="text-xs uppercase tracking-wider" style={{ color: COLORS.data }}>Wins / Losses</div>
                </div>
                <div className="text-lg font-mono font-semibold">
                  <span className="text-emerald-400">{stats.wins}</span>
                  <span className="mx-2 text-gray-600">/</span>
                  <span className="text-red-400">{stats.losses}</span>
                </div>
              </div>
              
              <div className="flex-1 px-5 py-4 bg-white/[0.03] text-center transition-colors duration-300 hover:bg-white/[0.06]">
                 <div className="flex items-center justify-center gap-1.5 mb-1.5">
                   <div className="text-xs uppercase tracking-wider" style={{ color: COLORS.data }}>Portfolio Value</div>
                   <InfoTooltip>
                      <strong>Total Portfolio Value</strong><br/><br/>
                      Current USD value of all token addresses held by this wallet, including SOL.
                   </InfoTooltip>
                </div>
                <div className="text-lg font-mono font-semibold" style={{ color: COLORS.text }}>
                  {portfolioLoading ? (
                    <div className="flex items-center justify-center h-[28px]">
                       <Loader2 size={16} className="animate-spin text-white/50" />
                    </div>
                  ) : (
                    formatUsd(totalPortfolioValue)
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
          {/* ===== TAB SWITCHER & CONTROL BAR ===== */}
          <div className="border border-white/10 overflow-hidden animate-fade-up delay-200" style={{ backgroundColor: COLORS.surface }}>
            <div className="px-5 py-3 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setActiveTab('trades')}
                  className={`px-4 py-2 text-sm font-medium rounded-t transition-all duration-200 ${activeTab === 'trades' ? 'bg-white/[0.05] border-b-2' : 'hover:bg-white/[0.03] opacity-70 hover:opacity-100'}`}
                  style={{ 
                    color: activeTab === 'trades' ? COLORS.text : COLORS.data,
                    borderColor: activeTab === 'trades' ? COLORS.brand : 'transparent'
                  }}
                >
                  Recent Trades
                </button>
                <button 
                  onClick={() => setActiveTab('portfolio')}
                  className={`px-4 py-2 text-sm font-medium rounded-t transition-all duration-200 ${activeTab === 'portfolio' ? 'bg-white/[0.05] border-b-2' : 'hover:bg-white/[0.03] opacity-70 hover:opacity-100'}`}
                  style={{ 
                    color: activeTab === 'portfolio' ? COLORS.text : COLORS.data,
                    borderColor: activeTab === 'portfolio' ? COLORS.brand : 'transparent'
                  }}
                >
                  {portfolioLoading ? (
                    <span className="flex items-center gap-2">
                      Portfolio <Loader2 size={12} className="animate-spin" />
                    </span>
                  ) : (
                    `Portfolio (${portfolioTokens.length})` 
                  )}
                </button>
              </div>
              
              <div className="flex items-center gap-3">
                 {/* Dust Toggle (Visible only on Portfolio Tab) */}
                 {activeTab === 'portfolio' && (
                    <div className="hidden sm:block">
                      <InfoTooltip 
                        trigger={
                          <button 
                            onClick={() => setShowDust(!showDust)}
                            className="text-xs px-3 py-1.5 rounded transition-all duration-200 flex items-center gap-1.5 border hover:scale-[1.02] active:scale-[0.98]"
                            style={{ 
                              borderColor: showDust ? COLORS.brand : 'rgba(255,255,255,0.1)', 
                              backgroundColor: showDust ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.03)',
                              color: showDust ? COLORS.brand : COLORS.data
                            }}
                          >
                            <Info size={12} />
                            {showDust ? 'Hide Dust' : `Show ${dustCount} Dust`}
                          </button>
                        }
                      >
                        <strong>Dust Tokens</strong><br/><br/>
                        Small balances valued under $0.01 or less than 0.1% of portfolio.<br/>
                        Hiding them keeps your view clean.
                      </InfoTooltip>
                    </div>
                 )}
                 
                <button 
                  onClick={refreshData} 
                  disabled={loading}
                  className="group px-3 py-1.5 text-xs border border-white/20 rounded hover:bg-white/5 disabled:opacity-50 transition-all duration-200 active:scale-[0.98] flex items-center gap-1.5"
                  style={{ color: COLORS.text }}
                >
                  <RefreshCw size={12} className={`transition-transform duration-500 ${loading ? 'animate-spin' : 'group-hover:rotate-180'}`} /> 
                  Refresh
                </button>
              </div>
            </div>
          
          {/* ===== RECENT TRADES TAB ===== */}
          {activeTab === 'trades' && (
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                <div className="grid grid-cols-[80px_1fr_120px_120px_100px_100px_80px] gap-4 px-6 py-2.5 text-[11px] font-mono uppercase tracking-wider border-b border-white/10 bg-white/[0.04]" style={{ color: COLORS.data }}>
                  <div>Type</div>
                  <div>Token In → Out</div>
                  <div className="text-right">USD Value</div>
                  <div className="text-right">Profit</div>
                  <div className="text-right">Age</div>
                  <div className="text-right">Gas</div>
                  <div className="text-center">Action</div>
                </div>
                
                <div className="max-h-[600px] overflow-y-auto">
                  {trades.length === 0 && !infiniteLoading ? (
                    <div className="text-center py-20 text-sm" style={{ color: COLORS.data }}>
                       No recent trades found for this wallet.
                    </div>
                  ) : (
                    trades.map((trade, index) => {
                      const isBuy = trade.type === 'buy';
                      const pnl = formatPnl(trade.realizedPnl);
                      const inMeta = tokenMeta[trade.tokenInMint] || { symbol: trade.tokenInSymbol, logoURI: null };
                      const outMeta = tokenMeta[trade.tokenOutMint] || { symbol: trade.tokenOutSymbol, logoURI: null };
                      
                      return (
                        <motion.div 
                          key={trade.signature}
                          initial={{ opacity: 0, y: 10 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true, margin: "-50px" }}
                          transition={{ duration: 0.3, ease: "easeOut" }}
                          className={`grid grid-cols-[80px_1fr_120px_120px_100px_100px_80px] gap-4 items-center px-6 py-3 border-b border-white/5 hover:bg-white/[0.04] transition-colors duration-200 group ${index % 2 === 1 ? 'bg-white/[0.02]' : ''}`}
                        >
                          <div>
                            <span className={`inline-flex items-center justify-center px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider w-14 ${isBuy ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                              {isBuy ? 'BUY' : 'SELL'}
                            </span>
                          </div>
                          
                         <div className="flex items-center gap-2">
                           <div className="flex items-center gap-1.5">
                             <TokenIcon symbol={inMeta.symbol} logoURI={inMeta.logoURI} />
                             <span className="font-mono text-sm" style={{ color: COLORS.text }}>
                               {formatAmount(trade.tokenInAmount)} <span className="font-bold ml-1 px-1.5 py-0.5 rounded bg-white/10 text-white">{inMeta.symbol}</span>
                             </span>
                           </div>
                           <ArrowRight size={14} style={{ color: COLORS.data }} />
                           <div className="flex items-center gap-1.5">
                             <TokenIcon symbol={outMeta.symbol} logoURI={outMeta.logoURI} />
                             <span className="font-mono text-sm" style={{ color: COLORS.text }}>
                               {formatAmount(trade.tokenOutAmount)} <span className="font-bold ml-1 px-1.5 py-0.5 rounded bg-white/10 text-white">{outMeta.symbol}</span>
                             </span>
                           </div>
                         </div>
                          
                          <div className="text-right font-mono text-sm" style={{ color: COLORS.text }}>
                            ${formatAmount(trade.usdValue)}
                          </div>
                          
                          <div className="text-right font-mono text-sm" style={{ color: pnl.color }}>
                            {pnl.text}
                          </div>
                          
                          <div className="text-right text-xs" style={{ color: COLORS.data }}>
                            {timeAgo(trade.timestamp)}
                          </div>
                          
                          <div className="text-right text-xs" style={{ color: COLORS.data }}>
                            ${(trade.gas * 200).toFixed(3)}
                          </div>
                          
                          <div className="text-center">
                            <a 
                              href={`https://solscan.io/tx/${trade.signature}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center px-2 py-1 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-[10px] font-bold uppercase tracking-wider hover:bg-cyan-500/20 transition-all duration-200 hover:scale-105 active:scale-95"
                            >
                              TX <ArrowUpRight size={10} className="ml-0.5" />
                            </a>
                          </div>
                        </motion.div>
                      );
                    })
                  )}

                  {/* Infinite Scroll Sentinel */}
                  <InfiniteScrollSentinel
                    inputRef={lastElementRef}
                    loading={infiniteLoading}
                    hasMore={hasMore}
                    skeleton={
                      <div className="flex flex-col">
                         {[...Array(3)].map((_, i) => (
                            <SkeletonRow 
                              key={`skeleton-${i}`} 
                              className="grid grid-cols-[80px_1fr_120px_120px_100px_100px_80px]"
                            />
                         ))}
                      </div>
                    }
                    endMessage={
                      <div className="flex flex-col items-center justify-center py-12 gap-3 animate-in fade-in duration-700">
                        <span className="text-[10px] uppercase tracking-[0.2em] opacity-30 font-semibold" style={{ color: COLORS.data }}>End of Recent History</span>
                        
                        <a 
                          href={`https://gmgn.ai/sol/address/${wallet}`}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="group flex items-center gap-3 px-6 py-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-emerald-500/[0.05] hover:border-emerald-500/30 transition-all duration-300 hover:shadow-[0_0_30px_-5px_rgba(16,185,129,0.15)] active:scale-[0.98]"
                        >
                          <span className="text-xs font-bold tracking-widest text-white/70 group-hover:text-emerald-400 transition-colors uppercase">View Full History on</span>
                          <img 
                            src="https://gmgn.ai/static/GMGNLogoDark.svg" 
                            alt="GMGN" 
                            className="h-5 w-auto opacity-90 group-hover:opacity-100 transition-all duration-300 group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]" 
                          />
                          <ArrowUpRight size={12} className="text-white/40 group-hover:text-emerald-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all -ml-1" />
                        </a>
                      </div>
                    }
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* ===== PORTFOLIO TAB ===== */}
          {activeTab === 'portfolio' && (
            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1.5fr_80px] gap-4 px-6 py-2.5 text-[11px] font-mono uppercase tracking-wider border-b border-white/10 bg-white/[0.04]" style={{ color: COLORS.data }}>
                  <div>Token</div>
                  <div className="text-right">Price</div>
                  <div className="text-right">Balance</div>
                  <div className="text-right">Value</div>
                  <div className="pl-4">% Portfolio</div>
                  <div className="text-center">Action</div>
                </div>
                
                <div className="max-h-[600px] overflow-y-auto">
                   {portfolioLoading ? (
                     <div className="flex flex-col items-center justify-center py-20 gap-3">
                       <Loader2 size={32} className="animate-spin text-white/30" />
                       <span className="text-sm font-medium text-white/50 animate-pulse">Scanning wallet assets...</span>
                     </div>
                   ) : (
                     <>
                       {/* SOL Balance */}
                       {solBalance && (
                         <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1.5fr_80px] gap-4 items-center px-6 py-3 border-b border-white/5 hover:bg-white/[0.02] transition-colors bg-emerald-500/[0.02]">
                            <div className="flex items-center gap-3">
                               <img src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" className="w-8 h-8 rounded-full" alt="SOL" />
                               <div>
                                  <div className="font-bold text-sm text-white">Solana</div>
                                  <div className="text-xs font-mono" style={{ color: COLORS.data }}>SOL</div>
                               </div>
                            </div>
                            <div className="text-right font-mono text-sm" style={{ color: COLORS.data }}>{formatUsd(solBalance.pricePerToken)}</div>
                            <div className="text-right font-mono text-sm" style={{ color: COLORS.text }}>{formatAmount(solBalance.balance)}</div>
                            <div className="text-right font-mono text-sm font-medium" style={{ color: COLORS.brand }}>{formatUsd(solBalance.totalValue)}</div>
                            <div className="pl-4">
                               <PortfolioBar percent={solBalance.holdingPercent || 0} />
                            </div>
                            <div className="text-center">
                                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-500">Native</span>
                            </div>
                         </div>
                       )}
                       
                       {/* Tokens */}
                       {displayTokens.map((token) => (
                          <div key={token.mint} className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1.5fr_80px] gap-4 items-center px-6 py-3 border-b border-white/5 hover:bg-white/[0.04] transition-colors duration-200 group" style={{ opacity: token.isDust ? 0.5 : 1 }}>
                            <div className="flex items-center gap-3">
                               <TokenIcon symbol={token.symbol} logoURI={token.logoURI} />
                               <div>
                                  <div className="flex items-center gap-1.5">
                                     <span className="font-bold text-sm text-white">{token.symbol}</span>
                                     {token.isDust && <span className="text-[9px] bg-yellow-500/20 text-yellow-500 px-1 rounded uppercase">Dust</span>}
                                  </div>
                                  <div className="text-xs font-mono truncate max-w-[120px]" style={{ color: COLORS.data }}>{token.name}</div>
                               </div>
                            </div>
                            <div className="text-right font-mono text-sm" style={{ color: COLORS.data }}>{formatUsd(token.pricePerToken)}</div>
                            <div className="text-right font-mono text-sm" style={{ color: COLORS.text }}>{formatAmount(token.balance)}</div>
                            <div className="text-right font-mono text-sm font-medium" style={{ color: COLORS.brand }}>{formatUsd(token.totalValue)}</div>
                            <div className="pl-4">
                               <PortfolioBar percent={token.holdingPercent || 0} />
                            </div>
                            <div className="text-center">
                                <a 
                                  href={`https://solscan.io/token/${token.mint}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center p-1.5 rounded hover:bg-white/10 transition-all duration-200 hover:scale-110"
                                  style={{ color: COLORS.data }}
                                >
                                  <ExternalLink size={14} />
                                </a>
                            </div>
                          </div>
                       ))}
                       
                       {/* Empty State */}
                       {displayTokens.length === 0 && !solBalance && (
                          <div className="text-center py-20 text-sm" style={{ color: COLORS.data }}>
                             No tokens found in portfolio.
                          </div>
                       )}
                     </>
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
