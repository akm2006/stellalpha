'use client';

import PageLoader from '@/components/PageLoader';
import {
  COPY_BUY_MODEL_DEFINITIONS,
  parseCopyBuyModelSelection,
} from '@/lib/copy-models/catalog';
import {
  formatCopyBuyModelConfigSummary,
  formatCopyBuyModelLabel,
} from '@/lib/copy-models/format';
import {
  CopyBuyModelConfig,
  CopyBuyModelKey,
} from '@/lib/copy-models/types';
import { useState, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { useAppKitAccount } from '@reown/appkit/react';
import { useAuth } from '@/contexts/auth-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { getDemoTradeCount } from '@/lib/demo-trade-stats';
import { COLORS } from '@/lib/theme';
import { 
  Wallet, 
  TrendingUp, 
  RefreshCw, 
  Clock,
  AlertCircle,
  Pause,
  StopCircle,
  DollarSign,
  LogIn,
  Loader2,
  Crown,
  ExternalLink,
  Info,
  X,
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

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
  copy_model_key: CopyBuyModelKey;
  copy_model_config: CopyBuyModelConfig;
  starting_capital_usd?: number | null;
  recommended_model_key?: CopyBuyModelKey | null;
  recommended_model_reason?: string | null;
  realized_pnl_usd: number;
  is_syncing: boolean;
  is_initialized: boolean;
  is_paused: boolean;
  is_settled: boolean;
  positions: Position[];
  totalValue: number;
  positionCount: number;
  tradeStats: TradeStats;
}

interface TradeStats {
  totalCount?: number;
  completedCount: number;
  failedCount: number;
  avgLatency?: number;
  totalRealizedPnl: number;
  profitableCount?: number;
  lossCount?: number;
  profitFactor?: number;
}

interface DemoVault {
  id: string;
  user_wallet: string;
  balance_usd: number;
}

interface StarTraderOption {
  address: string;
  name: string;
  image?: string;
  recommendedCopyModelKey: CopyBuyModelKey;
  recommendedCopyModelConfig: CopyBuyModelConfig;
  recommendedCopyModelReason: string;
  recommendedCopyModelLabel: string;
  recommendedCopyModelSummary: string;
}

function formatUsd(amount: number): string {
  if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(2) + 'M';
  if (amount >= 1000) return '$' + (amount / 1000).toFixed(2) + 'K';
  return '$' + amount.toFixed(2);
}

// Generate volatile sparkline based on PnL direction with seeded randomness
function generateSparklineFromPnl(pnl: number, allocatedUsd: number, seed: string) {
  const data = [];
  const steps = 14;
  
  // Create seeded random from trader address to keep consistent
  let seedNum = seed.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const seededRandom = () => {
    seedNum = (seedNum * 9301 + 49297) % 233280;
    return seedNum / 233280;
  };
  
  const isPositive = pnl >= 0;
  let value = 50; // Start at middle
  
  for (let i = 0; i <= steps; i++) {
    // Add volatile movements
    const volatility = 8 + seededRandom() * 12; // 8-20% swings
    const trend = isPositive ? 0.15 : -0.15; // Slight bias
    const change = (seededRandom() - 0.5 + trend) * volatility;
    
    value = Math.max(10, Math.min(90, value + change));
    data.push({ value });
  }
  
  // Ensure end matches overall direction
  const lastIdx = data.length - 1;
  if (isPositive && data[lastIdx].value < data[0].value + 5) {
    data[lastIdx].value = data[0].value + 15 + seededRandom() * 20;
  } else if (!isPositive && data[lastIdx].value > data[0].value - 5) {
    data[lastIdx].value = data[0].value - 15 - seededRandom() * 20;
  }
  
  return data;
}

// Sparkline with area glow effect
function Sparkline({ data, isPositive, id, className = "w-20" }: { data: { value: number }[]; isPositive: boolean; id: string; className?: string }) {
  const color = isPositive ? '#10B981' : '#EF4444';
  const gradientId = `gradient-${id}`;
  
  // Find min/max for proper scaling
  const values = data.map(d => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;
  
  // Scale data to 0-100 range
  const scaledData = data.map(d => ({
    value: ((d.value - minVal) / range) * 80 + 10 // 10-90 range
  }));
  
  // Create SVG path
  const width = 100;
  const height = 30;
  
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
        {/* Area fill with gradient */}
        <path d={areaPath} fill={`url(#${gradientId})`} />
        {/* Line with glow */}
        <path 
          d={linePath} 
          fill="none" 
          stroke={color} 
          strokeWidth="1.5"
          style={{ filter: `drop-shadow(0 0 2px ${color})` }}
        />
      </svg>
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

// Alert Bubble Component for Non-Active States
function StatusAlertBubble({ 
  status, 
  onClose 
}: { 
  status: 'paused' | 'uninitialized' | 'stopped'; 
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const config = {
    uninitialized: {
      color: '#FB923C', // Orange-400
      bg: 'rgba(249, 115, 22, 0.1)', // Orange-500/10
      border: 'rgba(249, 115, 22, 0.2)', // Orange-500/20
      title: 'Action Required',
      text: 'This setup is saved but not running yet. Open it and click "Start" to begin copying.'
    },
    paused: {
      color: '#FACC15', // Yellow-400
      bg: 'rgba(234, 179, 8, 0.1)', // Yellow-500/10
      border: 'rgba(234, 179, 8, 0.2)', // Yellow-500/20
      title: 'Copying Paused',
      text: 'New trades are not being copied. Existing positions remain open. Click "View" to resume.'
    },
    stopped: {
      color: '#F87171', // Red-400
      bg: 'rgba(239, 68, 68, 0.1)', // Red-500/10
      border: 'rgba(239, 68, 68, 0.2)', // Red-500/20
      title: 'Setup Stopped',
      text: 'This setup is stopped. Withdraw any remaining funds back to your vault.'
    }
  };

  const style = config[status];

  return (
    <div 
      className="absolute z-50 flex items-start px-3 py-2 rounded-lg shadow-xl animate-in fade-in zoom-in slide-in-from-bottom-2 duration-300"
      style={{ 
        backgroundColor: COLORS.surface,
        border: `1px solid ${style.color}`,
        color: COLORS.text,
        right: '100%', // Position to the LEFT of the element
        marginRight: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: '260px', // Wider for more info
        boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
        zIndex: 100
      }}
    >
      {/* Triangle pointer (Right side pointing to element) */}
      <div 
        className="absolute w-3 h-3 border-r border-t transform rotate-45"
        style={{ 
          backgroundColor: COLORS.surface,
          borderColor: style.color,
          borderLeft: 'transparent',
          borderBottom: 'transparent',
          right: '-7px', // On the right edge
          top: '50%',
          marginTop: '-6px'
        }}
      />
      
      <div className="flex-1 mr-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: style.color }}>
          {style.title}
        </h4>
        <p className="text-[10px] leading-relaxed opacity-90 w-full font-medium">
          {style.text}
        </p>
      </div>
      
      <button 
        onClick={(e) => { e.stopPropagation(); setVisible(false); onClose(); }}
        className="p-1 hover:bg-black/5 rounded transition-colors -mr-1 -mt-1 shrink-0"
        style={{ color: style.color }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

export default function DemoVaultPage() {
  const { isConnected } = useAppKitAccount();
  const { isAuthenticated, isLoading: authLoading, user, signIn, openWalletModal } = useAuth();
  const [vault, setVault] = useState<DemoVault | null>(null);
  const [traderStates, setTraderStates] = useState<TraderState[]>([]);
  const [starTraders, setStarTraders] = useState<StarTraderOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasCheckedVault, setHasCheckedVault] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [following, setFollowing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFollowModal, setShowFollowModal] = useState(false);
  const [selectedTrader, setSelectedTrader] = useState<string | null>(null);
  const [selectedCopyModelKey, setSelectedCopyModelKey] = useState<CopyBuyModelKey>('current_ratio');
  const [selectedCopyModelConfig, setSelectedCopyModelConfig] = useState<CopyBuyModelConfig>({});
  const [allocationUsd, setAllocationUsd] = useState(500);
  
  const { step: onboardingStep, setStep } = useOnboarding();
  const walletAddress = user?.wallet || null;

  const selectedTraderOption = useMemo(
    () => starTraders.find((trader) => trader.address === selectedTrader) || null,
    [selectedTrader, starTraders],
  );
  const normalizedSelectedModel = useMemo(
    () => parseCopyBuyModelSelection(selectedCopyModelKey, selectedCopyModelConfig),
    [selectedCopyModelConfig, selectedCopyModelKey],
  );
  const selectedModelDefinition = useMemo(
    () => COPY_BUY_MODEL_DEFINITIONS.find((definition) => definition.key === normalizedSelectedModel.modelKey),
    [normalizedSelectedModel.modelKey],
  );
  const selectedModelSummary = useMemo(
    () => formatCopyBuyModelConfigSummary(normalizedSelectedModel.modelKey, normalizedSelectedModel.config),
    [normalizedSelectedModel.config, normalizedSelectedModel.modelKey],
  );
  const existingStateCountForSelectedTrader = useMemo(
    () => selectedTrader
      ? traderStates.filter((state) => state.star_trader === selectedTrader).length
      : 0,
    [selectedTrader, traderStates],
  );
  
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
      setHasCheckedVault(true);
    }
  }, [walletAddress]);
  
  const fetchStarTraders = useCallback(async () => {
    try {
      const response = await fetch('/api/star-traders');
      const data = await response.json();
      setStarTraders((data.traders || []).map((t: any) => ({
        address: t.wallet,
        name: t.name,
        image: t.image,
        recommendedCopyModelKey: t.recommendedCopyModelKey || 'current_ratio',
        recommendedCopyModelConfig: t.recommendedCopyModelConfig || {},
        recommendedCopyModelReason: t.recommendedCopyModelReason || '',
        recommendedCopyModelLabel: t.recommendedCopyModelLabel || formatCopyBuyModelLabel('current_ratio'),
        recommendedCopyModelSummary: t.recommendedCopyModelSummary || formatCopyBuyModelConfigSummary('current_ratio', {}),
      })));
    } catch {
      console.error('Failed to fetch star traders');
    }
  }, []);
  
  // Handle ?follow= query param from star-traders page (client-side only)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const followParam = params.get('follow');
    
    if (followParam && starTraders.length > 0 && vault) {
      const availableBalance = Number(vault?.balance_usd || 0);
      setSelectedTrader(followParam);
      setShowFollowModal(true);
      setAllocationUsd(Math.min(500, availableBalance));
      // Clear the URL param after handling
      window.history.replaceState({}, '', '/demo-vault');
    }
  }, [starTraders, vault]);

  useEffect(() => {
    if (!selectedTraderOption) {
      setSelectedCopyModelKey('current_ratio');
      setSelectedCopyModelConfig({});
      return;
    }

    setSelectedCopyModelKey(selectedTraderOption.recommendedCopyModelKey);
    setSelectedCopyModelConfig(selectedTraderOption.recommendedCopyModelConfig);
  }, [selectedTraderOption]);
  
  useEffect(() => {
    if (isConnected && walletAddress) {
      fetchVault();
      fetchStarTraders();
    }
  }, [isConnected, walletAddress, fetchVault, fetchStarTraders]);
  
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
  
  const closeFollowModal = () => {
    setShowFollowModal(false);
    setSelectedTrader(null);
    setSelectedCopyModelKey('current_ratio');
    setSelectedCopyModelConfig({});
  };

  const updateSelectedModelField = (fieldKey: string, rawValue: string) => {
    const numericValue = Number(rawValue);
    setSelectedCopyModelConfig((currentConfig) => parseCopyBuyModelSelection(
      selectedCopyModelKey,
      {
        ...(currentConfig as Record<string, unknown>),
        [fieldKey]: Number.isFinite(numericValue) ? numericValue : rawValue,
      },
    ).config);
  };

  const followTrader = async (initializeNow = false) => {
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
          allocationUsd,
          copyModelKey: normalizedSelectedModel.modelKey,
          copyModelConfig: normalizedSelectedModel.config,
          initializeNow,
        })
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        closeFollowModal();
        if (onboardingStep === 'ALLOCATE') {
          setStep(initializeNow ? 'COMPLETE' : 'INITIALIZE');
        }
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
      setError(null);
      const response = await fetch(`/api/demo-vault?wallet=${walletAddress}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok || data.error) {
        setError(data.error || 'Failed to delete vault');
        return;
      }
      setVault(null);
      setTraderStates([]);
    } catch {
      setError('Failed to delete vault');
    }
  };
  
  const unallocated = Number(vault?.balance_usd || 0);
  const totalAllocated = traderStates.reduce((sum, ts) => sum + Number(ts.allocated_usd || 0), 0);
  const totalValue = traderStates.reduce((sum, ts) => sum + Number(ts.totalValue || 0), 0);
  const totalPnl = totalValue - totalAllocated;

  const rankedTraderStates = useMemo(() => {
    return [...traderStates].sort((a, b) => {
      const allocatedA = Number(a.allocated_usd) || 1; // Avoid div by zero
      const allocatedB = Number(b.allocated_usd) || 1;
      
      const roiA = ((a.totalValue - Number(a.allocated_usd)) / allocatedA) * 100;
      const roiB = ((b.totalValue - Number(b.allocated_usd)) / allocatedB) * 100;
      
      return roiB - roiA; // Sort by ROI descending
    });
  }, [traderStates]);
  
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
        @keyframes pulseRing {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.4); }
          50% { box-shadow: 0 0 0 8px rgba(16,185,129,0); }
        }
        .pulse-ring { animation: pulseRing 2s ease-in-out infinite; }
      `}</style>
      <main className="w-full px-4 sm:px-5 py-4 pt-20">
        
        {/* Not Connected */}
        {!isConnected && (
          <div className="max-w-lg mx-auto mt-8 border border-white/10 overflow-hidden animate-fade-up" style={{ backgroundColor: COLORS.surface }}>
            <div className="relative p-10 text-center overflow-hidden">
              <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ background: `radial-gradient(circle at 50% 0%, ${COLORS.brand} 0%, transparent 65%)` }} />
              <div className="relative z-10">
                <div className="w-14 h-14 mx-auto mb-5 border border-white/10 flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.08)' }}>
                  <Wallet size={26} style={{ color: COLORS.brand }} />
                </div>
                <h2 className="text-lg font-semibold mb-2 tracking-tight">Connect Your Wallet</h2>
                <p className="text-sm mb-6 leading-relaxed max-w-xs mx-auto" style={{ color: COLORS.data }}>Connect your Solana wallet to access your demo vault with $1,000 virtual USD</p>
                <button
                  onClick={openWalletModal}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-all duration-200 hover:opacity-90 active:scale-95 shadow-lg shadow-emerald-500/20"
                  style={{ backgroundColor: COLORS.brand, color: '#000' }}
                >
                  <Wallet size={15} />
                  Connect Wallet
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Connected but Not Authenticated */}
        {isConnected && !isAuthenticated && !authLoading && (
          <div className="max-w-lg mx-auto mt-8 border border-white/10 overflow-hidden animate-fade-up" style={{ backgroundColor: COLORS.surface }}>
            <div className="relative p-10 text-center overflow-hidden">
              <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ background: `radial-gradient(circle at 50% 0%, ${COLORS.brand} 0%, transparent 65%)` }} />
              <div className="relative z-10">
                <div className="w-14 h-14 mx-auto mb-5 border border-white/10 flex items-center justify-center" style={{ backgroundColor: 'rgba(16,185,129,0.08)' }}>
                  <LogIn size={26} style={{ color: COLORS.brand }} />
                </div>
                <h2 className="text-lg font-semibold mb-2 tracking-tight">Signature Required</h2>
                <p className="text-sm mb-6 leading-relaxed max-w-xs mx-auto" style={{ color: COLORS.data }}>Sign a message with your wallet to verify ownership and access your vault.</p>
                <button
                  onClick={signIn}
                  disabled={authLoading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-50 shadow-lg shadow-emerald-500/20"
                  style={{ backgroundColor: COLORS.brand, color: '#000' }}
                >
                  {authLoading ? <Loader2 className="animate-spin" size={15} /> : <LogIn size={15} />}
                  Sign In with Wallet
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Auth Loading */}
        {isConnected && authLoading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={28} className="animate-spin" style={{ color: COLORS.brand }} />
              <span className="text-sm" style={{ color: COLORS.data }}>Verifying wallet ownership...</span>
            </div>
          </div>
        )}
        
        {/* No Vault */}
        {isConnected && isAuthenticated && !vault && !loading && hasCheckedVault && (
          <div className="max-w-4xl mx-auto animate-fade-up">
            <div className="border border-white/10 overflow-hidden" style={{ backgroundColor: COLORS.surface }}>
              {/* Hero Section */}
              <div className="p-8 sm:p-12 text-center border-b border-white/10 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none" 
                  style={{ background: `radial-gradient(circle at center, ${COLORS.brand} 0%, transparent 70%)` }} 
                />
                <TrendingUp size={48} className="mx-auto mb-6 relative z-10" style={{ color: COLORS.brand }} />
                <h2 className="text-2xl sm:text-3xl font-medium mb-4 relative z-10">Start Your Risk-Free Trading Journey</h2>
                <p className="text-sm sm:text-base leading-relaxed max-w-2xl mx-auto relative z-10" style={{ color: COLORS.data }}>
                  Experience the power of automated copy-trading with a virtual portfolio. 
                  Test strategies and follow top performers without risking real capital.
                </p>
              </div>

              {/* Features Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/10">
                <div className="p-6 text-center hover:bg-white/[0.04] transition-colors duration-300 group">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4 bg-emerald-500/10 text-emerald-400 group-hover:scale-110 transition-transform duration-300">
                    <DollarSign size={20} />
                  </div>
                  <h3 className="font-medium mb-2" style={{ color: COLORS.text }}>$1,000 Virtual Balance</h3>
                  <p className="text-xs leading-relaxed" style={{ color: COLORS.data }}>
                    Start with a pre-funded virtual wallet to allocate across multiple traders.
                  </p>
                </div>
                
                <div className="p-6 text-center hover:bg-white/[0.04] transition-colors duration-300 group">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4 bg-orange-500/10 text-orange-400 group-hover:scale-110 transition-transform duration-300">
                    <Crown size={20} />
                  </div>
                  <h3 className="font-medium mb-2" style={{ color: COLORS.text }}>Copy Top Traders</h3>
                  <p className="text-xs leading-relaxed" style={{ color: COLORS.data }}>
                    Automatically mirror the moves of successful star traders in real-time.
                  </p>
                </div>

                <div className="p-6 text-center hover:bg-white/[0.04] transition-colors duration-300 group">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-4 bg-blue-500/10 text-blue-400 group-hover:scale-110 transition-transform duration-300">
                    <TrendingUp size={20} />
                  </div>
                  <h3 className="font-medium mb-2" style={{ color: COLORS.text }}>Real-Time Analytics</h3>
                  <p className="text-xs leading-relaxed" style={{ color: COLORS.data }}>
                    Track your PnL, ROI, and win rates in a completely isolated environment.
                  </p>
                </div>
              </div>

              {/* Action Area */}
              <div className="p-8 text-center bg-white/[0.02]">
                <button
                  onClick={deployVault}
                  disabled={deploying}
                  className="px-8 py-3 text-sm font-semibold transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 rounded shadow-lg shadow-emerald-500/20"
                  style={{ backgroundColor: COLORS.brand, color: '#000' }}
                >
                  {deploying ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" />
                      Initializing Vault...
                    </span>
                  ) : (
                    'Deploy Demo Vault & Start Trading'
                  )}
                </button>
                <p className="mt-4 text-xs" style={{ color: COLORS.data }}>
                  Takes less than 10 seconds • No gas fees • No real funds required
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* Loading */}
        {(loading || (isConnected && isAuthenticated && !hasCheckedVault)) && (
          <PageLoader />
        )}
        
        {/* Error */}
        {error && (
          <div className="border border-red-500/50 px-4 py-3 mb-3 flex items-center gap-3 text-sm text-red-400 bg-red-500/10">
            <AlertCircle size={18} />
            {error}
            <button onClick={() => setError(null)} className="ml-auto text-lg">×</button>
          </div>
        )}
        
        {/* ===== VAULT DASHBOARD ===== */}
        {isConnected && isAuthenticated && vault && (
          <>
            {/* Page Header */}
            <div className="mb-4 animate-fade-up">
              <h1 className="text-lg font-semibold tracking-tight" style={{ color: COLORS.text }}>Demo Vault</h1>
            </div>

            {/* Stats HUD */}
            {(() => {
              const totalCapital = (totalValue + unallocated) || 1;
              const allocatedPct = Math.min(100, (totalAllocated / totalCapital) * 100);
              const pnlPct = totalAllocated > 0 ? (totalPnl / totalAllocated) * 100 : 0;
              return (
                <div className="border border-white/10 mb-3 grid grid-cols-2 sm:grid-cols-4 animate-fade-up" style={{ backgroundColor: COLORS.surface }}>
                  {/* Unallocated */}
                  <div className="px-4 sm:px-5 py-3.5 border-b border-r border-white/10 sm:border-b-0 hover:bg-white/[0.03] transition-colors relative group">
                    <div className="absolute top-0 left-0 right-0 h-px bg-white/20" />
                    <div className="text-[10px] uppercase tracking-widest mb-1.5 flex items-center gap-1" style={{ color: COLORS.data }}>
                      <DollarSign size={10} />
                      Unallocated
                      <InfoTooltip>
                        <strong>Unallocated</strong> is your available demo vault balance not yet assigned to any trader state.<br/><br/>
                        Use "New Setup" to assign these demo funds to a trader.
                      </InfoTooltip>
                    </div>
                    <div className="text-base sm:text-xl font-mono font-bold tracking-tight" style={{ color: COLORS.text }}>{formatUsd(unallocated)}</div>
                  </div>

                  {/* Allocated */}
                  <div className="px-4 sm:px-5 py-3.5 border-b border-r border-white/10 sm:border-b-0 hover:bg-white/[0.03] transition-colors relative group">
                    <div className="absolute top-0 left-0 right-0 h-px bg-white/20" />
                    <div className="text-[10px] uppercase tracking-widest mb-1.5 flex items-center gap-1" style={{ color: COLORS.data }}>
                      <TrendingUp size={10} />
                      Allocated
                      <InfoTooltip>
                        <strong>Allocated</strong> is the total amount distributed across all your trader states.<br/><br/>
                        Each trader state receives a portion that is used to copy trades from the star trader you're following.
                      </InfoTooltip>
                    </div>
                    <div className="text-base sm:text-xl font-mono font-bold tracking-tight" style={{ color: COLORS.text }}>{formatUsd(totalAllocated)}</div>
                    <div className="mt-2 h-0.5 w-full bg-white/5 overflow-hidden">
                      <div className="h-full bg-emerald-500/60 transition-all duration-700" style={{ width: `${allocatedPct}%` }} />
                    </div>
                    <div className="text-[10px] mt-1" style={{ color: COLORS.data }}>{allocatedPct.toFixed(0)}% deployed</div>
                  </div>

                  {/* Total Value */}
                  <div className="px-4 sm:px-5 py-3.5 border-r border-white/10 hover:bg-white/[0.03] transition-colors relative group">
                    <div className="absolute top-0 left-0 right-0 h-px bg-white/20" />
                    <div className="text-[10px] uppercase tracking-widest mb-1.5 flex items-center gap-1" style={{ color: COLORS.data }}>
                      <Wallet size={10} />
                      Total Value
                      <InfoTooltip>
                        <strong>Total Value</strong> is the current worth of your entire demo vault.<br/><br/>
                        = Unallocated + Current portfolio value of all trader states (including unrealized gains/losses)
                      </InfoTooltip>
                    </div>
                    <div className="text-base sm:text-xl font-mono font-bold tracking-tight" style={{ color: COLORS.text }}>{formatUsd(totalValue + unallocated)}</div>
                  </div>

                  {/* PNL */}
                  <div className="px-4 sm:px-5 py-3.5 hover:bg-white/[0.03] transition-colors relative group">
                    <div className={`absolute top-0 left-0 right-0 h-px ${totalPnl >= 0 ? 'bg-emerald-500/60' : 'bg-red-500/60'}`} />
                    <div className="text-[10px] uppercase tracking-widest mb-1.5 flex items-center gap-1" style={{ color: COLORS.data }}>
                      <TrendingUp size={10} />
                      PNL
                      <InfoTooltip>
                        <strong>PNL (Profit/Loss)</strong> shows how much you've gained or lost across all trader states.<br/><br/>
                        Green = profit, Red = loss. This includes both realized (closed) and unrealized (open) positions.
                      </InfoTooltip>
                    </div>
                    <div className={`text-base sm:text-xl font-mono font-bold tracking-tight ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {totalPnl >= 0 ? '+' : ''}{formatUsd(totalPnl)}
                    </div>
                    {totalAllocated > 0 && (
                      <div className={`text-[10px] mt-0.5 font-mono ${pnlPct >= 0 ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
                        {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}% ROI
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3 py-3 px-4 sm:px-5 border border-white/10 animate-fade-up delay-100" style={{ backgroundColor: COLORS.surface }}>
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-semibold" style={{ color: COLORS.text }}>Trader States</h2>
                {traderStates.length > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold font-mono border border-white/10" style={{ color: COLORS.data, backgroundColor: 'rgba(255,255,255,0.03)' }}>
                    {traderStates.length}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* Create CTA */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setShowFollowModal(true); setAllocationUsd(Math.min(500, unallocated)); }}
                    disabled={unallocated < 10}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold tracking-tight transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-40 shadow-lg shadow-emerald-500/15"
                    style={{ backgroundColor: COLORS.brand, color: '#000' }}
                  >
                    <span className="text-base leading-none mb-px">+</span>
                    <span>New Setup</span>
                  </button>
                  <div className="hidden sm:block">
                    <InfoTooltip>
                      <strong>New Setup</strong> creates a separate demo balance for one trader.<br/><br/>
                      • Pick a trader<br/>
                      • Choose a copy style<br/>
                      • Add at least $10<br/>
                      • Start now or save it for later
                    </InfoTooltip>
                  </div>
                </div>

                {/* Refresh */}
                <button
                  onClick={fetchVault}
                  title="Refresh"
                  className="group p-2 border border-white/15 hover:border-white/30 hover:bg-white/5 transition-all duration-200 active:scale-[0.96]"
                  style={{ color: COLORS.data }}
                >
                  <RefreshCw size={13} className="group-hover:rotate-180 transition-transform duration-500" />
                </button>

                {/* Delete */}
                <button
                  onClick={deleteVault}
                  title="Delete Vault"
                  className="p-2 border border-red-500/30 text-red-500/60 hover:text-red-400 hover:border-red-500/50 hover:bg-red-500/5 transition-all duration-200 active:scale-[0.96]"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Trader States Table (Desktop) */}
            <div className="hidden md:block border border-white/10 overflow-hidden animate-fade-up delay-200" style={{ backgroundColor: COLORS.surface }}>              
              {/* Horizontal scroll container for table */}
              <div className="overflow-x-auto">
                {/* Table Header */}
                <div className="grid grid-cols-[50px_1fr_1.4fr_0.7fr_0.7fr_0.6fr_0.7fr_0.6fr_100px] gap-3 px-4 sm:px-5 py-2.5 text-[10px] sm:text-xs uppercase tracking-wider border-b border-white/10 font-mono bg-white/[0.04] min-w-[900px]" style={{ color: COLORS.data }}>
                  <div className="flex items-center gap-1">
                    Rank
                    <InfoTooltip>
                       <strong>ROI Ranking</strong><br/><br/>
                       Traders are ranked by their <strong>Return on Investment (ROI)</strong>.<br/><br/>
                       This levels the playing field, showing who is most efficient with their allocated capital, regardless of position size.
                    </InfoTooltip>
                  </div>
                  <div>Star Trader</div>
                  <div className="flex items-center gap-1">
                    PnL (7D)
                    <InfoTooltip>
                       <strong>7-Day PnL</strong><br/><br/>
                       Net profit or loss generated by this trader in the last week.
                    </InfoTooltip>
                  </div>
                  <div className="flex items-center gap-1">
                    ROI (Total)
                    <InfoTooltip>
                       <strong>Total ROI</strong><br/><br/>
                       (Current Value - Allocated) / Allocated<br/><br/>
                       The percentage return on your initial investment since you started following this trader.
                    </InfoTooltip>
                  </div>
                  <div className="flex items-center gap-1">
                    Profit Factor
                    <InfoTooltip>
                       <strong>Profit Factor</strong><br/><br/>
                       Industry standard efficiency metric: (Gross Profit / Gross Loss).<br/><br/>
                       &gt; 1.0 means profitable. Higher is better.
                    </InfoTooltip>
                  </div>
                  <div className="flex items-center gap-1">
                    Trades
                    <InfoTooltip>
                       <strong>Total Trades</strong><br/><br/>
                       Number of buy/sell execution cycles completed by this trader state.
                    </InfoTooltip>
                  </div>
                  <div className="flex items-center gap-1">
                    Allocated
                    <InfoTooltip>
                       <strong>Allocated Capital</strong><br/><br/>
                       The amount of virtual USD you have assigned to this trader to use for copy-trading.
                    </InfoTooltip>
                  </div>
                  <div className="flex items-center gap-1">
                    Status
                    <InfoTooltip>
                      <strong>Trader State Status:</strong><br/><br/>
                      🟢 <strong>Active</strong> - Copy trading is running. New trades will be automatically copied.<br/><br/>
                      ⏸️ <strong>Paused</strong> - Temporarily stopped. No new trades copied, but positions remain.<br/><br/>
                      🟠 <strong>Uninitialized</strong> - Pending setup. You need to initialize the vault to start copy trading.<br/><br/>
                      🔴 <strong>Stopped</strong> - Fully stopped. Use withdraw to reclaim funds.
                    </InfoTooltip>
                  </div>
                  <div></div>
                </div>
              
              {/* Table Rows */}
              <div className="divide-y divide-white/5">
                {rankedTraderStates.length === 0 ? (
                  <div className="py-14 sm:py-20 text-center px-6" style={{ color: COLORS.data }}>
                    <div className="max-w-2xl mx-auto">
                      <div className="w-12 h-12 border border-white/10 flex items-center justify-center mx-auto mb-6" style={{ backgroundColor: 'rgba(16,185,129,0.06)' }}>
                        <Crown size={24} style={{ color: COLORS.brand }} />
                      </div>
                      <h3 className="text-lg font-semibold mb-2 tracking-tight" style={{ color: COLORS.text }}>Start Copy Trading</h3>
                      <p className="text-sm leading-relaxed max-w-md mx-auto mb-10">
                        Allocate funds to follow a star trader and automatically mirror their trades in real-time.
                      </p>

                      {/* Numbered Steps */}
                      <div className="flex items-start justify-center gap-0 mb-10">
                        {[['01', 'Browse Traders', 'Find top performers on the Star Traders page'], ['02', 'Allocate Funds', 'Set an amount (min $10) to copy with'], ['03', 'Auto Mirror', 'Trades are copied automatically in real-time']].map(([num, title, desc], i) => (
                          <div key={num} className="flex items-start gap-0">
                            <div className="flex flex-col items-center w-40 sm:w-48">
                              <div className="w-8 h-8 border border-white/20 flex items-center justify-center mb-3" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                                <span className="text-[11px] font-bold font-mono" style={{ color: COLORS.brand }}>{num}</span>
                              </div>
                              <div className="text-sm font-semibold mb-1" style={{ color: COLORS.text }}>{title}</div>
                              <div className="text-xs leading-relaxed" style={{ color: COLORS.data }}>{desc}</div>
                            </div>
                            {i < 2 && <div className="w-10 sm:w-16 h-px mt-4 shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />}
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() => { setShowFollowModal(true); setAllocationUsd(Math.min(500, unallocated)); }}
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold transition-all hover:opacity-90 active:scale-95 pulse-ring shadow-lg shadow-emerald-500/20"
                        style={{ backgroundColor: COLORS.brand, color: '#000' }}
                      >
                        <span className="text-lg leading-none">+</span>
                        Create First Trader State
                      </button>
                    </div>
                  </div>
                ) : (
                  rankedTraderStates.map((ts, index) => {
                    const rank = index + 1;
                    const pnl = ts.totalValue - Number(ts.allocated_usd);
                    const pnlPercent = ts.allocated_usd > 0 ? (pnl / ts.allocated_usd) * 100 : 0;
                    const isPositive = pnl >= 0;
                    const sparklineData = generateSparklineFromPnl(pnl, Number(ts.allocated_usd), ts.star_trader);
                    
                    // Get real trade stats
                    const stats = ts.tradeStats || { completedCount: 0, failedCount: 0, totalRealizedPnl: 0, profitableCount: 0, lossCount: 0, avgLatency: 0, totalCount: 0, profitFactor: 0 };
                    
                    // Profit Factor provided by API or default to 0
                    const profitFactor = stats.profitFactor ?? 0;
                    const totalTrades = getDemoTradeCount(stats);
                    const roi = ts.allocated_usd > 0 ? (pnl / Number(ts.allocated_usd)) * 100 : 0;
                    
                    const isTargetForInit = onboardingStep === 'INITIALIZE' && !ts.is_initialized && !ts.is_settled;

                    return (
                      <div 
                        key={ts.id} 
                        className={`grid grid-cols-[50px_1fr_1.4fr_0.7fr_0.7fr_0.6fr_0.7fr_0.6fr_100px] gap-3 px-4 sm:px-5 py-3 items-center hover:bg-white/[0.04] transition-colors min-w-[900px] ${index % 2 === 1 ? 'bg-white/[0.02]' : ''} ${isTargetForInit ? 'ring-2 ring-emerald-500/50 bg-emerald-500/5 relative z-10' : ''}`}
                      >
                        {isTargetForInit && (
                            <div className="absolute -left-2 top-1/2 -translate-y-1/2 -translate-x-full pr-2 hidden xl:block animate-pulse">
                                <span className="text-emerald-400 text-sm font-medium whitespace-nowrap">Click View →</span>
                            </div>
                        )}
                        {/* Rank */}
                        <div className="flex items-center gap-1 font-mono text-sm">
                          {rank === 1 ? (
                            <Crown size={16} className="text-yellow-400" />
                          ) : (
                            <span style={{ color: COLORS.data }}>#{rank}</span>
                          )}
                        </div>
                        
                        {/* Star Trader */}
                        <div className="flex items-center gap-3">
                          <TraderAvatar 
                            address={ts.star_trader} 
                            image={starTraders.find(t => t.address === ts.star_trader)?.image}
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-sm truncate" style={{ color: COLORS.text }}>
                              {starTraders.find(t => t.address === ts.star_trader)?.name || 'Unknown Trader'}
                            </span>
                            <span className="font-mono text-[10px] opacity-60 truncate" style={{ color: COLORS.data }}>
                              {ts.star_trader.slice(0, 6)}...
                            </span>
                            <span className="text-[10px] opacity-80 truncate" style={{ color: COLORS.data }}>
                              {formatCopyBuyModelLabel(ts.copy_model_key || 'current_ratio')} • {formatCopyBuyModelConfigSummary(ts.copy_model_key || 'current_ratio', ts.copy_model_config || {})}
                            </span>
                          </div>
                        </div>
                        
                        {/* PnL with Sparkline */}
                        <div className="flex items-center gap-2.5">
                          <Sparkline data={sparklineData} isPositive={isPositive} id={ts.id} />
                          <div className="flex flex-col gap-0.5">
                            <span className={`font-mono text-sm font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                              {isPositive ? '+' : ''}{formatUsd(pnl)}
                            </span>
                            <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold font-mono border ${isPositive ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' : 'text-red-400 border-red-500/20 bg-red-500/5'}`}>
                              {isPositive ? '+' : ''}{pnlPercent.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        
                        {/* ROI */}
                        <div className={`font-mono text-sm ${roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
                        </div>
                        
                        {/* Profit Factor */}
                        <div className={`font-mono text-sm ${profitFactor >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {profitFactor.toFixed(2)}x
                        </div>
                        
                        {/* Total Trades */}
                        <div className="font-mono text-sm" style={{ color: COLORS.text }}>
                          {totalTrades}
                        </div>
                        
                        {/* Allocated */}
                        <div className="font-mono text-sm" style={{ color: COLORS.text }}>
                          {formatUsd(ts.allocated_usd)}
                        </div>
                        
                        {/* Status */}
                        <div>
                          {(() => {
                            if (ts.is_settled) {
                              return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold border border-white/10 text-slate-400"><StopCircle size={9} /> Settled</span>;
                            }
                            if (ts.is_paused) {
                              return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold border border-yellow-500/30 bg-yellow-500/5 text-yellow-400"><Pause size={9} /> Paused</span>;
                            }
                            if (ts.is_initialized) {
                              return (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold border border-emerald-500/25 bg-emerald-500/5 text-emerald-400">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Active
                                </span>
                              );
                            }
                            if (ts.is_syncing) {
                              return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold border border-blue-500/30 bg-blue-500/5 text-blue-400"><RefreshCw size={9} className="animate-spin" /> Syncing</span>;
                            }
                            return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-wider font-semibold border border-orange-500/30 bg-orange-500/5 text-orange-400"><Clock size={9} /> Uninit</span>;
                          })()}
                        </div>
                        
                        {/* View Button */}
                        <div>
                          <Link 
                            href={`/demo-vault/${ts.id}`}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border transition-all ${
                              isTargetForInit 
                                ? 'border-emerald-400 text-emerald-900 animate-pulse' 
                                : 'border-white/15 hover:border-white/30 hover:bg-white/5'
                            }`}
                            style={{ backgroundColor: isTargetForInit ? '#10B981' : 'transparent', color: isTargetForInit ? '#000' : COLORS.text }}
                          >
                            {isTargetForInit ? 'Start' : 'View'} →
                          </Link>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              </div>{/* End horizontal scroll */}
            </div>

            {/* Mobile Card View (md:hidden) */}
            <div className="md:hidden space-y-4 animate-fade-up delay-200">
                <div className="px-1 py-1 flex items-center justify-between">
                   <h2 className="text-base font-semibold" style={{ color: COLORS.text }}>Trader States ({rankedTraderStates.length})</h2>
                </div>

                {rankedTraderStates.map((ts, index) => {
                    const traderInfo = starTraders.find(t => t.address === ts.star_trader);
                    const stats = ts.tradeStats || { completedCount: 0, failedCount: 0, totalRealizedPnl: 0, avgLatency: 0, totalCount: 0, profitFactor: 0 };
                    
                    const totalPnl = (ts.totalValue - ts.allocated_usd);
                    const roi = (totalPnl / (ts.allocated_usd || 1)) * 100;
                    const isPositive = totalPnl >= 0;
                    
                    const resolvedTrades = stats.completedCount + stats.failedCount;
                    const winRate = resolvedTrades > 0 
                      ? (stats.completedCount / resolvedTrades) * 100 
                      : 0;

                    const sparklineData = generateSparklineFromPnl(totalPnl, ts.allocated_usd, ts.star_trader);
                    
                    let statusColor = 'text-emerald-400';
                    let statusText = 'Active';
                    let statusBg = 'bg-emerald-500/10 border-emerald-500/20';
                    
                    if (!ts.is_initialized) { 
                        statusColor = 'text-orange-400';
                        statusText = 'Uninitialized';
                        statusBg = 'bg-orange-500/10 border-orange-500/30';
                    } else if (ts.is_paused) {
                        statusColor = 'text-yellow-400';
                        statusText = 'Paused';
                        statusBg = 'bg-yellow-500/10 border-yellow-500/30';
                    }

                    return (
                        <div 
                          key={ts.id}
                          className={`relative overflow-hidden border border-white/10 group transition-colors hover:border-white/20 ${
                            isPositive ? 'border-l-2 border-l-emerald-500/40' : 'border-l-2 border-l-red-500/30'
                          }`}
                          style={{ backgroundColor: '#111' }}
                        >
                             {/* Trader Header */}
                             <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/5">
                                <div className="flex items-center gap-3">
                                   {/* Rank badge */}
                                   <div className={`w-6 h-6 flex items-center justify-center text-[10px] font-bold font-mono border ${
                                     index < 3 ? 'border-yellow-500/30 text-yellow-400 bg-yellow-500/5' : 'border-white/10 text-slate-500 bg-white/[0.02]'
                                   }`}>
                                     {index < 3 ? <Crown size={10} className="text-yellow-400" /> : index + 1}
                                   </div>
                                   
                                   <TraderAvatar address={ts.star_trader} image={traderInfo?.image} />
                                   
                                   <div className="flex flex-col">
                                     <h3 className="font-semibold text-sm tracking-tight" style={{ color: COLORS.text }}>{traderInfo?.name || 'Unknown'}</h3>
                                     <div className={`text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 border inline-flex w-fit mt-0.5 ${statusBg} ${statusColor}`}>
                                         {statusText}
                                     </div>
                                   </div>
                                </div>
                                
                                <div className="text-right">
                                   <div className="text-[10px] uppercase font-mono mb-0.5" style={{ color: COLORS.data }}>Value</div>
                                   <div className="text-base font-mono font-bold tracking-tight" style={{ color: COLORS.text }}>
                                      {formatUsd(ts.totalValue)}
                                   </div>
                                </div>
                             </div>

                             {/* PnL + Sparkline Row */}
                             <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                                 <div className="h-8 flex-1 mr-4 opacity-70">
                                     <Sparkline data={sparklineData} isPositive={isPositive} id={`mobile-${ts.id}`} className="w-full" />
                                 </div>
                                 
                                 <div className="flex items-center gap-4">
                                     <div className="text-right">
                                         <div className="text-[10px] uppercase font-mono mb-0.5" style={{ color: COLORS.data }}>ROI</div>
                                         <div className={`text-sm font-mono font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                                             {isPositive ? '+' : ''}{roi.toFixed(1)}%
                                         </div>
                                     </div>
                                     <div className="text-right">
                                         <div className="text-[10px] uppercase font-mono mb-0.5" style={{ color: COLORS.data }}>PnL</div>
                                         <div className={`text-sm font-mono font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                                             {isPositive ? '+' : ''}{formatUsd(totalPnl)}
                                         </div>
                                     </div>
                                 </div>
                             </div>

                             {/* Stats + Utilization */}
                             <div className="px-4 py-3 border-b border-white/5">
                               {/* Utilization Bar */}
                               {(() => {
                                 const utilPct = ts.allocated_usd > 0 ? Math.min(100, (ts.totalValue / ts.allocated_usd) * 100) : 0;
                                 return (
                                   <div className="mb-3">
                                     <div className="flex items-center justify-between mb-1">
                                       <span className="text-[10px] uppercase tracking-widest" style={{ color: COLORS.data }}>Utilization</span>
                                       <span className={`text-[10px] font-mono font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>{utilPct.toFixed(0)}%</span>
                                     </div>
                                     <div className="h-0.5 w-full bg-white/5 overflow-hidden">
                                       <div className={`h-full transition-all duration-700 ${isPositive ? 'bg-emerald-500/60' : 'bg-red-500/60'}`} style={{ width: `${utilPct}%` }} />
                                     </div>
                                   </div>
                                 );
                               })()}

                               {/* Stats Grid */}
                               <div className="grid grid-cols-3 gap-2">
                                  <div>
                                      <div className="text-[10px] uppercase font-mono mb-0.5" style={{ color: COLORS.data }}>Allocated</div>
                                      <div className="text-xs font-semibold font-mono" style={{ color: COLORS.text }}>{formatUsd(ts.allocated_usd)}</div>
                                  </div>
                                  <div>
                                      <div className="text-[10px] uppercase font-mono mb-0.5" style={{ color: COLORS.data }}>Win Rate</div>
                                      <div className={`text-xs font-semibold font-mono ${winRate >= 50 ? 'text-emerald-400' : 'text-slate-300'}`}>{winRate.toFixed(0)}%</div>
                                  </div>
                                  <div>
                                      <div className="text-[10px] uppercase font-mono mb-0.5" style={{ color: COLORS.data }}>Trades</div>
                                      <div className="text-xs font-semibold font-mono" style={{ color: COLORS.text }}>{getDemoTradeCount(stats)}</div>
                                  </div>
                               </div>
                             </div>

                             {/* Action */}
                             <div className="px-4 py-3">
                                <Link href={`/demo-vault/${ts.id}`}>
                                    <span className="flex items-center gap-1.5 text-xs font-semibold tracking-tight transition-colors hover:opacity-100 opacity-60" style={{ color: COLORS.text }}>
                                        View Details →
                                    </span>
                                </Link>
                             </div>
                        </div>
                    );
                })}
            </div>
        <AnimatePresence>
          {showFollowModal && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 top-16 bg-black/60 backdrop-blur-md flex items-start justify-center z-[100] p-4 pt-8 overflow-y-auto"
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full max-w-lg bg-[#0A0A0A] border border-white/10 rounded-lg overflow-hidden relative shadow-2xl shadow-emerald-500/5 flex flex-col mb-8"
              >
                {/* Header */}
                <div className="p-6 pb-4 border-b border-white/5 relative shrink-0">
                  <h2 className="text-xl font-bold tracking-tight text-white mb-2">
                    {onboardingStep === 'ALLOCATE' ? 'Set Up Copy Trading' : 'Create New Setup'}
                  </h2>
                  <p className="text-sm text-slate-400 leading-relaxed max-w-sm">
                    {onboardingStep === 'ALLOCATE' 
                      ? 'Pick a trader, choose a copy style, and add demo funds.'
                      : 'Each setup uses its own demo balance.'
                    }
                  </p>
                </div>

                {/* Form Body - scrollable */}
                <div className="p-6 overflow-y-auto space-y-7 flex-1 custom-scrollbar">
                  {/* Trader Selection */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                      Star Trader
                    </label>
                    <div className="relative group">
                      <select
                        value={selectedTrader || ''}
                        onChange={(e) => setSelectedTrader(e.target.value)}
                        className="w-full appearance-none bg-white/[0.03] border border-white/10 group-hover:border-white/20 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-white rounded-lg p-3.5 pr-10 text-sm transition-all focus:outline-none cursor-pointer"
                      >
                        <option value="" className="bg-[#0A0A0A]">Select trader...</option>
                        {starTraders.map(t => (
                          <option key={t.address} value={t.address} className="bg-[#0A0A0A] text-white py-2">
                            {t.name} ({t.address.slice(0, 8)}...)
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-slate-400 group-hover:text-slate-300">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </div>
                    </div>
                    {selectedTraderOption && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }} 
                        animate={{ opacity: 1, height: 'auto' }} 
                        className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 shadow-sm"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                            Recommended
                          </span>
                          <span className="text-sm font-semibold text-emerald-50 tracking-tight">
                            {selectedTraderOption.recommendedCopyModelLabel}
                          </span>
                        </div>
                        <p className="mt-1 text-[13px] text-slate-300 leading-relaxed">
                          {selectedTraderOption.recommendedCopyModelReason}
                        </p>
                        <div className="mt-3 bg-black/40 px-3 py-2.5 rounded-lg border border-black/20 text-xs font-mono text-emerald-200/90 leading-relaxed">
                          {selectedTraderOption.recommendedCopyModelSummary}
                        </div>
                        {existingStateCountForSelectedTrader > 0 && (
                          <p className="mt-3.5 flex items-center gap-2 text-xs text-slate-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]"></span>
                            Existing setups for this trader: <strong className="text-white font-mono">{existingStateCountForSelectedTrader}</strong>
                          </p>
                        )}
                      </motion.div>
                    )}
                  </div>

                  {/* Model Selection */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-300">Copy Style</label>
                    <div className="relative group">
                      <select
                        value={normalizedSelectedModel.modelKey}
                        onChange={(e) => {
                          const nextModelKey = e.target.value as CopyBuyModelKey;
                          const nextModel = parseCopyBuyModelSelection(nextModelKey, {});
                          setSelectedCopyModelKey(nextModel.modelKey);
                          setSelectedCopyModelConfig(nextModel.config);
                        }}
                        className="w-full appearance-none bg-white/[0.03] border border-white/10 group-hover:border-white/20 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-white rounded-lg p-3.5 pr-10 text-sm transition-all focus:outline-none cursor-pointer"
                      >
                        {COPY_BUY_MODEL_DEFINITIONS.map((definition) => {
                          const isRecommended = selectedTraderOption?.recommendedCopyModelKey === definition.key;
                          return (
                            <option key={definition.key} value={definition.key} className="bg-[#0A0A0A] text-white py-2">
                              {definition.label}{isRecommended ? '  ✨ Recommended' : ''}
                            </option>
                          );
                        })}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-slate-400 group-hover:text-slate-300">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                      </div>
                    </div>
                    {selectedModelDefinition && (
                      <p className="text-[13px] text-slate-400 leading-relaxed px-1">
                        {selectedModelDefinition.shortDescription}
                      </p>
                    )}
                  </div>

                  {/* Config Fields */}
                  {selectedModelDefinition && selectedModelDefinition.fields.length > 0 && (
                    <div className="space-y-4 pt-4 border-t border-white/5">
                      {selectedModelDefinition.fields.map((field) => {
                        const fieldValue = Number(
                          (normalizedSelectedModel.config as Record<string, unknown>)[field.key] ?? '',
                        );
                        return (
                          <div key={field.key} className="grid grid-cols-[1fr_auto] gap-4 items-center">
                            <label className="text-sm font-medium text-slate-300">
                              {field.label}
                            </label>
                            <input
                              type="number"
                              min={field.min}
                              max={field.max}
                              step={field.step}
                              value={Number.isFinite(fieldValue) ? fieldValue : ''}
                              onChange={(e) => updateSelectedModelField(field.key, e.target.value)}
                              className="w-28 bg-white/[0.03] border border-white/10 focus:border-emerald-500 hover:border-white/20 focus:ring-1 focus:ring-emerald-500 focus:bg-white/[0.05] text-white font-mono rounded-md p-2.5 text-sm text-right transition-all focus:outline-none"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Setup Review Box */}
                  <div className="rounded-lg border border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent p-4 flex flex-col gap-2 shadow-inner">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Your Setup</span>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 rounded shadow-sm">
                        {formatCopyBuyModelLabel(normalizedSelectedModel.modelKey)}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-slate-400/90 leading-relaxed">
                      {selectedModelSummary}
                    </div>
                  </div>
                  
                  {/* Allocation Input */}
                  <div className="space-y-3 pt-5 pb-2 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-slate-300">Allocation (USD)</label>
                      <div className="text-xs font-medium text-slate-400 bg-white/[0.03] px-2.5 py-1 rounded-md border border-white/5">
                        Available: <span className="font-mono text-emerald-400">{formatUsd(unallocated)}</span>
                      </div>
                    </div>
                    
                    <div className="relative flex items-center group">
                      <div className="absolute left-5 text-slate-400 group-hover:text-emerald-400 group-focus-within:text-emerald-400 transition-colors">
                        <DollarSign size={22} strokeWidth={2.5} />
                      </div>
                      <input
                        type="number"
                        min="10"
                        max={unallocated}
                        step="10"
                        value={allocationUsd}
                        onChange={(e) => setAllocationUsd(Math.min(Number(e.target.value), unallocated))}
                        className="w-full appearance-none bg-white/[0.03] border border-white/10 hover:border-white/20 focus:bg-white/[0.05] focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-white font-mono text-2xl lg:text-3xl rounded-lg py-4 lg:py-5 pl-14 pr-24 transition-all focus:outline-none shadow-inner tracking-tight"
                        placeholder="0.00"
                      />
                      <button 
                        onClick={() => setAllocationUsd(unallocated)}
                        className="absolute right-3.5 px-3 py-1.5 text-xs font-bold tracking-wider uppercase text-emerald-400 border border-emerald-400/20 bg-emerald-400/10 hover:bg-emerald-400/20 hover:border-emerald-400/40 rounded-md transition-all shadow-sm active:scale-95"
                      >
                        Max
                      </button>
                    </div>
                    
                    <div className="text-xs text-slate-500 flex items-center gap-1.5 font-medium ml-1">
                      <Info size={14} className="opacity-70" /> Minimum allocation is $10.
                    </div>
                  </div>
                </div>
                
                {/* Footer / Actions */}
                <div className="p-6 pt-5 border-t border-white/5 bg-[#0A0A0A] shrink-0 mt-auto flex flex-col gap-3">
                  <div className="flex gap-3 relative z-20">
                    <button
                      onClick={() => followTrader(true)}
                      disabled={!selectedTrader || following || allocationUsd > unallocated || allocationUsd < 10}
                      className="flex-1 py-4 px-4 text-sm font-bold tracking-tight rounded-lg text-[#000] bg-emerald-500 hover:bg-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.15)] hover:shadow-[0_0_25px_rgba(16,185,129,0.3)] disabled:opacity-50 disabled:hover:shadow-none disabled:bg-emerald-500/50 disabled:text-emerald-900 transition-all outline-none focus:ring-2 focus:ring-emerald-500/50 flex justify-center items-center gap-2 active:scale-[0.98]"
                    >
                      {following ? <Loader2 size={16} className="animate-spin" /> : null}
                      {following ? 'Creating...' : 'Create + Start'}
                    </button>
                    
                    <button
                      onClick={() => followTrader(false)}
                      disabled={!selectedTrader || following || allocationUsd > unallocated || allocationUsd < 10}
                      className="hidden sm:flex flex-1 max-w-[140px] py-4 px-4 text-[13px] font-semibold rounded-lg text-emerald-400 border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/50 disabled:opacity-50 transition-all outline-none focus:ring-2 focus:ring-emerald-500/50 flex-col items-center justify-center whitespace-nowrap active:scale-[0.98]"
                      title="Save now and start later"
                    >
                      {following ? '...' : 'Save Only'}
                    </button>
                  </div>
                  
                  <button
                    onClick={closeFollowModal}
                    className="w-full py-3.5 text-sm font-medium rounded-lg text-slate-300 border border-white/10 bg-transparent hover:bg-white/5 hover:text-white transition-all outline-none flex justify-center items-center active:scale-[0.99] relative z-20"
                  >
                    Cancel Setup
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
          </>
        )}
      </main>
    </div>
  );
}
