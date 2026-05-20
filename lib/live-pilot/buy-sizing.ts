import { PublicKey, type Connection } from '@solana/web3.js';
import type {
  FixedAvailablePctCopyModelConfig,
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

function clampRatio(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampPercent(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.max(0.1, Math.min(100, parsed));
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
  if (!args.connection) {
    return {
      copyRatio: 0,
      skipReason: 'target_sizing_rpc_unavailable',
      deployableSolAtIntent: null,
      solPriceAtIntent: null,
      leaderUsdValue: null,
    };
  }

  const [leaderUsdValue, solPrice, lamports] = await Promise.all([
    getUsdValue(args.trade.tokenInMint, args.trade.tokenInAmount),
    getSolPrice(),
    args.connection.getBalance(new PublicKey(args.wallet.publicKey), 'confirmed'),
  ]);

  if (!Number.isFinite(leaderUsdValue) || leaderUsdValue <= 0) {
    return {
      copyRatio: 0,
      skipReason: 'zero_leader_usd_value',
      deployableSolAtIntent: null,
      solPriceAtIntent: solPrice,
      leaderUsdValue,
    };
  }

  const walletBalanceSol = lamports / 1e9;
  const reserveSol = Math.max(
    walletBalanceSol * args.wallet.feeReservePct,
    args.wallet.minFeeReserveSol,
  );
  const deployableSol = Math.max(0, walletBalanceSol - reserveSol);
  const deployableUsd = deployableSol * solPrice;

  if (!Number.isFinite(deployableUsd) || deployableUsd <= 0) {
    return {
      copyRatio: 0,
      skipReason: 'insufficient_deployable_sol',
      deployableSolAtIntent: deployableSol,
      solPriceAtIntent: solPrice,
      leaderUsdValue,
    };
  }

  const targetPct = clampPercent(args.config.targetBuyPct) / 100;
  const maxPct = clampPercent(args.config.maxBuyPct) / 100;
  const targetSpendUsd = leaderUsdValue * targetPct;
  const cappedSpendUsd = Math.min(targetSpendUsd, deployableUsd * maxPct);
  const copyRatio = clampRatio(cappedSpendUsd / deployableUsd);

  return {
    copyRatio,
    skipReason: copyRatio > 0 ? null : 'zero_model_spend',
    deployableSolAtIntent: deployableSol,
    solPriceAtIntent: solPrice,
    leaderUsdValue,
  };
}
