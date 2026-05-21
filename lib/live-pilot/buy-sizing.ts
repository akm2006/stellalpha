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
    return {
      copyRatio: 0,
      skipReason: 'missed_initial_entry',
      deployableSolAtIntent: null,
      solPriceAtIntent: null,
      leaderUsdValue: null,
    };
  }

  if (isNewPosition && args.tradeAgeMs > newPositionMaxAgeMs) {
    return {
      copyRatio: 0,
      skipReason: 'stale_new_position_buy',
      deployableSolAtIntent: null,
      solPriceAtIntent: null,
      leaderUsdValue: null,
    };
  }

  const maxDcaBuys = clampInteger(args.config.maxDcaBuysPerMint, 3, 1, 20);
  if (activeLeaderBuyCount > maxDcaBuys) {
    return {
      copyRatio: 0,
      skipReason: 'max_dca_buys_reached',
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

  const baseBuyPct = clampPercent(args.config.baseBuyPct) / 100;
  const maxBuyPct = clampPercent(args.config.maxBuyPct) / 100;
  const maxMintExposurePct = clampPercent(args.config.maxMintExposurePct) / 100;
  const secondMultiplier = clampPercent(args.config.dcaSecondBuyPct) / 100;
  const thirdMultiplier = clampPercent(args.config.dcaThirdBuyPct) / 100;

  const targetSpendUsd = leaderUsdValue * baseBuyPct;
  const maxSpendUsd = deployable.deployableUsd! * maxBuyPct;
  let proposedSpendUsd = Math.min(targetSpendUsd, maxSpendUsd);

  if (activeLeaderBuyCount === 2) {
    proposedSpendUsd *= secondMultiplier;
  } else if (activeLeaderBuyCount >= 3) {
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
