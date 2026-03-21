import { uniqueNamesGenerator, languages, starWars } from 'unique-names-generator';

export interface StarTraderStatsSummary {
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

export interface StarTraderStatsRow {
  wallet: string;
  total_pnl?: number | string | null;
  pnl_7d?: number | string | null;
  pnl_7d_percent?: number | string | null;
  win_rate?: number | string | null;
  wins?: number | string | null;
  losses?: number | string | null;
  trades_count?: number | string | null;
  follower_count?: number | string | null;
  total_allocated?: number | string | null;
  total_volume?: number | string | null;
  profit_factor?: number | string | null;
  last_trade_time?: number | string | null;
}

interface SortableTrader {
  stats: StarTraderStatsSummary;
}

const formatName = (value: string) =>
  value
    .split(' ')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

export function emptyStarTraderStats(): StarTraderStatsSummary {
  return {
    totalPnl: 0,
    pnl7d: 0,
    pnl7dPercent: 0,
    winRate: 0,
    wins: 0,
    losses: 0,
    tradesCount: 0,
    followerCount: 0,
    totalAllocated: 0,
    totalVolume: 0,
    profitFactor: 0,
    lastTradeTime: 0,
  };
}

export function normalizeStarTraderStatsRow(row?: StarTraderStatsRow | null): StarTraderStatsSummary {
  if (!row) {
    return emptyStarTraderStats();
  }

  return {
    totalPnl: Number(row.total_pnl || 0),
    pnl7d: Number(row.pnl_7d || 0),
    pnl7dPercent: Math.max(-100, Math.min(500, Number(row.pnl_7d_percent || 0))),
    winRate: Number(row.win_rate || 0),
    wins: Number(row.wins || 0),
    losses: Number(row.losses || 0),
    tradesCount: Number(row.trades_count || 0),
    followerCount: Number(row.follower_count || 0),
    totalAllocated: Number(row.total_allocated || 0),
    totalVolume: Number(row.total_volume || 0),
    profitFactor: Math.max(0, Math.min(50, Number(row.profit_factor || 0))),
    lastTradeTime: Number(row.last_trade_time || 0),
  };
}

export function createStarTraderStatsMap(
  wallets: string[],
  rows?: StarTraderStatsRow[] | null
): Record<string, StarTraderStatsSummary> {
  const statsMap: Record<string, StarTraderStatsSummary> = {};

  for (const wallet of wallets) {
    statsMap[wallet] = emptyStarTraderStats();
  }

  for (const row of rows || []) {
    statsMap[row.wallet] = normalizeStarTraderStatsRow(row);
  }

  return statsMap;
}

export function getStarTraderFallbackName(wallet: string): string {
  return formatName(
    uniqueNamesGenerator({
      dictionaries: [languages, starWars],
      separator: ' ',
      length: 2,
      seed: wallet,
    })
  );
}

export function getStarTraderFallbackImage(wallet: string): string {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${wallet}`;
}

export function getStarTraderCompositeScore(trader: SortableTrader): number {
  const { profitFactor, tradesCount, totalPnl } = trader.stats;

  if (tradesCount < 3) {
    return profitFactor * 0.1;
  }

  const tradeWeight = Math.log10(tradesCount + 1);
  const profitMultiplier = totalPnl > 0 ? Math.min(1 + totalPnl / 1000, 2) : 0.5;

  return profitFactor * tradeWeight * profitMultiplier;
}

export function sortStarTradersByCompositeScore<T extends SortableTrader>(traders: T[]): T[] {
  return [...traders].sort((left, right) => {
    return getStarTraderCompositeScore(right) - getStarTraderCompositeScore(left);
  });
}
