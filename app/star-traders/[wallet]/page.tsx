'use client';

import PageLoader from '@/components/PageLoader';
import { InfiniteScrollSentinel } from '@/components/InfiniteScrollSentinel';
import { MetricTile } from '@/components/cyber/metric-tile';
import { CyberHistorySkeletonRows } from '@/components/cyber/history-skeleton';
import { TraderAvatar } from '@/components/cyber/trader-avatar';
import { InfoTooltip, Tooltip } from '@/components/cyber/tooltip';
import { CopyModelBadge } from '@/components/trading/copy-model-badge';
import { SOLSCAN_LOGO_SRC, SolscanLink } from '@/components/trading/solscan-link';
import { TokenIcon } from '@/components/trading/token-icon';
import { useAuth } from '@/contexts/auth-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { CopyBuyModelConfig, CopyBuyModelKey } from '@/lib/copy-models/types';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  UserCheck,
  UserPlus,
} from 'lucide-react';

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

function formatAmount(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  if (amount === 0) return '0';
  if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (Math.abs(amount) >= 1_000) return `${(amount / 1_000).toFixed(2)}K`;

  if (Math.abs(amount) < 0.01 && Math.abs(amount) > 0) {
    const absAmount = Math.abs(amount);
    const str = absAmount.toFixed(20);
    const match = str.match(/^0\.0*([1-9]\d*)/);
    if (match) {
      const leadingZeros = str.indexOf(match[1]) - 2;
      const significantDigits = match[1].slice(0, 4);
      const subscripts = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
      const subscriptNum = String(leadingZeros)
        .split('')
        .map((digit) => subscripts[Number.parseInt(digit, 10)])
        .join('');
      return `${amount < 0 ? '-' : ''}0.0${subscriptNum}${significantDigits}`;
    }
  }

  return amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatUsd(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(2)}K`;
  if (amount >= 1) return `$${amount.toFixed(2)}`;
  if (amount >= 0.01) return `$${amount.toFixed(2)}`;
  if (amount >= 0.0001) return `$${amount.toFixed(4)}`;
  if (amount >= 0.000001) return `$${amount.toFixed(6)}`;
  if (amount > 0) return `$${amount.toExponential(2)}`;
  return '$0.00';
}

function formatSignedUsd(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return `${amount >= 0 ? '+' : '-'}${formatUsd(Math.abs(amount))}`;
}

function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(digits)}%`;
}

function timeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatTimestamp(timestamp: number | undefined) {
  if (!timestamp) return 'No recent trade detected';
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getActivityMeta(timestamp: number | undefined) {
  if (!timestamp) {
    return {
      label: 'No Data',
      className: 'border-white/15 bg-white/[0.04] text-white/50',
      description: 'No recent trade has been loaded for this wallet yet.',
    };
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - timestamp;

  if (ageSeconds < 3600) {
    return {
      label: 'Live',
      className: 'border-emerald-300/55 bg-emerald-400/12 text-emerald-200',
      description: 'This wallet has traded within the last hour.',
    };
  }

  if (ageSeconds < 86400) {
    return {
      label: 'Active',
      className: 'border-cyan-300/50 bg-cyan-300/10 text-cyan-200',
      description: 'This wallet has traded within the last 24 hours.',
    };
  }

  return {
    label: 'Quiet',
    className: 'border-amber-300/45 bg-amber-400/10 text-amber-200',
    description: 'This wallet has not traded in the last 24 hours.',
  };
}

function PortfolioBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 min-w-[72px] flex-1 overflow-hidden rounded-full bg-white/6">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#00FF85] via-emerald-400 to-[#00E5D4] transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(percent, 0))}%` }}
        />
      </div>
      <span className="min-w-[44px] text-right font-mono text-xs font-medium tabular-nums text-white/72">
        {percent.toFixed(1)}%
      </span>
    </div>
  );
}

function getTradePnlTone(value: number | null) {
  if (value === null) return 'text-white/45';
  return value >= 0 ? 'text-emerald-300' : 'text-red-300';
}

