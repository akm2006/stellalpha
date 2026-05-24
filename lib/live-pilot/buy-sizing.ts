import { PublicKey, type Connection } from '@solana/web3.js';
import type {
  FixedAvailablePctCopyModelConfig,
  GuardedHybridCopyModelConfig,
  TargetBuyPctWithCapCopyModelConfig,
} from '@/lib/copy-models/types';
import { getSolPrice, getUsdValue } from '@/lib/services/token-service';
import type { PilotWalletConfigSummary } from '@/lib/live-pilot/types';
import type { RawTrade } from '@/lib/trade-parser';

export interface LiveBuySizingResult {
  copyRatio: number;
  skipReason: string | null;
  deployableSolAtIntent: number | null;
  solPriceAtIntent: number | null;
  leaderUsdValue: number | null;
}

export interface GuardedHybridCopyStateInput {
  leaderOpenAmount?: number | null;
  copiedOpenAmount?: number | null;
  copiedCostUsd?: number | null;
  activeLeaderBuyCount?: number | null;
}

export interface GuardedHybridPreflightResult {
  skipReason: string | null;
  isNewPosition: boolean;
  activeLeaderBuyCount: number;
}

function clampRatio(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampPercent(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.max(0.1, Math.min(100, parsed));
}

function clampInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

async function getDeployableUsd(args: {
  wallet: PilotWalletConfigSummary;
  connection: Connection | null;
}) {
  if (!args.connection) {
    return {
      skipReason: 'buy_sizing_rpc_unavailable',
      deployableSol: null,
      deployableUsd: null,
      solPrice: null,
    };
  }

  const [solPrice, lamports] = await Promise.all([
    getSolPrice(),
    args.connection.getBalance(new PublicKey(args.wallet.publicKey), 'confirmed'),
  ]);

  const walletBalanceSol = lamports / 1e9;
  const reserveSol = Math.max(
    walletBalanceSol * args.wallet.feeReservePct,
    args.wallet.minFeeReserveSol,
  );
  const deployableSol = Math.max(0, walletBalanceSol - reserveSol);
  const deployableUsd = deployableSol * solPrice;

  if (!Number.isFinite(deployableUsd) || deployableUsd <= 0) {
    return {
      skipReason: 'insufficient_deployable_sol',
      deployableSol,
      deployableUsd,
      solPrice,
    };
  }

  return {
    skipReason: null,
    deployableSol,
    deployableUsd,
    solPrice,
  };
}

export function resolveFixedAvailableLiveBuySizing(config: FixedAvailablePctCopyModelConfig): LiveBuySizingResult {
  const buyPct = clampPercent(config.buyPct);
  const copyRatio = clampRatio(buyPct / 100);
  return {
    copyRatio,
    skipReason: copyRatio > 0 ? null : 'zero_model_spend',
    deployableSolAtIntent: null,
    solPriceAtIntent: null,
    leaderUsdValue: null,
  };
}

export function resolveTargetBuyPctWithCapIntentHint(
  config: TargetBuyPctWithCapCopyModelConfig,
): LiveBuySizingResult {
  const copyRatio = clampRatio(clampPercent(config.maxBuyPct) / 100);
  return {
    copyRatio,
    skipReason: copyRatio > 0 ? null : 'zero_model_spend',
    deployableSolAtIntent: null,
    solPriceAtIntent: null,
    leaderUsdValue: null,
  };
}

export function resolveGuardedHybridIntentHint(
  config: GuardedHybridCopyModelConfig,
): LiveBuySizingResult {
  const copyRatio = clampRatio(clampPercent(config.maxBuyPct) / 100);
  return {
    copyRatio,
    skipReason: copyRatio > 0 ? null : 'zero_model_spend',
    deployableSolAtIntent: null,
    solPriceAtIntent: null,
    leaderUsdValue: null,
  };
}

export function resolveTargetBuyPctWithCapExecutionInputSol(args: {
  leaderInputSol: number | null;
  deployableSol: number;
  config: TargetBuyPctWithCapCopyModelConfig;
}) {
  if (!Number.isFinite(args.leaderInputSol) || !args.leaderInputSol || args.leaderInputSol <= 0) {
    return null;
  }

  const targetPct = clampPercent(args.config.targetBuyPct) / 100;
  const maxPct = clampPercent(args.config.maxBuyPct) / 100;
  const targetInputSol = args.leaderInputSol * targetPct;
  const maxInputSol = args.deployableSol * maxPct;
  return Math.max(0, Math.min(targetInputSol, maxInputSol));
}

export function resolveGuardedHybridLiveBuyPreflight(args: {
  config: GuardedHybridCopyModelConfig;
  tradeAgeMs: number;
  copyState?: GuardedHybridCopyStateInput | null;
}): GuardedHybridPreflightResult {
  const state = args.copyState || {};
  const copiedOpenAmount = Math.max(0, Number(state.copiedOpenAmount || 0));
  const copiedCostUsd = Math.max(0, Number(state.copiedCostUsd || 0));
  const isNewPosition = copiedOpenAmount <= 0.000000001 && copiedCostUsd <= 0.000000001;
  const newPositionMaxAgeMs = clampInteger(args.config.newPositionMaxAgeMs, 3_000, 500, 10_000);
  const activeLeaderBuyCount = Math.max(
    1,
    clampInteger(
      state.activeLeaderBuyCount,
      Number(state.leaderOpenAmount || 0) > 0 ? 2 : 1,
      1,
      100,
    ),
  );

  if (isNewPosition && activeLeaderBuyCount > 1) {
    return { skipReason: 'missed_initial_entry', isNewPosition, activeLeaderBuyCount };
  }

  if (isNewPosition && args.tradeAgeMs > newPositionMaxAgeMs) {
    return { skipReason: 'stale_new_position_buy', isNewPosition, activeLeaderBuyCount };
  }

  const maxDcaBuys = clampInteger(args.config.maxDcaBuysPerMint, 3, 1, 20);
  if (activeLeaderBuyCount > maxDcaBuys) {
    return { skipReason: 'max_dca_buys_reached', isNewPosition, activeLeaderBuyCount };
  }

  return { skipReason: null, isNewPosition, activeLeaderBuyCount };
}

export function resolveGuardedHybridExecutionInputSol(args: {
  leaderInputSol: number | null;
  deployableSol: number;
  config: GuardedHybridCopyModelConfig;
  copiedCostUsd?: number | null;
  activeLeaderBuyCount?: number | null;
  solPrice?: number | null;
}) {
  if (!Number.isFinite(args.leaderInputSol) || !args.leaderInputSol || args.leaderInputSol <= 0) {
    return null;
  }

  const baseBuyPct = clampPercent(args.config.baseBuyPct) / 100;
  const maxBuyPct = clampPercent(args.config.maxBuyPct) / 100;
  const maxMintExposurePct = clampPercent(args.config.maxMintExposurePct) / 100;
  const secondMultiplier = clampPercent(args.config.dcaSecondBuyPct) / 100;
  const thirdMultiplier = clampPercent(args.config.dcaThirdBuyPct) / 100;
  const activeLeaderBuyCount = Math.max(
    1,
    clampInteger(args.activeLeaderBuyCount, 1, 1, 100),
  );

  let proposedInputSol = Math.min(
    args.leaderInputSol * baseBuyPct,
    args.deployableSol * maxBuyPct,
  );

  if (activeLeaderBuyCount === 2) {
    proposedInputSol *= secondMultiplier;
  } else if (activeLeaderBuyCount >= 3) {
    proposedInputSol *= thirdMultiplier;
  }

  const copiedCostUsd = Math.max(0, Number(args.copiedCostUsd || 0));
  const solPrice = Number(args.solPrice || 0);
  if (copiedCostUsd > 0 && Number.isFinite(solPrice) && solPrice > 0) {
    const maxMintExposureSol = args.deployableSol * maxMintExposurePct;
    const remainingMintExposureSol = maxMintExposureSol - copiedCostUsd / solPrice;
    if (remainingMintExposureSol <= 0) {
      return 0;
    }
    proposedInputSol = Math.min(proposedInputSol, remainingMintExposureSol);
  }

  return Math.max(0, proposedInputSol);
}

export async function resolveTargetBuyPctWithCapLiveBuySizing(args: {
  trade: RawTrade;
  wallet: PilotWalletConfigSummary;
  config: TargetBuyPctWithCapCopyModelConfig;
  connection: Connection | null;
}): Promise<LiveBuySizingResult> {
  const [deployable, leaderUsdValue] = await Promise.all([
    getDeployableUsd(args),
    getUsdValue(args.trade.tokenInMint, args.trade.tokenInAmount),
  ]);
  if (deployable.skipReason) {
    return {
      copyRatio: 0,
      skipReason: deployable.skipReason === 'buy_sizing_rpc_unavailable'
        ? 'target_sizing_rpc_unavailable'
        : deployable.skipReason,
      deployableSolAtIntent: deployable.deployableSol,
      solPriceAtIntent: deployable.solPrice,
      leaderUsdValue: null,
    };
  }

  if (!Number.isFinite(leaderUsdValue) || leaderUsdValue <= 0) {
    return {
      copyRatio: 0,
      skipReason: 'zero_leader_usd_value',
      deployableSolAtIntent: null,
      solPriceAtIntent: deployable.solPrice,
      leaderUsdValue,
    };
  }

  const targetPct = clampPercent(args.config.targetBuyPct) / 100;
  const maxPct = clampPercent(args.config.maxBuyPct) / 100;
  const targetSpendUsd = leaderUsdValue * targetPct;
  const cappedSpendUsd = Math.min(targetSpendUsd, deployable.deployableUsd! * maxPct);
  const copyRatio = clampRatio(cappedSpendUsd / deployable.deployableUsd!);

  return {
    copyRatio,
    skipReason: copyRatio > 0 ? null : 'zero_model_spend',
    deployableSolAtIntent: deployable.deployableSol,
    solPriceAtIntent: deployable.solPrice,
    leaderUsdValue,
  };
}

export async function resolveGuardedHybridLiveBuySizing(args: {
  trade: RawTrade;
  wallet: PilotWalletConfigSummary;
  config: GuardedHybridCopyModelConfig;
  connection: Connection | null;
  tradeAgeMs: number;
  copyState?: GuardedHybridCopyStateInput | null;
}): Promise<LiveBuySizingResult> {
  const preflight = resolveGuardedHybridLiveBuyPreflight({
    config: args.config,
    tradeAgeMs: args.tradeAgeMs,
    copyState: args.copyState,
  });
  if (preflight.skipReason) {
    return {
      copyRatio: 0,
      skipReason: preflight.skipReason,
      deployableSolAtIntent: null,
      solPriceAtIntent: null,
      leaderUsdValue: null,
    };
  }

  const [deployable, leaderUsdValue] = await Promise.all([
    getDeployableUsd(args),
    getUsdValue(args.trade.tokenInMint, args.trade.tokenInAmount),
  ]);
  if (deployable.skipReason) {
    return {
      copyRatio: 0,
      skipReason: deployable.skipReason === 'buy_sizing_rpc_unavailable'
        ? 'guarded_sizing_rpc_unavailable'
        : deployable.skipReason,
      deployableSolAtIntent: deployable.deployableSol,
      solPriceAtIntent: deployable.solPrice,
      leaderUsdValue: null,
    };
  }

  if (!Number.isFinite(leaderUsdValue) || leaderUsdValue <= 0) {
    return {
      copyRatio: 0,
      skipReason: 'zero_leader_usd_value',
      deployableSolAtIntent: deployable.deployableSol,
      solPriceAtIntent: deployable.solPrice,
      leaderUsdValue,
    };
  }

  const copiedCostUsd = Math.max(0, Number(args.copyState?.copiedCostUsd || 0));
  const baseBuyPct = clampPercent(args.config.baseBuyPct) / 100;
  const maxBuyPct = clampPercent(args.config.maxBuyPct) / 100;
  const maxMintExposurePct = clampPercent(args.config.maxMintExposurePct) / 100;
  const secondMultiplier = clampPercent(args.config.dcaSecondBuyPct) / 100;
  const thirdMultiplier = clampPercent(args.config.dcaThirdBuyPct) / 100;

  const targetSpendUsd = leaderUsdValue * baseBuyPct;
  const maxSpendUsd = deployable.deployableUsd! * maxBuyPct;
  let proposedSpendUsd = Math.min(targetSpendUsd, maxSpendUsd);

  if (preflight.activeLeaderBuyCount === 2) {
    proposedSpendUsd *= secondMultiplier;
  } else if (preflight.activeLeaderBuyCount >= 3) {
    proposedSpendUsd *= thirdMultiplier;
  }

  const maxMintExposureUsd = deployable.deployableUsd! * maxMintExposurePct;
  const remainingMintExposureUsd = maxMintExposureUsd - copiedCostUsd;
  if (remainingMintExposureUsd <= 0) {
    return {
      copyRatio: 0,
      skipReason: 'mint_exposure_cap_reached',
      deployableSolAtIntent: deployable.deployableSol,
      solPriceAtIntent: deployable.solPrice,
      leaderUsdValue,
    };
  }

  proposedSpendUsd = Math.min(proposedSpendUsd, remainingMintExposureUsd);
  const copyRatio = clampRatio(proposedSpendUsd / deployable.deployableUsd!);

  return {
    copyRatio,
    skipReason: copyRatio > 0 ? null : 'zero_model_spend',
    deployableSolAtIntent: deployable.deployableSol,
    solPriceAtIntent: deployable.solPrice,
    leaderUsdValue,
  };
}
