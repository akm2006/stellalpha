import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/services/token-service', () => ({
  getSolPrice: vi.fn(),
  getUsdValue: vi.fn(),
}));

import {
  resolveGuardedHybridExecutionInputSol,
  resolveGuardedHybridIntentHint,
  resolveTargetBuyPctWithCapExecutionInputSol,
  resolveTargetBuyPctWithCapIntentHint,
} from './buy-sizing';

describe('live-pilot execution buy sizing', () => {
  it('uses bounded intent hints so Redis producers do not need wallet balance RPC', () => {
    expect(resolveTargetBuyPctWithCapIntentHint({ targetBuyPct: 5, maxBuyPct: 2 }).copyRatio)
      .toBeCloseTo(0.02, 8);
    expect(resolveGuardedHybridIntentHint({
      baseBuyPct: 0.35,
      maxBuyPct: 0.75,
      maxMintExposurePct: 2.5,
      maxDcaBuysPerMint: 1,
      dcaSecondBuyPct: 0.1,
      dcaThirdBuyPct: 0.1,
      newPositionMaxAgeMs: 2500,
    }).copyRatio).toBeCloseTo(0.0075, 8);
  });

  it('resolves target/cap execution spend from leader SOL input and deployable cap', () => {
    const result = resolveTargetBuyPctWithCapExecutionInputSol({
      leaderInputSol: 0.3,
      deployableSol: 0.5,
      config: { targetBuyPct: 5, maxBuyPct: 2 },
    });

    expect(result).toBeCloseTo(0.01, 8);
  });

  it('resolves guarded hybrid execution spend from leader SOL input and profile caps', () => {
    const result = resolveGuardedHybridExecutionInputSol({
      leaderInputSol: 4,
      deployableSol: 0.3,
      config: {
        baseBuyPct: 0.35,
        maxBuyPct: 0.75,
        maxMintExposurePct: 2.5,
        maxDcaBuysPerMint: 1,
        dcaSecondBuyPct: 0.1,
        dcaThirdBuyPct: 0.1,
        newPositionMaxAgeMs: 2500,
      },
      copiedCostUsd: 0,
      activeLeaderBuyCount: 1,
      solPrice: 100,
    });

    expect(result).toBeCloseTo(0.00225, 8);
  });
});
