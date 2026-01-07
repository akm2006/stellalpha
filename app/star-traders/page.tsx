'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { Users, ArrowRight } from 'lucide-react';

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
    <div className="min-h-screen font-sans" style={{ backgroundColor: COLORS.canvas, color: COLORS.text }}>
      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div 
              className="w-12 h-12 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${COLORS.brand}20` }}
            >
              <Users size={24} style={{ color: COLORS.brand }} />
            </div>
            <div>
              <h1 className="text-3xl font-semibold" style={{ color: COLORS.text }}>
                Star Traders
              </h1>
              <p className="text-sm" style={{ color: COLORS.data }}>
                Follow top-performing wallets in real-time
              </p>
            </div>
          </div>
        </div>
        
        {/* Traders List */}
        <div 
          className="border overflow-hidden"
          style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}
        >
          <div 
            className="px-6 py-4 border-b"
            style={{ borderColor: COLORS.structure }}
          >
            <h2 className="font-medium" style={{ color: COLORS.text }}>All Traders</h2>
          </div>
          
          {/* Header Row */}
          <div 
            className="grid grid-cols-6 gap-4 px-6 py-3 text-xs font-mono uppercase tracking-wider border-b"
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
            <div className="text-center py-16" style={{ color: '#EF4444' }}>
              {error}
            </div>
          )}
          
          {/* Empty State */}
          {!loading && !error && traders.length === 0 && (
            <div className="text-center py-16" style={{ color: COLORS.data }}>
              <Users size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg mb-2">No traders yet</p>
              <p className="text-sm">Star traders are automatically added when you follow wallets in Helius</p>
            </div>
          )}
          
          {/* Trader Rows */}
          {!loading && !error && traders.map((trader) => {
            if (!trader || !trader.wallet) return null;
            const isProfitable = trader.stats?.totalPnl >= 0;
            
            return (
              <div
                key={trader.wallet}
                onClick={() => handleTraderClick(trader.wallet)}
                className="grid grid-cols-6 gap-4 items-center px-6 py-4 cursor-pointer hover:bg-white/[0.02] transition-all duration-200 border-b group"
                style={{ borderColor: COLORS.structure }}
              >
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
            );
          })}
        </div>
        
        {/* Footer Note */}
        <p 
          className="text-center text-sm mt-8"
          style={{ color: COLORS.data }}
        >
          Star traders are automatically added when you follow wallets in your Helius dashboard
        </p>
      </main>
    </div>
  );
}
