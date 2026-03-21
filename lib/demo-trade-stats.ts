export interface DemoTradeStatsSummary {
  totalCount: number;
  completedCount: number;
  failedCount: number;
  avgLatency: number;
  totalRealizedPnl: number;
  profitableCount: number;
  lossCount: number;
  profitFactor: number;
}

export interface DemoTradeStatsRow {
  trader_state_id: string;
  total_count?: number | string | null;
  completed_count?: number | string | null;
  failed_count?: number | string | null;
  avg_latency_ms?: number | string | null;
  total_realized_pnl?: number | string | null;
  profitable_count?: number | string | null;
  loss_count?: number | string | null;
  profit_factor?: number | string | null;
}

export function emptyDemoTradeStats(): DemoTradeStatsSummary {
  return {
    totalCount: 0,
    completedCount: 0,
    failedCount: 0,
    avgLatency: 0,
    totalRealizedPnl: 0,
    profitableCount: 0,
    lossCount: 0,
    profitFactor: 0,
  };
}

export function normalizeDemoTradeStatsRow(row?: DemoTradeStatsRow | null): DemoTradeStatsSummary {
  if (!row) {
    return emptyDemoTradeStats();
  }

  return {
    totalCount: Number(row.total_count || 0),
    completedCount: Number(row.completed_count || 0),
    failedCount: Number(row.failed_count || 0),
    avgLatency: Math.round(Number(row.avg_latency_ms || 0)),
    totalRealizedPnl: Number(row.total_realized_pnl || 0),
    profitableCount: Number(row.profitable_count || 0),
    lossCount: Number(row.loss_count || 0),
    profitFactor: Number(row.profit_factor || 0),
  };
}

export function getDemoTradeCount(
  stats?: Partial<Pick<DemoTradeStatsSummary, 'totalCount' | 'completedCount' | 'failedCount'>> | null
): number {
  if (stats && typeof stats.totalCount === 'number' && Number.isFinite(stats.totalCount)) {
    return stats.totalCount;
  }

  const completedCount = Number(stats?.completedCount || 0);
  const failedCount = Number(stats?.failedCount || 0);

  return completedCount + failedCount;
}

export function createDemoTradeStatsMap(
  traderStateIds: string[],
  rows?: DemoTradeStatsRow[] | null
): Record<string, DemoTradeStatsSummary> {
  const statsMap: Record<string, DemoTradeStatsSummary> = {};

  for (const traderStateId of traderStateIds) {
    statsMap[traderStateId] = emptyDemoTradeStats();
  }

  for (const row of rows || []) {
    statsMap[row.trader_state_id] = normalizeDemoTradeStatsRow(row);
  }

  return statsMap;
}
