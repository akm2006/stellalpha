'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useWallet } from '@solana/wallet-adapter-react';
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
  TrendingUp,
  Clock,
  CheckCircle,
  ExternalLink,
  X,
  Loader2
} from 'lucide-react';

interface Position {
  mint: string;
  symbol: string;
  name: string;
  logoURI: string | null;
  amount: number;
  costBasis: number;
  avgCost: number;
  currentPrice: number | null;
  currentValue: number | null;
  unrealizedPnL: number | null;
  unrealizedPercent: number | null;
  portfolioPercent: number | null;
  priceStale: boolean;
}

interface Trade {
  id: string;
  type: string;
  token_in_mint: string;
  token_in_symbol: string;
  token_in_amount: number;
  token_out_mint: string;
  token_out_symbol: string;
  token_out_amount: number;
  usd_value: number;
  price_impact: number;
  latency_diff_ms: number;
  realized_pnl: number | null;
  star_trade_signature: string;
  created_at: string;
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
  
  // ============================================
  // METRICS (per authoritative spec)
  // ============================================
  portfolioValue: number;       // Σ (currentPrice × amount)
  totalCostBasis: number;       // Σ position.costBasis
  
  // THE SINGLE TRUTH: totalPnL = portfolioValue - allocatedUsd
  totalPnL: number;
  totalPnLPercent: number;      // (totalPnL / allocatedUsd) × 100
  
  // Split
  unrealizedPnL: number;        // portfolioValue - totalCostBasis
  unrealizedPnLPercent: number;
  
  // Invariant check
  invariantValid: boolean;
  hasStalePrices: boolean;
}

