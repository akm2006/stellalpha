'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { COLORS } from '@/lib/theme';
import { ArrowUpRight, ArrowRight, Filter, RefreshCw, Download } from 'lucide-react';

interface Trader {
  address: string;
  name: string;
}

interface TraderStats {
  totalPnl: number;
  winRate: number;
  wins: number;
  losses: number;
  tradesCount: number;
}

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

interface TokenMeta {
  symbol: string;
  name: string;
  logoURI: string | null;
}

const STAR_TRADERS: Trader[] = [
  {
    address: '2ySF5KLP8WQW1FLVTY5xZEnoJgM6xMpZnhFtoXjadYar',
    name: 'Alpha Trader'
  },
  {
    address: 'TestTrader111111111111111111111111111111111',
    name: 'Test Trader'
  }
];

function formatAmount(amount: number): string {
  if (Math.abs(amount) >= 1000000) return (amount / 1000000).toFixed(1) + 'M';
  if (Math.abs(amount) >= 1000) return (amount / 1000).toFixed(1) + 'K';
  if (Math.abs(amount) < 0.01) return amount.toFixed(4);
  return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
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

function calculateStats(trades: Trade[]): TraderStats {
  let totalPnl = 0;
  let wins = 0;
  let losses = 0;
  
  for (const trade of trades) {
    if (trade.realizedPnl !== null) {
      totalPnl += trade.realizedPnl;
      if (trade.realizedPnl > 0) wins++;
      else if (trade.realizedPnl < 0) losses++;
    }
  }
  
  const totalWithPnl = wins + losses;
  const winRate = totalWithPnl > 0 ? Math.round((wins / totalWithPnl) * 100) : 0;
  
  return { totalPnl, winRate, wins, losses, tradesCount: trades.length };
}

function TokenIcon({ symbol, logoURI }: { symbol: string; logoURI?: string | null }) {
  const [imgError, setImgError] = useState(false);
  
  if (logoURI && !imgError) {
    return (
      <img 
        src={logoURI}
        alt={symbol}
        className="w-5 h-5 rounded-full"
        onError={() => setImgError(true)}
      />
    );
  }
  
  return (
    <div 
      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
      style={{ backgroundColor: COLORS.structure, color: COLORS.text }}
    >
      {symbol.charAt(0)}
    </div>
  );
}

function TradeRow({ trade, tokenMeta }: { trade: Trade; tokenMeta: Record<string, TokenMeta> }) {
  const isBuy = trade.type === 'buy';
  const pnl = formatPnl(trade.realizedPnl);
  
  const inMeta = tokenMeta[trade.tokenInMint] || { symbol: trade.tokenInSymbol, logoURI: null };
  const outMeta = tokenMeta[trade.tokenOutMint] || { symbol: trade.tokenOutSymbol, logoURI: null };
  
  return (
    <div 
      className="grid grid-cols-8 gap-4 items-center px-4 py-3 hover:bg-white/[0.02] transition-colors border-b"
      style={{ borderColor: COLORS.structure }}
    >
      <div>
        <span 
          className="px-2.5 py-1 rounded text-xs font-medium"
          style={{ 
            backgroundColor: isBuy ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: isBuy ? '#10B981' : '#EF4444'
          }}
        >
          {isBuy ? 'Buy' : 'Sell'}
        </span>
      </div>
      
      <div className="col-span-2 flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <TokenIcon symbol={inMeta.symbol} logoURI={inMeta.logoURI} />
          <span style={{ color: COLORS.text }} className="text-sm">
            {formatAmount(trade.tokenInAmount)} {inMeta.symbol}
          </span>
        </div>
        <ArrowRight size={14} style={{ color: COLORS.data }} />
        <div className="flex items-center gap-1.5">
          <TokenIcon symbol={outMeta.symbol} logoURI={outMeta.logoURI} />
          <span style={{ color: COLORS.text }} className="text-sm">
            {formatAmount(trade.tokenOutAmount)} {outMeta.symbol}
          </span>
        </div>
      </div>
      
      <div style={{ color: COLORS.brand }} className="font-medium">
        ${formatAmount(trade.usdValue)}
      </div>
      
      <div style={{ color: pnl.color }} className="font-medium">
        {pnl.text}
      </div>
      
      <div style={{ color: COLORS.data }}>{timeAgo(trade.timestamp)}</div>
      
      <div style={{ color: COLORS.data }}>${(trade.gas * 200).toFixed(3)}</div>
      
      <div>
        <a 
          href={`https://solscan.io/tx/${trade.signature}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs hover:opacity-80 transition-opacity"
          style={{ color: COLORS.data }}
        >
          View <ArrowUpRight size={12} />
        </a>
      </div>
    </div>
  );
}

function TraderCard({ trader, stats, onClick, isSelected }: { 
  trader: Trader;
  stats: TraderStats | null;
  onClick: () => void;
  isSelected: boolean;
}) {
  return (
    <div 
      onClick={onClick}
      className="p-5 border cursor-pointer transition-all duration-300"
      style={{ 
        backgroundColor: COLORS.surface, 
        borderColor: isSelected ? COLORS.brand : COLORS.structure,
        boxShadow: isSelected ? `0 0 20px ${COLORS.brand}20` : 'none'
      }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div 
          className="w-10 h-10 rounded-full flex items-center justify-center font-bold"
          style={{ backgroundColor: COLORS.structure, color: COLORS.text }}
        >
          {trader.name.charAt(0)}
        </div>
        <div>
          <div style={{ color: COLORS.text }} className="font-medium">{trader.name}</div>
          <div className="text-xs font-mono" style={{ color: COLORS.data }}>
            {trader.address.slice(0, 8)}...{trader.address.slice(-4)}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <div className="text-[10px] font-mono tracking-wider mb-1" style={{ color: COLORS.data }}>WIN RATE</div>
          <div style={{ color: COLORS.brand }} className="font-medium">
            {stats ? `${stats.winRate}%` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono tracking-wider mb-1" style={{ color: COLORS.data }}>PNL</div>
          <div style={{ color: stats && stats.totalPnl >= 0 ? '#10B981' : '#EF4444' }} className="font-medium">
            {stats ? `${stats.totalPnl >= 0 ? '+' : '-'}$${formatAmount(Math.abs(stats.totalPnl))}` : '—'}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-mono tracking-wider mb-1" style={{ color: COLORS.data }}>TRADES</div>
          <div style={{ color: COLORS.text }}>{stats?.tradesCount || '—'}</div>
        </div>
      </div>
    </div>
  );
}

export default function StarTradersPage() {
  const [selectedTrader, setSelectedTrader] = useState<Trader | null>(STAR_TRADERS[0]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tokenMeta, setTokenMeta] = useState<Record<string, TokenMeta>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<TraderStats | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  
  const fetchTokenMetadata = async (tradesList: Trade[]) => {
    const mints = new Set<string>();
    tradesList.forEach(t => {
      if (t.tokenInMint && t.tokenInMint !== 'SOL') mints.add(t.tokenInMint);
      if (t.tokenOutMint && t.tokenOutMint !== 'SOL') mints.add(t.tokenOutMint);
    });
    
    if (mints.size === 0) return;
    
    try {
      const response = await fetch(`/api/tokens?mints=${Array.from(mints).join(',')}`);
      const data = await response.json();
      if (data.tokens) {
        data.tokens['SOL'] = {
          symbol: 'SOL',
          name: 'Solana',
          logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png'
        };
        setTokenMeta(data.tokens);
      }
    } catch (err) {
      console.error('Failed to fetch token metadata:', err);
    }
  };
  
  const fetchTrades = async () => {
    if (!selectedTrader) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/trades?wallet=${selectedTrader.address}&limit=100`);
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        const tradesList = data.trades || [];
        setTrades(tradesList);
        
        // Calculate stats from trades
        const calculatedStats = calculateStats(tradesList);
        setStats(calculatedStats);
        
        // Fetch token metadata
        if (tradesList.length > 0) {
          await fetchTokenMetadata(tradesList);
        }
      }
    } catch {
      setError('Failed to fetch trades');
    } finally {
      setLoading(false);
    }
  };
  
  const syncTrades = async () => {
    if (!selectedTrader) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: selectedTrader.address, limit: 100 })
      });
      const data = await response.json();
      if (data.error) {
        setSyncResult(`Error: ${data.error}`);
      } else {
        setSyncResult(`Synced ${data.inserted} trades from ${data.fetched} transactions`);
        fetchTrades();
      }
    } catch {
      setSyncResult('Sync failed');
    } finally {
      setSyncing(false);
    }
  };
  
  useEffect(() => { fetchTrades(); }, [selectedTrader]);
  
  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: COLORS.canvas, color: COLORS.text }}>
      <header className="sticky top-0 z-50 px-6 py-4 border-b" style={{ backgroundColor: COLORS.canvas, borderColor: COLORS.structure }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-bold text-xl" style={{ color: COLORS.text }}>StellAlpha</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/" className="text-sm hover:opacity-80 transition-opacity" style={{ color: COLORS.data }}>Home</Link>
            <Link href="/star-traders" className="text-sm font-medium" style={{ color: COLORS.brand }}>Star Traders</Link>
          </nav>
        </div>
      </header>
      
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-medium mb-2" style={{ color: COLORS.text }}>⭐ Star Traders</h1>
          <p className="text-sm" style={{ color: COLORS.data }}>Track and follow the best traders on Solana</p>
        </div>
        
        {/* Trader Cards - Now with dynamic stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {STAR_TRADERS.map((trader) => (
            <TraderCard
              key={trader.address}
              trader={trader}
              stats={selectedTrader?.address === trader.address ? stats : null}
              onClick={() => setSelectedTrader(trader)}
              isSelected={selectedTrader?.address === trader.address}
            />
          ))}
        </div>
        
        {/* Sync Result */}
        {syncResult && (
          <div className="mb-4 p-3 border text-sm" style={{ borderColor: COLORS.structure, color: syncResult.includes('Error') ? '#EF4444' : COLORS.brand }}>
            {syncResult}
          </div>
        )}
        
        {/* Stats Summary */}
        {!loading && stats && trades.length > 0 && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="p-4 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
              <div className="text-[10px] font-mono tracking-wider mb-1" style={{ color: COLORS.data }}>TOTAL PNL</div>
              <div className="text-lg font-medium" style={{ color: stats.totalPnl >= 0 ? '#10B981' : '#EF4444' }}>
                {stats.totalPnl >= 0 ? '+' : '-'}${formatAmount(Math.abs(stats.totalPnl))}
              </div>
            </div>
            <div className="p-4 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
              <div className="text-[10px] font-mono tracking-wider mb-1" style={{ color: COLORS.data }}>WIN RATE</div>
              <div className="text-lg font-medium" style={{ color: COLORS.brand }}>{stats.winRate}%</div>
            </div>
            <div className="p-4 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
              <div className="text-[10px] font-mono tracking-wider mb-1" style={{ color: COLORS.data }}>WINS / LOSSES</div>
              <div className="text-lg font-medium">
                <span style={{ color: '#10B981' }}>{stats.wins}</span>
                <span style={{ color: COLORS.data }}> / </span>
                <span style={{ color: '#EF4444' }}>{stats.losses}</span>
              </div>
            </div>
            <div className="p-4 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
              <div className="text-[10px] font-mono tracking-wider mb-1" style={{ color: COLORS.data }}>DATA SOURCE</div>
              <div className="text-lg font-medium" style={{ color: COLORS.text }}>Database</div>
            </div>
          </div>
        )}
        
        {selectedTrader && (
          <div className="border overflow-hidden" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
            <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: COLORS.structure }}>
              <div>
                <h2 className="font-medium" style={{ color: COLORS.text }}>Recent Trades</h2>
                <p className="text-xs" style={{ color: COLORS.data }}>Last 20 trades with PnL</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 text-xs border transition-colors hover:opacity-80" style={{ borderColor: COLORS.structure, color: COLORS.data }}>
                  <Filter size={12} className="inline mr-1" /> Filter
                </button>
                <button onClick={fetchTrades} className="px-3 py-1.5 text-xs border transition-colors hover:opacity-80" style={{ borderColor: COLORS.structure, color: COLORS.brand }}>
                  <RefreshCw size={12} className="inline mr-1" /> Refresh
                </button>
                <button 
                  onClick={syncTrades} 
                  disabled={syncing}
                  className="px-3 py-1.5 text-xs border transition-colors hover:opacity-80" 
                  style={{ borderColor: COLORS.structure, color: '#F59E0B' }}
                >
                  <Download size={12} className="inline mr-1" /> {syncing ? 'Syncing...' : 'Sync Helius'}
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-8 gap-4 px-4 py-2 text-[10px] font-mono tracking-wider uppercase border-b" style={{ color: COLORS.data, borderColor: COLORS.structure }}>
              <div>Type</div>
              <div className="col-span-2">Token In → Token Out</div>
              <div>Total USD</div>
              <div>Profit</div>
              <div>Age</div>
              <div>Gas</div>
              <div>Actions</div>
            </div>
            
            <div className="max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: COLORS.brand, borderTopColor: 'transparent' }} />
                </div>
              ) : error ? (
                <div className="text-center py-12" style={{ color: '#EF4444' }}>{error}</div>
              ) : trades.length === 0 ? (
                <div className="text-center py-12" style={{ color: COLORS.data }}>
                  No trades found. Click "Sync Helius" to import historical trades.
                </div>
              ) : (
                trades.map((trade) => <TradeRow key={trade.signature} trade={trade} tokenMeta={tokenMeta} />)
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
