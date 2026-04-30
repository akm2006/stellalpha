import type { FixedAvailablePctCopyModelConfig } from '@/lib/copy-models/types';
import { BUY_STALENESS_THRESHOLD_MS } from '@/lib/ingestion/copy-signal';
import {
  classifyTradeSource,
  formatTradeSourceClassification,
  type TradeSourceClassification,
} from '@/lib/ingestion/trade-source-classifier';
import { findPilotWalletForStarTrader, getLivePilotPublicConfig } from '@/lib/live-pilot/config';
import type { PilotTradeRow, PilotWalletConfigSummary } from '@/lib/live-pilot/types';
import { getTokenSymbol } from '@/lib/services/token-service';
import type { RawTrade } from '@/lib/trade-parser';
import {
  extractMeteoraDammV2CandidatePools,
  isMeteoraDammV2Source,
} from '@/lib/live-pilot/meteora-damm-v2-cache';
import { getRedisPilotControlSnapshot } from './control-snapshot';
import { isLivePilotRedisAvailable, livePilotRedisConfig } from './config';
import {
  pilotTradeToRedisIntent,
  publishLivePilotRedisAudit,
  publishLivePilotRedisIntent,
} from './streams';
import {
  getRedisMintQuarantine,
  recordRedisObservedLeaderBuy,
  recordRedisObservedLeaderSell,
} from './state';

function toIso(ms: number) {
  return new Date(ms).toISOString();
}

function toBlockTimestampIso(timestampSeconds: number) {
  return new Date(timestampSeconds * 1000).toISOString();
}

function buildSyntheticTradeId(walletAlias: string, signature: string, leaderType: string) {
  return `redis:${walletAlias}:${signature}:${leaderType}`;
}

function resolveRedisLiveBuyCopyRatio(pilotWallet: PilotWalletConfigSummary) {
  if (pilotWallet.buyModelKey !== 'fixed_available_pct') {
    return {
      copyRatio: 0,
      skipReason: 'redis_current_ratio_unsupported',
    };
  }

  const buyPct = Number((pilotWallet.buyModelConfig as FixedAvailablePctCopyModelConfig).buyPct || 0);
  const copyRatio = Math.min(Math.max(buyPct / 100, 0), 1);
  return {
    copyRatio,
    skipReason: copyRatio > 0 ? null : 'zero_model_spend',
  };
}

type RedisPilotIntentResult = {
  considered: boolean;
  created: boolean;
  duplicate: boolean;
  status?: 'queued' | 'skipped';
  skipReason?: string;
  trade?: PilotTradeRow;
};

function baseTradeRow(args: {
  pilotWallet: PilotWalletConfigSummary;
  trade: RawTrade;
  receivedAt: number;
  copyRatio: number;
  status: PilotTradeRow['status'];
  skipReason?: string | null;
  errorMessage?: string | null;
  leaderPositionBefore?: number | null;
  leaderPositionAfter?: number | null;
  copiedPositionBefore?: number | null;
  sellFraction?: number | null;
}): PilotTradeRow {
  const now = new Date().toISOString();
  return {
    id: buildSyntheticTradeId(args.pilotWallet.alias, args.trade.signature, args.trade.type),
    wallet_alias: args.pilotWallet.alias,
    wallet_public_key: args.pilotWallet.publicKey,
    trigger_kind: 'copy',
    trigger_reason: 'leader_trade',
    star_trader: args.trade.wallet,
    star_trade_signature: args.trade.signature,
    leader_type: args.trade.type,
    token_in_mint: args.trade.tokenInMint || null,
    token_out_mint: args.trade.tokenOutMint || null,
    copy_ratio: args.copyRatio,
    leader_position_before: args.leaderPositionBefore ?? null,
    leader_position_after: args.leaderPositionAfter ?? null,
    copied_position_before: args.copiedPositionBefore ?? null,
    copied_position_after: null,
    sell_fraction: args.sellFraction ?? null,
    leader_block_timestamp: toBlockTimestampIso(args.trade.timestamp),
    received_at: toIso(args.receivedAt),
    intent_created_at: now,
    quote_received_at: null,
    tx_built_at: null,
    tx_submitted_at: null,
    tx_signature: null,
    tx_confirmed_at: null,
    confirmation_slot: null,
    quoted_input_amount: null,
    quoted_output_amount: null,
    quoted_input_amount_raw: null,
    actual_input_amount: null,
    actual_output_amount: null,
    price_impact_pct: null,
    deployable_sol_at_intent: null,
    sol_price_at_intent: null,
    next_retry_at: null,
    attempt_count: 0,
    winning_attempt_id: null,
    status: args.status,
    skip_reason: args.skipReason ?? null,
    error_message: args.errorMessage ?? null,
    created_at: now,
    updated_at: now,
  };
}

