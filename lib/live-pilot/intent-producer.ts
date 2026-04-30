import type { FixedAvailablePctCopyModelConfig } from '@/lib/copy-models/types';
import { RawTrade } from '@/lib/trade-parser';
import {
  buildPilotControlSnapshot,
  ensurePilotControlState,
  listPilotControlStates,
} from '@/lib/live-pilot/repositories/pilot-control-state.repo';
import {
  ensurePilotRuntimeState,
  updatePilotRuntimeState,
} from '@/lib/live-pilot/repositories/pilot-runtime-state.repo';
import { isPilotMintQuarantined } from '@/lib/live-pilot/repositories/pilot-mint-quarantines.repo';
import {
  createPilotTrade,
  getCopyPilotTradeByWalletSignature,
} from '@/lib/live-pilot/repositories/pilot-trades.repo';
import {
  BUY_STALENESS_THRESHOLD_MS,
  computeCopyTradeSignal,
  createPrivateRpcConnection,
} from '@/lib/ingestion/copy-signal';
import { classifyTradeSource, formatTradeSourceClassification } from '@/lib/ingestion/trade-source-classifier';
import { rememberLivePilotSourceClassification } from '@/lib/live-pilot/source-classification-cache';
import { findPilotWalletForStarTrader, getLivePilotPublicConfig } from '@/lib/live-pilot/config';
import { getTokenSymbol } from '@/lib/services/token-service';
import {
  recordObservedLeaderBuy,
  recordObservedLeaderSell,
} from '@/lib/repositories/copy-position-states.repo';
import type { PilotWalletConfigSummary } from '@/lib/live-pilot/types';
import type { PilotTradeRow } from '@/lib/live-pilot/types';

export interface PilotIntentResult {
  considered: boolean;
  created: boolean;
  duplicate: boolean;
  status?: 'queued' | 'skipped';
  skipReason?: string;
  trade?: PilotTradeRow | null;
}

function toIso(ms: number) {
  return new Date(ms).toISOString();
}

function toBlockTimestampIso(timestampSeconds: number) {
  return new Date(timestampSeconds * 1000).toISOString();
}

const INTENT_CONTROL_CACHE_TTL_MS = 500;
const ensuredIntentStateAliases = new Set<string>();
let intentControlCache: {
  expiresAt: number;
  walletAlias: string;
  snapshot: ReturnType<typeof buildPilotControlSnapshot>;
} | null = null;

async function ensureIntentStateOnce(pilotWallet: PilotWalletConfigSummary) {
  if (ensuredIntentStateAliases.has(pilotWallet.alias)) {
    return;
  }

  await Promise.all([
    ensurePilotControlState([pilotWallet.alias]),
    ensurePilotRuntimeState([pilotWallet]),
  ]);
  ensuredIntentStateAliases.add(pilotWallet.alias);
}

async function getIntentControlSnapshot(walletAlias: string) {
  const now = Date.now();
  if (
    intentControlCache
    && intentControlCache.walletAlias === walletAlias
    && intentControlCache.expiresAt > now
  ) {
    return intentControlCache.snapshot;
  }

  const controlRows = await listPilotControlStates();
  const snapshot = buildPilotControlSnapshot(controlRows, [walletAlias]);
  intentControlCache = {
    walletAlias,
    expiresAt: now + INTENT_CONTROL_CACHE_TTL_MS,
    snapshot,
  };
  return snapshot;
}

function resolveLiveBuyCopyRatio(args: {
  buyModelKey: 'current_ratio' | 'fixed_available_pct';
  buyModelConfig: Record<string, never> | FixedAvailablePctCopyModelConfig;
  signalFinalRatio: number;
}) {
  switch (args.buyModelKey) {
    case 'current_ratio':
      return {
        copyRatio: Math.min(Math.max(args.signalFinalRatio || 0, 0), 1),
        skipReason: null as string | null,
      };
    case 'fixed_available_pct': {
      const buyPct = Number((args.buyModelConfig as FixedAvailablePctCopyModelConfig).buyPct || 0);
      const copyRatio = Math.min(Math.max(buyPct / 100, 0), 1);
      return {
        copyRatio,
        skipReason: copyRatio > 0 ? null : 'zero_model_spend',
      };
    }
  }
}

