import { describe, expect, it } from 'vitest';
import { resolveDemoBuySpend } from '@/lib/copy-models/resolve-demo-buy-spend';

const leaderContext = {
  leaderBuyUsdValue: 80,
  leaderRawRatio: 0.5,
  leaderFinalRatio: 0.5,
  leaderMetric: 160,
  tradeAgeMs: 1000,
};

describe('resolveDemoBuySpend', () => {
  it('resolves current ratio buys from available cash', () => {
    const result = resolveDemoBuySpend({
      modelKey: 'current_ratio',
      modelConfig: {},
      availableCashUsd: 100,
      startingCapitalUsd: 100,
      leaderContext,
    });

    expect(result.buyAmount).toBe(50);
    expect(result.reason).toBeNull();
  });

  it('caps fixed starting capital buys by available cash', () => {
    const result = resolveDemoBuySpend({
      modelKey: 'fixed_starting_pct',
      modelConfig: { buyPct: 10 },
      availableCashUsd: 5,
      startingCapitalUsd: 100,
      leaderContext,
    });

    expect(result.buyAmount).toBe(5);
    expect(result.limitedByAvailableCash).toBe(true);
  });

  it('resolves target buy plus cap using both leader amount and follower cap', () => {
    const result = resolveDemoBuySpend({
      modelKey: 'target_buy_pct_with_cap',
      modelConfig: { targetBuyPct: 50, maxBuyPct: 10 },
      availableCashUsd: 100,
      startingCapitalUsd: 100,
      leaderContext,
    });

    expect(result.buyAmount).toBe(10);
    expect(result.limitedByAvailableCash).toBe(true);
  });

  it('resolves hybrid buys using the leader ratio inside the envelope', () => {
    const result = resolveDemoBuySpend({
      modelKey: 'hybrid_envelope_leader_ratio',
      modelConfig: { envelopePct: 10 },
      availableCashUsd: 100,
      startingCapitalUsd: 100,
      leaderContext,
    });

    expect(result.buyAmount).toBe(5);
    expect(result.reason).toBeNull();
  });
});