export default function TraderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const wallet = params.wallet as string;
  const { user, isAuthenticated } = useAuth();
  const { step: onboardingStep, setStep } = useOnboarding();

  const [activeTab, setActiveTab] = useState<'trades' | 'portfolio'>('trades');
  const [portfolioTokens, setPortfolioTokens] = useState<PortfolioToken[]>([]);
  const [solBalance, setSolBalance] = useState<SolBalance | null>(null);
  const [totalPortfolioValue, setTotalPortfolioValue] = useState(0);
  const [tokenMeta, setTokenMeta] = useState<Record<string, TokenMeta>>({});
  const [bootstrapping, setBootstrapping] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<TraderStats | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDust, setShowDust] = useState(false);
  const [traderName, setTraderName] = useState('Star Trader');
  const [traderImage, setTraderImage] = useState<string | undefined>(undefined);
  const [isFollowing, setIsFollowing] = useState(false);
  const [recommendedModelKey, setRecommendedModelKey] = useState<CopyBuyModelKey | null>(null);
  const [recommendedModelConfig, setRecommendedModelConfig] = useState<CopyBuyModelConfig | null>(null);
  const [recommendedModelSummary, setRecommendedModelSummary] = useState<string | null>(null);
  const [recommendedModelReason, setRecommendedModelReason] = useState<string | null>(null);

  const fetchTokenMetadata = async (mints: string[]) => {
    if (mints.length === 0) return;

    try {
      const response = await fetch(`/api/tokens?mints=${mints.join(',')}`);
      const data = await response.json();

      if (data) {
        if (!data.SOL) {
          data.SOL = {
            symbol: 'SOL',
            name: 'Solana',
            logoURI:
              'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
          };
        }
        setTokenMeta((previous) => ({ ...previous, ...data }));
      }
    } catch (tokenError) {
      console.error('Failed to fetch token metadata:', tokenError);
    }
  };

  const fetchTraderProfile = async () => {
    const response = await fetch(`/api/star-traders/${wallet}`);
    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    if (data.trader) {
      const trader = data.trader;
      if (trader.name) setTraderName(trader.name);
      if (trader.image) setTraderImage(trader.image);
      setIsFollowing(Boolean(trader.isFollowing));
      setStats(trader.stats || null);
      setRecommendedModelKey(trader.recommendedCopyModelKey || null);
      setRecommendedModelConfig(trader.recommendedCopyModelConfig || null);
      setRecommendedModelSummary(trader.recommendedCopyModelSummary || null);
      setRecommendedModelReason(trader.recommendedCopyModelReason || null);
    }
  };

  const fetchTrades = useCallback(
    async (cursor?: string): Promise<{ data: Trade[]; nextCursor: string | null }> => {
      const url = new URL('/api/trades', window.location.origin);
      url.searchParams.set('wallet', wallet);
      url.searchParams.set('limit', '50');
      if (cursor) url.searchParams.set('cursor', cursor);

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const mints = new Set<string>();
      (data.data || []).forEach((trade: Trade) => {
        if (trade.tokenInMint) mints.add(trade.tokenInMint);
        if (trade.tokenOutMint) mints.add(trade.tokenOutMint);
      });
      if (mints.size > 0) {
        await fetchTokenMetadata(Array.from(mints));
      }

      return {
        data: data.data || [],
        nextCursor: data.nextCursor,
      };
    },
    [wallet],
  );

  const {
    data: trades,
    loading: tradesLoading,
    error: tradesError,
    hasMore,
    lastElementRef,
    loadMore,
    reset,
  } = useInfiniteScroll<Trade>({
    fetchData: fetchTrades,
    limit: 50,
    rootMargin: '0px 0px 280px 0px',
  });

  const fetchPortfolioData = async () => {
    setPortfolioLoading(true);
    try {
      const response = await fetch(`/api/portfolio?wallet=${wallet}`);
      const portfolioData = await response.json();

      if (portfolioData.error) {
        throw new Error(portfolioData.error);
      }

      setPortfolioTokens(portfolioData.tokens || []);
      setSolBalance(portfolioData.solBalance || null);
      setTotalPortfolioValue(portfolioData.totalPortfolioValue || 0);

      const mints = new Set<string>();
      (portfolioData.tokens || []).forEach((token: PortfolioToken) => mints.add(token.mint));
      if (mints.size > 0) {
        await fetchTokenMetadata(Array.from(mints));
      }
    } finally {
      setPortfolioLoading(false);
    }
  };

  const refreshData = useCallback(
    async (initial = false) => {
      if (initial) {
        setBootstrapping(true);
      } else {
        setRefreshing(true);
      }

      setError(null);
      reset();

      try {
        await Promise.all([fetchTraderProfile(), fetchPortfolioData(), loadMore()]);
      } catch (fetchError) {
        console.error(fetchError);
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch trader data');
      } finally {
        if (initial) {
          setBootstrapping(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [loadMore, reset],
  );

  useEffect(() => {
    if (wallet) {
      void refreshData(true);
    }
  }, [wallet, user?.wallet, refreshData]);

  const copyAddress = () => {
    navigator.clipboard.writeText(wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFollow = () => {
    if (!isAuthenticated) {
      router.push('/demo-vault');
      return;
    }

    if (onboardingStep === 'TOUR') {
      setStep('ALLOCATE');
    }

    router.push(`/demo-vault?follow=${wallet}`);
  };

  const displayTokens = showDust ? portfolioTokens : portfolioTokens.filter((token) => !token.isDust);
  const dustCount = portfolioTokens.filter((token) => token.isDust).length;
  const latestTradeTimestamp = trades[0]?.timestamp;
  const activityMeta = getActivityMeta(latestTradeTimestamp);
  const pnl7d = stats?.pnl7d ?? stats?.totalPnl ?? null;
  const pnl7dTone = pnl7d === null ? 'neutral' : pnl7d >= 0 ? 'positive' : 'negative';
  const tradeCount = stats?.tradesCount ?? trades.length;
  const holdingsCount = displayTokens.length + (solBalance ? 1 : 0);

  if (bootstrapping) {
    return <PageLoader />;
  }

  return (
    <div className="cyber-vault-shell min-h-screen pt-20">
      <main className="cyber-vault-content px-4 pb-10 md:px-6">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-4">
          <Link
            href="/star-traders"
            className="cyber-control inline-flex w-fit items-center gap-2 px-4 py-2 text-sm font-semibold text-white/80 transition active:scale-[0.98]"
          >
            <ArrowLeft size={14} />
            Back
          </Link>

          {error ? (
            <div className="cyber-panel border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <section className="cyber-panel border p-4 sm:p-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px] xl:items-start">
              <div className="min-w-0 flex-1">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="cyber-command text-[10px] text-[#00E5D4]">Trader Analysis</span>
                  <Tooltip
                    label="Activity"
                    trigger={
                      <span className={`cyber-command inline-flex items-center gap-1.5 border px-2.5 py-1 text-[10px] font-semibold ${activityMeta.className}`}>
                        {activityMeta.label}
                      </span>
                    }
                    triggerClassName="border-0 bg-transparent p-0"
                    ariaLabel={`${activityMeta.label} trader activity`}
                  >
                    <strong>{activityMeta.label}</strong>
                    <br />
                    {activityMeta.description}
                    <br />
                    <br />
                    <span className="text-white/55">
                      Latest trade: {formatTimestamp(latestTradeTimestamp)}
                    </span>
                  </Tooltip>
                </div>

                <div className="flex items-start gap-4">
                  <TraderAvatar address={wallet} image={traderImage} className="h-14 w-14 sm:h-16 sm:w-16" />

                  <div className="min-w-0 flex-1">
                    <h1 className="truncate text-2xl font-semibold text-white sm:text-3xl">{traderName}</h1>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/45">
                      <span className="font-mono">
                        {wallet.slice(0, 6)}...{wallet.slice(-6)}
                      </span>
                      <button
                        type="button"
                        onClick={copyAddress}
                        className="cyber-icon-button border border-white/10 p-1.5 text-white/55 transition hover:border-white/30 hover:text-white"
                        title="Copy wallet address"
                      >
                        {copied ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}
                      </button>
                      <a
                        href={`https://solscan.io/account/${wallet}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cyber-icon-button inline-flex items-center gap-1.5 border border-white/10 px-2 py-1.5 text-white/55 transition hover:border-white/30 hover:text-white"
                        title="View wallet on Solscan"
                      >
                        <img src={SOLSCAN_LOGO_SRC} alt="Solscan" className="h-3.5 w-auto opacity-80" />
                      </a>
                    </div>
                    {recommendedModelKey && recommendedModelConfig ? (
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <div className="flex flex-col gap-1">
                          <span className="cyber-command text-[10px] text-white/35">Suggested Copy Style</span>
                          <CopyModelBadge
                            modelKey={recommendedModelKey}
                            config={recommendedModelConfig}
                            summary={recommendedModelSummary || undefined}
                            compact
                          />
                        </div>
                        {recommendedModelReason ? (
                          <p className="max-w-2xl text-xs leading-relaxed text-white/48">{recommendedModelReason}</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex w-full flex-col gap-2 xl:w-[280px]">
                <button
                  type="button"
                  onClick={handleFollow}
                  className={`inline-flex items-center justify-center gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] transition active:scale-[0.98] ${
                    isFollowing
                      ? 'cyber-control border-cyan-300/45 bg-cyan-300/10 text-cyan-200'
                      : 'cyber-action-primary border border-cyan-300/40 bg-cyan-300 px-4 text-black hover:brightness-105'
                  }`}
                >
                  {isFollowing ? <UserCheck size={14} /> : <UserPlus size={14} />}
                  {isFollowing ? 'Following in Demo Vault' : 'Follow in Demo Vault'}
                </button>

                <a
                  href={`https://gmgn.ai/sol/address/${wallet}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cyber-control inline-flex items-center justify-center gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/78 transition hover:border-emerald-300/55 hover:text-emerald-200"
                >
                  <img
                    src="https://gmgn.ai/static/GMGNLogoDark.svg"
                    alt="GMGN"
                    className="h-4 w-auto opacity-80"
                  />
                  View Full History
                  <ArrowUpRight size={13} />
                </a>

                <button
                  type="button"
                  onClick={() => void refreshData(false)}
                  disabled={refreshing}
                  className="cyber-control inline-flex items-center justify-center gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/72 transition hover:text-white disabled:opacity-50"
                >
                  <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>
            </div>
          </section>

          {stats ? (
            <section className="flex flex-col gap-4">
              <div className="cyber-panel border p-5">
                <div className="cyber-command mb-3 text-[10px] text-[#00FF85]">Trader Health</div>
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="cyber-command text-[10px] text-white/45">7D PnL</span>
                      <InfoTooltip>
                        <strong>7-day realized PnL</strong>
                        <br />
                        <br />
                        Calculated from realized trades in the last seven days. Unrealized holdings are not included in this number.
                      </InfoTooltip>
                    </div>
                    <div className={`mt-3 font-mono text-[2.1rem] font-semibold leading-none tabular-nums ${pnl7dTone === 'positive' ? 'text-emerald-300' : pnl7dTone === 'negative' ? 'text-red-300' : 'text-white'}`}>
                      {formatSignedUsd(pnl7d)}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-white/55">
                      <span className={`font-mono tabular-nums ${stats.pnl7dPercent !== undefined && stats.pnl7dPercent < 0 ? 'text-red-300' : 'text-emerald-200'}`}>
                        {formatPercent(stats.pnl7dPercent, 1)}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="cyber-panel-soft border px-3 py-3">
                      <div className="cyber-command mb-1 text-[9px] text-white/38">Win Rate</div>
                      <div className="font-mono text-lg font-semibold text-emerald-200">{formatPercent(stats.winRate)}</div>
                      <div className="mt-1 text-xs text-white/45">Realized winners over total closed trades.</div>
                    </div>
                    <div className="cyber-panel-soft border px-3 py-3">
                      <div className="cyber-command mb-1 text-[9px] text-white/38">Profit Factor</div>
                      <div className="font-mono text-lg font-semibold text-cyan-200">{stats.profitFactor.toFixed(2)}x</div>
                      <div className="mt-1 text-xs text-white/45">Gross gains versus gross losses.</div>
                    </div>
                    <div className="cyber-panel-soft border px-3 py-3">
                      <div className="cyber-command mb-1 text-[9px] text-white/38">Wins / Losses</div>
                      <div className="font-mono text-lg font-semibold tabular-nums">
                        <span className="text-emerald-300">{stats.wins}</span>
                        <span className="px-1 text-white/25">/</span>
                        <span className="text-red-300">{stats.losses}</span>
                      </div>
                      <div className="mt-1 text-xs text-white/45">Closed trade outcomes only.</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricTile
                  label="Portfolio Value"
                  value={portfolioLoading ? <Loader2 size={18} className="animate-spin text-white/50" /> : formatUsd(totalPortfolioValue)}
                  helper={
                    <span className="inline-flex items-center gap-1">
                      Live wallet valuation including SOL.
                      <InfoTooltip>
                        <strong>Portfolio value</strong>
                        <br />
                        <br />
                        Current USD value of token balances fetched for this wallet, including native SOL.
                      </InfoTooltip>
                    </span>
                  }
                />

                <MetricTile
                  label="Followers"
                  value={stats.followerCount ?? '—'}
                  helper={
                    <span className="inline-flex items-center gap-1">
                      Demo Vault setups currently following this trader.
                      <InfoTooltip>
                        <strong>Followers</strong>
                        <br />
                        <br />
                        Number of demo trader states currently linked to this wallet in Demo Vault.
                      </InfoTooltip>
                    </span>
                  }
                />

                <MetricTile
                  label="Trades"
                  value={tradeCount}
                  helper={
                    <span className="inline-flex items-center gap-1">
                      Recent trade count in the current analysis window.
                      <InfoTooltip>
                        <strong>Trades in analysis window</strong>
                        <br />
                        <br />
                        Count of recent trades represented by the current summary statistics.
                      </InfoTooltip>
                    </span>
                  }
                />

                <MetricTile
                  label="Last Active"
                  value={latestTradeTimestamp ? timeAgo(latestTradeTimestamp) : '—'}
                  helper={
                    <span className="inline-flex items-center gap-1">
                      {formatTimestamp(latestTradeTimestamp)}
                      <InfoTooltip>
                        <strong>Latest detected trade</strong>
                        <br />
                        <br />
                        Time since the most recent trade loaded for this wallet on this page.
                      </InfoTooltip>
                    </span>
                  }
                  tone={latestTradeTimestamp ? 'neutral' : 'warning'}
                />
              </div>
            </section>
          ) : null}

          <section className="cyber-panel border overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('trades')}
                  className={`cyber-control relative px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                    activeTab === 'trades'
                      ? '!border-[#00FF85] !bg-[#00FF85] !text-black shadow-[0_0_22px_rgba(0,255,133,0.2),inset_0_-2px_0_rgba(0,0,0,0.35)]'
                      : 'text-white/55'
                  }`}
                  aria-current={activeTab === 'trades' ? 'page' : undefined}
                >
                  <span className="inline-flex items-center gap-2">Recent Trades</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('portfolio')}
                  className={`cyber-control relative px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                    activeTab === 'portfolio'
                      ? '!border-[#00FF85] !bg-[#00FF85] !text-black shadow-[0_0_22px_rgba(0,255,133,0.2),inset_0_-2px_0_rgba(0,0,0,0.35)]'
                      : 'text-white/55'
                  }`}
                  aria-current={activeTab === 'portfolio' ? 'page' : undefined}
                >
                  <span className="inline-flex items-center gap-2">Portfolio ({portfolioTokens.length})</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activeTab === 'portfolio' ? (
                  <Tooltip
                    trigger={
                      <>
                        {showDust ? 'Hide Dust' : `Show Dust${dustCount > 0 ? ` (${dustCount})` : ''}`}
                      </>
                    }
                    triggerClassName={`cyber-control px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${
                      showDust ? 'border-emerald-300/60 text-emerald-200' : 'text-white/68'
                    }`}
                    label="Dust Tokens"
                    ariaLabel={showDust ? 'Hide dust tokens' : 'Show dust tokens'}
                    onTriggerClick={() => setShowDust((value) => !value)}
                  >
                    <strong>Dust tokens</strong>
                    <br />
                    <br />
                    Small balances under roughly one cent or below 0.1% of total wallet value.
                  </Tooltip>
                ) : (
                  <div className="cyber-command text-[10px] text-white/35">
                    Latest trade {latestTradeTimestamp ? timeAgo(latestTradeTimestamp) : 'unavailable'}
                  </div>
                )}
              </div>
            </div>

            {activeTab === 'trades' ? (
              <div>
                <div className="hidden md:block">
                  <div className="cyber-table-header grid grid-cols-[88px_minmax(280px,2fr)_0.9fr_0.8fr_0.7fr_80px] gap-3 border-b border-white/10 px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-white/50">
                    <div>Type</div>
                    <div>Token Flow</div>
                    <div className="text-right">USD Value</div>
                    <div className="text-right">Realized PnL</div>
                    <div className="text-right">Age</div>
                    <div className="flex justify-center">
                      <img src={SOLSCAN_LOGO_SRC} alt="Solscan" className="h-3.5 w-auto opacity-70" />
                    </div>
                  </div>

                  {trades.length === 0 && !tradesLoading ? (
                    <div className="cyber-panel-soft border px-4 py-12 text-center text-sm text-white/45">
                      No recent trades found for this wallet.
                    </div>
                  ) : (
                    trades.map((trade) => {
                      const isBuy = trade.type === 'buy';
                      const inMeta = tokenMeta[trade.tokenInMint] || {
                        symbol: trade.tokenInSymbol,
                        name: trade.tokenInSymbol,
                        logoURI: null,
                      };
                      const outMeta = tokenMeta[trade.tokenOutMint] || {
                        symbol: trade.tokenOutSymbol,
                        name: trade.tokenOutSymbol,
                        logoURI: null,
                      };

                      return (
                        <div
                          key={trade.signature}
                          className={`cyber-row grid grid-cols-[88px_minmax(280px,2fr)_0.9fr_0.8fr_0.7fr_80px] items-center gap-3 border-b border-white/[0.06] px-5 py-3 ${
                            trade.realizedPnl !== null && trade.realizedPnl < 0 ? 'bg-red-500/[0.05]' : ''
                          }`}
                        >
                          <div>
                            <span
                              className={`inline-flex items-center justify-center px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                                isBuy
                                  ? 'border border-emerald-400/35 bg-emerald-500/10 text-emerald-200'
                                  : 'border border-red-400/35 bg-red-500/10 text-red-200'
                              }`}
                            >
                              {isBuy ? 'Buy' : 'Sell'}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <TokenIcon symbol={inMeta.symbol} logoURI={inMeta.logoURI} />
                              <div className="min-w-0">
                                <div className="font-mono text-sm text-white">
                                  {formatAmount(trade.tokenInAmount)}
                                </div>
                                <div className="truncate text-xs text-white/45">{inMeta.symbol}</div>
                              </div>
                            </div>
                            <ArrowRight size={14} className="shrink-0 text-white/25" />
                            <div className="flex min-w-0 items-center gap-2">
                              <TokenIcon symbol={outMeta.symbol} logoURI={outMeta.logoURI} />
                              <div className="min-w-0">
                                <div className="font-mono text-sm text-white">
                                  {formatAmount(trade.tokenOutAmount)}
                                </div>
                                <div className="truncate text-xs text-white/45">{outMeta.symbol}</div>
                              </div>
                            </div>
                          </div>

                          <div className="text-right font-mono text-sm text-white tabular-nums">
                            {formatUsd(trade.usdValue)}
                          </div>

                          <div className={`text-right font-mono text-sm tabular-nums ${getTradePnlTone(trade.realizedPnl)}`}>
                            {trade.realizedPnl === null ? '—' : formatSignedUsd(trade.realizedPnl)}
                          </div>

                          <div className="text-right text-xs text-white/55">{timeAgo(trade.timestamp)}</div>

                          <div className="flex justify-center">
                            <SolscanLink signature={trade.signature} compact />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="grid gap-3 p-4 md:hidden">
                  {trades.length === 0 && !tradesLoading ? (
                    <div className="cyber-panel-soft border px-4 py-10 text-center text-sm text-white/45">
                      No recent trades found for this wallet.
                    </div>
                  ) : (
                    trades.map((trade) => {
                      const isBuy = trade.type === 'buy';
                      const inMeta = tokenMeta[trade.tokenInMint] || {
                        symbol: trade.tokenInSymbol,
                        name: trade.tokenInSymbol,
                        logoURI: null,
                      };
                      const outMeta = tokenMeta[trade.tokenOutMint] || {
                        symbol: trade.tokenOutSymbol,
                        name: trade.tokenOutSymbol,
                        logoURI: null,
                      };

                      return (
                        <article
                          key={trade.signature}
                          className={`cyber-panel-soft border p-4 ${
                            trade.realizedPnl !== null && trade.realizedPnl < 0 ? 'border-red-400/35 bg-red-500/[0.06]' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span
                              className={`inline-flex items-center justify-center px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                                isBuy
                                  ? 'border border-emerald-400/35 bg-emerald-500/10 text-emerald-200'
                                  : 'border border-red-400/35 bg-red-500/10 text-red-200'
                              }`}
                            >
                              {isBuy ? 'Buy' : 'Sell'}
                            </span>
                            <span className="text-xs text-white/45">{timeAgo(trade.timestamp)}</span>
                          </div>

                          <div className="mt-4 flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <TokenIcon symbol={inMeta.symbol} logoURI={inMeta.logoURI} />
                              <div className="min-w-0">
                                <div className="font-mono text-sm text-white">{formatAmount(trade.tokenInAmount)}</div>
                                <div className="truncate text-xs text-white/45">{inMeta.symbol}</div>
                              </div>
                            </div>
                            <ArrowRight size={14} className="shrink-0 text-white/25" />
                            <div className="flex min-w-0 items-center gap-2">
                              <TokenIcon symbol={outMeta.symbol} logoURI={outMeta.logoURI} />
                              <div className="min-w-0 text-right">
                                <div className="font-mono text-sm text-white">{formatAmount(trade.tokenOutAmount)}</div>
                                <div className="truncate text-xs text-white/45">{outMeta.symbol}</div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-3 gap-3">
                            <div>
                              <div className="cyber-command mb-1 text-[10px] text-white/35">USD Value</div>
                              <div className="font-mono text-sm text-white">{formatUsd(trade.usdValue)}</div>
                            </div>
                            <div>
                              <div className="cyber-command mb-1 text-[10px] text-white/35">PnL</div>
                              <div className={`font-mono text-sm ${getTradePnlTone(trade.realizedPnl)}`}>
                                {trade.realizedPnl === null ? '—' : formatSignedUsd(trade.realizedPnl)}
                              </div>
                            </div>
                            <div>
                              <div className="mb-1 flex h-[14px] items-center">
                                <img src={SOLSCAN_LOGO_SRC} alt="Solscan" className="h-3.5 w-auto opacity-70" />
                              </div>
                              <div className="flex justify-start">
                                <SolscanLink signature={trade.signature} compact />
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>

                <InfiniteScrollSentinel
                  inputRef={lastElementRef}
                  loading={tradesLoading}
                  hasMore={hasMore}
                  onLoadMore={() => void loadMore()}
                  loadMoreLabel="Load more trades"
                  error={tradesError ? <span>Could not load more trades. Try refreshing the page.</span> : undefined}
                  skeleton={
                    <>
                      <div className="hidden md:block">
                        <CyberHistorySkeletonRows
                          containerClassName="flex flex-col"
                          rowClassName="grid grid-cols-[88px_minmax(280px,2fr)_0.9fr_0.8fr_0.7fr_80px] items-center gap-3 border-b border-white/[0.06] px-5 py-3"
                          cellClassNames={[
                            'h-5 w-14',
                            'h-4 w-52 max-w-full',
                            'h-4 w-20 justify-self-end',
                            'h-4 w-20 justify-self-end',
                            'h-3 w-12 justify-self-end',
                            'h-6 w-10 justify-self-center',
                          ]}
                          ariaLabel="Loading more recent trades"
                        />
                      </div>
                      <div className="grid gap-3 p-4 md:hidden">
                        <CyberHistorySkeletonRows
                          rows={2}
                          containerClassName="flex flex-col gap-3"
                          rowClassName="cyber-panel-soft border p-4"
                          cellClassNames={['h-5 w-12', 'mt-4 h-4 w-full', 'mt-3 h-4 w-3/4', 'mt-4 h-4 w-full']}
                          ariaLabel="Loading more recent trades"
                        />
                      </div>
                    </>
                  }
                  endMessage={
                    <div className="flex flex-col items-center justify-center gap-3 py-12">
                      <span className="cyber-command text-[10px] text-white/35">End of recent history</span>
                      <a
                        href={`https://gmgn.ai/sol/address/${wallet}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cyber-control inline-flex items-center gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/72 hover:text-emerald-200"
                      >
                        View full history on GMGN
                        <ArrowUpRight size={13} />
                      </a>
                    </div>
                  }
                />
              </div>
            ) : (
              <div>
                <div className="hidden md:block">
                  <div className="cyber-table-header grid grid-cols-[minmax(220px,1.2fr)_0.9fr_0.9fr_0.9fr_1.1fr_72px] gap-3 border-b border-white/10 px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-white/50">
                    <div>Token</div>
                    <div className="text-right">Price</div>
                    <div className="text-right">Balance</div>
                    <div className="text-right">Value</div>
                    <div className="pl-4">Allocation</div>
                    <div className="text-center">Action</div>
                  </div>

                  {portfolioLoading ? (
                    <div className="flex items-center justify-center gap-3 px-4 py-12 text-sm text-white/45">
                      <Loader2 size={20} className="animate-spin" />
                      Scanning wallet assets...
                    </div>
                  ) : (
                    <>
                      {solBalance ? (
                        <div className="cyber-row grid grid-cols-[minmax(220px,1.2fr)_0.9fr_0.9fr_0.9fr_1.1fr_72px] items-center gap-3 border-b border-white/[0.06] bg-emerald-500/[0.04] px-5 py-3">
                          <div className="flex items-center gap-3">
                            <img
                              src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
                              className="h-8 w-8 rounded-full"
                              alt="SOL"
                            />
                            <div>
                              <div className="font-semibold text-white">Solana</div>
                              <div className="text-xs text-white/45">SOL</div>
                            </div>
                          </div>
                          <div className="text-right font-mono text-sm text-white/62">{formatUsd(solBalance.pricePerToken)}</div>
                          <div className="text-right font-mono text-sm text-white">{formatAmount(solBalance.balance)}</div>
                          <div className="text-right font-mono text-sm text-emerald-200">{formatUsd(solBalance.totalValue)}</div>
                          <div className="pl-4">
                            <PortfolioBar percent={solBalance.holdingPercent || 0} />
                          </div>
                          <div className="text-center">
                            <span className="cyber-command text-[10px] text-emerald-200">Native</span>
                          </div>
                        </div>
                      ) : null}

                      {displayTokens.map((token) => (
                        <div
                          key={token.mint}
                          className="cyber-row grid grid-cols-[minmax(220px,1.2fr)_0.9fr_0.9fr_0.9fr_1.1fr_72px] items-center gap-3 border-b border-white/[0.06] px-5 py-3"
                        >
                          <div className="flex items-center gap-3">
                            <TokenIcon symbol={token.symbol} logoURI={token.logoURI} />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-semibold text-white">{token.symbol}</span>
                                {token.isDust ? (
                                  <span className="cyber-command border border-amber-300/35 bg-amber-400/10 px-1.5 py-0.5 text-[9px] text-amber-200">
                                    Dust
                                  </span>
                                ) : null}
                              </div>
                              <div className="truncate text-xs text-white/45">{token.name}</div>
                            </div>
                          </div>
                          <div className="text-right font-mono text-sm text-white/62">{formatUsd(token.pricePerToken)}</div>
                          <div className="text-right font-mono text-sm text-white">{formatAmount(token.balance)}</div>
                          <div className="text-right font-mono text-sm text-emerald-200">{formatUsd(token.totalValue)}</div>
                          <div className="pl-4">
                            <PortfolioBar percent={token.holdingPercent || 0} />
                          </div>
                          <div className="flex justify-center">
                            <a
                              href={`https://solscan.io/token/${token.mint}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="cyber-icon-button inline-flex items-center gap-1.5 border border-white/10 px-2 py-1.5 text-white/55 transition hover:border-white/30 hover:text-white"
                              title="Open token on Solscan"
                            >
                              <img src={SOLSCAN_LOGO_SRC} alt="Solscan" className="h-3.5 w-auto opacity-80" />
                            </a>
                          </div>
                        </div>
                      ))}

                      {displayTokens.length === 0 && !solBalance ? (
                        <div className="cyber-panel-soft border px-4 py-12 text-center text-sm text-white/45">
                          No tokens found in this wallet.
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                <div className="grid gap-3 p-4 md:hidden">
                  <div className="cyber-command text-[10px] text-white/35">
                    {portfolioLoading
                      ? 'Scanning current holdings'
                      : `${holdingsCount} holdings${showDust ? ' shown with dust' : ''}`}
                  </div>

                  {portfolioLoading ? (
                    <div className="cyber-panel-soft border px-4 py-10 text-center text-sm text-white/45">
                      <div className="mb-3 flex justify-center">
                        <Loader2 size={20} className="animate-spin" />
                      </div>
                      Scanning wallet assets...
                    </div>
                  ) : (
                    <>
                      {solBalance ? (
                        <article className="cyber-panel-soft border bg-emerald-500/[0.05] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <img
                                src="https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
                                className="h-9 w-9 rounded-full"
                                alt="SOL"
                              />
                              <div>
                                <div className="font-semibold text-white">Solana</div>
                                <div className="text-xs text-white/45">SOL</div>
                              </div>
                            </div>
                            <span className="cyber-command border border-emerald-300/35 bg-emerald-400/10 px-2 py-0.5 text-[9px] text-emerald-200">
                              Native
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-3">
                            <div>
                              <div className="cyber-command mb-1 text-[10px] text-white/35">Price</div>
                              <div className="font-mono text-sm text-white">{formatUsd(solBalance.pricePerToken)}</div>
                            </div>
                            <div>
                              <div className="cyber-command mb-1 text-[10px] text-white/35">Balance</div>
                              <div className="font-mono text-sm text-white">{formatAmount(solBalance.balance)}</div>
                            </div>
                            <div>
                              <div className="cyber-command mb-1 text-[10px] text-white/35">Value</div>
                              <div className="font-mono text-sm text-emerald-200">{formatUsd(solBalance.totalValue)}</div>
                            </div>
                            <div>
                              <div className="cyber-command mb-1 text-[10px] text-white/35">Allocation</div>
                              <div className="font-mono text-sm text-white">{formatPercent(solBalance.holdingPercent, 1)}</div>
                            </div>
                          </div>
                          <div className="mt-4">
                            <PortfolioBar percent={solBalance.holdingPercent || 0} />
                          </div>
                        </article>
                      ) : null}

                      {displayTokens.map((token) => (
                        <article key={token.mint} className="cyber-panel-soft border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <TokenIcon symbol={token.symbol} logoURI={token.logoURI} className="h-9 w-9" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate font-semibold text-white">{token.symbol}</span>
                                  {token.isDust ? (
                                    <span className="cyber-command border border-amber-300/35 bg-amber-400/10 px-1.5 py-0.5 text-[9px] text-amber-200">
                                      Dust
                                    </span>
                                  ) : null}
                                </div>
                                <div className="truncate text-xs text-white/45">{token.name}</div>
                              </div>
                            </div>
                            <a
                              href={`https://solscan.io/token/${token.mint}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="cyber-icon-button inline-flex items-center gap-1.5 border border-white/10 px-2 py-1.5 text-white/55 transition hover:border-white/30 hover:text-white"
                              title="Open token on Solscan"
                            >
                              <img src={SOLSCAN_LOGO_SRC} alt="Solscan" className="h-3.5 w-auto opacity-80" />
                            </a>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-3">
                            <div>
                              <div className="cyber-command mb-1 text-[10px] text-white/35">Price</div>
                              <div className="font-mono text-sm text-white">{formatUsd(token.pricePerToken)}</div>
                            </div>
                            <div>
                              <div className="cyber-command mb-1 text-[10px] text-white/35">Balance</div>
                              <div className="font-mono text-sm text-white">{formatAmount(token.balance)}</div>
                            </div>
                            <div>
                              <div className="cyber-command mb-1 text-[10px] text-white/35">Value</div>
                              <div className="font-mono text-sm text-emerald-200">{formatUsd(token.totalValue)}</div>
                            </div>
                            <div>
                              <div className="cyber-command mb-1 text-[10px] text-white/35">Allocation</div>
                              <div className="font-mono text-sm text-white">{formatPercent(token.holdingPercent, 1)}</div>
                            </div>
                          </div>

                          <div className="mt-4">
                            <PortfolioBar percent={token.holdingPercent || 0} />
                          </div>
                        </article>
                      ))}

                      {displayTokens.length === 0 && !solBalance ? (
                        <div className="cyber-panel-soft border px-4 py-10 text-center text-sm text-white/45">
                          No tokens found in this wallet.
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
