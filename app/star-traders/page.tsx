'use client';

import PageLoader from '@/components/PageLoader';


import { useState, useEffect, useMemo, ReactNode, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { useAuth } from '@/contexts/auth-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { Users, RefreshCw, Crown, Eye, UserPlus, UserCheck, Info } from 'lucide-react';

interface TraderStats {
  totalPnl: number;
  pnl7d: number;
  pnl7dPercent: number;
  winRate: number;
  wins: number;
  losses: number;
  tradesCount: number;
  followerCount: number;
  totalAllocated: number;
  totalVolume: number;
  profitFactor: number;
}

interface StarTrader {
  wallet: string;
  name: string;
  image?: string;
  createdAt: string;
  isFollowing: boolean;
  stats: TraderStats;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatUsd(amount: number): string {
  if (Math.abs(amount) >= 1000000) return '$' + (amount / 1000000).toFixed(2) + 'M';
  if (Math.abs(amount) >= 1000) return '$' + (amount / 1000).toFixed(2) + 'K';
  return '$' + amount.toFixed(2);
}

function formatPercent(value: number): string {
  return (value >= 0 ? '+' : '') + value.toFixed(1) + '%';
}

// Generate volatile sparkline based on PnL direction with seeded randomness
function generateSparklineFromPnl(pnl: number, seed: string) {
  const data = [];
  const steps = 14;
  
  let seedNum = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const seededRandom = () => {
    seedNum = (seedNum * 9301 + 49297) % 233280;
    return seedNum / 233280;
  };
  
  const isPositive = pnl >= 0;
  let value = 50;
  
  for (let i = 0; i <= steps; i++) {
    const volatility = 8 + seededRandom() * 12;
    const trend = isPositive ? 0.15 : -0.15;
    const change = (seededRandom() - 0.5 + trend) * volatility;
    
    value = Math.max(10, Math.min(90, value + change));
    data.push({ value });
  }
  
  const lastIdx = data.length - 1;
  if (isPositive && data[lastIdx].value < data[0].value + 5) {
    data[lastIdx].value = data[0].value + 15 + seededRandom() * 20;
  } else if (!isPositive && data[lastIdx].value > data[0].value - 5) {
    data[lastIdx].value = data[0].value - 15 - seededRandom() * 20;
  }
  
  return data;
}

// Sparkline with area glow effect (SVG-based)
function Sparkline({ data, isPositive, id, className = "w-20" }: { data: { value: number }[]; isPositive: boolean; id: string; className?: string }) {
  const color = isPositive ? '#10B981' : '#EF4444';
  const gradientId = `gradient-${id}`;
  
  const values = data.map(d => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  
  const scaledData = data.map(d => ({
    value: ((d.value - minVal) / range) * 80 + 10
  }));
  
  const width = 100; // Use abstract 100 coordinates
  const height = 30; // Use abstract 30 coordinates
  
  const points = scaledData.map((d, i) => ({
    x: (i / (scaledData.length - 1)) * width,
    y: height - (d.value / 100) * height
  }));
  
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;
  
  return (
    <div className={`h-full ${className} shrink-0`}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" style={{ filter: `drop-shadow(0 0 2px ${color})` }} />
      </svg>
    </div>
  );
}

// Trader Avatar with seeded HSL color
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
          <div 
            className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 w-2 h-2 rotate-45 border-r border-b"
            style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}
          />
        </div>,
        document.body
      )}
    </>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function StarTradersListPage() {
  const [traders, setTraders] = useState<StarTrader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const { step: onboardingStep, setStep } = useOnboarding();
  
  const walletAddress = user?.wallet || null;
  
  useEffect(() => {
    fetchTraders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);
  
  const fetchTraders = async () => {
    setLoading(true);
    try {
      const url = walletAddress 
        ? `/api/star-traders?userWallet=${walletAddress}`
        : '/api/star-traders';
      const response = await fetch(url);
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setTraders(data.traders || []);
      }
    } catch {
      setError('Failed to load traders');
    } finally {
      setLoading(false);
    }
  };
  
  // Traders are already sorted by winRate from API
  const rankedTraders = useMemo(() => traders, [traders]);
  
  // Compute aggregate stats
  const aggregateStats = useMemo(() => {
    const totalTraders = traders.length;
    const totalPnl7d = traders.reduce((sum, t) => sum + (t.stats?.pnl7d ?? 0), 0);
    const topProfitFactor = traders.length > 0 ? Math.max(...traders.map(t => t.stats?.profitFactor ?? 0)) : 0;
    
    // Only include traders with at least 5 trades in the average win rate calculation
    // This prevents traders with 0 trades from dragging down the average
    const MIN_TRADES_FOR_AVG = 5;
    const tradersWithSufficientTrades = traders.filter(t => (t.stats?.tradesCount ?? 0) >= MIN_TRADES_FOR_AVG);
    const avgWinRate = tradersWithSufficientTrades.length > 0 
      ? tradersWithSufficientTrades.reduce((sum, t) => sum + (t.stats?.winRate ?? 0), 0) / tradersWithSufficientTrades.length 
      : 0;
    
    return { totalTraders, totalPnl7d, topProfitFactor, avgWinRate };
  }, [traders]);
  
  const handleFollow = (traderWallet: string) => {
    if (!isAuthenticated) {
      router.push('/demo-vault');
      return;
    }
    
    // If in onboarding TOUR step, advance to ALLOCATE to allow navigation
    if (onboardingStep === 'TOUR') {
      setStep('ALLOCATE');
    }

    router.push(`/demo-vault?follow=${traderWallet}`);
  };
  
  const handleView = (traderWallet: string) => {
    router.push(`/star-traders/${traderWallet}`);
  };

  if (loading) {
    return <PageLoader />;
  }

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
      <main className="w-full px-3 sm:px-4 py-4 pt-24">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-3 py-3 px-3 sm:px-4 border border-white/10 animate-fade-up" style={{ backgroundColor: COLORS.surface }}>
          <div>
            <h1 className="text-xl font-semibold" style={{ color: COLORS.text }}>Star Traders</h1>
            <p className="text-sm" style={{ color: COLORS.data }}>
              Copy-trade top performers. Follow to allocate funds.
            </p>
          </div>
          <button
            onClick={fetchTraders}
            disabled={loading}
            className="group px-4 py-2 text-sm font-medium flex items-center gap-2 border border-white/20 hover:bg-white/5 rounded transition-all duration-200 disabled:opacity-50 active:scale-[0.98]"
            style={{ color: COLORS.text }}
          >
            <RefreshCw size={14} className={`transition-transform duration-500 ${loading ? 'animate-spin' : 'group-hover:rotate-180'}`} /> Refresh
          </button>
        </div>
        
        {/* Stats HUD */}
        <div className="mb-3 animate-fade-up delay-100">
          {/* Mobile: 2x2 Grid */}
          <div className="grid grid-cols-2 gap-px bg-white/10 border border-white/10 rounded-lg overflow-hidden md:hidden">
            <div className="px-4 py-3 bg-[#0A0A0A] text-center">
              <div className="text-[10px] uppercase tracking-wider mb-1 flex items-center justify-center gap-1" style={{ color: COLORS.data }}>
                Traders
              </div>
              <div className="text-lg font-mono font-semibold" style={{ color: COLORS.text }}>{aggregateStats.totalTraders}</div>
            </div>
            <div className="px-4 py-3 bg-[#0A0A0A] text-center">
              <div className="text-[10px] uppercase tracking-wider mb-1 flex items-center justify-center gap-1" style={{ color: COLORS.data }}>
                PNL (7D)
              </div>
              <div className={`text-lg font-mono font-semibold ${aggregateStats.totalPnl7d >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {aggregateStats.totalPnl7d >= 0 ? '+' : ''}{formatUsd(aggregateStats.totalPnl7d)}
              </div>
            </div>
            <div className="px-4 py-3 bg-[#0A0A0A] text-center">
              <div className="text-[10px] uppercase tracking-wider mb-1 flex items-center justify-center gap-1" style={{ color: COLORS.data }}>
                Top P. Factor
              </div>
              <div className={`text-lg font-mono font-semibold ${aggregateStats.topProfitFactor >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                {aggregateStats.topProfitFactor.toFixed(2)}x
              </div>
            </div>
            <div className="px-4 py-3 bg-[#0A0A0A] text-center">
              <div className="text-[10px] uppercase tracking-wider mb-1 flex items-center justify-center gap-1" style={{ color: COLORS.data }}>
                Avg Win Rate
              </div>
              <div className="text-lg font-mono font-semibold" style={{ color: COLORS.text }}>
                {aggregateStats.avgWinRate.toFixed(0)}%
              </div>
            </div>
          </div>

          {/* Desktop: Horizontal Flex */}
          <div className="hidden md:block border border-white/10 overflow-x-auto" style={{ backgroundColor: COLORS.surface }}>
            <div className="flex items-stretch divide-x divide-white/10 min-w-[500px]">
              <div className="flex-1 px-2 sm:px-3 py-3 bg-white/[0.03] text-center transition-colors duration-300 hover:bg-white/[0.06]">
                <div className="text-xs uppercase tracking-wider mb-1 flex items-center justify-center gap-1" style={{ color: COLORS.data }}>
                  Traders
                  <InfoTooltip>
                    <strong>Total Traders</strong> shows the number of star traders currently available to follow.<br/><br/>
                    Star traders are experienced traders whose trades you can automatically copy. Each trader has their own performance history and trading style.
                  </InfoTooltip>
                </div>
                <div className="text-base sm:text-lg font-mono font-semibold" style={{ color: COLORS.text }}>{aggregateStats.totalTraders}</div>
              </div>
              <div className="flex-1 px-2 sm:px-3 py-3 bg-white/[0.03] text-center transition-colors duration-300 hover:bg-white/[0.06]">
                <div className="text-xs uppercase tracking-wider mb-1 flex items-center justify-center gap-1" style={{ color: COLORS.data }}>
                  PNL (7D)
                  <InfoTooltip>
                    <strong>7-Day PNL</strong> is the total profit/loss generated by all star traders in the last 7 days.<br/><br/>
                    This shows the combined trading performance across all tracked wallets. Green means net profit, red means net loss.
                  </InfoTooltip>
                </div>
                <div className={`text-base sm:text-lg font-mono font-semibold ${aggregateStats.totalPnl7d >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {aggregateStats.totalPnl7d >= 0 ? '+' : ''}{formatUsd(aggregateStats.totalPnl7d)}
                </div>
              </div>
              <div className="flex-1 px-2 sm:px-3 py-3 bg-white/[0.03] text-center">
                <div className="text-xs uppercase tracking-wider mb-1 flex items-center justify-center gap-1" style={{ color: COLORS.data }}>
                  Top Profit Factor
                  <InfoTooltip>
                    <strong>Profit Factor</strong> is the industry-standard metric for trading efficiency. It measures: <strong>For every $1 lost, how many $ were gained?</strong><br/><br/>
                    A Profit Factor above 1.0 means the trader makes more money than they lose. Higher is better. This shows the best performer.
                  </InfoTooltip>
                </div>
                <div className={`text-base sm:text-lg font-mono font-semibold ${aggregateStats.topProfitFactor >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {aggregateStats.topProfitFactor.toFixed(2)}x
                </div>
              </div>
              <div className="flex-1 px-2 sm:px-3 py-3 bg-white/[0.03] text-center">
                <div className="text-xs uppercase tracking-wider mb-1 flex items-center justify-center gap-1" style={{ color: COLORS.data }}>
                  Avg Win Rate
                  <InfoTooltip>
                    <strong>Average Win Rate</strong> is the percentage of profitable trades across active star traders (minimum 5 trades required).<br/><br/>
                    Traders with fewer than 5 trades are excluded to ensure statistical accuracy. A higher win rate means traders are more consistent.
                  </InfoTooltip>
                </div>
                <div className="text-base sm:text-lg font-mono font-semibold" style={{ color: COLORS.text }}>
                  {aggregateStats.avgWinRate.toFixed(0)}%
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Leaderboard Table (Desktop) */}
        <div className="hidden md:block border border-white/10 overflow-hidden animate-fade-up delay-200" style={{ backgroundColor: COLORS.surface }}>
          <div className="px-3 sm:px-4 py-3 border-b border-white/10 bg-white/[0.02]">
            <h2 className="text-sm font-medium" style={{ color: COLORS.text }}>All Traders</h2>
          </div>
          
          <div className="overflow-x-auto">
            {/* Table Header - Increased padding */}
            <div className="grid grid-cols-[30px_0.32fr_0.39fr_0.27fr_0.20fr_0.15fr_0.15fr_120px] gap-1.5 px-6 py-2.5 text-xs uppercase tracking-wider border-b border-white/10 font-mono bg-white/[0.04] min-w-[600px]" style={{ color: COLORS.data }}>
              <div>#</div>
              <div>Trader</div>
              <div>PnL (7D)</div>
              <div className="flex items-center justify-start gap-1.5">
                Profit Factor
                <InfoTooltip>
                  <strong>Profit Factor</strong> is the industry-standard metric for trading efficiency. It measures: <strong>For every $1 lost, how many $ were gained?</strong><br/><br/>
                  A Profit Factor above 1.0 means the trader makes more money than they lose. Higher is better. This metric catches traders who might have a high win rate but lose big on bad trades.
                </InfoTooltip>
              </div>
              <div>Win Rate</div>
              <div>Trades</div>
              <div>Follows</div>
              <div></div>
            </div>
            
            {/* Loading State */}
            {loading && (
              <div className="flex items-center justify-center py-16">
                <div className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: COLORS.brand, borderTopColor: 'transparent' }} />
              </div>
            )}
            
            {/* Error State */}
            {error && (
              <div className="text-center py-16 px-4">
                <div className="text-sm mb-3" style={{ color: '#EF4444' }}>{error}</div>
                <button onClick={fetchTraders} className="text-sm px-4 py-2 rounded transition-colors" style={{ backgroundColor: COLORS.structure, color: COLORS.text }}>
                  Try Again
                </button>
              </div>
            )}
            
            {/* Empty State */}
            {!loading && !error && traders.length === 0 && (
              <div className="text-center py-16 px-4" style={{ color: COLORS.data }}>
                <Users size={44} className="mx-auto mb-4 opacity-50" />
                <p className="text-sm mb-1">No traders yet</p>
              </div>
            )}
            
            {/* Table Rows */}
            <div className="divide-y divide-white/5">
              {rankedTraders.map((trader, index) => {
                const rank = index + 1;
                const pnl7d = trader.stats?.pnl7d ?? 0;
                const pnl7dPercent = trader.stats?.pnl7dPercent ?? 0;
                const isPositive = pnl7d >= 0;
                const sparklineData = generateSparklineFromPnl(pnl7d, trader.wallet);
                const profitFactor = trader.stats?.profitFactor ?? 0;
                const winRate = trader.stats?.winRate ?? 0;
                const tradesCount = trader.stats?.tradesCount ?? 0;
                const followerCount = trader.stats?.followerCount ?? 0;
                const isFollowing = trader.isFollowing;
                
                return (
                  <div 
                    key={trader.wallet} 
                    className={`grid grid-cols-[30px_0.32fr_0.39fr_0.27fr_0.20fr_0.15fr_0.15fr_120px] gap-1.5 px-6 py-3 items-center hover:bg-white/[0.04] transition-colors duration-200 min-w-[600px] cursor-pointer group ${index % 2 === 1 ? 'bg-white/[0.02]' : ''}`}
                    onClick={() => handleView(trader.wallet)}
                  >
                    {/* Rank */}
                    <div className="font-mono text-sm">
                      {rank === 1 ? (
                        <Crown size={16} className="text-yellow-400" />
                      ) : (
                        <span style={{ color: COLORS.data }}>#{rank}</span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="transition-transform duration-300 group-hover:scale-105">
                        <TraderAvatar address={trader.wallet} image={trader.image} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-sm truncate group-hover:text-white transition-colors" style={{ color: COLORS.text }}>
                          {trader.name}
                        </span>
                        <span className="font-mono text-[10px] truncate opacity-60" style={{ color: COLORS.data }}>
                          {trader.wallet.slice(0, 4)}...{trader.wallet.slice(-4)}
                        </span>
                      </div>
                    </div>
                    
                    {/* PnL (7D) with Sparkline */}
                    <div className="flex items-center gap-1.5">
                      <Sparkline data={sparklineData} isPositive={isPositive} id={trader.wallet} />
                      <div className={`font-mono text-sm ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isPositive ? '+' : ''}{formatUsd(pnl7d)} ({isPositive ? '+' : ''}{pnl7dPercent.toFixed(1)}%)
                      </div>
                    </div>
                    
                    {/* Profit Factor */}
                    <div className={`font-mono text-sm ${profitFactor >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {profitFactor.toFixed(2)}x
                    </div>
                    
                    {/* Win Rate */}
                    <div className="font-mono text-sm" style={{ color: COLORS.text }}>
                      {winRate}%
                    </div>
                    
                    {/* Trades */}
                    <div className="font-mono text-sm" style={{ color: COLORS.text }}>
                      {tradesCount}
                    </div>
                    
                    {/* Followers */}
                    <div className="font-mono text-sm" style={{ color: COLORS.text }}>
                      {followerCount}
                    </div>
                    
                    {/* Actions */}
                    <div className="flex items-center justify-start gap-1.5">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleView(trader.wallet); }}
                        className="p-1.5 rounded border border-white/20 hover:bg-white/5 transition-all duration-200 hover:scale-110 active:scale-90"
                        style={{ color: COLORS.text }}
                        title="View"
                      >
                        <Eye size={14} />
                      </button>
                      
                      {isFollowing ? (
                        <button 
                          className="px-3 py-1 rounded text-xs font-medium flex items-center gap-1.5 border border-cyan-400/50"
                          style={{ backgroundColor: 'rgba(34, 211, 238, 0.15)', color: '#22D3EE' }}
                        >
                          <UserCheck size={12} />
                          Following
                        </button>
                      ) : (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleFollow(trader.wallet); }}
                          className={`px-3 py-1 rounded text-xs font-semibold uppercase flex items-center gap-1.5 transition-all duration-200 hover:opacity-90 hover:scale-[1.03] active:scale-[0.97] shadow-lg shadow-cyan-500/10 ${
                            onboardingStep === 'TOUR' && index === 0 ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-black animate-pulse' : ''
                          }`}
                          style={{ backgroundColor: '#22D3EE', color: '#000' }}
                        >
                          <UserPlus size={12} />
                          Follow
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Mobile Card View (md:hidden) */}
        <div className="md:hidden space-y-4 animate-fade-up delay-200">
           <div className="px-1 py-2 flex items-center justify-between">
              <h2 className="text-base font-semibold" style={{ color: COLORS.text }}>All Traders</h2>
              <button
                onClick={fetchTraders}
                disabled={loading}
                className="px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 border border-white/10 hover:bg-white/5 rounded-full transition-all"
                style={{ color: COLORS.data, backgroundColor: COLORS.surface }}
              >
                 <RefreshCw size={12} className={`transition-transform duration-500 ${loading ? 'animate-spin' : ''}`} /> 
                 Refresh
              </button>
           </div>
           
           {/* Loading State Mobile */}
           {loading && (
             <div className="flex items-center justify-center py-12">
               <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: COLORS.brand, borderTopColor: 'transparent' }} />
             </div>
           )}

           {/* Mobile List */}
           {!loading && rankedTraders.map((trader, index) => {
              const rank = index + 1;
              const pnl7d = trader.stats?.pnl7d ?? 0;
              const pnl7dPercent = trader.stats?.pnl7dPercent ?? 0;
              const isPositive = pnl7d >= 0;
              const sparklineData = generateSparklineFromPnl(pnl7d, trader.wallet);
              const profitFactor = trader.stats?.profitFactor ?? 0;
              const winRate = trader.stats?.winRate ?? 0;
              const followerCount = trader.stats?.followerCount ?? 0;
              const isFollowing = trader.isFollowing;

              return (
                 <div 
                   key={trader.wallet}
                   className="rounded-xl border border-white/10 bg-[#0A0A0A] p-5 relative overflow-hidden transition-all active:scale-[0.99] shadow-lg"
                   onClick={() => handleView(trader.wallet)}
                 >
                    {/* Background subtle glow based on performance */}
                    <div className={`absolute top-0 right-0 w-32 h-32 blur-[80px] rounded-full pointer-events-none opacity-20 ${isPositive ? 'bg-emerald-500' : 'bg-red-500'}`} />

                    {/* Top Row: Rank/User & PNL */}
                    <div className="flex items-start justify-between mb-5 relative z-10">
                       <div className="flex items-center gap-3.5">
                          {/* Rank Badge */}
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-inner ${rank <= 3 ? 'bg-gradient-to-br from-yellow-400/20 to-orange-500/20 text-yellow-500 border border-yellow-500/30' : 'bg-white/5 text-slate-500 border border-white/5'}`}>
                             {rank <= 3 ? <Crown size={14} /> : rank}
                          </div>
                          
                          <div className="relative">
                             <TraderAvatar address={trader.wallet} image={trader.image} />
                             {/* Online Status Dot (Visual Flair) */}
                             <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#0A0A0A]" />
                          </div>
                          
                          <div className="flex flex-col">
                             <h3 className="font-bold text-base text-white tracking-tight">{trader.name}</h3>
                             <p className="font-mono text-[10px] text-slate-500">{trader.wallet.slice(0, 4)}...{trader.wallet.slice(-4)}</p>
                          </div>
                       </div>
                       
                       <div className="text-right">
                          <div className={`text-lg font-mono font-bold tracking-tight ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                             {isPositive ? '+' : ''}{formatUsd(pnl7d)}
                          </div>
                          <div className={`text-xs font-medium ${isPositive ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
                             {isPositive ? '+' : ''}{pnl7dPercent.toFixed(1)}%
                          </div>
                       </div>
                    </div>
                    
                    {/* Middle Row: Sparkline & Key Stats */}
                    <div className="grid grid-cols-[1fr_auto] gap-4 mb-5 relative z-10 items-center">
                        {/* Sparkline (More Integrated) */}
                        <div className="h-10 w-full opacity-60">
                            <Sparkline data={sparklineData} isPositive={isPositive} id={`mobile-${trader.wallet}`} className="w-full" />
                        </div>
                        
                        {/* Vertical Divider */}
                        <div className="h-8 w-px bg-white/10 hidden sm:block" />

                        {/* Stats Group */}
                        <div className="flex items-center gap-4">
                            <div>
                                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wider mb-0.5">Win Rate</div>
                                <div className="text-sm font-mono font-medium text-white">{winRate}%</div>
                            </div>
                            <div>
                                <div className="text-[10px] uppercase text-slate-500 font-bold tracking-wider mb-0.5">P. Factor</div>
                                <div className={`text-sm font-mono font-medium ${profitFactor >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {profitFactor.toFixed(2)}x
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    {/* Bottom Row: Actions */}
                    <div className="grid grid-cols-[1fr_auto] gap-3 relative z-10">
                         {isFollowing ? (
                          <button 
                            className="flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-sm bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 w-full"
                          >
                             <UserCheck size={16} />
                             Following
                          </button>
                        ) : (
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleFollow(trader.wallet); }}
                            className={`flex items-center justify-center gap-2 py-3 rounded-lg font-bold text-sm uppercase bg-[#22D3EE] text-black shadow-[0_0_20px_rgba(34,211,238,0.2)] active:scale-[0.98] transition-transform w-full ${
                                onboardingStep === 'TOUR' && index === 0 ? 'animate-pulse ring-2 ring-emerald-400 ring-offset-2 ring-offset-black' : ''
                            }`}
                          >
                             <UserPlus size={16} />
                             Follow
                          </button>
                        )}
                        
                        <button
                          onClick={(e) => { e.stopPropagation(); handleView(trader.wallet); }}
                          className="flex items-center justify-center px-4 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                        >
                           <Eye size={18} className="text-slate-400" />
                        </button>
                    </div>
                 </div>
              );
           })}
        </div>
      </main>
    </div>
  );
}