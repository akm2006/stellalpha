const POSITION_EPSILON = 1e-12;

export interface CopyPositionLifecycleSnapshot {
  leaderOpenAmount: number;
  copiedOpenAmount: number;
  copiedCostUsd: number;
  avgCostUsd: number;
}

export interface ObservedLeaderBuyTransition {
  leaderPositionBefore: number;
  leaderPositionAfter: number;
  copiedPositionBefore: number;
  next: CopyPositionLifecycleSnapshot;
}

export interface ObservedLeaderSellTransition {
  leaderPositionBefore: number;
  leaderPositionAfter: number;
  copiedPositionBefore: number;
  sellFraction: number;
  notFollowedPosition: boolean;
  next: CopyPositionLifecycleSnapshot;
}

export interface CopiedBuyTransition {
  copiedPositionBefore: number;
  copiedPositionAfter: number;
  copiedCostBefore: number;
  copiedCostAfter: number;
  avgCostUsd: number;
  next: CopyPositionLifecycleSnapshot;
}

export interface CopiedSellTransition {
  copiedPositionBefore: number;
  copiedPositionAfter: number;
  copiedCostBefore: number;
  copiedCostAfter: number;
  avgCostUsd: number;
  realizedCostUsd: number;
  next: CopyPositionLifecycleSnapshot;
}

function clampNonNegative(value: number) {
  if (!Number.isFinite(value) || value <= POSITION_EPSILON) {
    return 0;
  }

  return value;
}

function normalizeSnapshot(snapshot?: Partial<CopyPositionLifecycleSnapshot> | null): CopyPositionLifecycleSnapshot {
  const leaderOpenAmount = clampNonNegative(Number(snapshot?.leaderOpenAmount || 0));
  const copiedOpenAmount = clampNonNegative(Number(snapshot?.copiedOpenAmount || 0));
  const copiedCostUsd = clampNonNegative(Number(snapshot?.copiedCostUsd || 0));
  const avgCostUsd = copiedOpenAmount > 0 ? copiedCostUsd / copiedOpenAmount : 0;

  return {
    leaderOpenAmount,
    copiedOpenAmount,
    copiedCostUsd,
    avgCostUsd,
  };
}

export function createEmptyCopyPositionLifecycle(): CopyPositionLifecycleSnapshot {
  return normalizeSnapshot();
}

export function applyObservedLeaderBuy(
  snapshot: Partial<CopyPositionLifecycleSnapshot> | null | undefined,
  leaderBuyAmount: number,
): ObservedLeaderBuyTransition {
  const current = normalizeSnapshot(snapshot);
  const increment = clampNonNegative(leaderBuyAmount);
  const leaderPositionBefore = current.leaderOpenAmount;
  const leaderPositionAfter = leaderPositionBefore + increment;

  return {
    leaderPositionBefore,
    leaderPositionAfter,
    copiedPositionBefore: current.copiedOpenAmount,
    next: {
      ...current,
      leaderOpenAmount: leaderPositionAfter,
    },
  };
}

export function applyObservedLeaderSell(
  snapshot: Partial<CopyPositionLifecycleSnapshot> | null | undefined,
  leaderSellAmount: number,
): ObservedLeaderSellTransition {
  const current = normalizeSnapshot(snapshot);
  const sellAmount = clampNonNegative(leaderSellAmount);
  const leaderPositionBefore = current.leaderOpenAmount;
  const copiedPositionBefore = current.copiedOpenAmount;

  if (leaderPositionBefore <= 0 || sellAmount <= 0) {
    return {
      leaderPositionBefore,
      leaderPositionAfter: leaderPositionBefore,
      copiedPositionBefore,
      sellFraction: 0,
      notFollowedPosition: true,
      next: current,
    };
  }

  const sellFraction = Math.min(Math.max(sellAmount / leaderPositionBefore, 0), 1);
  const leaderPositionAfter = clampNonNegative(leaderPositionBefore - sellAmount);

  return {
    leaderPositionBefore,
    leaderPositionAfter,
    copiedPositionBefore,
    sellFraction,
    notFollowedPosition: copiedPositionBefore <= 0,
    next: {
      ...current,
      leaderOpenAmount: leaderPositionAfter,
    },
  };
}

export function applySuccessfulCopiedBuy(
  snapshot: Partial<CopyPositionLifecycleSnapshot> | null | undefined,
  copiedBuyAmount: number,
  copiedCostUsd: number,
): CopiedBuyTransition {
  const current = normalizeSnapshot(snapshot);
  const amount = clampNonNegative(copiedBuyAmount);
  const cost = clampNonNegative(copiedCostUsd);
  const copiedPositionBefore = current.copiedOpenAmount;
  const copiedCostBefore = current.copiedCostUsd;
  const copiedPositionAfter = copiedPositionBefore + amount;
  const copiedCostAfter = copiedCostBefore + cost;
  const avgCostUsd = copiedPositionAfter > 0 ? copiedCostAfter / copiedPositionAfter : 0;

  return {
    copiedPositionBefore,
    copiedPositionAfter,
    copiedCostBefore,
    copiedCostAfter,
    avgCostUsd,
    next: {
      ...current,
      copiedOpenAmount: copiedPositionAfter,
      copiedCostUsd: copiedCostAfter,
      avgCostUsd,
    },
  };
}

export function applySuccessfulCopiedSell(
  snapshot: Partial<CopyPositionLifecycleSnapshot> | null | undefined,
  copiedSellAmount: number,
): CopiedSellTransition {
  const current = normalizeSnapshot(snapshot);
  const requestedSellAmount = clampNonNegative(copiedSellAmount);
  const copiedPositionBefore = current.copiedOpenAmount;
  const copiedCostBefore = current.copiedCostUsd;
  const sellAmount = Math.min(requestedSellAmount, copiedPositionBefore);
  const avgCostUsd = current.avgCostUsd;
  const realizedCostUsd = sellAmount * avgCostUsd;
  const copiedPositionAfter = clampNonNegative(copiedPositionBefore - sellAmount);
  const copiedCostAfter = copiedPositionAfter > 0 ? copiedPositionAfter * avgCostUsd : 0;

  return {
    copiedPositionBefore,
    copiedPositionAfter,
    copiedCostBefore,
    copiedCostAfter,
    avgCostUsd: copiedPositionAfter > 0 ? avgCostUsd : 0,
    realizedCostUsd,
    next: {
      ...current,
      copiedOpenAmount: copiedPositionAfter,
      copiedCostUsd: copiedCostAfter,
      avgCostUsd: copiedPositionAfter > 0 ? avgCostUsd : 0,
    },
  };
}
