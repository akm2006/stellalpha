'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAuth } from '@/contexts/auth-context';
import { COLORS } from '@/lib/theme';
import { 
  Wallet, 
  TrendingUp, 
  RefreshCw, 
  Plus,
  Trash2,
  Clock,
  AlertCircle,
  CheckCircle,
  Pause,
  StopCircle,
  ArrowRight,
  DollarSign,
  LogIn,
  Loader2
} from 'lucide-react';

interface Position {
  token_mint: string;
  token_symbol: string;
  size: number;
  cost_usd: number;
}

interface TraderState {
  id: string;
  star_trader: string;
  allocated_usd: number;
  is_syncing: boolean;
  is_initialized: boolean;
  is_paused: boolean;
  is_settled: boolean;
  positions: Position[];
  totalValue: number;
  positionCount: number;
}

interface DemoVault {
  id: string;
  user_wallet: string;
  balance_usd: number;
}

function formatUsd(amount: number): string {
  if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(2) + 'M';
  if (amount >= 1000) return '$' + (amount / 1000).toFixed(2) + 'K';
  return '$' + amount.toFixed(2);
}

export default function DemoVaultPage() {
  const { connected } = useWallet();
  const { isAuthenticated, isLoading: authLoading, user, signIn, openWalletModal } = useAuth();
  const [vault, setVault] = useState<DemoVault | null>(null);
  const [traderStates, setTraderStates] = useState<TraderState[]>([]);
  const [starTraders, setStarTraders] = useState<{ address: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [following, setFollowing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFollowModal, setShowFollowModal] = useState(false);
  const [selectedTrader, setSelectedTrader] = useState<string | null>(null);
  const [allocationUsd, setAllocationUsd] = useState(500);
  
  // Use authenticated wallet address instead of raw connected wallet
  const walletAddress = user?.wallet || null;
  
  const fetchVault = useCallback(async () => {
    if (!walletAddress) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/demo-vault?wallet=${walletAddress}`);
      const data = await response.json();
      
      if (data.exists) {
        setVault(data.vault);
        setTraderStates(data.traderStates || []);
      } else {
        setVault(null);
        setTraderStates([]);
      }
    } catch {
      setError('Failed to fetch vault');
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);
  
  const fetchStarTraders = useCallback(async () => {
    try {
      const response = await fetch('/api/star-traders');
      const data = await response.json();
      setStarTraders((data.traders || []).map((t: any) => ({ address: t.wallet, name: t.name })));
    } catch {
      console.error('Failed to fetch star traders');
    }
  }, []);
  
  useEffect(() => {
    if (connected && walletAddress) {
      fetchVault();
      fetchStarTraders();
    }
  }, [connected, walletAddress, fetchVault, fetchStarTraders]);
  
  const deployVault = async () => {
    if (!walletAddress) return;
    
    setDeploying(true);
    setError(null);
    
    try {
      const response = await fetch('/api/demo-vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress })
      });
      
      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        await fetchVault();
      }
    } catch {
      setError('Failed to deploy vault');
    } finally {
      setDeploying(false);
    }
  };
  
  const followTrader = async () => {
    if (!walletAddress || !selectedTrader) return;
    
    setFollowing(true);
    setError(null);
    
    try {
      const response = await fetch('/api/demo-vault/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          wallet: walletAddress, 
          starTrader: selectedTrader,
          allocationUsd
        })
      });
      
      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
      } else {
        setShowFollowModal(false);
        setSelectedTrader(null);
        await fetchVault();
      }
    } catch {
      setError('Failed to create trader state');
    } finally {
      setFollowing(false);
    }
  };
  
  const deleteVault = async () => {
    if (!walletAddress || !confirm('Delete entire demo vault?')) return;
    
    try {
      await fetch(`/api/demo-vault?wallet=${walletAddress}`, { method: 'DELETE' });
      setVault(null);
      setTraderStates([]);
    } catch {
      setError('Failed to delete vault');
    }
  };
  
  // Calculate totals
  const unallocated = Number(vault?.balance_usd || 0);
  const totalAllocated = traderStates.reduce((sum, ts) => sum + Number(ts.allocated_usd || 0), 0);
  const totalValue = traderStates.reduce((sum, ts) => sum + Number(ts.totalValue || 0), 0);
  const totalPnl = totalValue - totalAllocated;
  
  return (
    <div className="min-h-screen font-sans" style={{ backgroundColor: COLORS.canvas, color: COLORS.text }}>
      <main className="max-w-6xl mx-auto px-6 py-12 pt-32">
        {/* Professional Header - Centered Hero Style */}
        <div className="flex flex-col items-center text-center justify-center mb-16 max-w-3xl mx-auto">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/10 mb-6" 
               style={{ backgroundColor: `${COLORS.brand}10`, border: `1px solid ${COLORS.brand}20` }}>
            <Wallet size={40} style={{ color: COLORS.brand }} />
          </div>
          
          <h1 className="text-4xl font-bold mb-4 tracking-tight bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent" style={{ color: COLORS.text }}>
            Demo Vault
          </h1>
          
          <p className="text-lg leading-relaxed mb-8 text-balance" style={{ color: COLORS.data }}>
            Experience our autonomous copy-trading engine in a risk-free environment. 
            Allocate virtual funds to Star Traders, track real-time performance, and master the platform before going live.
          </p>
          
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs font-semibold uppercase tracking-wider" style={{ color: COLORS.data }}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
              Risk-Free Simulation
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span>
              Real-Time Market Data
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]"></span>
              Instant Settlement
            </div>
          </div>
        </div>
        
        {/* Not Connected */}
        {!connected && (
          <div className="border p-12 text-center" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
            <Wallet size={48} className="mx-auto mb-4" style={{ color: COLORS.brand }} />
            <h2 className="text-xl font-medium mb-2">Connect Your Wallet</h2>
            <p className="text-sm mb-6" style={{ color: COLORS.data }}>Connect your Solana wallet to create a demo vault with $1,000 virtual USD</p>
            <button
              onClick={openWalletModal}
              className="px-6 py-3 font-medium transition-opacity hover:opacity-90 flex items-center gap-2 mx-auto rounded-lg"
              style={{ backgroundColor: COLORS.brand, color: '#000' }}
            >
              <Wallet size={18} />
              Connect Wallet
            </button>
          </div>
        )}
        
        {/* Connected but Not Authenticated - Require Sign In */}
        {connected && !isAuthenticated && !authLoading && (
          <div className="border p-12 text-center" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
            <LogIn size={48} className="mx-auto mb-4" style={{ color: COLORS.brand }} />
            <h2 className="text-xl font-medium mb-2">Sign In Required</h2>
            <p className="text-sm mb-6" style={{ color: COLORS.data }}>
              Sign a message with your wallet to verify ownership and access your demo vault securely.
            </p>
            <button
              onClick={signIn}
              disabled={authLoading}
              className="px-6 py-3 font-medium transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center gap-2 mx-auto"
              style={{ backgroundColor: COLORS.brand, color: '#000' }}
            >
              {authLoading ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />}
              Sign In with Wallet
            </button>
          </div>
        )}
        
        {/* Auth Loading */}
        {connected && authLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={32} className="animate-spin" style={{ color: COLORS.brand }} />
              <span className="text-sm" style={{ color: COLORS.data }}>Verifying wallet ownership...</span>
            </div>
          </div>
        )}
        
        {/* No Vault */}
        {connected && isAuthenticated && !vault && !loading && (
          <div className="border p-12 text-center" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
            <TrendingUp size={48} className="mx-auto mb-4" style={{ color: COLORS.brand }} />
            <h2 className="text-xl font-medium mb-2">Deploy Demo Vault</h2>
            <p className="text-sm mb-6" style={{ color: COLORS.data }}>Start with $1,000 virtual USD</p>
            <button
              onClick={deployVault}
              disabled={deploying}
              className="px-6 py-3 font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: COLORS.brand, color: '#000' }}
            >
              {deploying ? 'Deploying...' : 'Deploy Vault ($1,000 USD)'}
            </button>
          </div>
        )}
        
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: COLORS.brand, borderTopColor: 'transparent' }} />
          </div>
        )}
        
        {/* Error */}
        {error && (
          <div className="border p-4 mb-6 flex items-center gap-3" style={{ borderColor: '#EF4444', color: '#EF4444' }}>
            <AlertCircle size={20} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">×</button>
          </div>
        )}
        
        {/* Vault Dashboard */}
        {connected && isAuthenticated && vault && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
              <div className="p-5 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
                <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: COLORS.data }}>Unallocated</div>
                <div className="text-xl font-semibold" style={{ color: COLORS.text }}>{formatUsd(unallocated)}</div>
              </div>
              <div className="p-5 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
                <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: COLORS.data }}>Allocated</div>
                <div className="text-xl font-semibold" style={{ color: COLORS.brand }}>{formatUsd(totalAllocated)}</div>
              </div>
              <div className="p-5 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
                <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: COLORS.data }}>Total Value</div>
                <div className="text-xl font-semibold" style={{ color: COLORS.brand }}>{formatUsd(totalValue + unallocated)}</div>
              </div>
              <div className="p-5 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
                <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: COLORS.data }}>PnL</div>
                <div className="text-xl font-semibold" style={{ color: totalPnl >= 0 ? '#10B981' : '#EF4444' }}>
                  {totalPnl >= 0 ? '+' : ''}{formatUsd(totalPnl)}
                </div>
              </div>
              <div className="p-5 border col-span-2 md:col-span-1" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
                <div className="text-xs font-mono uppercase tracking-wider mb-2" style={{ color: COLORS.data }}>Trader States</div>
                <div className="text-xl font-semibold" style={{ color: COLORS.text }}>{traderStates.length}</div>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex flex-wrap gap-3 mb-8">
              <button
                onClick={() => { setShowFollowModal(true); setAllocationUsd(Math.min(500, unallocated)); }}
                disabled={unallocated < 10}
                className="px-4 py-2 text-sm font-medium flex items-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: COLORS.brand, color: '#000' }}
              >
                <Plus size={16} /> Create Trader State
              </button>
              <button
                onClick={fetchVault}
                className="px-4 py-2 text-sm font-medium flex items-center gap-2 border transition-opacity hover:opacity-90"
                style={{ borderColor: COLORS.structure, color: COLORS.text }}
              >
                <RefreshCw size={16} /> Refresh
              </button>
              <button
                onClick={deleteVault}
                className="px-4 py-2 text-sm font-medium flex items-center gap-2 border transition-opacity hover:opacity-90 ml-auto"
                style={{ borderColor: '#EF4444', color: '#EF4444' }}
              >
                <Trash2 size={16} /> Delete Vault
              </button>
            </div>
            
            {/* Trader States List - Responsive */}
            <div className="border overflow-hidden" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
              <div className="px-6 py-4 border-b" style={{ borderColor: COLORS.structure }}>
                <h2 className="font-medium" style={{ color: COLORS.text }}>Trader States</h2>
                <p className="text-xs" style={{ color: COLORS.data }}>Each state follows a different star trader with isolated funds</p>
              </div>
              
              {/* Desktop Header */}
              <div className="hidden md:grid md:grid-cols-7 gap-4 px-6 py-3 text-xs font-mono uppercase tracking-wider border-b" style={{ color: COLORS.data, borderColor: COLORS.structure }}>
                <div>Star Trader</div>
                <div>Allocated</div>
                <div>Current Value</div>
                <div>PnL</div>
                <div>Positions</div>
                <div>Status</div>
                <div>Actions</div>
              </div>
              
              {/* Content */}
              <div className="divide-y md:divide-y-0" style={{ borderColor: COLORS.structure }}>
                {traderStates.length === 0 ? (
                  <div className="text-center py-12" style={{ color: COLORS.data }}>
                    No trader states. Create one to start copy trading.
                  </div>
                ) : (
                  traderStates.map(ts => {
                    const pnl = ts.totalValue - Number(ts.allocated_usd);
                    const pnlPercent = ts.allocated_usd > 0 ? (pnl / ts.allocated_usd) * 100 : 0;
                    
                    return (
                      <Link 
                        key={ts.id} 
                        href={`/demo-vault/${ts.id}`}
                        className="block hover:bg-white/[0.02] transition-colors border-b md:border-b-0"
                        style={{ borderColor: COLORS.structure }}
                      >
                        <div className="p-4 md:px-6 md:py-4 grid grid-cols-1 md:grid-cols-7 gap-4 items-center">
                          
                          {/* 1. Trader Info */}
                          <div className="flex items-center gap-3 md:col-span-1">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0" style={{ backgroundColor: COLORS.structure, color: COLORS.text }}>
                              {ts.star_trader.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="font-mono text-sm truncate" style={{ color: COLORS.text }}>
                                {ts.star_trader.slice(0, 8)}...
                              </div>
                              {/* Mobile Only ID */}
                              <div className="md:hidden text-xs truncate opacity-50" style={{ color: COLORS.data }}>
                                ID: {ts.id.slice(0,6)}
                              </div>
                            </div>
                          </div>

                          {/* Mobile Stats Grid (2 cols) */}
                          <div className="grid grid-cols-2 gap-y-3 gap-x-4 md:contents">
                            
                            {/* 2. Allocated */}
                            <div className="md:col-span-1">
                              <span className="md:hidden text-[10px] uppercase font-mono mb-1 block opacity-60" style={{ color: COLORS.data }}>Allocated</span>
                              <div style={{ color: COLORS.text }}>{formatUsd(ts.allocated_usd)}</div>
                            </div>
                            
                            {/* 3. Current Value */}
                            <div className="md:col-span-1">
                              <span className="md:hidden text-[10px] uppercase font-mono mb-1 block opacity-60" style={{ color: COLORS.data }}>Value</span>
                              <div style={{ color: COLORS.brand }} className="font-medium">{formatUsd(ts.totalValue)}</div>
                            </div>
                            
                            {/* 4. PnL */}
                            <div className="md:col-span-1">
                              <span className="md:hidden text-[10px] uppercase font-mono mb-1 block opacity-60" style={{ color: COLORS.data }}>PnL</span>
                              <div style={{ color: pnl >= 0 ? '#10B981' : '#EF4444' }} className="font-medium">
                                {pnl >= 0 ? '+' : ''}{formatUsd(pnl)} ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%)
                              </div>
                            </div>
                            
                            {/* 5. Positions */}
                            <div className="md:col-span-1">
                              <span className="md:hidden text-[10px] uppercase font-mono mb-1 block opacity-60" style={{ color: COLORS.data }}>Pos</span>
                              <div style={{ color: COLORS.text }}>{ts.positionCount}</div>
                            </div>
                          </div>

                          {/* 6. Status */}
                          <div className="md:col-span-1 mt-2 md:mt-0 flex items-center justify-between md:block">
                             <div className="md:hidden text-sm font-medium" style={{ color: COLORS.text }}>Status</div>
                             <div>
                                {ts.is_settled ? (
                                  <span className="text-xs text-gray-400 flex items-center gap-1"><StopCircle size={12} /> Settled</span>
                                ) : ts.is_paused ? (
                                  <span className="text-xs text-yellow-400 flex items-center gap-1"><Pause size={12} /> Paused</span>
                                ) : ts.is_initialized ? (
                                  <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle size={12} /> Active</span>
                                ) : ts.is_syncing ? (
                                  <span className="text-xs text-blue-400 flex items-center gap-1"><RefreshCw size={12} className="animate-spin" /> Syncing</span>
                                ) : (
                                  <span className="text-xs text-orange-400 flex items-center gap-1"><Clock size={12} /> Uninitialized</span>
                                )}
                             </div>
                          </div>

                          {/* 7. Action */}
                          <div className="md:col-span-1 hidden md:flex items-center gap-1" style={{ color: COLORS.brand }}>
                            View <ArrowRight size={14} />
                          </div>
                          
                          {/* Mobile View Button */}
                          <div className="md:hidden mt-2 pt-3 border-t flex items-center justify-center gap-2 font-medium" style={{ borderColor: COLORS.structure, color: COLORS.brand }}>
                             View Details <ArrowRight size={14} />
                          </div>

                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}
        
        {/* Create Trader State Modal */}
        {showFollowModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="w-full max-w-md p-6 border" style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}>
              <h2 className="text-xl font-medium mb-2" style={{ color: COLORS.text }}>Create Trader State</h2>
              <p className="text-sm mb-4" style={{ color: COLORS.data }}>
                Allocate USD to follow a star trader. Each state has isolated funds.
              </p>
              
              <div className="mb-4">
                <label className="block text-sm mb-2" style={{ color: COLORS.data }}>Star Trader</label>
                <select
                  value={selectedTrader || ''}
                  onChange={(e) => setSelectedTrader(e.target.value)}
                  className="w-full p-3 border rounded"
                  style={{ backgroundColor: COLORS.canvas, borderColor: COLORS.structure, color: COLORS.text }}
                >
                  <option value="">Select trader...</option>
                  {starTraders
                    .filter(t => !traderStates.some(ts => ts.star_trader === t.address))
                    .map(t => (
                      <option key={t.address} value={t.address}>{t.name} ({t.address.slice(0, 8)}...)</option>
                    ))}
                </select>
              </div>
              
              <div className="mb-6">
                <label className="block text-sm mb-2" style={{ color: COLORS.data }}>Allocation (USD)</label>
                <div className="flex items-center gap-2">
                  <DollarSign size={16} style={{ color: COLORS.text }} />
                  <input
                    type="number"
                    min="10"
                    max={unallocated}
                    step="10"
                    value={allocationUsd}
                    onChange={(e) => setAllocationUsd(Math.min(Number(e.target.value), unallocated))}
                    className="flex-1 p-3 border rounded"
                    style={{ backgroundColor: COLORS.canvas, borderColor: COLORS.structure, color: COLORS.text }}
                  />
                </div>
                <p className="text-xs mt-1" style={{ color: COLORS.data }}>
                  Available: {formatUsd(unallocated)} • Min: $10
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={followTrader}
                  disabled={!selectedTrader || following || allocationUsd > unallocated || allocationUsd < 10}
                  className="flex-1 py-3 font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: COLORS.brand, color: '#000' }}
                >
                  {following ? 'Creating...' : `Allocate ${formatUsd(allocationUsd)}`}
                </button>
                <button
                  onClick={() => { setShowFollowModal(false); setSelectedTrader(null); }}
                  className="px-6 py-3 border transition-opacity hover:opacity-90"
                  style={{ borderColor: COLORS.structure, color: COLORS.text }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