export async function maybeCreatePilotIntent(
  trade: RawTrade,
  receivedAt: number,
  options: {
    includeTrade?: boolean;
    rawTx?: any;
  } = {},
): Promise<PilotIntentResult> {
  const config = getLivePilotPublicConfig();
  const pilotWallet = findPilotWalletForStarTrader(config, trade.wallet);

  if (!pilotWallet) {
    return { considered: false, created: false, duplicate: false };
  }

  if (!pilotWallet.isEnabled || !pilotWallet.isComplete || !pilotWallet.publicKey) {
    console.log(
      `[LIVE_PILOT] Wallet ${pilotWallet.alias} is not ready for intent production `
      + `(enabled=${pilotWallet.isEnabled}, complete=${pilotWallet.isComplete})`
    );
    return { considered: false, created: false, duplicate: false };
  }

  await ensureIntentStateOnce(pilotWallet);

  const existingIntent = await getCopyPilotTradeByWalletSignature(pilotWallet.alias, trade.signature);
  if (existingIntent) {
    console.log(`[LIVE_PILOT] Existing copy intent found for ${pilotWallet.alias} / ${trade.signature.slice(0, 12)}...`);
    return {
      considered: true,
      created: false,
      duplicate: true,
      status: existingIntent.status === 'skipped' ? 'skipped' : undefined,
      skipReason: existingIntent.skip_reason || undefined,
      ...(options.includeTrade ? { trade: existingIntent } : {}),
    };
  }

  const runtimePatchBase = {
    star_trader: trade.wallet,
    last_seen_star_trade_signature: trade.signature,
  };

  try {
    const control = await getIntentControlSnapshot(pilotWallet.alias);
    const walletControl = control.wallets[0];
    const sourceClassification = classifyTradeSource(trade, options.rawTx);
    const sourceSummary = formatTradeSourceClassification(sourceClassification);
    rememberLivePilotSourceClassification(trade.signature, sourceClassification);
    const tradeAgeMs = receivedAt - trade.timestamp * 1000;
    let signal: Awaited<ReturnType<typeof computeCopyTradeSignal>> | null = null;

    let skipReason: string | null = null;
    let copyRatio = 0;
    let leaderPositionBefore: number | null = null;
    let leaderPositionAfter: number | null = null;
    let copiedPositionBefore: number | null = null;
    let sellFraction: number | null = null;

    if (control.global.kill_switch_active) {
      skipReason = 'kill_switch_active';
    } else if (walletControl.kill_switch_active) {
      skipReason = 'wallet_kill_switch_active';
    } else if (control.global.is_paused) {
      skipReason = 'global_paused';
    } else if (walletControl.is_paused) {
      skipReason = 'wallet_paused';
    }

    if (!skipReason && trade.type === 'buy') {
      if (tradeAgeMs > BUY_STALENESS_THRESHOLD_MS) {
        skipReason = 'stale_buy';
      } else {
        const outputMint = trade.tokenOutMint || null;
        if (outputMint && await isPilotMintQuarantined(outputMint)) {
          skipReason = 'mint_quarantined';
        }
      }
    }

    if (!skipReason && trade.type === 'buy') {
      const needsBuySignal = pilotWallet.buyModelKey === 'current_ratio';
      signal = needsBuySignal
        ? await computeCopyTradeSignal(trade, receivedAt, createPrivateRpcConnection())
        : null;

      const liveBuySizing = resolveLiveBuyCopyRatio({
        buyModelKey: pilotWallet.buyModelKey,
        buyModelConfig: pilotWallet.buyModelConfig,
        signalFinalRatio: signal?.finalRatio || 0,
      });
      copyRatio = liveBuySizing.copyRatio;

      if (liveBuySizing.skipReason) {
        skipReason = liveBuySizing.skipReason;
      }
    }

    if (!skipReason && trade.type === 'buy') {
      const leaderBuy = await recordObservedLeaderBuy({
        scopeType: 'pilot',
        scopeKey: pilotWallet.alias,
        starTrader: trade.wallet,
        mint: trade.tokenOutMint || '',
        tokenSymbol: trade.tokenOutMint ? getTokenSymbol(trade.tokenOutMint) : null,
        tradeSignature: trade.signature,
        tradeTimestampIso: toBlockTimestampIso(trade.timestamp),
        leaderBuyAmount: trade.tokenOutAmount,
      });

      leaderPositionBefore = leaderBuy.leaderPositionBefore;
      leaderPositionAfter = leaderBuy.leaderPositionAfter;
      copiedPositionBefore = leaderBuy.copiedPositionBefore;
    }

    if (!skipReason && trade.type === 'sell') {
      const leaderSell = await recordObservedLeaderSell({
        scopeType: 'pilot',
        scopeKey: pilotWallet.alias,
        starTrader: trade.wallet,
        mint: trade.tokenInMint || '',
        tokenSymbol: trade.tokenInMint ? getTokenSymbol(trade.tokenInMint) : null,
        tradeSignature: trade.signature,
        tradeTimestampIso: toBlockTimestampIso(trade.timestamp),
        leaderSellAmount: trade.tokenInAmount,
      });

      leaderPositionBefore = leaderSell.leaderPositionBefore;
      leaderPositionAfter = leaderSell.leaderPositionAfter;
      copiedPositionBefore = leaderSell.copiedPositionBefore;
      copyRatio = Math.min(Math.max(leaderSell.sellFraction, 0), 1);
      sellFraction = leaderSell.sellFraction;

      if (leaderSell.notFollowedPosition || copyRatio <= 0) {
        skipReason = 'not_followed_position';
      }
    }

    const intentCreatedAt = Date.now();
    const status = skipReason ? 'skipped' : 'queued';

    const insertResult = await createPilotTrade({
      wallet_alias: pilotWallet.alias,
      wallet_public_key: pilotWallet.publicKey,
      trigger_kind: 'copy',
      trigger_reason: 'leader_trade',
      star_trader: trade.wallet,
      star_trade_signature: trade.signature,
      leader_type: trade.type,
      token_in_mint: trade.tokenInMint || null,
      token_out_mint: trade.tokenOutMint || null,
      copy_ratio: copyRatio,
      leader_position_before: leaderPositionBefore,
      leader_position_after: leaderPositionAfter,
      copied_position_before: copiedPositionBefore,
      copied_position_after: copiedPositionBefore,
      sell_fraction: sellFraction,
      leader_block_timestamp: toBlockTimestampIso(trade.timestamp),
      received_at: toIso(receivedAt),
      intent_created_at: toIso(intentCreatedAt),
      deployable_sol_at_intent: null,
      sol_price_at_intent: signal?.solPrice ?? null,
      status,
      skip_reason: skipReason,
      error_message: skipReason
        ? `Intent skipped at producer stage: ${skipReason}; age=${Math.round(tradeAgeMs)}ms; source=${sourceSummary}`
        : null,
    });

    await updatePilotRuntimeState(pilotWallet.alias, {
      ...runtimePatchBase,
      last_error: null,
    });

    if (insertResult.duplicate) {
      console.log(`[LIVE_PILOT] Duplicate intent skipped for ${pilotWallet.alias} / ${trade.signature.slice(0, 12)}...`);
      return { considered: true, created: false, duplicate: true, status, skipReason: skipReason || undefined };
    }

    if (status === 'skipped') {
      console.log(
        `[LIVE_PILOT] Skipped intent for ${pilotWallet.alias} / ${trade.signature.slice(0, 12)}... `
        + `(${skipReason}, age=${Math.round(tradeAgeMs / 1000)}s, stale-threshold=${BUY_STALENESS_THRESHOLD_MS / 1000}s, `
        + `source=${sourceSummary})`
      );
    } else {
      console.log(
        `[LIVE_PILOT] Queued pilot intent for ${pilotWallet.alias} / ${trade.signature.slice(0, 12)}... `
        + `(model=${pilotWallet.buyModelKey}, ratio=${(copyRatio * 100).toFixed(2)}%, source=${sourceSummary})`
      );
    }

    return {
      considered: true,
      created: true,
      duplicate: false,
      status,
      skipReason: skipReason || undefined,
      ...(options.includeTrade ? { trade: insertResult.trade } : {}),
    };
  } catch (error: any) {
    await updatePilotRuntimeState(pilotWallet.alias, {
      ...runtimePatchBase,
      last_error: error?.message || 'Intent production failed',
    }).catch(() => undefined);

    throw error;
  }
}
