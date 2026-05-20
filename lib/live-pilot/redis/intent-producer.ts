import type {
  FixedAvailablePctCopyModelConfig,
  TargetBuyPctWithCapCopyModelConfig,
} from '@/lib/copy-models/types';
import { BUY_STALENESS_THRESHOLD_MS, createPrivateRpcConnection } from '@/lib/ingestion/copy-signal';
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
} from '@/lib/live-pilot/meteora-damm-v2-cache';
import { extractPumpSwapCandidatePools } from '@/lib/live-pilot/pump-swap-cache';
import { getRedisPilotControlSnapshot } from './control-snapshot';
import { isLivePilotRedisAvailable, livePilotRedisConfig } from './config';
import {
  clearLivePilotRedisIntentDedupe,
  pilotTradeToRedisIntent,
  publishLivePilotRedisAudit,
  publishLivePilotRedisIntent,
  reserveLivePilotRedisIntentDedupe,
} from './streams';
import {
  getRedisMintQuarantine,
  recordRedisObservedLeaderBuy,
  recordRedisObservedLeaderSell,
} from './state';
import { resolveLivePilotSellSizing } from '@/lib/live-pilot/sell-safety';
import {
  resolveFixedAvailableLiveBuySizing,
  resolveTargetBuyPctWithCapLiveBuySizing,
} from '@/lib/live-pilot/buy-sizing';

function toIso(ms: number) {
  return new Date(ms).toISOString();
}

function toBlockTimestampIso(timestampSeconds: number) {
  return new Date(timestampSeconds * 1000).toISOString();
}

function buildSyntheticTradeId(walletAlias: string, signature: string, leaderType: string) {
  return `redis:${walletAlias}:${signature}:${leaderType}`;
}

async function resolveRedisLiveBuyCopyRatio(pilotWallet: PilotWalletConfigSummary, trade: RawTrade) {
  if (pilotWallet.buyModelKey === 'fixed_available_pct') {
    return resolveFixedAvailableLiveBuySizing(pilotWallet.buyModelConfig as FixedAvailablePctCopyModelConfig);
  }

  if (pilotWallet.buyModelKey === 'target_buy_pct_with_cap') {
    return resolveTargetBuyPctWithCapLiveBuySizing({
      trade,
      wallet: pilotWallet,
      config: pilotWallet.buyModelConfig as TargetBuyPctWithCapCopyModelConfig,
      connection: createPrivateRpcConnection(),
    });
  }

  if (pilotWallet.buyModelKey !== 'current_ratio') {
    return {
      copyRatio: 0,
      skipReason: 'redis_buy_model_unsupported',
      deployableSolAtIntent: null,
      solPriceAtIntent: null,
      leaderUsdValue: null,
    };
  }

  return {
    copyRatio: 0,
    skipReason: 'redis_current_ratio_unsupported',
    deployableSolAtIntent: null,
    solPriceAtIntent: null,
    leaderUsdValue: null,
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
  const meteoraDammV2CandidatePools = extractMeteoraDammV2CandidatePools(options.rawTx);
  const pumpSwapCandidatePools = extractPumpSwapCandidatePools(options.rawTx);

  let skipReason: string | null = null;
  let errorMessage: string | null = null;
  let copyRatio = 0;
  let leaderPositionBefore: number | null = null;
  let leaderPositionAfter: number | null = null;
  let copiedPositionBefore: number | null = null;
  let sellFraction: number | null = null;
  let dedupeReserved = false;
  let sellSizingSource: string | null = null;
  let sellFallbackReason: string | null = null;

  const reserveIntentDedupe = async () => {
    const reservationRow = baseTradeRow({
      pilotWallet,
      trade,
      receivedAt,
      copyRatio,
      status: 'queued',
      leaderPositionBefore,
      leaderPositionAfter,
      copiedPositionBefore,
      sellFraction,
    });
    const reservationPayload = pilotTradeToRedisIntent(reservationRow, 'redis_primary', {
      sourceClassification,
      meteoraDammV2CandidatePools,
      pumpSwapCandidatePools,
    });
    const reservation = await reserveLivePilotRedisIntentDedupe(reservationPayload);
    if (!reservation.reserved) {
      return {
        duplicate: reservation.reason === 'duplicate',
      };
    }
    dedupeReserved = true;
    return { duplicate: false };
  };

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
      const sizing = await resolveRedisLiveBuyCopyRatio(pilotWallet, trade);
      copyRatio = sizing.copyRatio;
      skipReason = sizing.skipReason;
      errorMessage = sizing.skipReason ? `Redis fallback cannot size ${pilotWallet.buyModelKey} buy model` : null;
    }

    if (!skipReason) {
      const reservation = await reserveIntentDedupe();
      if (reservation.duplicate) {
        return {
          considered: true,
          created: false,
          duplicate: true,
          status: undefined,
        };
      }

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
    if (!skipReason && !inputMint) {
      skipReason = 'missing_input_mint';
      errorMessage = 'Sell trade is missing input token mint';
    }

    if (!skipReason && inputMint && (await getRedisMintQuarantine(inputMint))?.status === 'active') {
      skipReason = 'mint_quarantined';
      errorMessage = `${getTokenSymbol(inputMint)} is quarantined for live-pilot sells`;
    }

    if (!skipReason) {
      const reservation = await reserveIntentDedupe();
      if (reservation.duplicate) {
        return {
          considered: true,
          created: false,
          duplicate: true,
          status: undefined,
        };
      }

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
      const sellSizing = resolveLivePilotSellSizing({
        trade,
        lifecycleSellFraction: leaderSell?.sellFraction,
      });
      copyRatio = sellSizing.copyRatio;
      sellFraction = sellSizing.sellFraction;
      sellSizingSource = sellSizing.source;
      sellFallbackReason = leaderSell?.notFollowedPosition || sellSizing.fallbackReason
        ? sellSizing.fallbackReason || 'copied_position_missing_on_sell'
        : null;
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
    const payload = pilotTradeToRedisIntent(row, 'redis_primary', {
      sourceClassification,
      meteoraDammV2CandidatePools,
      pumpSwapCandidatePools,
    });
    if (dedupeReserved) {
      await clearLivePilotRedisIntentDedupe(payload).catch(() => undefined);
    }
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

  const payload = pilotTradeToRedisIntent(row, 'redis_primary', {
      sourceClassification,
      meteoraDammV2CandidatePools,
      pumpSwapCandidatePools,
  });
  let result: Awaited<ReturnType<typeof publishLivePilotRedisIntent>>;
  try {
    result = await publishLivePilotRedisIntent(payload, {
      dedupeAlreadyReserved: dedupeReserved,
    });
  } catch (error) {
    if (dedupeReserved) {
      await clearLivePilotRedisIntentDedupe(payload).catch(() => undefined);
    }
    throw error;
  }
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
    sellSizingSource,
    sellFallbackReason,
    meteoraDammV2CandidatePools: meteoraDammV2CandidatePools.join(','),
    pumpSwapCandidatePools: pumpSwapCandidatePools.join(','),
    redisStreamId: result.streamId,
  });

  return { considered: true, created: true, duplicate: false, status: 'queued', trade: row };
}
