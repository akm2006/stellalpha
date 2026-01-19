'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { ArrowUpRight, ArrowRight, ArrowLeft, RefreshCw, Download, TrendingUp, Wallet, BarChart3, AlertTriangle, Info } from 'lucide-react';

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

function formatAmount(amount: number): string {
  if (Math.abs(amount) >= 1000000) return (amount / 1000000).toFixed(2) + 'M';
  if (Math.abs(amount) >= 1000) return (amount / 1000).toFixed(2) + 'K';
  if (Math.abs(amount) < 0.01) return amount.toFixed(6);
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
  if (amount > 0) return '$' + amount.toExponential(2); // Very small values
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
      {symbol.charAt(0)}
    </div>
  );
}

export default function TraderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const wallet = params.wallet as string;
  
  const [traderName, setTraderName] = useState(`Trader ${wallet.slice(0, 6)}`);
  const [activeTab, setActiveTab] = useState<'trades' | 'portfolio'>('trades');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [portfolioTokens, setPortfolioTokens] = useState<PortfolioToken[]>([]);
  const [solBalance, setSolBalance] = useState<SolBalance | null>(null);
  const [totalPortfolioValue, setTotalPortfolioValue] = useState(0);
  const [tokenMeta, setTokenMeta] = useState<Record<string, TokenMeta>>({});
  const [loading, setLoading] = useState(false);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [stats, setStats] = useState<TraderStats | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [showDust, setShowDust] = useState(false);
  
  const fetchTokenMetadata = async (mints: string[]) => {
    if (mints.length === 0) return;
    
    try {
      const response = await fetch(`/api/tokens?mints=${mints.join(',')}`);
      const data = await response.json();
      if (data) {
        // Ensure SOL is present if needed (though API might return it)
        if (!data['SOL']) {
          data['SOL'] = {
            symbol: 'SOL',
            name: 'Solana',
            logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
            decimals: 9 // Add missing decimals property to match TokenMeta
          };
        }
        setTokenMeta(prev => ({ ...prev, ...data }));
      }
    } catch (err) {
      console.error('Failed to fetch token metadata:', err);
    }
  };
  
  const fetchTrades = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/trades?wallet=${wallet}&limit=100`);
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        const tradesList = data.trades || [];
        setTrades(tradesList);
        const calculatedStats = calculateStats(tradesList);
        setStats(calculatedStats);
        
        const mints = new Set<string>();
        tradesList.forEach((t: Trade) => {
          if (t.tokenInMint && t.tokenInMint !== 'SOL') mints.add(t.tokenInMint);
          if (t.tokenOutMint && t.tokenOutMint !== 'SOL') mints.add(t.tokenOutMint);
        });
        if (mints.size > 0) await fetchTokenMetadata(Array.from(mints));
      }
    } catch {
      setError('Failed to fetch trades');
    } finally {
      setLoading(false);
    }
  };
  
  const fetchPortfolio = async () => {
    setPortfolioLoading(true);
    setPortfolioError(null);
    try {
      const response = await fetch(`/api/portfolio?wallet=${wallet}`);
      const data = await response.json();
      if (data.error) {
        setPortfolioError(data.error);
      } else {
        setPortfolioTokens(data.tokens || []);
        setSolBalance(data.solBalance || null);
        setTotalPortfolioValue(data.totalPortfolioValue || 0);
      }
    } catch {
      setPortfolioError('Failed to fetch portfolio');
    } finally {
      setPortfolioLoading(false);
    }
  };
  
  const syncTrades = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, limit: 100 })
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
  
  useEffect(() => {
    if (wallet) {
      fetchTrades();
      fetchPortfolio();
    }
  }, [wallet]);
  
  // Filter tokens based on dust toggle
  const displayTokens = showDust 
    ? portfolioTokens 
    : portfolioTokens.filter(t => !t.isDust);
  
  const dustCount = portfolioTokens.filter(t => t.isDust).length;
  
  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: COLORS.canvas, color: COLORS.text }}>
      <Link 
        href="/star-traders"
        className="fixed top-20 left-4 z-50 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border transition-all hover:bg-white/10 md:w-auto"
        style={{ 
          borderColor: COLORS.structure,
          backgroundColor: COLORS.surface,
          color: COLORS.text,
        }}
      >
        <ArrowLeft size={16} />
        <span className="hidden sm:inline">Back to Traders</span>
      </Link>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 pt-32 sm:pt-24">
        {/* Header */}
        <div className="mb-8">
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div 
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center font-bold text-lg sm:text-xl flex-shrink-0"
                style={{ backgroundColor: COLORS.structure, color: COLORS.text }}
              >
                {traderName.charAt(0)}
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-semibold truncate" style={{ color: COLORS.text }}>
                  {traderName}
                </h1>
                <a 
                  href={`https://solscan.io/account/${wallet}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs sm:text-sm font-mono flex items-center gap-1 hover:opacity-80 transition-opacity"
                  style={{ color: COLORS.data }}
                >
                  <span className="truncate">{wallet.slice(0, 8)}...{wallet.slice(-6)}</span>
                  <ArrowUpRight size={12} className="flex-shrink-0" />
                </a>
              </div>
            </div>

            {/* GMGN Link with Context */}
            <div className="flex flex-col items-end gap-2 self-start sm:self-center">
              <a 
                href={`https://gmgn.ai/sol/address/${wallet}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all hover:bg-white/5 hover:border-white/20"
                style={{ 
                  borderColor: COLORS.structure, 
                  backgroundColor: COLORS.surface,
                }}
              >
                <span className="text-sm font-medium" style={{ color: COLORS.text }}>View on</span>
                <img src="https://gmgn.ai/static/GMGNLogoDark.svg" alt="GMGN" className="h-5 w-auto" />
                <ArrowUpRight size={14} style={{ color: COLORS.data }} />
              </a>
              <div className="flex items-start gap-1.5 text-xs font-medium max-w-[220px] text-right" style={{ color: COLORS.data }}>
                <Info size={14} className="mt-0.5 flex-shrink-0" style={{ color: COLORS.brand }} />
                <span>Analysis based on recent trades. Use GMGN for full history.</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Sync Result */}
        {syncResult && (
          <div 
            className="mb-6 p-3 border text-sm"
            style={{ borderColor: COLORS.structure, color: syncResult.includes('Error') ? '#EF4444' : COLORS.brand }}
          >
            {syncResult}
          </div>
        )}
        
        {/* Stats Summary */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
            <div className="p-4 sm:p-5 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
              <div className="text-xs font-mono uppercase tracking-wider mb-1 sm:mb-2" style={{ color: COLORS.data }}>Total PnL</div>
              <div className="text-lg sm:text-xl font-semibold" style={{ color: stats.totalPnl >= 0 ? '#10B981' : '#EF4444' }}>
                {stats.totalPnl >= 0 ? '+' : '-'}${formatAmount(Math.abs(stats.totalPnl))}
              </div>
            </div>
            <div className="p-4 sm:p-5 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
              <div className="text-xs font-mono uppercase tracking-wider mb-1 sm:mb-2" style={{ color: COLORS.data }}>Win Rate</div>
              <div className="text-lg sm:text-xl font-semibold" style={{ color: COLORS.brand }}>{stats.winRate}%</div>
            </div>
            <div className="p-4 sm:p-5 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
              <div className="text-xs font-mono uppercase tracking-wider mb-1 sm:mb-2" style={{ color: COLORS.data }}>Wins / Losses</div>
              <div className="text-lg sm:text-xl font-semibold">
                <span style={{ color: '#10B981' }}>{stats.wins}</span>
                <span style={{ color: COLORS.data }}> / </span>
                <span style={{ color: '#EF4444' }}>{stats.losses}</span>
              </div>
            </div>
            <div className="p-4 sm:p-5 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
              <div className="text-xs font-mono uppercase tracking-wider mb-1 sm:mb-2" style={{ color: COLORS.data }}>Portfolio</div>
              <div className="text-lg sm:text-xl font-semibold" style={{ color: COLORS.brand }}>{formatUsd(totalPortfolioValue)}</div>
            </div>
          </div>
        )}
        
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('trades')}
            className="px-5 py-2.5 text-sm font-medium transition-colors flex items-center gap-2"
            style={{
              backgroundColor: activeTab === 'trades' ? COLORS.surface : 'transparent',
              color: activeTab === 'trades' ? COLORS.brand : COLORS.data,
              borderBottom: activeTab === 'trades' ? `2px solid ${COLORS.brand}` : '2px solid transparent'
            }}
          >
            <BarChart3 size={16} /> Trades ({trades.length})
          </button>
          <button
            onClick={() => setActiveTab('portfolio')}
            className="px-5 py-2.5 text-sm font-medium transition-colors flex items-center gap-2"
            style={{
              backgroundColor: activeTab === 'portfolio' ? COLORS.surface : 'transparent',
              color: activeTab === 'portfolio' ? COLORS.brand : COLORS.data,
              borderBottom: activeTab === 'portfolio' ? `2px solid ${COLORS.brand}` : '2px solid transparent'
            }}
          >
            <Wallet size={16} /> Portfolio ({portfolioTokens.length})
          </button>
        </div>
        
        {/* Trades Tab */}
        {activeTab === 'trades' && (
          <div className="border overflow-hidden" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
            <div className="px-4 sm:px-6 py-4 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" style={{ borderColor: COLORS.structure }}>
              <div>
                <h2 className="font-medium" style={{ color: COLORS.text }}>Recent Trades</h2>
                <p className="text-xs" style={{ color: COLORS.data }}>Last 100 trades with PnL calculation</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={fetchTrades} className="px-3 py-1.5 text-xs border transition-colors hover:opacity-80 rounded" style={{ borderColor: COLORS.structure, color: COLORS.brand }}>
                  <RefreshCw size={12} className="inline mr-1" /> Refresh
                </button>
                <button onClick={syncTrades} disabled={syncing} className="px-3 py-1.5 text-xs border transition-colors hover:opacity-80 rounded" style={{ borderColor: COLORS.structure, color: '#F59E0B' }}>
                  <Download size={12} className="inline mr-1" /> {syncing ? 'Syncing...' : 'Sync'}
                </button>
              </div>
            </div>
            
            {/* Scrollable table wrapper for mobile */}
            <div className="overflow-x-auto">
              <div className="min-w-[700px]">
                <div className="grid grid-cols-8 gap-4 px-6 py-3 text-xs font-mono uppercase tracking-wider border-b" style={{ color: COLORS.data, borderColor: COLORS.structure }}>
                  <div>Type</div>
                  <div className="col-span-2">Token In → Token Out</div>
                  <div>USD Value</div>
                  <div>Profit</div>
                  <div>Age</div>
                  <div>Gas</div>
                  <div>Actions</div>
                </div>
            
                <div className="max-h-[500px] overflow-y-auto">
                  {loading ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: COLORS.brand, borderTopColor: 'transparent' }} />
                    </div>
                  ) : error ? (
                    <div className="text-center py-16" style={{ color: '#EF4444' }}>{error}</div>
                  ) : trades.length === 0 ? (
                    <div className="text-center py-16" style={{ color: COLORS.data }}>
                      No trades found. Click "Sync" to import historical trades.
                    </div>
                  ) : (
                    trades.map((trade) => {
                      const isBuy = trade.type === 'buy';
                      const pnl = formatPnl(trade.realizedPnl);
                      const inMeta = tokenMeta[trade.tokenInMint] || { symbol: trade.tokenInSymbol, logoURI: null };
                      const outMeta = tokenMeta[trade.tokenOutMint] || { symbol: trade.tokenOutSymbol, logoURI: null };
                      
                      return (
                        <div key={trade.signature} className="grid grid-cols-8 gap-4 items-center px-6 py-3 hover:bg-white/[0.02] transition-colors border-b" style={{ borderColor: COLORS.structure }}>
                          <div>
                            <span className="px-2.5 py-1 rounded text-xs font-medium" style={{ backgroundColor: isBuy ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: isBuy ? '#10B981' : '#EF4444' }}>
                              {isBuy ? 'Buy' : 'Sell'}
                            </span>
                          </div>
                          <div className="col-span-2 flex items-center gap-2">
                            <div className="flex items-center gap-1.5">
                              <TokenIcon symbol={inMeta.symbol} logoURI={inMeta.logoURI} />
                              <span style={{ color: COLORS.text }} className="text-sm">{formatAmount(trade.tokenInAmount)} {inMeta.symbol}</span>
                            </div>
                            <ArrowRight size={14} style={{ color: COLORS.data }} />
                            <div className="flex items-center gap-1.5">
                              <TokenIcon symbol={outMeta.symbol} logoURI={outMeta.logoURI} />
                              <span style={{ color: COLORS.text }} className="text-sm">{formatAmount(trade.tokenOutAmount)} {outMeta.symbol}</span>
                            </div>
                          </div>
                          <div style={{ color: COLORS.brand }} className="font-medium">${formatAmount(trade.usdValue)}</div>
                          <div style={{ color: pnl.color }} className="font-medium">{pnl.text}</div>
                          <div style={{ color: COLORS.data }}>{timeAgo(trade.timestamp)}</div>
                          <div style={{ color: COLORS.data }}>${(trade.gas * 200).toFixed(3)}</div>
                          <div>
                            <a href={`https://solscan.io/tx/${trade.signature}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs hover:opacity-80 transition-opacity" style={{ color: COLORS.data }}>
                              View <ArrowUpRight size={12} />
                            </a>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Portfolio Tab */}
        {activeTab === 'portfolio' && (
          <div className="border overflow-hidden" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
            <div className="px-4 sm:px-6 py-4 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" style={{ borderColor: COLORS.structure }}>
              <div>
                <h2 className="font-medium" style={{ color: COLORS.text }}>Portfolio</h2>
                <p className="text-xs" style={{ color: COLORS.data }}>Real-time on-chain holdings</p>
              </div>
              <div className="flex items-center gap-4">
                {dustCount > 0 && (
                  <button 
                    onClick={() => setShowDust(!showDust)}
                    className="text-xs flex items-center gap-1 hover:opacity-80 transition-opacity"
                    style={{ color: COLORS.data }}
                  >
                    <AlertTriangle size={12} />
                    {showDust ? `Hide ${dustCount} dust` : `Show ${dustCount} dust`}
                  </button>
                )}
                <div className="text-lg font-medium" style={{ color: COLORS.brand }}>
                  {formatUsd(totalPortfolioValue)}
                </div>
              </div>
            </div>
            
            {/* Scrollable table wrapper for mobile */}
            <div className="overflow-x-auto">
              <div className="min-w-[600px]">
                <div className="grid grid-cols-6 gap-4 px-6 py-3 text-xs font-mono uppercase tracking-wider border-b" style={{ color: COLORS.data, borderColor: COLORS.structure }}>
                  <div>Token</div>
                  <div>Balance</div>
                  <div>Price</div>
                  <div>Value</div>
                  <div>% Portfolio</div>
                  <div>Actions</div>
                </div>
            
                <div className="max-h-[500px] overflow-y-auto">
                  {portfolioLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: COLORS.brand, borderTopColor: 'transparent' }} />
                    </div>
                  ) : portfolioError ? (
                    <div className="text-center py-16" style={{ color: '#EF4444' }}>{portfolioError}</div>
                  ) : (
                <>
                  {/* Native SOL */}
                  {solBalance && (
                    <div className="grid grid-cols-6 gap-4 items-center px-6 py-3 hover:bg-white/[0.02] transition-colors border-b" style={{ borderColor: COLORS.structure, backgroundColor: 'rgba(16, 185, 129, 0.03)' }}>
                      <div className="flex items-center gap-2">
                        <TokenIcon symbol="SOL" logoURI="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" />
                        <div>
                          <div style={{ color: COLORS.text }} className="font-medium">SOL</div>
                          <div className="text-xs" style={{ color: COLORS.data }}>Solana (Native)</div>
                        </div>
                      </div>
                      <div style={{ color: COLORS.text }}>{formatAmount(solBalance.balance)}</div>
                      <div style={{ color: COLORS.data }}>{formatUsd(solBalance.pricePerToken)}</div>
                      <div style={{ color: COLORS.brand }} className="font-medium">{formatUsd(solBalance.totalValue)}</div>
                      <div style={{ color: COLORS.text }}>{solBalance.holdingPercent !== null ? `${solBalance.holdingPercent.toFixed(1)}%` : '—'}</div>
                      <div><span className="text-xs" style={{ color: COLORS.data }}>Native</span></div>
                    </div>
                  )}
                  
                  {/* Tokens */}
                  {displayTokens.map((token) => (
                    <div 
                      key={token.mint} 
                      className="grid grid-cols-6 gap-4 items-center px-6 py-3 hover:bg-white/[0.02] transition-colors border-b" 
                      style={{ borderColor: COLORS.structure, opacity: token.isDust ? 0.5 : 1 }}
                    >
                      <div className="flex items-center gap-2">
                        <TokenIcon symbol={token.symbol} logoURI={token.logoURI} />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span style={{ color: COLORS.text }} className="font-medium">{token.symbol}</span>
                            {token.isDust && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(234, 179, 8, 0.2)', color: '#EAB308' }}>
                                DUST
                              </span>
                            )}
                          </div>
                          <div className="text-xs truncate max-w-[120px]" style={{ color: COLORS.data }}>{token.name}</div>
                        </div>
                      </div>
                      <div style={{ color: COLORS.text }}>{formatAmount(token.balance)}</div>
                      <div style={{ color: COLORS.data }}>{token.pricePerToken ? formatUsd(token.pricePerToken) : '—'}</div>
                      <div style={{ color: COLORS.brand }} className="font-medium">{formatUsd(token.totalValue)}</div>
                      <div style={{ color: COLORS.text }}>{token.holdingPercent !== null ? `${token.holdingPercent.toFixed(1)}%` : '—'}</div>
                      <div>
                        <a href={`https://solscan.io/token/${token.mint}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs hover:opacity-80 transition-opacity" style={{ color: COLORS.data }}>
                          View <ArrowUpRight size={12} />
                        </a>
                      </div>
                    </div>
                  ))}
                </>
              )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
