import { describe, expect, it } from 'vitest';

import {
  getDemoTradeCount,
  normalizeDemoTradeStatsRow,
} from '@/lib/demo-trade-stats';

describe('demo trade stats helpers', () => {
  it('prefers totalCount when present so overview and detail pages stay aligned', () => {
    const stats = normalizeDemoTradeStatsRow({
      trader_state_id: 'ts-1',
      total_count: '3663',
      completed_count: '3550',
      failed_count: '0',
      profitable_count: '1800',
      loss_count: '1750',
      avg_latency_ms: '4200',
      total_realized_pnl: '12.5',
      profit_factor: '1.02',
    });

    expect(stats.totalCount).toBe(3663);
    expect(stats.completedCount).toBe(3550);
    expect(stats.failedCount).toBe(0);
    expect(getDemoTradeCount(stats)).toBe(3663);
  });

  it('falls back to completed plus failed when totalCount is unavailable', () => {
    expect(
      getDemoTradeCount({
        completedCount: 12,
        failedCount: 3,
      })
    ).toBe(15);
  });
});