function formatAmount(amount: number): string {
  if (Math.abs(amount) >= 1000000) return (amount / 1000000).toFixed(2) + 'M';
  if (Math.abs(amount) >= 1000) return (amount / 1000).toFixed(2) + 'K';
  if (Math.abs(amount) < 0.01 && amount !== 0) return amount.toFixed(6);
  return amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatUsd(amount: number | null): string {
  if (amount === null || amount === undefined) return '—';
  if (Math.abs(amount) >= 1000000) return '$' + (amount / 1000000).toFixed(2) + 'M';
  if (Math.abs(amount) >= 1000) return '$' + (amount / 1000).toFixed(2) + 'K';
  if (Math.abs(amount) < 0.01 && amount !== 0) return '$' + amount.toFixed(4);
  return '$' + amount.toFixed(2);
}

// Format token price - handles small prices like BONK ($0.0000117)
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

function formatPnl(pnl: number | null, includeSign = true): { text: string; color: string } {
  if (pnl === null) return { text: '—', color: COLORS.data };
  const isPositive = pnl >= 0;
  const text = includeSign 
    ? (isPositive ? `+${formatUsd(pnl)}` : `-${formatUsd(Math.abs(pnl))}`)
    : formatUsd(Math.abs(pnl));
  return { text, color: isPositive ? '#10B981' : '#EF4444' };
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

function TokenIcon({ symbol, logoURI }: { symbol: string; logoURI?: string | null }) {
  const [imgError, setImgError] = useState(false);
  
  if (logoURI && !imgError) {
    return (
      <img 
        src={logoURI}
        alt={symbol}
        className="w-8 h-8 rounded-full"
        onError={() => setImgError(true)}
      />
    );
  }
  
  return (
    <div 
      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
      style={{ backgroundColor: COLORS.structure, color: COLORS.text }}
    >
      {symbol?.charAt(0) || '?'}
    </div>
  );
}

export default function TraderStateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { publicKey, connected } = useWallet();
  const traderStateId = params.id as string;
  const walletAddress = publicKey?.toBase58() || null;
  
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tokenMeta, setTokenMeta] = useState<Record<string, any>>({});
  
  // Init Modal State
  const [showInitModal, setShowInitModal] = useState(false);
  const [previewPortfolio, setPreviewPortfolio] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'portfolio' | 'trades'>('portfolio');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fetchData = useCallback(async () => {
    if (!walletAddress || !traderStateId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Fetch portfolio with live prices
      const portfolioRes = await fetch(
        `/api/demo-vault/portfolio?wallet=${walletAddress}&traderStateId=${traderStateId}`
      );
      const portfolioData = await portfolioRes.json();
      
      if (portfolioData.error) {
        setError(portfolioData.error);
        return;
      }
      
      setPortfolio(portfolioData);
      
      // Fetch trades
      const tradesRes = await fetch(
        `/api/demo-vault/trades?wallet=${walletAddress}&traderStateId=${traderStateId}`
      );
      const tradesData = await tradesRes.json();
      setTrades(tradesData.trades || []);
      
    } catch {
      setError('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [walletAddress, traderStateId]);

  // Separate effect for metadata fetching to avoid infinite loop
  useEffect(() => {
    const fetchMetadata = async () => {
      const uniqueMints = new Set<string>();
      
      // Collect mints from trades
      if (trades.length > 0) {
        trades.forEach((t: Trade) => {
          if (t.token_in_mint) uniqueMints.add(t.token_in_mint);
          if (t.token_out_mint) uniqueMints.add(t.token_out_mint);
        });
      }
      
      // Collect mints from portfolio
      if (portfolio) {
        portfolio.positions.forEach(p => uniqueMints.add(p.mint));
      }
      
      const mints = Array.from(uniqueMints);
      if (mints.length > 0) {
        const missing = mints.filter(m => !tokenMeta[m]);
        
        if (missing.length > 0) {
           try {
             const res = await fetch(`/api/tokens?mints=${missing.join(',')}`);
             if (res.ok) {
               const meta = await res.json();
               if (Object.keys(meta).length > 0) {
                 setTokenMeta(prev => ({ ...prev, ...meta }));
               }
             }
           } catch (e) {
             console.error('Failed to fetch token metadata', e);
           }
        }
      }
    };
    
    if (trades.length > 0 || portfolio) {
      fetchMetadata();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, portfolio]);
  
  useEffect(() => {
    if (connected && walletAddress) {
      fetchData();
    }
  }, [connected, walletAddress, fetchData]);
  
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
      
      // Add native SOL if present and significant
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
      // Just show empty if fail
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmInit = async () => {
    // 1. Sync first
    const synced = await handleAction('sync');
    if (!synced) return;
    
    // 2. Initialize
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
  
  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: COLORS.canvas }}>
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: COLORS.brand, borderTopColor: 'transparent' }} />
      </div>
    );
  }
  
  // Not connected
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
  
  // Error state
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
  
  const { 
    positions, portfolioValue, totalCostBasis, totalPnL, totalPnLPercent, 
    allocatedUsd, starTrader, isPaused, isSettled, isInitialized, 
    realizedPnlUsd, unrealizedPnL, hasStalePrices 
  } = portfolio;
  const avgLatency = trades.length > 0 ? trades.reduce((s, t) => s + (t.latency_diff_ms || 0), 0) / trades.length : 0;
  
  // Win rate calculation (profitable sells / total sells)
  const sellTrades = trades.filter(t => t.type === 'sell');
  const profitableSells = sellTrades.filter(t => (t as any).realized_pnl > 0).length;
  const winRate = sellTrades.length > 0 ? (profitableSells / sellTrades.length) * 100 : 0;
  
  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: COLORS.canvas, color: COLORS.text }}>
      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Back & Header */}
        <div className="mb-8">
          <Link 
            href="/demo-vault"
            className="inline-flex items-center gap-2 text-sm mb-6 hover:opacity-80"
            style={{ color: COLORS.data }}
          >
            <ArrowLeft size={16} /> Back to Demo Vault
          </Link>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-xl" style={{ backgroundColor: COLORS.structure, color: COLORS.text }}>
                {starTrader.charAt(0)}
              </div>
              <div>
                <h1 className="text-2xl font-semibold flex items-center gap-3" style={{ color: COLORS.text }}>
                  Trader State
                  {isSettled ? (
                    <span className="text-sm text-gray-400 flex items-center gap-1"><StopCircle size={14} /> Settled</span>
                  ) : isPaused ? (
                    <span className="text-sm text-yellow-400 flex items-center gap-1"><Pause size={14} /> Paused</span>
                  ) : isInitialized ? (
                    <span className="text-sm text-green-400 flex items-center gap-1"><CheckCircle size={14} /> Active</span>
                  ) : (
                    <span className="text-sm text-orange-400 flex items-center gap-1"><Clock size={14} /> Pending</span>
                  )}
                </h1>
                <div className="flex items-center gap-4 text-sm" style={{ color: COLORS.data }}>
                  <span className="font-mono">{starTrader.slice(0, 12)}...{starTrader.slice(-8)}</span>
                  <a 
                    href={`https://solscan.io/account/${starTrader}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:opacity-80"
                    style={{ color: COLORS.brand }}
                  >
                    Solscan <ArrowUpRight size={12} />
                  </a>
                </div>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Sync button - show when not initialized */}
              {/* Initialize button (Syncs & Initializes) */}
              {!isInitialized && !isSettled && (
                <button 
                  onClick={handleInitClick} 
                  disabled={actionLoading} 
                  className="px-4 py-2 text-sm font-medium flex items-center gap-2 rounded transition-colors hover:opacity-90 disabled:opacity-50" 
                  style={{ backgroundColor: '#10B981', color: '#000' }}
                >
                  <CheckCircle size={14} /> Initialize Copy Trading
                </button>
              )}
              
              {/* Pause/Resume for initialized states */}
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
        </div>
        
        {/* Stats Cards */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          <div className="p-5 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
            <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: COLORS.data }}>Allocated</div>
            <div className="text-xl font-semibold" style={{ color: COLORS.text }}>{formatUsd(allocatedUsd)}</div>
          </div>
          <div className="p-5 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
            <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: COLORS.data }}>Portfolio Value</div>
            <div className="text-xl font-semibold" style={{ color: COLORS.brand }}>{formatUsd(portfolioValue)}</div>
            {hasStalePrices && <div className="text-xs mt-1 text-yellow-400">⚠️ Some prices stale</div>}
          </div>
          <div className="p-5 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
            <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: COLORS.data }}>Total PnL</div>
            <div className="text-xl font-semibold" style={{ color: totalPnL >= 0 ? '#10B981' : '#EF4444' }}>
              {totalPnL >= 0 ? '+' : ''}{formatUsd(totalPnL)} ({totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(1)}%)
            </div>
            <div className="text-xs mt-1 flex gap-3" style={{ color: COLORS.data }}>
              <span>Realized: <span style={{ color: realizedPnlUsd >= 0 ? '#10B981' : '#EF4444' }}>{realizedPnlUsd >= 0 ? '+' : ''}{formatUsd(realizedPnlUsd)}</span></span>
              <span>Unrealized: <span style={{ color: unrealizedPnL >= 0 ? '#10B981' : '#EF4444' }}>{unrealizedPnL >= 0 ? '+' : ''}{formatUsd(unrealizedPnL)}</span></span>
            </div>
          </div>
          <div className="p-5 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
            <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: COLORS.data }}>Trades</div>
            <div className="text-xl font-semibold" style={{ color: COLORS.text }}>{trades.length}</div>
            <div className="text-xs mt-1" style={{ color: COLORS.data }}>Win Rate: {winRate.toFixed(0)}%</div>
          </div>
          <div className="p-5 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
            <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: COLORS.data }}>Avg Latency</div>
            <div className="text-xl font-semibold" style={{ color: COLORS.text }}>{(avgLatency / 1000).toFixed(1)}s</div>
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
        
        {/* Portfolio Tab */}
        {activeTab === 'portfolio' && (
          <div className="border overflow-hidden" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: COLORS.structure }}>
              <div>
                <h2 className="font-medium" style={{ color: COLORS.text }}>Portfolio</h2>
                <p className="text-xs" style={{ color: COLORS.data }}>Live prices from Jupiter</p>
              </div>
              <div className="text-lg font-medium" style={{ color: COLORS.brand }}>{formatUsd(portfolioValue)}</div>
            </div>
            
            <div className="grid grid-cols-7 gap-4 px-6 py-3 text-xs font-mono uppercase tracking-wider border-b" style={{ color: COLORS.data, borderColor: COLORS.structure }}>
              <div>Token</div>
              <div>Amount</div>
              <div>Price</div>
              <div>Value</div>
              <div>Cost Basis</div>
              <div>PnL</div>
              <div>% Portfolio</div>
            </div>
            
            <div className="max-h-[500px] overflow-y-auto">
              {/* All tokens */}
              {positions.length === 0 ? (
                <div className="text-center py-12" style={{ color: COLORS.data }}>No positions</div>
              ) : (
                positions.map(pos => {
                  const pnl = formatPnl(pos.unrealizedPnL);
                  return (
                    <div key={pos.mint} className="grid grid-cols-7 gap-4 items-center px-6 py-3 hover:bg-white/[0.02] border-b" style={{ borderColor: COLORS.structure }}>
                      <div className="flex items-center gap-2">
                        <TokenIcon symbol={pos.symbol} logoURI={pos.logoURI} />
                        <div>
                          <div style={{ color: COLORS.text }} className="font-medium">{pos.symbol}</div>
                          <div className="text-xs truncate max-w-[100px]" style={{ color: COLORS.data }}>{pos.name}</div>
                        </div>
                      </div>
                      <div style={{ color: COLORS.text }}>{formatAmount(pos.amount)}</div>
                      <div style={{ color: pos.priceStale ? '#EAB308' : COLORS.data }}>
                        {pos.priceStale ? '—' : formatPrice(pos.currentPrice)}
                        {pos.priceStale && <span className="text-xs ml-1">⚠️</span>}
                      </div>
                      <div style={{ color: COLORS.brand }} className="font-medium">{formatUsd(pos.currentValue)}</div>
                      <div style={{ color: COLORS.data }}>{formatUsd(pos.costBasis)}</div>
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
        
        {/* Trades Tab */}
        {activeTab === 'trades' && (
          <div className="border overflow-hidden" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: COLORS.structure }}>
              <h2 className="font-medium" style={{ color: COLORS.text }}>Copy Trades</h2>
              <p className="text-xs" style={{ color: COLORS.data }}>Simulated trades based on Jupiter quotes</p>
            </div>
            
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
              {trades.length === 0 ? (
                <div className="text-center py-12" style={{ color: COLORS.data }}>No trades yet</div>
              ) : (
                trades.map(trade => {
                  const tradePnl = formatPnl(trade.realized_pnl);
                  
                  // Use metadata if available, otherwise fallback
                  const inMeta = tokenMeta[trade.token_in_mint] || { symbol: trade.token_in_symbol, logoURI: null };
                  const outMeta = tokenMeta[trade.token_out_mint] || { symbol: trade.token_out_symbol, logoURI: null };
                  
                  return (
                    <div key={trade.id} className="grid grid-cols-8 gap-4 items-center px-6 py-3 hover:bg-white/[0.02] border-b" style={{ borderColor: COLORS.structure }}>
                      <div>
                        <span className="px-2.5 py-1 rounded text-xs font-medium" style={{ 
                          backgroundColor: trade.type === 'buy' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', 
                          color: trade.type === 'buy' ? '#10B981' : '#EF4444' 
                        }}>
                          {trade.type === 'buy' ? 'Buy' : 'Sell'}
                        </span>
                      </div>
                      <div className="col-span-2 flex items-center gap-2">
                        <div className="flex items-center gap-1.5" title={trade.token_in_symbol}>
                           <TokenIcon symbol={inMeta.symbol} logoURI={inMeta.logoURI} />
                           <span style={{ color: COLORS.text }}>{formatAmount(trade.token_in_amount)}</span>
                        </div>
                        <ArrowRight size={14} style={{ color: COLORS.data }} />
                         <div className="flex items-center gap-1.5" title={trade.token_out_symbol}>
                           <TokenIcon symbol={outMeta.symbol} logoURI={outMeta.logoURI} />
                           <span style={{ color: COLORS.text }}>{formatAmount(trade.token_out_amount)}</span>
                        </div>
                      </div>
                      <div style={{ color: COLORS.brand }} className="font-medium">{formatUsd(trade.usd_value)}</div>
                      <div style={{ color: tradePnl.color }} className="font-medium">{tradePnl.text}</div>
                      <div style={{ color: COLORS.data }}>{timeAgo(trade.created_at)}</div>
                      <div style={{ color: COLORS.data }} className="text-xs">
                         {/* Gasless Copy Trading */}
                         {'< 0.00001 SOL'}
                      </div>
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
          </div>
        )}
        
        {/* Init Modal */}
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
                  We will sync your demo vault with the current Star Trader portfolio to ensure accurate tracking.
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
                        // Filter dust (< 0.1% of portfolio)
                        const filtered = previewPortfolio.filter((t: any) => (t.holdingPercent || 0) >= 0.1);
                        const allocatedUsd = portfolio?.allocatedUsd || 0;
                        
                        return filtered.length === 0 ? (
                          <div className="p-4 text-center text-xs" style={{ color: COLORS.data }}>No assets found matching sync criteria.</div>
                        ) : (
                          <div className="divide-y" style={{ borderColor: COLORS.structure }}>
                            {filtered.map((token: any) => {
                              const percent = token.holdingPercent || 0;
                              // Calculate projected value for this vault based on allocation
                              const projectedValue = (percent / 100) * allocatedUsd;
                              // Calculate projected balance based on price
                              const projectedBalance = token.pricePerToken ? (projectedValue / token.pricePerToken) : 0;
                              
                              return (
                                <div key={token.mint} className="flex items-center justify-between p-2 text-sm">
                                  <div className="flex items-center gap-2">
                                    <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-[10px] overflow-hidden">
                                      {token.logoURI ? <img src={token.logoURI} alt="" /> : token.symbol[0]}
                                    </div>
                                    <div>
                                      <div style={{ color: COLORS.text }}>{token.symbol}</div>
                                      <div className="text-[10px]" style={{ color: COLORS.data }}>
                                        {percent.toFixed(2)}%
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div style={{ color: COLORS.text }}>{formatUsd(projectedValue)}</div>
                                    <div className="text-[10px]" style={{ color: COLORS.data }}>
                                      {formatAmount(projectedBalance)}
                                    </div>
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
