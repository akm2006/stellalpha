'use client';

import PageLoader from '@/components/PageLoader';
import { InfoTooltip } from '@/components/cyber/tooltip';
import { TraderAvatar } from '@/components/cyber/trader-avatar';
import { CopyModelBadge } from '@/components/trading/copy-model-badge';
import {
  COPY_BUY_MODEL_DEFINITIONS,
  parseCopyBuyModelSelection,
} from '@/lib/copy-models/catalog';
import {
  formatCopyBuyModelConfigBadge,
  formatCopyBuyModelConfigSummary,
  formatCopyBuyModelLabel,
} from '@/lib/copy-models/format';
import {
  CopyBuyModelConfig,
  CopyBuyModelKey,
} from '@/lib/copy-models/types';
import { useState, useEffect, useCallback, useMemo, ReactNode, CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
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
  CheckCircle2,
  Info,
  ShieldCheck,
  Target,
  X,
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

type TraderSortKey =
  | 'roi'
  | 'pnl'
  | 'totalValue'
  | 'trades'
  | 'allocated'
  | 'copyStyle'
  | 'status'
  | 'trader';

type SortDirection = 'asc' | 'desc';

const TRADER_SORT_OPTIONS: Array<{ key: TraderSortKey; label: string; kind: 'number' | 'text' }> = [
  { key: 'roi', label: 'ROI', kind: 'number' },
  { key: 'pnl', label: 'PnL', kind: 'number' },
  { key: 'totalValue', label: 'Total Value', kind: 'number' },
  { key: 'trades', label: 'Trades', kind: 'number' },
  { key: 'allocated', label: 'Allocated', kind: 'number' },
  { key: 'copyStyle', label: 'Copy Style', kind: 'text' },
  { key: 'status', label: 'Status', kind: 'text' },
  { key: 'trader', label: 'Trader', kind: 'text' },
];

const TRADER_TABLE_GRID =
  'grid-cols-[50px_minmax(150px,1fr)_minmax(185px,1.15fr)_minmax(165px,1fr)_100px_115px_80px_115px_115px]';

function getTraderStatePnl(state: TraderState) {
  return Number(state.totalValue || 0) - Number(state.allocated_usd || 0);
}

function getTraderStateRoi(state: TraderState) {
  const allocated = Number(state.allocated_usd) || 1;
  return (getTraderStatePnl(state) / allocated) * 100;
}

function getTraderStateStatusLabel(state: TraderState) {
  if (state.is_settled) return 'Settled';
  if (state.is_paused) return 'Paused';
  if (state.is_initialized) return 'Active';
  if (state.is_syncing) return 'Syncing';
  return 'Uninitialized';
}

function formatUsd(amount: number): string {
  if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(2) + 'M';
  if (amount >= 1000) return '$' + (amount / 1000).toFixed(2) + 'K';
  return '$' + amount.toFixed(2);
}

function clampUsd(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function getRecommendedAllocationUsd(availableUsd: number) {
  if (availableUsd < 10) return 0;
  const suggested = Math.min(50, Math.max(25, availableUsd * 0.12));
  const rounded = Math.round(suggested / 5) * 5;
  return clampUsd(rounded, 10, availableUsd);
}

function getModelBestForText(modelKey: CopyBuyModelKey) {
  switch (modelKey) {
    case 'current_ratio':
      return 'Best when the trader wallet balance is stable and representative.';
    case 'fixed_available_pct':
      return 'Best for survival testing across very active or volatile traders.';
    case 'fixed_starting_pct':
      return 'Best when you want each buy to stay consistent during the test.';
    case 'target_buy_pct_with_cap':
      return 'Best when you want to follow large buys without letting one trade dominate.';
    case 'hybrid_envelope_leader_ratio':
      return 'Best when you want trader intent, but inside a smaller safety envelope.';
  }
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

// Compact sparkline for scan-friendly trader rows.
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
        {/* Line */}
        <path 
          d={linePath} 
          fill="none" 
          stroke={color} 
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}

function SetupStepHeading({
  step,
  title,
  description,
}: {
  step: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="cyber-command mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center border border-[#00FF85]/35 bg-[#00FF85]/5 text-[10px] font-bold text-[#00FF85]">
        {step}
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
        )}
      </div>
    </div>
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
      text: 'New trades are not being copied. Existing positions remain open. Open the setup to resume.'
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
      className="absolute z-50 flex items-start px-3 py-2 border animate-in fade-in zoom-in slide-in-from-bottom-2 duration-300"
      style={{ 
        backgroundColor: COLORS.surface,
        borderColor: style.color,
        color: COLORS.text,
        right: '100%', // Position to the LEFT of the element
        marginRight: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        width: '260px', // Wider for more info
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
  const router = useRouter();
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
  const [sortKey, setSortKey] = useState<TraderSortKey>('roi');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [isSyncingVault, setIsSyncingVault] = useState(false);
  const [syncPulse, setSyncPulse] = useState(0);
  
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
  const selectedModelBestForText = useMemo(
    () => getModelBestForText(normalizedSelectedModel.modelKey),
    [normalizedSelectedModel.modelKey],
  );
  const existingStateCountForSelectedTrader = useMemo(
    () => selectedTrader
      ? traderStates.filter((state) => state.star_trader === selectedTrader).length
      : 0,
    [selectedTrader, traderStates],
  );
  
  const fetchVault = useCallback(async (options?: { silent?: boolean }) => {
    if (!walletAddress) return;
    if (!options?.silent) {
      setLoading(true);
    }
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
      if (!options?.silent) {
        setLoading(false);
      }
      setHasCheckedVault(true);
    }
  }, [walletAddress]);

  const refreshVault = useCallback(async () => {
    if (isSyncingVault) return;
    setIsSyncingVault(true);
    setSyncPulse((current) => current + 1);
    try {
      await fetchVault({ silent: true });
    } finally {
      setIsSyncingVault(false);
    }
  }, [fetchVault, isSyncingVault]);
  
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
      setAllocationUsd(getRecommendedAllocationUsd(availableBalance));
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
  const startingDemoCapital = Math.max(1, totalAllocated + unallocated);
  const currentVaultValue = totalValue + unallocated;
  const vaultRoiPct = ((currentVaultValue - startingDemoCapital) / startingDemoCapital) * 100;
  const freeCashPct = Math.min(100, Math.max(0, (unallocated / startingDemoCapital) * 100));
  const portfolioValuePct = Math.min(100, Math.max(0, (totalValue / startingDemoCapital) * 100));
  const portfolioSegmentPct = Math.min(Math.max(0, 100 - freeCashPct), portfolioValuePct);
  const drawdownPct = totalPnl < 0 ? Math.min(100, Math.abs(totalPnl / startingDemoCapital) * 100) : 0;
  const rawDrawupPct = totalPnl > 0 ? (totalPnl / startingDemoCapital) * 100 : 0;
  const drawupBarPct = Math.min(100, rawDrawupPct);
  const activeSetupCount = traderStates.filter((state) => state.is_initialized && !state.is_paused && !state.is_settled).length;
  const attentionSetupCount = traderStates.filter((state) => state.is_paused || state.is_syncing || (!state.is_initialized && !state.is_settled)).length;
  const recommendedAllocationUsd = getRecommendedAllocationUsd(unallocated);
  const allocationPresets = useMemo(() => {
    const presets = [recommendedAllocationUsd, 25, 50, 100]
      .filter((amount) => amount >= 10 && amount <= unallocated);
    return Array.from(new Set(presets));
  }, [recommendedAllocationUsd, unallocated]);
  const allocationSliderMax = Math.max(10, Math.floor(unallocated));
  const allocationPctOfFreeCash = unallocated > 0 ? Math.min(100, (allocationUsd / unallocated) * 100) : 0;
  const allocationRangePct = allocationSliderMax > 10
    ? ((clampUsd(allocationUsd, 10, allocationSliderMax) - 10) / (allocationSliderMax - 10)) * 100
    : 0;
  const createDisabledReason = !selectedTrader
    ? 'Choose a star trader to continue.'
    : allocationUsd < 10
      ? 'Use at least $10 of demo capital.'
      : allocationUsd > unallocated
        ? 'Allocation is higher than your free cash.'
        : null;
  const selectedSortOption = TRADER_SORT_OPTIONS.find((option) => option.key === sortKey) || TRADER_SORT_OPTIONS[0];
  const sortDirectionLabel = selectedSortOption.kind === 'text'
    ? (sortDirection === 'asc' ? 'A-Z' : 'Z-A')
    : (sortDirection === 'asc' ? 'Low to high' : 'High to low');

  const rankedTraderStates = useMemo(() => {
    return [...traderStates].sort((a, b) => {
      const traderNameA = starTraders.find((trader) => trader.address === a.star_trader)?.name || a.star_trader;
      const traderNameB = starTraders.find((trader) => trader.address === b.star_trader)?.name || b.star_trader;
      const copyStyleA = formatCopyBuyModelLabel(a.copy_model_key || 'current_ratio');
      const copyStyleB = formatCopyBuyModelLabel(b.copy_model_key || 'current_ratio');

      let comparison = 0;
      switch (sortKey) {
        case 'pnl':
          comparison = getTraderStatePnl(a) - getTraderStatePnl(b);
          break;
        case 'totalValue':
          comparison = Number(a.totalValue || 0) - Number(b.totalValue || 0);
          break;
        case 'trades':
          comparison = getDemoTradeCount(a.tradeStats) - getDemoTradeCount(b.tradeStats);
          break;
        case 'allocated':
          comparison = Number(a.allocated_usd || 0) - Number(b.allocated_usd || 0);
          break;
        case 'copyStyle':
          comparison = copyStyleA.localeCompare(copyStyleB);
          break;
        case 'status':
          comparison = getTraderStateStatusLabel(a).localeCompare(getTraderStateStatusLabel(b));
          break;
        case 'trader':
          comparison = traderNameA.localeCompare(traderNameB);
          break;
        case 'roi':
        default:
          comparison = getTraderStateRoi(a) - getTraderStateRoi(b);
          break;
      }

      if (comparison === 0) {
        comparison = traderNameA.localeCompare(traderNameB);
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [sortDirection, sortKey, starTraders, traderStates]);
  
  return (
    <div className="cyber-vault-shell min-h-screen animate-in fade-in duration-700" style={{ backgroundColor: COLORS.canvas, color: COLORS.text, fontFamily: 'Inter, system-ui, sans-serif' }}>
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
          0%, 100% { box-shadow: inset 0 0 0 0 rgba(0,255,133,0.24); }
          50% { box-shadow: inset 0 0 0 2px rgba(0,255,133,0.24); }
        }
        .pulse-ring { animation: pulseRing 2s ease-in-out infinite; }
      `}</style>
      <main className="cyber-vault-content w-full px-4 sm:px-5 py-4 pt-20">
        
        {/* Not Connected */}
        {!isConnected && (
          <div className="cyber-panel max-w-lg mx-auto mt-8 border overflow-hidden animate-fade-up">
            <div className="relative p-10 text-center overflow-hidden">
              <div className="relative z-10">
                <div className="w-14 h-14 mx-auto mb-5 border flex items-center justify-center" style={{ borderColor: 'rgba(0,255,133,0.35)', backgroundColor: '#050505' }}>
                  <Wallet size={26} style={{ color: COLORS.acid }} />
                </div>
                <h2 className="text-lg font-semibold mb-2 tracking-tight">Connect Your Wallet</h2>
                <p className="text-sm mb-6 leading-relaxed max-w-xs mx-auto" style={{ color: COLORS.data }}>Connect your Solana wallet to access your demo vault with $1,000 virtual USD</p>
                <button
                  onClick={openWalletModal}
                  className="cyber-action-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-all duration-200 hover:opacity-90 active:scale-95 rounded-none"
                  style={{ backgroundColor: COLORS.acid, color: '#050505' }}
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
          <div className="cyber-panel max-w-lg mx-auto mt-8 border overflow-hidden animate-fade-up">
            <div className="relative p-10 text-center overflow-hidden">
              <div className="relative z-10">
                <div className="w-14 h-14 mx-auto mb-5 border flex items-center justify-center" style={{ borderColor: 'rgba(0,255,133,0.35)', backgroundColor: '#050505' }}>
                  <LogIn size={26} style={{ color: COLORS.acid }} />
                </div>
                <h2 className="text-lg font-semibold mb-2 tracking-tight">Signature Required</h2>
                <p className="text-sm mb-6 leading-relaxed max-w-xs mx-auto" style={{ color: COLORS.data }}>Sign a message with your wallet to verify ownership and access your vault.</p>
                <button
                  onClick={signIn}
                  disabled={authLoading}
                  className="cyber-action-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-50 rounded-none"
                  style={{ backgroundColor: COLORS.acid, color: '#050505' }}
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
          <div className="cyber-panel max-w-sm mx-auto mt-8 border overflow-hidden animate-fade-up">
            <div className="flex flex-col items-center gap-4 p-8">
              <div className="cyber-command text-[10px]" style={{ color: COLORS.acid }}>Wallet Check</div>
              <Loader2 size={28} className="animate-spin" style={{ color: COLORS.acid }} />
              <span className="text-sm" style={{ color: COLORS.data }}>Verifying wallet ownership...</span>
              <div className="cyber-loading-track mt-1">
                <span />
              </div>
            </div>
          </div>
        )}
        
        {/* No Vault */}
        {isConnected && isAuthenticated && !vault && !loading && hasCheckedVault && (
          <div className="max-w-4xl mx-auto animate-fade-up">
            <div className="cyber-panel border overflow-hidden">
              {/* Hero Section */}
              <div className="p-8 sm:p-12 text-center border-b border-white/10 relative overflow-hidden">
                <TrendingUp size={48} className="mx-auto mb-6 relative z-10" style={{ color: COLORS.acid }} />
                <h2 className="text-2xl sm:text-3xl font-medium mb-4 relative z-10">Start Your Risk-Free Trading Journey</h2>
                <p className="text-sm sm:text-base leading-relaxed max-w-2xl mx-auto relative z-10" style={{ color: COLORS.data }}>
                  Experience the power of automated copy-trading with a virtual portfolio. 
                  Test strategies and follow top performers without risking real capital.
                </p>
              </div>

              {/* Features Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/10">
                <div className="cyber-hover-slice p-6 text-center hover:bg-white/[0.03] transition-colors duration-200 group">
                  <div className="w-10 h-10 border flex items-center justify-center mx-auto mb-4" style={{ borderColor: 'rgba(0,255,133,0.28)', backgroundColor: '#050505', color: COLORS.acid }}>
                    <DollarSign size={20} />
                  </div>
                  <h3 className="font-medium mb-2" style={{ color: COLORS.text }}>$1,000 Virtual Balance</h3>
                  <p className="text-xs leading-relaxed" style={{ color: COLORS.data }}>
                    Start with a pre-funded virtual wallet to allocate across multiple traders.
                  </p>
                </div>
                
                <div className="cyber-hover-slice p-6 text-center hover:bg-white/[0.03] transition-colors duration-200 group">
                  <div className="w-10 h-10 border flex items-center justify-center mx-auto mb-4" style={{ borderColor: 'rgba(0,229,212,0.28)', backgroundColor: '#050505', color: COLORS.cyan }}>
                    <Crown size={20} />
                  </div>
                  <h3 className="font-medium mb-2" style={{ color: COLORS.text }}>Copy Top Traders</h3>
                  <p className="text-xs leading-relaxed" style={{ color: COLORS.data }}>
                    Automatically mirror the moves of successful star traders in real-time.
                  </p>
                </div>

                <div className="cyber-hover-slice p-6 text-center hover:bg-white/[0.03] transition-colors duration-200 group">
                  <div className="w-10 h-10 border flex items-center justify-center mx-auto mb-4" style={{ borderColor: 'rgba(255,255,255,0.14)', backgroundColor: '#050505', color: COLORS.text }}>
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
                  className="cyber-action-primary px-8 py-3 text-sm font-semibold transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 rounded-none"
                  style={{ backgroundColor: COLORS.acid, color: '#050505' }}
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
          <div className="cyber-panel cyber-system-alert border px-4 py-3 mb-3 flex items-center gap-3 text-sm text-red-300 bg-red-500/10 animate-fade-up">
            <AlertCircle size={18} className="shrink-0 text-red-400" />
            <span className="cyber-command hidden sm:inline text-[10px] text-red-400">System Alert</span>
            <span className="min-w-0 flex-1">{error}</span>
            <button
              onClick={() => setError(null)}
              className="cyber-icon-button ml-auto px-2 py-1 text-sm text-red-300 border border-red-500/30 hover:bg-red-500/10"
              aria-label="Dismiss error"
            >
              x
            </button>
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
            <div className="cyber-panel border border-white/10 mb-3 overflow-hidden animate-fade-up">
              <div className="grid grid-cols-1 lg:grid-cols-[1.45fr_1fr]">
                <section className="cyber-kpi p-5 sm:p-6 border-b lg:border-b-0 lg:border-r border-white/10">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="cyber-command mb-2 flex items-center gap-1.5 text-[10px]" style={{ color: COLORS.acid }}>
                        <ShieldCheck size={12} />
                        Vault Health
                        <InfoTooltip>
                          <strong>Vault Health</strong> compares your current demo vault value against the demo capital you started with.<br /><br />
                          It includes free cash plus the current value of all trader states.
                        </InfoTooltip>
                      </div>
                      <div className="font-mono text-3xl font-bold tracking-tight sm:text-4xl" style={{ color: COLORS.text }}>
                        {formatUsd(currentVaultValue)}
                      </div>
                      <div className={`mt-2 font-mono text-sm ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {totalPnl >= 0 ? '+' : ''}{formatUsd(totalPnl)} · {vaultRoiPct >= 0 ? '+' : ''}{vaultRoiPct.toFixed(2)}%
                      </div>
                    </div>

                    <div className="min-w-[150px] border border-white/10 bg-black/30 px-3 py-2 text-right">
                      <div className="cyber-command text-[9px]" style={{ color: COLORS.data }}>Demo Start</div>
                      <div className="mt-1 font-mono text-sm font-semibold" style={{ color: COLORS.text }}>
                        {formatUsd(startingDemoCapital)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between text-[10px] font-mono" style={{ color: COLORS.data }}>
                      <span>Free cash</span>
                      <span>Open setup value</span>
                      <span>{totalPnl > 0 ? 'Drawup' : 'Drawdown'}</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden border border-white/10 bg-white/[0.03]">
                      <div className="flex h-full">
                        <div className="cyber-progress bg-[#00FF85]/75" style={{ width: `${freeCashPct}%` }} />
                        <div className="cyber-progress bg-[#00E5D4]/45" style={{ width: `${portfolioSegmentPct}%` }} />
                        {drawupBarPct > 0 && (
                          <div className="cyber-progress bg-emerald-400/60" style={{ width: `${drawupBarPct}%` }} />
                        )}
                        {drawdownPct > 0 && (
                          <div className="cyber-progress bg-red-500/55" style={{ width: `${drawdownPct}%` }} />
                        )}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] font-mono" style={{ color: COLORS.data }}>
                      <span>{formatUsd(unallocated)} free</span>
                      <span>{formatUsd(totalValue)} in setups</span>
                      <span className={drawdownPct > 0 ? 'text-red-400' : 'text-emerald-400'}>
                        {drawdownPct > 0
                          ? `${drawdownPct.toFixed(0)}% drawdown`
                          : rawDrawupPct > 0
                            ? `${rawDrawupPct.toFixed(0)}% drawup`
                            : 'Flat'}
                      </span>
                    </div>
                  </div>
                </section>

                <section className="grid grid-cols-2">
                  <div className="cyber-kpi p-4 border-b border-r border-white/10">
                    <div className="cyber-command mb-1.5 flex items-center gap-1 text-[10px]" style={{ color: COLORS.data }}>
                      <DollarSign size={10} />
                      Free Cash
                    </div>
                    <div className="font-mono text-xl font-bold" style={{ color: COLORS.text }}>{formatUsd(unallocated)}</div>
                    <div className="mt-1 text-[10px]" style={{ color: COLORS.data }}>Ready for new tests</div>
                  </div>

                  <div className="cyber-kpi p-4 border-b border-white/10">
                    <div className="cyber-command mb-1.5 flex items-center gap-1 text-[10px]" style={{ color: COLORS.data }}>
                      <Target size={10} />
                      Allocated
                    </div>
                    <div className="font-mono text-xl font-bold" style={{ color: COLORS.text }}>{formatUsd(totalAllocated)}</div>
                    <div className="mt-1 text-[10px]" style={{ color: COLORS.data }}>{((totalAllocated / startingDemoCapital) * 100).toFixed(0)}% assigned</div>
                  </div>

                  <div className="cyber-kpi p-4 border-r border-white/10">
                    <div className="cyber-command mb-1.5 flex items-center gap-1 text-[10px]" style={{ color: COLORS.data }}>
                      <CheckCircle2 size={10} />
                      Active Setups
                    </div>
                    <div className="font-mono text-xl font-bold" style={{ color: COLORS.text }}>{activeSetupCount}/{traderStates.length}</div>
                    <div className="mt-1 text-[10px]" style={{ color: COLORS.data }}>Copying now</div>
                  </div>

                  <div className="cyber-kpi p-4">
                    <div className="cyber-command mb-1.5 flex items-center gap-1 text-[10px]" style={{ color: attentionSetupCount > 0 ? '#FB923C' : COLORS.data }}>
                      <AlertCircle size={10} />
                      Needs Attention
                    </div>
                    <div className={`font-mono text-xl font-bold ${attentionSetupCount > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>
                      {attentionSetupCount}
                    </div>
                    <div className="mt-1 text-[10px]" style={{ color: COLORS.data }}>
                      {attentionSetupCount > 0 ? 'Review saved or paused setups' : 'All clear'}
                    </div>
                  </div>
                </section>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-2.5 text-[10px]" style={{ color: COLORS.data }}>
                <span className="cyber-command">Demo simulation · no real funds</span>
                {isSyncingVault && <span className="font-mono">Refreshing data...</span>}
              </div>
            </div>

            {/* Action Bar */}
            <div className={`cyber-panel ${isSyncingVault ? 'cyber-panel-syncing' : ''} relative overflow-hidden flex flex-wrap items-center justify-between gap-3 mb-3 py-3 px-4 sm:px-5 border border-white/10 animate-fade-up delay-100`}>
              {syncPulse > 0 && <span key={syncPulse} className="cyber-sync-sweep" aria-hidden="true" />}
              <div className="relative z-10 flex items-center gap-2.5">
                <h2 className="cyber-command text-sm font-semibold" style={{ color: COLORS.text }}>Trader States</h2>
                {traderStates.length > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold font-mono border border-white/10" style={{ color: COLORS.data, backgroundColor: 'rgba(255,255,255,0.03)' }}>
                    {traderStates.length}
                  </span>
                )}
              </div>

              <div className="relative z-10 flex flex-wrap items-center justify-end gap-2">
                {traderStates.length > 0 && (
                  <div className="hidden md:flex items-center gap-2 mr-0 sm:mr-2">
                    <label htmlFor="demo-vault-sort" className="text-[10px] uppercase tracking-[0.18em] font-mono" style={{ color: COLORS.acid }}>
                      Sort by
                    </label>
                    <select
                      id="demo-vault-sort"
                      value={sortKey}
                      onChange={(event) => setSortKey(event.target.value as TraderSortKey)}
                      className="cyber-control h-8 rounded-sm px-2.5 text-xs font-mono"
                    >
                      {TRADER_SORT_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key} className="bg-[#070A0D] text-white">
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')}
                      className="cyber-control h-8 rounded-sm px-2.5 text-[10px] font-mono uppercase tracking-[0.14em]"
                      aria-label={`Sort direction: ${sortDirectionLabel}`}
                    >
                      {sortDirectionLabel}
                    </button>
                  </div>
                )}

                {/* Create CTA */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setShowFollowModal(true); setAllocationUsd(recommendedAllocationUsd); }}
                    disabled={unallocated < 10}
                      className="cyber-action-primary inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-40"
                    style={{ backgroundColor: COLORS.acid, color: '#050505' }}
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
                  onClick={refreshVault}
                  disabled={isSyncingVault}
                  title="Refresh"
                  aria-label={isSyncingVault ? 'Refreshing vault' : 'Refresh vault'}
                  className="cyber-icon-button group p-2 border border-white/15 hover:border-white/30 hover:bg-white/5 transition-all duration-200 active:scale-[0.96] disabled:opacity-50"
                  style={{ color: COLORS.data }}
                >
                  <RefreshCw size={13} className={isSyncingVault ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} />
                </button>

                {/* Delete */}
                <button
                  onClick={deleteVault}
                  title="Delete Vault"
                  className="cyber-icon-button p-2 border border-red-500/30 text-red-500/60 hover:text-red-400 hover:border-red-500/50 hover:bg-red-500/5 transition-all duration-200 active:scale-[0.96]"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Trader States Table (Desktop) */}
            <div className="cyber-panel hidden md:block border border-white/10 overflow-hidden animate-fade-up delay-200">
              {/* Horizontal scroll container for table */}
              <div className="overflow-x-auto">
                {/* Table Header */}
                <div className={`cyber-table-header grid ${TRADER_TABLE_GRID} gap-3 px-4 sm:px-5 py-2.5 text-[10px] sm:text-xs uppercase tracking-wider border-b border-white/10 font-mono min-w-[1040px]`} style={{ color: COLORS.data }}>
                  <div className="min-w-0 flex items-center gap-1">
                    Rank
                    <InfoTooltip>
                       <strong>ROI Ranking</strong><br/><br/>
                       Traders are ranked by their <strong>Return on Investment (ROI)</strong>.<br/><br/>
                       This levels the playing field, showing who is most efficient with their allocated capital, regardless of position size.
                    </InfoTooltip>
                  </div>
                  <div className="min-w-0">Star Trader</div>
                  <div className="min-w-0 flex items-center gap-1">
                    Copy Style
                    <InfoTooltip>
                      <strong>Copy Style</strong><br/><br/>
                      The buy sizing model used by this trader state. Hover a badge to see what it does.
                    </InfoTooltip>
                  </div>
                  <div className="min-w-0 flex items-center gap-1">
                    PnL (7D)
                    <InfoTooltip>
                       <strong>7-Day PnL</strong><br/><br/>
                       Net profit or loss generated by this trader in the last week.
                    </InfoTooltip>
                  </div>
                  <div className="min-w-0 flex items-center gap-1 justify-end text-right">
                    ROI (Total)
                    <InfoTooltip>
                       <strong>Total ROI</strong><br/><br/>
                       (Current Value - Allocated) / Allocated<br/><br/>
                       The percentage return on your initial investment since you started following this trader.
                    </InfoTooltip>
                  </div>
                  <div className="min-w-0 flex items-center gap-1 justify-end text-right">
                    Profit Factor
                    <InfoTooltip>
                       <strong>Profit Factor</strong><br/><br/>
                       Industry standard efficiency metric: (Gross Profit / Gross Loss).<br/><br/>
                       &gt; 1.0 means profitable. Higher is better.
                    </InfoTooltip>
                  </div>
                  <div className="min-w-0 flex items-center gap-1 justify-end text-right">
                    Trades
                    <InfoTooltip>
                       <strong>Total Trades</strong><br/><br/>
                       Number of buy/sell execution cycles completed by this trader state.
                    </InfoTooltip>
                  </div>
                  <div className="min-w-0 flex items-center gap-1 justify-end text-right">
                    Allocated
                    <InfoTooltip>
                       <strong>Allocated Capital</strong><br/><br/>
                       The amount of virtual USD you have assigned to this trader to use for copy-trading.
                    </InfoTooltip>
                  </div>
                  <div className="min-w-0 flex items-center gap-1">
                    Status
                    <InfoTooltip>
                      <strong>Trader State Status:</strong><br/><br/>
                      🟢 <strong>Active</strong> - Copy trading is running. New trades will be automatically copied.<br/><br/>
                      ⏸️ <strong>Paused</strong> - Temporarily stopped. No new trades copied, but positions remain.<br/><br/>
                      🟠 <strong>Uninitialized</strong> - Pending setup. You need to initialize the vault to start copy trading.<br/><br/>
                      🔴 <strong>Stopped</strong> - Fully stopped. Use withdraw to reclaim funds.
                    </InfoTooltip>
                  </div>
                </div>
              
              {/* Table Rows */}
              <div className="divide-y divide-white/5">
                {rankedTraderStates.length === 0 ? (
                  <div className="py-14 sm:py-20 text-center px-6" style={{ color: COLORS.data }}>
                    <div className="max-w-2xl mx-auto">
                      <div className="w-12 h-12 border flex items-center justify-center mx-auto mb-6" style={{ borderColor: 'rgba(0,255,133,0.32)', backgroundColor: '#050505' }}>
                        <Crown size={24} style={{ color: COLORS.acid }} />
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
                                <span className="text-[11px] font-bold font-mono" style={{ color: COLORS.acid }}>{num}</span>
                              </div>
                              <div className="text-sm font-semibold mb-1" style={{ color: COLORS.text }}>{title}</div>
                              <div className="text-xs leading-relaxed" style={{ color: COLORS.data }}>{desc}</div>
                            </div>
                            {i < 2 && <div className="w-10 sm:w-16 h-px mt-4 shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }} />}
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() => { setShowFollowModal(true); setAllocationUsd(recommendedAllocationUsd); }}
                        className="cyber-action-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold transition-all hover:opacity-90 active:scale-95 pulse-ring rounded-none"
                        style={{ backgroundColor: COLORS.acid, color: '#050505' }}
                      >
                        <span className="text-lg leading-none">+</span>
                        Create First Trader State
                      </button>
                    </div>
                  </div>
                ) : (
                  rankedTraderStates.map((ts, index) => {
                    const rank = index + 1;
                    const traderInfo = starTraders.find(t => t.address === ts.star_trader);
                    const traderName = traderInfo?.name || 'Unknown Trader';
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
                    const stateUrl = `/demo-vault/${ts.id}`;
                    const navigateToState = () => router.push(stateUrl);

                    return (
                      <div 
                        key={ts.id} 
                        role="link"
                        tabIndex={0}
                        aria-label={`Open trader state for ${traderName}`}
                        onClick={(event) => {
                          if ((event.target as HTMLElement).closest('button,a,input,select,textarea')) return;
                          navigateToState();
                        }}
                        onKeyDown={(event) => {
                          if (event.currentTarget !== event.target) return;
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            navigateToState();
                          }
                        }}
                        className={`cyber-row grid ${TRADER_TABLE_GRID} gap-3 px-4 sm:px-5 py-3 items-center transition-colors min-w-[1040px] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00FF85]/70 ${index % 2 === 1 ? 'bg-white/[0.02]' : ''} ${isTargetForInit ? 'ring-2 ring-[#00FF85]/50 bg-[#00FF85]/5 relative z-10' : ''}`}
                      >
                        {isTargetForInit && (
                            <div className="absolute -left-2 top-1/2 -translate-y-1/2 -translate-x-full pr-2 hidden xl:block animate-pulse">
                                <span className="text-[#00FF85] text-sm font-medium whitespace-nowrap">Open Setup →</span>
                            </div>
                        )}
                        {/* Rank */}
                        <div className="min-w-0 flex items-center gap-1 font-mono text-sm">
                          {rank === 1 ? (
                            <Crown size={16} className="text-yellow-400" />
                          ) : (
                            <span style={{ color: COLORS.data }}>#{rank}</span>
                          )}
                        </div>
                        
                        {/* Star Trader */}
                        <div className="min-w-0 flex items-center gap-3">
                          <TraderAvatar 
                            address={ts.star_trader} 
                            image={traderInfo?.image}
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="max-w-full truncate text-sm font-semibold" style={{ color: COLORS.text }} title={traderName}>
                              {traderName}
                            </span>
                            <span className="max-w-full truncate font-mono text-[10px] opacity-60" style={{ color: COLORS.data }} title={ts.star_trader}>
                              {ts.star_trader.slice(0, 6)}...
                            </span>
                          </div>
                        </div>

                        {/* Copy Style */}
                        <div className="min-w-0">
                          <CopyModelBadge
                            modelKey={ts.copy_model_key || 'current_ratio'}
                            config={ts.copy_model_config || {}}
                          />
                        </div>
                        
                        {/* PnL with Sparkline */}
                        <div className="min-w-0 flex items-center gap-2.5">
                          <Sparkline data={sparklineData} isPositive={isPositive} id={ts.id} />
                          <div className="min-w-0 flex flex-col gap-0.5">
                            <span className={`font-mono text-sm font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                              {isPositive ? '+' : ''}{formatUsd(pnl)}
                            </span>
                            <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold font-mono border ${isPositive ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' : 'text-red-400 border-red-500/20 bg-red-500/5'}`}>
                              {isPositive ? '+' : ''}{pnlPercent.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        
                        {/* ROI */}
                        <div className={`min-w-0 text-right font-mono text-sm ${roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
                        </div>
                        
                        {/* Profit Factor */}
                        <div className={`min-w-0 text-right font-mono text-sm ${profitFactor >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {profitFactor.toFixed(2)}x
                        </div>
                        
                        {/* Total Trades */}
                        <div className="min-w-0 text-right font-mono text-sm" style={{ color: COLORS.text }}>
                          {totalTrades}
                        </div>
                        
                        {/* Allocated */}
                        <div className="min-w-0 text-right font-mono text-sm" style={{ color: COLORS.text }}>
                          {formatUsd(ts.allocated_usd)}
                        </div>
                        
                        {/* Status */}
                        <div className="min-w-0">
                          {(() => {
                            if (ts.is_settled) {
                              return <span className="cyber-command inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold border border-white/10 text-slate-400"><StopCircle size={9} /> Settled</span>;
                            }
                            if (ts.is_paused) {
                              return <span className="cyber-command inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold border border-yellow-500/30 bg-yellow-500/5 text-yellow-400"><Pause size={9} /> Paused</span>;
                            }
                            if (ts.is_initialized) {
                              return (
                                <span className="cyber-command inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-semibold border border-[#00FF85]/30 bg-[#00FF85]/5 text-[#00FF85]">
                                  <span className="w-1.5 h-1.5 bg-[#00FF85]" />Active
                                </span>
                              );
                            }
                            if (ts.is_syncing) {
                              return <span className="cyber-command inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold border border-blue-500/30 bg-blue-500/5 text-blue-400"><RefreshCw size={9} className="animate-spin" /> Syncing</span>;
                            }
                            return <span className="cyber-command inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold border border-orange-500/30 bg-orange-500/5 text-orange-400"><Clock size={9} /> Uninit</span>;
                          })()}
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
                <div className="px-1 py-1 flex items-center justify-between gap-3">
                   <h2 className="cyber-command text-sm font-semibold" style={{ color: COLORS.text }}>Trader States ({rankedTraderStates.length})</h2>
                   {traderStates.length > 0 && (
                    <div className="flex items-center gap-2">
                      <select
                        aria-label="Sort trader states"
                        value={sortKey}
                        onChange={(event) => setSortKey(event.target.value as TraderSortKey)}
                        className="cyber-control h-8 max-w-[120px] rounded-sm px-2 text-[11px] font-mono"
                      >
                        {TRADER_SORT_OPTIONS.map((option) => (
                          <option key={option.key} value={option.key} className="bg-[#070A0D] text-white">
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')}
                        className="cyber-control h-8 rounded-sm px-2 text-[10px] font-mono uppercase"
                        aria-label={`Sort direction: ${sortDirectionLabel}`}
                      >
                        {sortDirection === 'asc' ? 'Asc' : 'Desc'}
                      </button>
                    </div>
                   )}
                </div>

                {rankedTraderStates.map((ts, index) => {
                    const traderInfo = starTraders.find(t => t.address === ts.star_trader);
                    const traderName = traderInfo?.name || 'Unknown';
                    const stats = ts.tradeStats || { completedCount: 0, failedCount: 0, totalRealizedPnl: 0, avgLatency: 0, totalCount: 0, profitFactor: 0 };
                    
                    const totalPnl = (ts.totalValue - ts.allocated_usd);
                    const roi = (totalPnl / (ts.allocated_usd || 1)) * 100;
                    const isPositive = totalPnl >= 0;
                    
                    const resolvedTrades = stats.completedCount + stats.failedCount;
                    const winRate = resolvedTrades > 0 
                      ? (stats.completedCount / resolvedTrades) * 100 
                      : 0;

                    const sparklineData = generateSparklineFromPnl(totalPnl, ts.allocated_usd, ts.star_trader);
                    
                    let statusColor = 'text-[#00FF85]';
                    let statusText = 'Active';
                    let statusBg = 'bg-[#00FF85]/5 border-[#00FF85]/30';
                    
                    if (!ts.is_initialized) { 
                        statusColor = 'text-orange-400';
                        statusText = 'Uninitialized';
                        statusBg = 'bg-orange-500/10 border-orange-500/30';
                    } else if (ts.is_paused) {
                        statusColor = 'text-yellow-400';
                        statusText = 'Paused';
                        statusBg = 'bg-yellow-500/10 border-yellow-500/30';
                    }
                    const stateUrl = `/demo-vault/${ts.id}`;
                    const navigateToState = () => router.push(stateUrl);

                    return (
                        <div 
                          key={ts.id}
                          role="link"
                          tabIndex={0}
                          aria-label={`Open trader state for ${traderName}`}
                          onClick={(event) => {
                            if ((event.target as HTMLElement).closest('button,a,input,select,textarea')) return;
                            navigateToState();
                          }}
                          onKeyDown={(event) => {
                            if (event.currentTarget !== event.target) return;
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              navigateToState();
                            }
                          }}
                          className={`cyber-panel-soft relative cursor-pointer overflow-hidden border border-white/10 group transition-colors hover:border-white/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00FF85]/70 ${
                            isPositive ? 'border-l-2 border-l-emerald-500/40' : 'border-l-2 border-l-red-500/30'
                          }`}
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
                                   
                                   <div className="flex min-w-0 flex-col">
                                     <h3 className="max-w-[160px] truncate text-sm font-semibold tracking-tight" style={{ color: COLORS.text }} title={traderName}>{traderName}</h3>
                                     <div className={`cyber-command text-[10px] font-bold px-1.5 py-0.5 border inline-flex w-fit mt-0.5 ${statusBg} ${statusColor}`}>
                                         {statusText}
                                     </div>
                                     <div className="mt-1.5 max-w-[180px]">
                                       <CopyModelBadge
                                         modelKey={ts.copy_model_key || 'current_ratio'}
                                         config={ts.copy_model_config || {}}
                                         compact
                                       />
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
                                       <span className="cyber-command text-[10px]" style={{ color: COLORS.data }}>Utilization</span>
                                       <span className={`text-[10px] font-mono font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>{utilPct.toFixed(0)}%</span>
                                     </div>
                                     <div className="h-0.5 w-full bg-white/5 overflow-hidden">
                                       <div className={`cyber-progress h-full transition-all duration-700 ${isPositive ? 'bg-emerald-500/60' : 'bg-red-500/60'}`} style={{ width: `${utilPct}%` }} />
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
              className="fixed inset-0 top-16 z-[100] flex items-start justify-center overflow-y-auto bg-black/80 p-3 sm:p-5"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="cyber-panel relative mb-8 flex max-h-[calc(100dvh-5.5rem)] w-full max-w-5xl flex-col overflow-hidden border"
              >
                <div className="shrink-0 border-b border-white/10 p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="cyber-command mb-2 text-[10px]" style={{ color: COLORS.acid }}>
                        Demo Copy-Test Setup
                      </div>
                      <h2 className="text-2xl font-bold tracking-tight text-white">
                        Create Trader State
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
                        Create one isolated demo balance for one star trader and one copy model. This lets you compare strategies safely without mixing results.
                      </p>
                    </div>
                    <button
                      onClick={closeFollowModal}
                      className="cyber-icon-button shrink-0 border border-white/10 p-2 text-slate-400 hover:border-white/25 hover:text-white"
                      aria-label="Close create trader state modal"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 sm:p-6">
                  <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
                    <div className="space-y-7">
                      <section className="space-y-4">
                        <SetupStepHeading
                          step="01"
                          title="Choose the star trader"
                          description="This trader's detected buys and sells will drive this isolated demo setup."
                        />

                        <div className="relative group">
                          <select
                            value={selectedTrader || ''}
                            onChange={(e) => setSelectedTrader(e.target.value)}
                            className="w-full appearance-none bg-white/[0.03] border border-white/10 group-hover:border-white/20 focus:border-[#00FF85] focus:ring-1 focus:ring-[#00FF85]/45 text-white rounded-none p-3.5 pr-10 text-sm transition-all focus:outline-none cursor-pointer"
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

                        {selectedTraderOption ? (
                          <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="border border-[#00FF85]/25 bg-[#00FF85]/[0.035] p-4"
                          >
                            <div className="flex items-start gap-3">
                              <TraderAvatar address={selectedTraderOption.address} image={selectedTraderOption.image} />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="truncate text-sm font-semibold text-white">{selectedTraderOption.name}</span>
                                  <span className="cyber-command border border-[#00FF85]/35 bg-black px-2 py-0.5 text-[9px] text-[#00FF85]">
                                    Recommended model
                                  </span>
                                </div>
                                <p className="mt-2 text-xs leading-relaxed text-slate-300">
                                  {selectedTraderOption.recommendedCopyModelReason}
                                </p>
                                <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
                                  <div className="border border-white/10 bg-black/35 px-3 py-2">
                                    <span className="cyber-command block text-[9px] text-slate-500">Recommended</span>
                                    <span className="mt-1 block font-mono text-slate-200">{selectedTraderOption.recommendedCopyModelLabel}</span>
                                  </div>
                                  <div className="border border-white/10 bg-black/35 px-3 py-2">
                                    <span className="cyber-command block text-[9px] text-slate-500">Existing setups</span>
                                    <span className="mt-1 block font-mono text-slate-200">{existingStateCountForSelectedTrader}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ) : (
                          <div className="border border-white/10 bg-black/25 p-4 text-sm text-slate-500">
                            Select a star trader to see the recommended copy model and setup context.
                          </div>
                        )}
                      </section>

                      <section className="space-y-4">
                        <SetupStepHeading
                          step="02"
                          title="Choose the copy model"
                          description="Each trader state stores its own model, so you can run multiple strategies side by side."
                        />

                        <div className="grid gap-3">
                          {COPY_BUY_MODEL_DEFINITIONS.map((definition) => {
                            const isSelected = normalizedSelectedModel.modelKey === definition.key;
                            const isRecommended = selectedTraderOption?.recommendedCopyModelKey === definition.key;
                            const cardModel = parseCopyBuyModelSelection(
                              definition.key,
                              isSelected ? normalizedSelectedModel.config : {},
                            );
                            return (
                              <button
                                key={definition.key}
                                type="button"
                                onClick={() => {
                                  const nextModel = parseCopyBuyModelSelection(definition.key, {});
                                  setSelectedCopyModelKey(nextModel.modelKey);
                                  setSelectedCopyModelConfig(nextModel.config);
                                }}
                                className={`cyber-model-card cyber-model-card-row text-left ${isSelected ? 'cyber-model-card-selected' : ''}`}
                              >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                      <div className="text-sm font-semibold text-white">{definition.label}</div>
                                      {isSelected && <CheckCircle2 size={15} className="shrink-0 text-[#00FF85]" />}
                                    </div>
                                    <div className="mt-1.5 text-xs leading-relaxed text-slate-400">
                                      {definition.shortDescription}
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 flex-row flex-wrap gap-2 sm:w-32 sm:flex-col sm:items-end">
                                    {isRecommended && (
                                      <span className="cyber-command border border-[#00FF85]/35 bg-[#00FF85]/5 px-2 py-0.5 text-[9px] text-[#00FF85]">
                                        Recommended
                                      </span>
                                    )}
                                    <span className="cyber-command border border-[#00E5D4]/25 bg-black px-2 py-0.5 text-[9px] text-[#00E5D4]">
                                      {formatCopyBuyModelConfigBadge(cardModel.modelKey, cardModel.config)}
                                    </span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {selectedModelDefinition && (
                          <div className="space-y-3 border border-white/10 bg-black/25 p-4">
                            <div className="cyber-command text-[10px] text-slate-500">Model Settings</div>
                            <p className="text-xs leading-relaxed text-slate-400">{selectedModelBestForText}</p>
                            {selectedModelDefinition.fields.length > 0 && (
                              <div className="space-y-3 border-t border-white/10 pt-3">
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
                                        className="w-28 bg-white/[0.03] border border-white/10 focus:border-[#00FF85] hover:border-white/20 focus:ring-1 focus:ring-[#00FF85]/45 focus:bg-white/[0.05] text-white font-mono rounded-none p-2.5 text-sm text-right transition-all focus:outline-none"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </section>
                      <section className="space-y-4">
                        <SetupStepHeading
                          step="03"
                          title="Set demo capital"
                          description="Use the slider for a safe test size, or choose a quick amount."
                        />

                        <div className="border border-white/10 bg-[#050505] p-4">
                          <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                              <div className="cyber-command text-[10px] text-slate-500">Allocation</div>
                              <div className="mt-1 flex items-center gap-2 font-mono text-3xl font-bold text-white">
                                <DollarSign size={22} className="text-slate-500" />
                                <input
                                  type="number"
                                  min="10"
                                  max={unallocated}
                                  step="1"
                                  value={allocationUsd}
                                  onChange={(e) => setAllocationUsd(clampUsd(Number(e.target.value), 10, unallocated))}
                                  className="w-32 bg-transparent p-0 font-mono text-3xl font-bold text-white outline-none"
                                  placeholder="0"
                                />
                              </div>
                            </div>
                            <div className="border border-white/10 bg-white/[0.03] px-3 py-2 text-right">
                              <div className="cyber-command text-[9px] text-slate-500">Available</div>
                              <div className="mt-1 font-mono text-sm font-semibold text-[#00FF85]">{formatUsd(unallocated)}</div>
                            </div>
                          </div>

                          <input
                            type="range"
                            min="10"
                            max={allocationSliderMax}
                            step="1"
                            value={clampUsd(allocationUsd, 10, allocationSliderMax)}
                            onChange={(e) => setAllocationUsd(clampUsd(Number(e.target.value), 10, unallocated))}
                            className="cyber-range w-full"
                            style={{ '--range-progress': `${allocationRangePct}%` } as CSSProperties}
                            aria-label="Allocation amount"
                          />
                          <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-500">
                            <span>$10 min</span>
                            <span>{allocationPctOfFreeCash.toFixed(0)}% of free cash</span>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {allocationPresets.map((amount) => (
                              <button
                                key={amount}
                                type="button"
                                onClick={() => setAllocationUsd(amount)}
                                className={`cyber-icon-button border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                  allocationUsd === amount
                                    ? 'border-[#00FF85]/55 bg-[#00FF85]/10 text-[#00FF85]'
                                    : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-white'
                                }`}
                              >
                                {amount === recommendedAllocationUsd ? `Recommended ${formatUsd(amount)}` : formatUsd(amount)}
                              </button>
                            ))}
                            <button
                              type="button"
                              onClick={() => setAllocationUsd(unallocated)}
                              className="cyber-icon-button border border-[#00FF85]/30 px-3 py-1.5 text-xs font-semibold text-[#00FF85] hover:bg-[#00FF85]/10"
                            >
                              Max
                            </button>
                          </div>
                        </div>
                      </section>
                    </div>

                    <aside className="space-y-5 lg:sticky lg:top-0 lg:self-start">
                      <section className="space-y-4">
                        <SetupStepHeading
                          step="04"
                          title="Review before creating"
                          description="This is the exact state that will be saved for demo testing."
                        />

                        <div className="border border-[#00E5D4]/25 bg-[#00E5D4]/[0.025] p-4">
                          <div className="cyber-command mb-3 text-[10px] text-[#00E5D4]">Setup Review</div>
                          <dl className="space-y-3 text-sm">
                            <div className="grid grid-cols-[110px_1fr] gap-3">
                              <dt className="text-slate-500">Trader</dt>
                              <dd className="min-w-0 truncate font-medium text-slate-200">
                                {selectedTraderOption?.name || 'Not selected'}
                              </dd>
                            </div>
                            <div className="grid grid-cols-[110px_1fr] gap-3">
                              <dt className="text-slate-500">Copy model</dt>
                              <dd className="font-medium text-slate-200">{formatCopyBuyModelLabel(normalizedSelectedModel.modelKey)}</dd>
                            </div>
                            <div className="grid grid-cols-[110px_1fr] gap-3">
                              <dt className="text-slate-500">Config</dt>
                              <dd className="font-mono text-xs leading-relaxed text-slate-300">{selectedModelSummary}</dd>
                            </div>
                            <div className="grid grid-cols-[110px_1fr] gap-3">
                              <dt className="text-slate-500">Demo capital</dt>
                              <dd className="font-mono font-semibold text-[#00FF85]">{formatUsd(allocationUsd)}</dd>
                            </div>
                          </dl>
                        </div>

                        <div className="border border-white/10 bg-black/25 p-3 text-xs leading-relaxed text-slate-500">
                          Creating a trader state does not use real funds. It reserves demo capital and starts recording results separately for this trader/model pair.
                        </div>
                      </section>
                    </aside>
                  </div>
                </div>

                <div className="shrink-0 border-t border-white/10 bg-[#0A0A0A] p-4 sm:p-5">
                  {createDisabledReason && (
                    <div className="mb-3 flex items-center gap-2 text-xs text-orange-300">
                      <AlertCircle size={13} />
                      {createDisabledReason}
                    </div>
                  )}
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button
                      onClick={() => followTrader(true)}
                      disabled={Boolean(createDisabledReason) || following}
                      className="cyber-action-primary flex-1 bg-[#00FF85] px-4 py-4 text-sm font-bold text-[#050505] transition-all hover:bg-[#4DFFAD] disabled:bg-[#00FF85]/35 disabled:text-black/60 disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {following ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                      {following ? 'Creating...' : 'Create and start copying'}
                    </button>

                    <button
                      onClick={() => followTrader(false)}
                      disabled={Boolean(createDisabledReason) || following}
                      className="cyber-icon-button border border-[#00FF85]/35 bg-black px-4 py-4 text-sm font-semibold text-[#00FF85] transition-all hover:bg-[#00FF85]/10 disabled:opacity-50 sm:w-44"
                    >
                      {following ? 'Saving...' : 'Save setup only'}
                    </button>
                  </div>
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