export async function maybeCreateRedisPilotIntent(
  trade: RawTrade,
  receivedAt: number,
  reason: string,
  options: {
    rawTx?: any;
    sourceClassification?: TradeSourceClassification;
  } = {},
): Promise<RedisPilotIntentResult> {
  if (!isLivePilotRedisAvailable() || !livePilotRedisConfig.executionEnabled) {
    return { considered: false, created: false, duplicate: false };
  }

  const config = getLivePilotPublicConfig();
  const pilotWallet = findPilotWalletForStarTrader(config, trade.wallet);
  if (!pilotWallet || !pilotWallet.isEnabled || !pilotWallet.isComplete || !pilotWallet.publicKey) {
    return { considered: false, created: false, duplicate: false };
  }

  const control = await getRedisPilotControlSnapshot([pilotWallet.alias]);
  if (!control) {
    await publishLivePilotRedisAudit({
      source: 'redis_intent_skip',
      reason,
      walletAlias: pilotWallet.alias,
      starTradeSignature: trade.signature,
      leaderType: trade.type,
      skipReason: 'redis_control_unavailable',
      errorMessage: 'Redis control state is unavailable; failing closed',
    });
    return {
      considered: true,
      created: false,
      duplicate: false,
      status: 'skipped' as const,
      skipReason: 'redis_control_unavailable',
    };
  }

  const walletControl = control.wallets[0];
  const sourceClassification =
    options.sourceClassification || classifyTradeSource(trade, options.rawTx);
  const sourceSummary = formatTradeSourceClassification(sourceClassification);
  const meteoraDammV2CandidatePools = isMeteoraDammV2Source(sourceClassification)
    ? extractMeteoraDammV2CandidatePools(options.rawTx)
    : [];

  let skipReason: string | null = null;
  let errorMessage: string | null = null;
  let copyRatio = 0;
  let leaderPositionBefore: number | null = null;
  let leaderPositionAfter: number | null = null;
  let copiedPositionBefore: number | null = null;
  let sellFraction: number | null = null;

  const tradeAgeMs = receivedAt - trade.timestamp * 1000;

  if (control.global.kill_switch_active) {
    skipReason = 'kill_switch_active';
    errorMessage = 'Redis control global kill switch is active';
  } else if (walletControl?.kill_switch_active) {
    skipReason = 'wallet_kill_switch_active';
    errorMessage = `Redis control kill switch is active for ${pilotWallet.alias}`;
  } else if (control.global.is_paused) {
    skipReason = 'global_paused';
    errorMessage = 'Redis control global pause is active';
  } else if (walletControl?.is_paused) {
    skipReason = 'wallet_paused';
    errorMessage = `Redis control pause is active for ${pilotWallet.alias}`;
  }

  if (trade.type === 'buy') {
    if (!skipReason && tradeAgeMs > BUY_STALENESS_THRESHOLD_MS) {
      skipReason = 'stale_buy';
      errorMessage = `Buy was ${Math.round(tradeAgeMs / 1000)}s old before Redis intent creation`;
    }

    const outputMint = trade.tokenOutMint || '';
    if (!skipReason && outputMint && (await getRedisMintQuarantine(outputMint))?.status === 'active') {
      skipReason = 'mint_quarantined';
      errorMessage = `${getTokenSymbol(outputMint)} is quarantined for live-pilot buys`;
    }

    if (!skipReason) {
      const sizing = resolveRedisLiveBuyCopyRatio(pilotWallet);
      copyRatio = sizing.copyRatio;
      skipReason = sizing.skipReason;
      errorMessage = sizing.skipReason ? `Redis fallback cannot size ${pilotWallet.buyModelKey} buy model` : null;
    }

    if (!skipReason) {
      const leaderBuy = await recordRedisObservedLeaderBuy({
        walletAlias: pilotWallet.alias,
        starTrader: trade.wallet,
        mint: outputMint,
        tokenSymbol: outputMint ? getTokenSymbol(outputMint) : null,
        tradeSignature: trade.signature,
        tradeTimestampIso: toBlockTimestampIso(trade.timestamp),
        leaderBuyAmount: trade.tokenOutAmount,
      });
      leaderPositionBefore = leaderBuy?.leaderPositionBefore ?? null;
      leaderPositionAfter = leaderBuy?.leaderPositionAfter ?? null;
      copiedPositionBefore = leaderBuy?.copiedPositionBefore ?? null;
    }
  } else {
    const inputMint = trade.tokenInMint || '';
    if (!skipReason && inputMint && (await getRedisMintQuarantine(inputMint))?.status === 'active') {
      skipReason = 'mint_quarantined';
      errorMessage = `${getTokenSymbol(inputMint)} is quarantined for live-pilot sells`;
    }

    if (!skipReason) {
      const leaderSell = await recordRedisObservedLeaderSell({
        walletAlias: pilotWallet.alias,
        starTrader: trade.wallet,
        mint: inputMint,
        tokenSymbol: inputMint ? getTokenSymbol(inputMint) : null,
        tradeSignature: trade.signature,
        tradeTimestampIso: toBlockTimestampIso(trade.timestamp),
        leaderSellAmount: trade.tokenInAmount,
      });
      leaderPositionBefore = leaderSell?.leaderPositionBefore ?? null;
      leaderPositionAfter = leaderSell?.leaderPositionAfter ?? null;
      copiedPositionBefore = leaderSell?.copiedPositionBefore ?? null;
      copyRatio = Math.min(Math.max(leaderSell?.sellFraction || 0, 0), 1);
      sellFraction = leaderSell?.sellFraction ?? null;

      if (leaderSell?.notFollowedPosition || copyRatio <= 0) {
        skipReason = 'not_followed_position';
        errorMessage = `Wallet ${pilotWallet.alias} did not build a copied ${getTokenSymbol(inputMint)} position`;
      }
    }
  }

  const row = baseTradeRow({
    pilotWallet,
    trade,
    receivedAt,
    copyRatio,
    status: skipReason ? 'skipped' : 'queued',
    skipReason,
    errorMessage,
    leaderPositionBefore,
    leaderPositionAfter,
    copiedPositionBefore,
    sellFraction,
  });

  if (row.status !== 'queued') {
    await publishLivePilotRedisAudit({
      source: 'redis_intent_skip',
      reason,
      tradeId: row.id,
      walletAlias: row.wallet_alias,
      starTradeSignature: row.star_trade_signature,
      leaderType: row.leader_type,
      skipReason,
      errorMessage: `${errorMessage || ''}; source=${sourceSummary}`,
    });
    return { considered: true, created: false, duplicate: false, status: 'skipped', skipReason: skipReason || undefined };
  }

  const result = await publishLivePilotRedisIntent(
    pilotTradeToRedisIntent(row, 'redis_primary', {
      sourceClassification,
      meteoraDammV2CandidatePools,
    }),
  );
  if (!result.published) {
    return {
      considered: true,
      created: false,
      duplicate: result.reason === 'duplicate',
      status: undefined,
    };
  }

  await publishLivePilotRedisAudit({
    source: 'redis_intent_created',
    reason,
    tradeId: row.id,
    walletAlias: row.wallet_alias,
    starTradeSignature: row.star_trade_signature,
    leaderType: row.leader_type,
    sourceSummary,
    meteoraDammV2CandidatePools: meteoraDammV2CandidatePools.join(','),
    redisStreamId: result.streamId,
  });

  return { considered: true, created: true, duplicate: false, status: 'queued', trade: row };
}
