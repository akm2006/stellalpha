'use client';

import PageLoader from '@/components/PageLoader';
import { Tooltip, InfoTooltip } from '@/components/cyber/tooltip';
import { TraderAvatar } from '@/components/cyber/trader-avatar';
import { useAuth } from '@/contexts/auth-context';
import { useOnboarding } from '@/contexts/onboarding-context';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Crown,
  RefreshCw,
  Search,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';

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
  lastTradeTime: number;
}

interface StarTrader {
  wallet: string;
  name: string;
  image?: string;
  createdAt: string;
  isFollowing: boolean;
  stats: TraderStats;
}

type SortKey = 'rank' | 'pnl7d' | 'winRate' | 'profitFactor' | 'lastActive' | 'followers';
type FilterKey = 'all' | 'active' | 'following';

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: 'rank', label: 'Rank' },
  { key: 'pnl7d', label: '7D PnL' },
  { key: 'winRate', label: 'Win Rate' },
  { key: 'profitFactor', label: 'Profit Factor' },
  { key: 'lastActive', label: 'Last Active' },
  { key: 'followers', label: 'Followers' },
];

const FILTER_OPTIONS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'following', label: 'Following' },
];

function formatUsd(amount: number): string {
  if (Math.abs(amount) >= 1000000) return '$' + (amount / 1000000).toFixed(2) + 'M';
  if (Math.abs(amount) >= 1000) return '$' + (amount / 1000).toFixed(2) + 'K';
  return '$' + amount.toFixed(2);
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return 'No recent trade';

  const now = Date.now();
  const diffInSeconds = Math.floor((now - timestamp) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  return `${Math.floor(diffInSeconds / 604800)}w ago`;
}

function isRecentlyActive(timestamp: number, hours = 24) {
  if (!timestamp) return false;
  return Date.now() - timestamp <= hours * 60 * 60 * 1000;
}

function truncateWallet(wallet: string) {
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

function getActivityState(timestamp: number) {
  if (!timestamp) {
    return {
      label: 'Quiet',
      className: 'border-white/10 bg-white/[0.03] text-white/38',
      emphasisClassName: 'text-white/38',
      tooltip:
        'Quiet means this trader has not made a recent detected on-chain trade. It can still be worth reviewing, but the feed is less active right now.',
    };
  }

  const ageMs = Date.now() - timestamp;
  if (ageMs <= 60 * 60 * 1000) {
    return {
      label: 'Live',
      className: 'border-emerald-400/45 bg-emerald-400/10 text-emerald-300',
      emphasisClassName: 'text-emerald-300',
      tooltip:
        'Live means this trader made a detected on-chain trade within the last hour. Use it when you want the freshest activity.',
    };
  }

  if (ageMs <= 24 * 60 * 60 * 1000) {
    return {
      label: 'Active',
      className: 'border-cyan-300/45 bg-cyan-300/10 text-cyan-200',
      emphasisClassName: 'text-cyan-200',
      tooltip:
        'Active means this trader made a detected on-chain trade within the last 24 hours, but not within the last hour.',
    };
  }

  return {
    label: 'Quiet',
    className: 'border-white/10 bg-white/[0.03] text-white/38',
    emphasisClassName: 'text-white/38',
    tooltip:
      'Quiet means this trader has not made a recent detected on-chain trade. It can still be worth reviewing, but the feed is less active right now.',
  };
}

function ActivityPill({ timestamp }: { timestamp: number }) {
  const state = getActivityState(timestamp);

  return (
    <Tooltip
      label="Activity"
      ariaLabel={`${state.label} activity status`}
      trigger={
        <span
          className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${state.className}`}
        >
          <Activity size={11} />
          {state.label}
        </span>
      }
      triggerClassName="inline-flex"
    >
      {state.tooltip}
    </Tooltip>
  );
}

function RankChip({ rank }: { rank: number }) {
  return (
    <div className="cyber-control inline-flex h-9 min-w-[2.75rem] items-center justify-center px-2 font-mono text-xs font-semibold text-white/72">
      {rank === 1 ? <Crown size={14} className="text-amber-300" /> : `#${rank}`}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="cyber-panel flex flex-col items-start gap-4 p-5 md:p-6">
      <div className="cyber-command text-[10px] text-red-300">System Alert</div>
      <div className="text-lg font-semibold text-white">Could not load star traders</div>
      <p className="max-w-2xl text-sm leading-relaxed text-white/55">{message}</p>
      <button type="button" onClick={onRetry} className="cyber-control px-4 py-2 text-sm font-semibold text-white">
        Retry
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="cyber-panel flex flex-col items-center justify-center px-6 py-14 text-center">
      <Users size={34} className="mb-4 text-white/28" />
      <div className="mb-2 text-lg font-semibold text-white">No star traders available yet</div>
      <p className="max-w-lg text-sm leading-relaxed text-white/50">
        This page lists the tracked wallets you can compare and follow in Demo Vault. Once traders are available, you
        will be able to sort them by performance or recent activity.
      </p>
    </div>
  );
}

export default function StarTradersListPage() {
  const [traders, setTraders] = useState<StarTrader[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [filterKey, setFilterKey] = useState<FilterKey>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const { step: onboardingStep, setStep } = useOnboarding();

  const walletAddress = user?.wallet || null;

  const fetchTraders = async (background = false) => {
    if (background && traders.length > 0) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const url = walletAddress ? `/api/star-traders?userWallet=${walletAddress}` : '/api/star-traders';
      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      setTraders(data.traders || []);
    } catch {
      setError('The trader list could not be refreshed. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchTraders(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  const baseRanks = useMemo(() => {
    return new Map(traders.map((trader, index) => [trader.wallet, index + 1]));
  }, [traders]);

  const filteredTraders = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    let next = [...traders];

    if (normalizedSearch) {
      next = next.filter((trader) =>
        trader.name.toLowerCase().includes(normalizedSearch) ||
        trader.wallet.toLowerCase().includes(normalizedSearch),
      );
    }

    if (filterKey === 'active') {
      next = next.filter((trader) => isRecentlyActive(trader.stats?.lastTradeTime));
    } else if (filterKey === 'following') {
      next = next.filter((trader) => trader.isFollowing);
    }

    switch (sortKey) {
      case 'pnl7d':
        next.sort((left, right) => (right.stats?.pnl7d ?? 0) - (left.stats?.pnl7d ?? 0));
        break;
      case 'winRate':
        next.sort((left, right) => (right.stats?.winRate ?? 0) - (left.stats?.winRate ?? 0));
        break;
      case 'profitFactor':
        next.sort((left, right) => (right.stats?.profitFactor ?? 0) - (left.stats?.profitFactor ?? 0));
        break;
      case 'lastActive':
        next.sort((left, right) => (right.stats?.lastTradeTime ?? 0) - (left.stats?.lastTradeTime ?? 0));
        break;
      case 'followers':
        next.sort((left, right) => (right.stats?.followerCount ?? 0) - (left.stats?.followerCount ?? 0));
        break;
      case 'rank':
      default:
        break;
    }

    return next;
  }, [filterKey, searchTerm, sortKey, traders]);

  const summary = useMemo(() => {
    const activeRecently = traders.filter((trader) => isRecentlyActive(trader.stats?.lastTradeTime)).length;
    const profitableThisWeek = traders.filter((trader) => (trader.stats?.pnl7d ?? 0) > 0).length;
    const followingCount = traders.filter((trader) => trader.isFollowing).length;
    const bestTrader = [...traders].sort((left, right) => (right.stats?.pnl7d ?? 0) - (left.stats?.pnl7d ?? 0))[0] ?? null;

    return {
      trackedCount: traders.length,
      activeRecently,
      profitableThisWeek,
      followingCount,
      bestTrader,
    };
  }, [traders]);

  const handleFollow = (traderWallet: string) => {
    if (!isAuthenticated) {
      router.push('/demo-vault');
      return;
    }

    if (onboardingStep === 'TOUR') {
      setStep('ALLOCATE');
    }

    router.push(`/demo-vault?follow=${traderWallet}`);
  };

  const handleView = (traderWallet: string) => {
    router.push(`/star-traders/${traderWallet}`);
  };

  const renderFollowButton = (trader: StarTrader, highlight = false, fullWidth = false) => {
    if (trader.isFollowing) {
      return (
        <button
          type="button"
          className={`cyber-control inline-flex items-center justify-center gap-2 border-cyan-300/45 bg-cyan-300/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300 ${
            fullWidth ? 'w-full' : ''
          }`.trim()}
        >
          <UserCheck size={14} />
          Following
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          handleFollow(trader.wallet);
        }}
        className={`cyber-action-primary inline-flex items-center justify-center gap-2 border border-cyan-300/40 bg-cyan-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-black transition hover:brightness-105 active:scale-[0.98] ${
          highlight ? 'ring-2 ring-emerald-400/70 ring-offset-2 ring-offset-black' : ''
        } ${fullWidth ? 'w-full' : ''}`.trim()}
      >
        <UserPlus size={14} />
        Follow
      </button>
    );
  };

  if (loading && traders.length === 0 && !error) {
    return <PageLoader />;
  }

  return (
    <div className="cyber-vault-shell min-h-screen pt-20">
      <main className="cyber-vault-content px-4 pb-10 md:px-6">
        <section className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_340px]">
          <div className="cyber-panel overflow-hidden p-5 md:p-6">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#00FF85]/70 to-transparent opacity-70" />
            <div className="relative flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <div className="cyber-command text-[10px] text-[#00E5D4]">Discovery Terminal</div>
                  <p className="cyber-command text-[11px] leading-[1.9] text-white/72 md:text-[12px]">
                    Select from high-performance{' '}
                    <span className="border border-[#00FF85]/28 bg-[#00FF85]/8 px-2 py-0.5 text-[1em] font-semibold uppercase tracking-[0.18em] text-[#00FF85]">
                      Star Traders
                    </span>, view on-chain history and analysis before allocating.
                  </p>
                </div>
                <div className="cyber-panel-soft mt-1 border p-3 md:p-4">
                  <div className="flex flex-col gap-3">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
                      <label className="cyber-control flex w-full items-center gap-2 px-3 py-2 text-sm text-white/60">
                        <Search size={14} className="text-white/35" />
                        <input
                          value={searchTerm}
                          onChange={(event) => setSearchTerm(event.target.value)}
                          placeholder="Search name or wallet"
                          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                        />
                      </label>

                      <span className="text-xs text-white/35 lg:text-right">
                        Showing {filteredTraders.length} of {traders.length}
                      </span>

                      <button
                        type="button"
                        onClick={() => void fetchTraders(true)}
                        disabled={loading || refreshing}
                        className="cyber-control inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white"
                      >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Refreshing' : 'Refresh'}
                      </button>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="cyber-command text-[10px] text-white/45">Sort By</span>
                        {SORT_OPTIONS.map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => setSortKey(option.key)}
                            className={`cyber-control px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] ${
                              sortKey === option.key
                                ? 'border-emerald-300/80 text-black shadow-[0_0_0_1px_rgba(0,255,133,0.2),0_0_18px_rgba(0,255,133,0.18)]'
                                : 'text-white/55'
                            }`}
                            style={
                              sortKey === option.key
                                ? {
                                    backgroundColor: '#00FF85',
                                    color: '#050505',
                                    boxShadow:
                                      '0 0 0 1px rgba(0,255,133,0.2), 0 0 18px rgba(0,255,133,0.18)',
                                  }
                                : undefined
                            }
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="cyber-command text-[10px] text-white/45">Filter</span>
                        {FILTER_OPTIONS.map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => setFilterKey(option.key)}
                            className={`cyber-control px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] ${
                              filterKey === option.key
                                ? 'border-cyan-300/80 text-black shadow-[0_0_0_1px_rgba(0,229,212,0.2),0_0_18px_rgba(0,229,212,0.18)]'
                                : 'text-white/55'
                            }`}
                            style={
                              filterKey === option.key
                                ? {
                                    backgroundColor: '#00E5D4',
                                    color: '#050505',
                                    boxShadow:
                                      '0 0 0 1px rgba(0,229,212,0.2), 0 0 18px rgba(0,229,212,0.18)',
                                  }
                                : undefined
                            }
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
            </div>
          </div>

          <section className="cyber-panel-soft border p-4 md:p-5">
            <div className="cyber-command mb-3 text-[10px] text-[#00E5D4]">Current Lead</div>
            {summary.bestTrader ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <TraderAvatar
                      address={summary.bestTrader.wallet}
                      image={summary.bestTrader.image}
                      className="h-11 w-11"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-white">{summary.bestTrader.name}</div>
                      <div className="truncate font-mono text-[11px] text-white/38">
                        {truncateWallet(summary.bestTrader.wallet)}
                      </div>
                    </div>
                  </div>
                  <ActivityPill timestamp={summary.bestTrader.stats?.lastTradeTime ?? 0} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-white/10 bg-black/35 px-3 py-3">
                    <div className="cyber-command text-[9px] text-white/35">7D PnL</div>
                    <div className={`mt-2 font-mono text-lg font-semibold ${(summary.bestTrader.stats?.pnl7d ?? 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                      {(summary.bestTrader.stats?.pnl7d ?? 0) >= 0 ? '+' : ''}
                      {formatUsd(summary.bestTrader.stats?.pnl7d ?? 0)}
                    </div>
                  </div>
                  <div className="border border-white/10 bg-black/35 px-3 py-3">
                    <div className="cyber-command text-[9px] text-white/35">Win Rate</div>
                    <div className="mt-2 font-mono text-lg font-semibold text-white">
                      {summary.bestTrader.stats?.winRate ?? 0}%
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 text-xs text-white/45">
                  <div className="inline-flex items-center gap-1.5">
                    <Users size={12} />
                    {summary.bestTrader.stats?.followerCount ?? 0} followers
                  </div>
                  <button
                    type="button"
                    onClick={() => handleView(summary.bestTrader.wallet)}
                    className="inline-flex items-center gap-1.5 text-[#00E5D4] transition hover:text-white"
                  >
                    View analysis
                    <ArrowUpRight size={13} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-white/45">No leading trader is available yet.</div>
            )}
          </section>
        </section>

        {error && traders.length === 0 ? (
          <ErrorState message={error} onRetry={() => void fetchTraders(false)} />
        ) : (
          <>
            {error && traders.length > 0 && (
              <div className="cyber-panel mb-4 flex items-center justify-between gap-3 px-4 py-3">
                <p className="text-sm text-amber-200">
                  Refresh failed. Showing the last loaded trader list.
                </p>
                <button type="button" onClick={() => void fetchTraders(false)} className="cyber-control px-3 py-2 text-xs font-semibold text-white">
                  Retry
                </button>
              </div>
            )}

            {traders.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                {filteredTraders.length === 0 ? (
                  <div className="cyber-panel px-6 py-12 text-center">
                    <div className="mb-2 text-lg font-semibold text-white">No traders match this view</div>
                    <p className="text-sm leading-relaxed text-white/50">
                      Try clearing the search or switching the active filter.
                    </p>
                  </div>
                ) : (
                  <>
                    <section className="cyber-panel hidden overflow-hidden border md:block">
                      <div className="cyber-table-header grid grid-cols-[72px_minmax(220px,1.25fr)_150px_110px_130px_120px_90px_148px] gap-3 px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-white/45">
                        <div>Rank</div>
                        <div>Trader</div>
                        <div className="text-right">7D PnL</div>
                        <div className="text-right">Win Rate</div>
                        <div className="flex items-center justify-end gap-1.5 text-right">
                          Profit Factor
                          <InfoTooltip>
                            Profit factor shows how much a trader gains for every dollar lost. Higher values usually indicate more efficient trade outcomes.
                          </InfoTooltip>
                        </div>
                        <div className="flex items-center justify-end gap-1.5 text-right">
                          Last Active
                          <InfoTooltip>
                            Shows how recently the trader made an on-chain trade. Recent activity is useful when you want fresher opportunities.
                          </InfoTooltip>
                        </div>
                        <div className="text-right">Followers</div>
                        <div className="sr-only">Action</div>
                      </div>

                      <div className="grid gap-2 px-3 py-3 md:px-0">
                        {filteredTraders.map((trader, index) => {
                          const pnl7d = trader.stats?.pnl7d ?? 0;
                          const pnl7dPercent = trader.stats?.pnl7dPercent ?? 0;
                          const visibleRank = sortKey === 'rank' ? (baseRanks.get(trader.wallet) ?? index + 1) : index + 1;
                          const activityState = getActivityState(trader.stats?.lastTradeTime);

                          return (
                            <div
                              key={trader.wallet}
                              role="button"
                              tabIndex={0}
                              onClick={() => handleView(trader.wallet)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  handleView(trader.wallet);
                                }
                              }}
                              className="cyber-row grid cursor-pointer gap-3 border border-white/[0.08] px-5 py-4 md:grid-cols-[72px_minmax(220px,1.25fr)_150px_110px_130px_120px_90px_148px] md:items-center md:border-x-0"
                            >
                              <div className="flex items-center gap-2 font-mono text-sm text-white/60">
                                <RankChip rank={visibleRank} />
                              </div>

                              <div className="flex min-w-0 items-center gap-3">
                                <TraderAvatar address={trader.wallet} image={trader.image} className="h-9 w-9" />
                                <div className="min-w-0">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <div className="truncate text-sm font-semibold text-white">{trader.name}</div>
                                    <ActivityPill timestamp={trader.stats?.lastTradeTime ?? 0} />
                                  </div>
                                  <div className="mt-1 truncate font-mono text-[11px] text-white/38">
                                    {truncateWallet(trader.wallet)}
                                  </div>
                                </div>
                              </div>

                              <div className="text-right">
                                <div className={`font-mono text-sm font-semibold tabular-nums ${pnl7d >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                                  {pnl7d >= 0 ? '+' : ''}
                                  {formatUsd(pnl7d)}
                                </div>
                                <div className="mt-1 font-mono text-[11px] text-white/38">
                                  {pnl7dPercent >= 0 ? '+' : ''}
                                  {pnl7dPercent.toFixed(1)}%
                                </div>
                              </div>

                              <div className="text-right font-mono text-sm text-white tabular-nums">
                                {trader.stats?.winRate ?? 0}%
                              </div>

                              <div className={`text-right font-mono text-sm tabular-nums ${(trader.stats?.profitFactor ?? 0) >= 1 ? 'text-emerald-300' : 'text-red-300'}`}>
                                {(trader.stats?.profitFactor ?? 0).toFixed(2)}x
                              </div>

                              <div className={`text-right font-mono text-sm tabular-nums ${activityState.emphasisClassName}`}>
                                {formatRelativeTime(trader.stats?.lastTradeTime)}
                              </div>

                              <div className="text-right font-mono text-sm text-white tabular-nums">
                                {trader.stats?.followerCount ?? 0}
                              </div>

                              <div className="flex justify-end">
                                {renderFollowButton(
                                  trader,
                                  onboardingStep === 'TOUR' && visibleRank === 1 && !trader.isFollowing,
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    <section className="grid gap-3 md:hidden">
                      {filteredTraders.map((trader, index) => {
                        const pnl7d = trader.stats?.pnl7d ?? 0;
                        const visibleRank = sortKey === 'rank' ? (baseRanks.get(trader.wallet) ?? index + 1) : index + 1;
                        const activityState = getActivityState(trader.stats?.lastTradeTime);

                        return (
                          <div
                            key={trader.wallet}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleView(trader.wallet)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                handleView(trader.wallet);
                              }
                            }}
                            className="cyber-panel-soft cyber-hover-slice border p-4"
                          >
                            <div className="mb-4 flex items-center justify-between gap-3">
                              <RankChip rank={visibleRank} />
                              <ActivityPill timestamp={trader.stats?.lastTradeTime ?? 0} />
                            </div>

                            <div className="mb-4 flex items-start justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <TraderAvatar address={trader.wallet} image={trader.image} className="h-11 w-11" />
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-white">{trader.name}</div>
                                  <div className="truncate font-mono text-[11px] text-white/38">
                                    {truncateWallet(trader.wallet)}
                                  </div>
                                </div>
                              </div>

                              <div className="border border-white/10 bg-black/45 px-3 py-2 text-right">
                                <div className="cyber-command text-[9px] text-white/35">7D PnL</div>
                                <div className={`mt-1 font-mono text-base font-semibold tabular-nums ${pnl7d >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                                  {pnl7d >= 0 ? '+' : ''}
                                  {formatUsd(pnl7d)}
                                </div>
                              </div>
                            </div>

                            <div className="mb-4 grid grid-cols-3 gap-2.5">
                              <div className="border border-white/8 bg-white/[0.02] px-3 py-2">
                                <div className="cyber-command mb-1 text-[9px] text-white/35">Win Rate</div>
                                <div className="font-mono text-sm text-white">{trader.stats?.winRate ?? 0}%</div>
                              </div>
                              <div className="border border-white/8 bg-white/[0.02] px-3 py-2">
                                <div className="cyber-command mb-1 text-[9px] text-white/35">Factor</div>
                                <div className={`font-mono text-sm ${(trader.stats?.profitFactor ?? 0) >= 1 ? 'text-emerald-300' : 'text-red-300'}`}>
                                  {(trader.stats?.profitFactor ?? 0).toFixed(2)}x
                                </div>
                              </div>
                              <div className="border border-white/8 bg-white/[0.02] px-3 py-2">
                                <div className="cyber-command mb-1 text-[9px] text-white/35">Followers</div>
                                <div className="font-mono text-sm text-white">{trader.stats?.followerCount ?? 0}</div>
                              </div>
                            </div>

                            <div className="mb-4 flex items-center justify-between text-xs text-white/42">
                              <div className="inline-flex items-center gap-1.5">
                                <TrendingUp size={12} />
                                {((trader.stats?.pnl7dPercent ?? 0) >= 0) ? '+' : ''}
                                {(trader.stats?.pnl7dPercent ?? 0).toFixed(1)}%
                              </div>
                              <div className={`inline-flex items-center gap-1.5 ${activityState.emphasisClassName}`}>
                                <Activity size={12} />
                                {formatRelativeTime(trader.stats?.lastTradeTime)}
                              </div>
                            </div>

                            {renderFollowButton(
                              trader,
                              onboardingStep === 'TOUR' && visibleRank === 1 && !trader.isFollowing,
                              true,
                            )}
                          </div>
                        );
                      })}
                    </section>
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
