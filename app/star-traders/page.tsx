'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { Users, ArrowRight, TrendingUp, Trophy, Activity, RefreshCw } from 'lucide-react';

interface TraderStats {
  totalPnl: number;
  winRate: number;
  wins: number;
  losses: number;
  tradesCount: number;
}

interface StarTrader {
  wallet: string;
  name: string;
  createdAt: string;
  stats: TraderStats;
}

function formatAmount(amount: number): string {
  if (Math.abs(amount) >= 1000000) return (amount / 1000000).toFixed(2) + 'M';
  if (Math.abs(amount) >= 1000) return (amount / 1000).toFixed(2) + 'K';
  return amount.toFixed(2);
}

export default function StarTradersListPage() {
  const [traders, setTraders] = useState<StarTrader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  
  useEffect(() => {
    fetchTraders();
  }, []);
  
  const fetchTraders = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/star-traders');
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
  
  const handleTraderClick = (wallet: string) => {
    router.push(`/star-traders/${wallet}`);
  };
    return (
    <div className="min-h-screen font-sans pt-24 pb-12" style={{ backgroundColor: COLORS.canvas, color: COLORS.text }}>
      <main className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-8 sm:mb-12">
          <div 
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: `${COLORS.brand}15` }}
          >
            <Users size={32} style={{ color: COLORS.brand }} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2" style={{ color: COLORS.text }}>
            Star Traders
          </h1>
          <p className="text-sm sm:text-base max-w-md mx-auto" style={{ color: COLORS.data }}>
            Follow top-performing wallets and copy their trades in real-time
          </p>
        </div>

        {/* Traders Section */}
        <div 
          className="border overflow-hidden"
          style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}
        >
          {/* Section Header */}
          <div 
            className="px-4 sm:px-6 py-4 border-b flex items-center justify-between"
            style={{ borderColor: COLORS.structure }}
          >
            <div className="flex items-center gap-2">
              <h2 className="font-semibold" style={{ color: COLORS.text }}>
                All Traders
              </h2>
              <span 
                className="px-2 py-0.5 text-xs rounded-full"
                style={{ backgroundColor: `${COLORS.brand}20`, color: COLORS.brand }}
              >
                {traders.length}
              </span>
            </div>
            <button
              onClick={fetchTraders}
              disabled={loading}
              className="p-2 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-50"
              style={{ color: COLORS.data }}
              title="Refresh"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          
          {/* Desktop Table Header (hidden on mobile) */}
          <div 
            className="hidden md:grid grid-cols-6 gap-4 px-6 py-3 text-xs font-mono uppercase tracking-wider border-b"
            style={{ color: COLORS.data, borderColor: COLORS.structure }}
          >
            <div>Trader</div>
            <div>Trades</div>
            <div>Win Rate</div>
            <div>Wins / Losses</div>
            <div>Total PnL</div>
            <div></div>
          </div>
          
          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div 
                className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: COLORS.brand, borderTopColor: 'transparent' }}
              />
            </div>
          )}
          
          {/* Error State */}
          {error && (
            <div className="text-center py-16 px-4">
              <div className="text-lg mb-2" style={{ color: '#EF4444' }}>{error}</div>
              <button
                onClick={fetchTraders}
                className="text-sm px-4 py-2 rounded-lg transition-colors"
                style={{ backgroundColor: COLORS.structure, color: COLORS.text }}
              >
                Try Again
              </button>
            </div>
          )}
          
          {/* Empty State */}
          {!loading && !error && traders.length === 0 && (
            <div className="text-center py-16 px-4" style={{ color: COLORS.data }}>
              <Users size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg mb-2">No traders yet</p>
              <p className="text-sm max-w-xs mx-auto opacity-70">
                Star traders will appear here once they are configured in the system.
              </p>
            </div>
          )}
          
          {/* Trader Cards/Rows */}
          {!loading && !error && traders.map((trader) => {
            if (!trader || !trader.wallet) return null;
            const isProfitable = trader.stats?.totalPnl >= 0;
            
            return (
              <div
                key={trader.wallet}
                onClick={() => handleTraderClick(trader.wallet)}
                className="border-b cursor-pointer hover:bg-white/[0.02] transition-all duration-200 group"
                style={{ borderColor: COLORS.structure }}
              >
                {/* Mobile Card Layout */}
                <div className="md:hidden p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
                        style={{ backgroundColor: COLORS.structure, color: COLORS.text }}
                      >
                        {trader.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium" style={{ color: COLORS.text }}>{trader.name}</div>
                        <div className="text-xs font-mono" style={{ color: COLORS.data }}>
                          {trader.wallet ? `${trader.wallet.slice(0, 6)}...${trader.wallet.slice(-4)}` : '—'}
                        </div>
                      </div>
                    </div>
                    <ArrowRight size={18} style={{ color: COLORS.brand }} className="opacity-50 group-hover:opacity-100" />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div 
                      className="py-2 rounded"
                      style={{ backgroundColor: `${COLORS.structure}50` }}
                    >
                      <div className="text-sm font-medium" style={{ color: COLORS.text }}>
                        {trader.stats?.tradesCount ?? 0}
                      </div>
                      <div className="text-xs" style={{ color: COLORS.data }}>Trades</div>
                    </div>
                    <div 
                      className="py-2 rounded"
                      style={{ backgroundColor: `${COLORS.structure}50` }}
                    >
                      <div 
                        className="text-sm font-medium"
                        style={{ color: (trader.stats?.winRate ?? 0) >= 50 ? '#10B981' : '#EF4444' }}
                      >
                        {trader.stats?.winRate ?? 0}%
                      </div>
                      <div className="text-xs" style={{ color: COLORS.data }}>Win Rate</div>
                    </div>
                    <div 
                      className="py-2 rounded"
                      style={{ backgroundColor: `${COLORS.structure}50` }}
                    >
                      <div 
                        className="text-sm font-medium"
                        style={{ color: isProfitable ? '#10B981' : '#EF4444' }}
                      >
                        {isProfitable ? '+' : '-'}${formatAmount(Math.abs(trader.stats?.totalPnl ?? 0))}
                      </div>
                      <div className="text-xs" style={{ color: COLORS.data }}>PnL</div>
                    </div>
                  </div>
                </div>
                
                {/* Desktop Table Row */}
                <div className="hidden md:grid grid-cols-6 gap-4 items-center px-6 py-4">
                  {/* Trader Info */}
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-transform group-hover:scale-105"
                      style={{ backgroundColor: COLORS.structure, color: COLORS.text }}
                    >
                      {trader.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-medium" style={{ color: COLORS.text }}>{trader.name}</div>
                      <div className="text-xs font-mono" style={{ color: COLORS.data }}>
                        {trader.wallet ? `${trader.wallet.slice(0, 6)}...${trader.wallet.slice(-4)}` : '—'}
                      </div>
                    </div>
                  </div>
                  
                  {/* Trade Count */}
                  <div style={{ color: COLORS.text }}>
                    {trader.stats?.tradesCount ?? 0}
                  </div>
                  
                  {/* Win Rate */}
                  <div>
                    <span 
                      className="px-2 py-1 rounded text-sm font-medium"
                      style={{ 
                        backgroundColor: (trader.stats?.winRate ?? 0) >= 50 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: (trader.stats?.winRate ?? 0) >= 50 ? '#10B981' : '#EF4444'
                      }}
                    >
                      {trader.stats?.winRate ?? 0}%
                    </span>
                  </div>
                  
                  {/* Wins / Losses */}
                  <div>
                    <span style={{ color: '#10B981' }}>{trader.stats?.wins ?? 0}</span>
                    <span style={{ color: COLORS.data }}> / </span>
                    <span style={{ color: '#EF4444' }}>{trader.stats?.losses ?? 0}</span>
                  </div>
                  
                  {/* Total PnL */}
                  <div 
                    className="font-medium"
                    style={{ color: isProfitable ? '#10B981' : '#EF4444' }}
                  >
                    {isProfitable ? '+' : '-'}${formatAmount(Math.abs(trader.stats?.totalPnl ?? 0))}
                  </div>
                  
                  {/* Action */}
                  <div className="flex justify-end">
                    <span 
                      className="flex items-center gap-1 text-sm opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: COLORS.brand }}
                    >
                      View Details <ArrowRight size={14} />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
