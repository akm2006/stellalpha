import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import os from 'os';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { sendLivePilotAlert } from '@/lib/live-pilot/alerts';
import {
  buildPilotControlSnapshot,
  ensurePilotControlState,
  listPilotControlStates,
  updatePilotControlState,
} from '@/lib/live-pilot/repositories/pilot-control-state.repo';
import { ensurePilotRuntimeState, releasePilotRuntimeLock, tryAcquirePilotRuntimeLock } from '@/lib/live-pilot/repositories/pilot-runtime-state.repo';
import {
  claimQueuedPilotTrade,
  getPilotTradeById,
  listFreshQueuedCopyBuyTrades,
  listQueuedCopySellTrades,
  listQueuedPilotTrades,
  skipExpiredQueuedCopyBuyTrades,
  updatePilotTradeIfStatus,
} from '@/lib/live-pilot/repositories/pilot-trades.repo';
import {
  executePilotTrade,
  createLivePilotConnection,
  loadPilotWalletKeypair,
  shouldSkipStaleBuyAtExecution,
} from '@/lib/live-pilot/executor';
import type { TradeSourceClassification } from '@/lib/ingestion/trade-source-classifier';
import { rememberLivePilotSourceClassification } from '@/lib/live-pilot/source-classification-cache';
import { rememberLivePilotMeteoraDammV2CandidatePools } from '@/lib/live-pilot/meteora-damm-v2-cache';
import { getLivePilotConfig, findPilotWalletByAlias } from '@/lib/live-pilot/config';
import { enqueueLiquidationIntentsForWallet } from '@/lib/live-pilot/liquidation';
import { enqueueResidualExitIntentsForWallet } from '@/lib/live-pilot/residual-exits';
import { subscribeToLivePilotQueueWake, unsubscribeFromLivePilotQueueWake } from '@/lib/live-pilot/queue-wake';
import { recoverSubmittedPilotTrades } from '@/lib/live-pilot/recovery';
import { closeZeroTokenAccounts } from '@/lib/live-pilot/token-account-rent';
import { closeLivePilotRedisClient } from '@/lib/live-pilot/redis/client';
import { isLivePilotRedisAvailable, livePilotRedisConfig } from '@/lib/live-pilot/redis/config';
import {
  ackLivePilotRedisIntent,
  claimStaleLivePilotRedisIntents,
  deadletterLivePilotRedisIntent,
  ensureLivePilotRedisStreams,
  publishLivePilotRedisAudit,
  readLivePilotRedisIntents,
  redisIntentToPilotTrade,
  type LivePilotRedisStreamMessage,
} from '@/lib/live-pilot/redis/streams';
import {
  acquireLivePilotRedisWalletLock,
  releaseLivePilotRedisWalletLock,
} from '@/lib/live-pilot/redis/locks';
import {
  getRedisPilotControlSnapshot,
  hydrateRedisPilotControlState,
} from '@/lib/live-pilot/redis/control';

const QUEUE_POLL_INTERVAL_MS = 1_000;
const RECOVERY_INTERVAL_MS = 5_000;
const FAILURE_BACKOFF_INITIAL_MS = 5_000;
const FAILURE_BACKOFF_MAX_MS = 60_000;
const LOCK_WAIT_TIMEOUT_MS = 2_000;
const LOCK_WAIT_INTERVAL_MS = 250;
const QUEUE_BATCH_SIZE = 10;
const WALLET_BUSY_RETRY_DELAY_MS = 2_500;
const CONTROL_CACHE_TTL_MS = 1_000;
const TOKEN_ACCOUNT_RENT_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const TOKEN_ACCOUNT_RENT_SWEEP_MAX_ACCOUNTS = 32;

let isShuttingDown = false;
let isProcessingQueue = false;
let isRunningRecovery = false;
let isQueueDrainScheduled = false;
let queueWakeChannel: RealtimeChannel | null = null;
const tokenAccountRentSweepNextAt = new Map<string, number>();
let queueBackoffUntil = 0;
let queueBackoffMs = FAILURE_BACKOFF_INITIAL_MS;
let recoveryBackoffUntil = 0;
let recoveryBackoffMs = FAILURE_BACKOFF_INITIAL_MS;

type PilotControlSnapshot = ReturnType<typeof buildPilotControlSnapshot>;

let controlSnapshotCache: {
  walletAliasesKey: string;
  expiresAt: number;
  snapshot: PilotControlSnapshot;
} | null = null;

const lockOwner = `${os.hostname()}:${process.pid}:live-pilot`;
const redisConsumerName = `${os.hostname()}:${process.pid}:live-pilot-redis`;
const connection = createLivePilotConnection();

function hydrateRedisIntentExecutionMetadata(message: LivePilotRedisStreamMessage) {
  const signature = message.payload.starTradeSignature;
  if (!signature) {
    return;
  }

  if (message.payload.sourceClassificationJson) {
    try {
      rememberLivePilotSourceClassification(
        signature,
        JSON.parse(message.payload.sourceClassificationJson) as TradeSourceClassification,
      );
    } catch {
      console.warn(`[LIVE_PILOT_REDIS] Ignoring malformed source classification for ${signature.slice(0, 12)}...`);
    }
  }

  const candidatePools = (message.payload.meteoraDammV2CandidatePools || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (candidatePools.length > 0) {
    rememberLivePilotMeteoraDammV2CandidatePools(signature, candidatePools);
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scheduleQueueDrain() {
  if (isShuttingDown || isQueueDrainScheduled || Date.now() < queueBackoffUntil) {
    return;
  }

  isQueueDrainScheduled = true;
  setTimeout(() => {
    isQueueDrainScheduled = false;
    processQueuedPilotTrades().catch((error) => {
      recordLoopFailure('queue', error);
    });
  }, 0);
}

async function getPilotControlSnapshot(walletAliases: string[]) {
  const walletAliasesKey = [...walletAliases].sort().join('|');
  const now = Date.now();

  if (
    controlSnapshotCache
    && controlSnapshotCache.walletAliasesKey === walletAliasesKey
    && controlSnapshotCache.expiresAt > now
  ) {
    return controlSnapshotCache.snapshot;
  }

  try {
    const controlRows = await listPilotControlStates();
    const snapshot = buildPilotControlSnapshot(controlRows, walletAliases);
    controlSnapshotCache = {
      walletAliasesKey,
      expiresAt: now + CONTROL_CACHE_TTL_MS,
      snapshot,
    };
    return snapshot;
  } catch (error) {
    if (controlSnapshotCache && controlSnapshotCache.walletAliasesKey === walletAliasesKey) {
      console.warn('[LIVE_PILOT] Failed to refresh control snapshot, using cached value:', error);
      return controlSnapshotCache.snapshot;
    }

    throw error;
  }
}

async function acquireExecutionLock(walletAlias: string) {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline && !isShuttingDown) {
    const acquired = await tryAcquirePilotRuntimeLock(walletAlias, lockOwner);
    if (acquired) {
      return true;
    }

    await wait(LOCK_WAIT_INTERVAL_MS);
  }

  return false;
}

async function skipQueuedTrade(tradeId: string, reason: string, message: string) {
  await updatePilotTradeIfStatus(tradeId, 'queued', {
    status: 'skipped',
    skip_reason: reason,
    error_message: message,
  });
}

async function deferQueuedTrade(tradeId: string, reason: string, message: string, delayMs: number) {
  await updatePilotTradeIfStatus(tradeId, 'queued', {
    status: 'queued',
    skip_reason: null,
    error_message: `${reason}: ${message}`,
    next_retry_at: new Date(Date.now() + delayMs).toISOString(),
  });
}

async function runLiquidationSweep(
  config: ReturnType<typeof getLivePilotConfig>,
  controlSnapshot: ReturnType<typeof buildPilotControlSnapshot>,
) {
  for (const wallet of config.wallets.filter((entry) => entry.isEnabled && entry.isComplete && entry.hasSecret)) {
    const walletControl = controlSnapshot.wallets.find((row) => row.scope_key === wallet.alias);
    const liquidationRequested =
      controlSnapshot.global.liquidation_requested
      || controlSnapshot.global.kill_switch_active
      || walletControl?.liquidation_requested
      || walletControl?.kill_switch_active;

    if (!liquidationRequested) {
      continue;
    }

    const lockAcquired = await acquireExecutionLock(wallet.alias);
    if (!lockAcquired) {
      continue;
    }

    try {
      const reason = walletControl?.kill_switch_active || controlSnapshot.global.kill_switch_active
        ? 'kill_switch'
        : 'manual_liquidation';
      const result = await enqueueLiquidationIntentsForWallet({
        wallet,
        connection,
        reason,
      });

      if (result.created > 0) {
        console.log(`[LIVE_PILOT] ${wallet.alias}: queued ${result.created} liquidation trade(s)`);
      } else if (!result.pendingWork && walletControl?.liquidation_requested) {
        await updatePilotControlState('wallet', wallet.alias, {
          liquidation_requested: false,
        });
        console.log(
          `[LIVE_PILOT] ${wallet.alias}: cleared liquidation request (no meaningful holdings or active liquidation trades)`,
        );
      }
    } catch (error) {
      console.error(`[LIVE_PILOT] Failed liquidation sweep for ${wallet.alias}:`, error);
    } finally {
      await releasePilotRuntimeLock(wallet.alias, lockOwner).catch(() => undefined);
    }
  }
}

function recordLoopSuccess(loop: 'queue' | 'recovery') {
  if (loop === 'queue') {
    queueBackoffUntil = 0;
    queueBackoffMs = FAILURE_BACKOFF_INITIAL_MS;
    return;
  }

  recoveryBackoffUntil = 0;
  recoveryBackoffMs = FAILURE_BACKOFF_INITIAL_MS;
}

function recordLoopFailure(loop: 'queue' | 'recovery', error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (loop === 'queue') {
    queueBackoffUntil = Date.now() + queueBackoffMs;
    console.error(`[LIVE_PILOT] Queue loop error; backing off ${queueBackoffMs}ms:`, message);
    queueBackoffMs = Math.min(queueBackoffMs * 2, FAILURE_BACKOFF_MAX_MS);
    return;
  }

  recoveryBackoffUntil = Date.now() + recoveryBackoffMs;
  console.error(`[LIVE_PILOT] Recovery loop error; backing off ${recoveryBackoffMs}ms:`, message);
  recoveryBackoffMs = Math.min(recoveryBackoffMs * 2, FAILURE_BACKOFF_MAX_MS);
}

async function runResidualExitSweep(
  config: ReturnType<typeof getLivePilotConfig>,
  controlSnapshot: ReturnType<typeof buildPilotControlSnapshot>,
) {
  for (const wallet of config.wallets.filter((entry) => entry.isEnabled && entry.isComplete && entry.hasSecret)) {
    const walletControl = controlSnapshot.wallets.find((row) => row.scope_key === wallet.alias);
    const liquidationRequested =
      controlSnapshot.global.liquidation_requested
      || controlSnapshot.global.kill_switch_active
      || walletControl?.liquidation_requested
      || walletControl?.kill_switch_active;

    if (
      liquidationRequested
      || controlSnapshot.global.is_paused
      || walletControl?.is_paused
    ) {
      continue;
    }

    try {
      const result = await enqueueResidualExitIntentsForWallet({
        wallet,
        connection,
      });

      if (result.created > 0) {
        console.log(`[LIVE_PILOT] ${wallet.alias}: queued ${result.created} residual copy exit trade(s)`);
      }
    } catch (error) {
      console.error(`[LIVE_PILOT] Failed residual exit sweep for ${wallet.alias}:`, error);
    }
  }
}

async function runTokenAccountRentSweep(
  config: ReturnType<typeof getLivePilotConfig>,
  controlSnapshot: ReturnType<typeof buildPilotControlSnapshot>,
) {
  const now = Date.now();

  for (const wallet of config.wallets.filter((entry) => entry.isEnabled && entry.isComplete && entry.hasSecret)) {
    if (!wallet.secret) {
      continue;
    }

    const nextSweepAt = tokenAccountRentSweepNextAt.get(wallet.alias) || 0;
    if (nextSweepAt > now) {
      continue;
    }

    const walletControl = controlSnapshot.wallets.find((row) => row.scope_key === wallet.alias);
    const maintenanceBlocked =
      controlSnapshot.global.is_paused
      || controlSnapshot.global.kill_switch_active
      || controlSnapshot.global.liquidation_requested
      || walletControl?.is_paused
      || walletControl?.kill_switch_active
      || walletControl?.liquidation_requested;

    if (maintenanceBlocked) {
      continue;
    }

    const lockAcquired = await acquireExecutionLock(wallet.alias);
    if (!lockAcquired) {
      tokenAccountRentSweepNextAt.set(wallet.alias, now + WALLET_BUSY_RETRY_DELAY_MS);
      continue;
    }

    try {
      const keypair = loadPilotWalletKeypair(wallet.secret);
      const result = await closeZeroTokenAccounts({
        connection,
        owner: keypair,
        maxAccounts: TOKEN_ACCOUNT_RENT_SWEEP_MAX_ACCOUNTS,
        alertTitle: 'Live-pilot token account rent sweep',
        alertContext: [`walletAlias=${wallet.alias}`],
      });

      tokenAccountRentSweepNextAt.set(wallet.alias, Date.now() + TOKEN_ACCOUNT_RENT_SWEEP_INTERVAL_MS);

      if (result.closed > 0) {
        console.log(
          `[LIVE_PILOT] ${wallet.alias}: closed ${result.closed} zero-balance token account(s), `
          + `reclaimed ${result.reclaimedSol.toFixed(6)} SOL`,
        );
      }
    } catch (error) {
      tokenAccountRentSweepNextAt.set(wallet.alias, Date.now() + TOKEN_ACCOUNT_RENT_SWEEP_INTERVAL_MS);
      console.error(`[LIVE_PILOT] Failed token-account rent sweep for ${wallet.alias}:`, error);
    } finally {
      await releasePilotRuntimeLock(wallet.alias, lockOwner).catch(() => undefined);
    }
  }
}

async function processQueuedTradeBatch(
  config: ReturnType<typeof getLivePilotConfig>,
  controlSnapshot: ReturnType<typeof buildPilotControlSnapshot>,
  walletControlMap: Map<string, ReturnType<typeof buildPilotControlSnapshot>['wallets'][number]>,
  queuedTrades: Awaited<ReturnType<typeof listQueuedPilotTrades>>,
) {
  for (const trade of queuedTrades) {
    const wallet = findPilotWalletByAlias(config, trade.wallet_alias);
    if (!wallet || !wallet.isEnabled) {
      await skipQueuedTrade(
        trade.id,
        'wallet_not_ready',
        `Pilot wallet ${trade.wallet_alias} is not enabled in config`,
      );
      continue;
    }

    if (!wallet.isComplete) {
      await skipQueuedTrade(
        trade.id,
        'wallet_not_ready',
        `Pilot wallet ${trade.wallet_alias} is missing required config fields: ${wallet.missingFields.join(', ')}`,
      );
      continue;
    }

    const walletControl = walletControlMap.get(wallet.alias);
    const isLiquidationTrade = trade.trigger_kind === 'liquidation';

    if (!isLiquidationTrade && (controlSnapshot.global.kill_switch_active || walletControl?.kill_switch_active)) {
      await skipQueuedTrade(
        trade.id,
        'kill_switch_active',
        `Kill switch is active for wallet ${wallet.alias}`,
      );
      continue;
    }

    if (!isLiquidationTrade && controlSnapshot.global.is_paused) {
      await skipQueuedTrade(
        trade.id,
        'global_paused',
        'Global pause is active for live-pilot execution',
      );
      continue;
    }

    if (!isLiquidationTrade && walletControl?.is_paused) {
      await skipQueuedTrade(
        trade.id,
        'wallet_paused',
        `Wallet ${wallet.alias} is paused for live-pilot execution`,
      );
      continue;
    }

    if (trade.leader_type === 'buy' && !trade.leader_block_timestamp) {
      await skipQueuedTrade(
        trade.id,
        'missing_leader_timestamp',
        'Buy freshness cannot be verified without leader_block_timestamp',
      );
      continue;
    }

    const staleBuy = shouldSkipStaleBuyAtExecution(trade);
    if (staleBuy.stale) {
      await skipQueuedTrade(
        trade.id,
        'stale_buy',
        `Buy expired before worker lock; age=${Math.round(staleBuy.ageMs / 1000)}s, remaining=0ms`,
      );
      continue;
    }

    const lockAcquired = await acquireExecutionLock(wallet.alias);
    if (!lockAcquired) {
      await deferQueuedTrade(
        trade.id,
        'wallet_busy',
        `Wallet ${wallet.alias} was busy for more than ${LOCK_WAIT_TIMEOUT_MS}ms`,
        WALLET_BUSY_RETRY_DELAY_MS,
      );
      continue;
    }

    try {
      const claimedTrade = await claimQueuedPilotTrade(trade.id, trade.attempt_count + 1);
      if (!claimedTrade) {
        continue;
      }

      const outcome = await executePilotTrade(claimedTrade, wallet, connection);

      const summary =
        outcome.outcome === 'skipped'
          ? `${claimedTrade.id} skipped (${outcome.reason})`
        : outcome.outcome === 'confirmed'
            ? `${claimedTrade.id} confirmed (${outcome.signature})`
          : outcome.outcome === 'submitted'
              ? `${claimedTrade.id} submitted (${outcome.signature || 'pending_execute'})`
            : outcome.outcome === 'requeued'
                ? `${claimedTrade.id} requeued`
                : `${claimedTrade.id} failed`;

      console.log(`[LIVE_PILOT] ${wallet.alias}: ${summary}`);
    } catch (error) {
      console.error(`[LIVE_PILOT] Failed to process queued trade ${trade.id}:`, error);
      await updatePilotTradeIfStatus(trade.id, 'building', {
        status: 'failed',
        error_message: error instanceof Error ? error.message : String(error),
      }).catch(() => undefined);
    } finally {
      await releasePilotRuntimeLock(wallet.alias, lockOwner).catch(() => undefined);
    }
  }
}

async function processQueuedPilotTrades() {
  if (isProcessingQueue || isShuttingDown) {
    return;
  }

  if (Date.now() < queueBackoffUntil) {
    return;
  }

  isProcessingQueue = true;

  try {
    if (isLivePilotRedisAvailable() && livePilotRedisConfig.executionEnabled) {
      const processedRedis = await processRedisPilotIntents();
      if (processedRedis) {
        scheduleQueueDrain();
      }
      recordLoopSuccess('queue');
      return;
    }

    const config = getLivePilotConfig();
    const enabledWallets = config.wallets.filter((wallet) => wallet.isEnabled);
    const walletAliases = enabledWallets.map((wallet) => wallet.alias);

    if (config.errors.length > 0) {
      throw new Error(`Live-pilot config errors: ${config.errors.join(' | ')}`);
    }

    const controlSnapshot = await getPilotControlSnapshot(walletAliases);
    const walletControlMap = new Map(
      controlSnapshot.wallets.map((row) => [row.scope_key, row])
    );

    const expiredBuyTrades = await skipExpiredQueuedCopyBuyTrades();
    if (expiredBuyTrades.length > 0) {
      console.log(`[LIVE_PILOT] Skipped ${expiredBuyTrades.length} expired queued buy intent(s) before execution`);
    }

    const freshCopyTrades = await listFreshQueuedCopyBuyTrades(QUEUE_BATCH_SIZE);

    if (freshCopyTrades.length > 0) {
      await processQueuedTradeBatch(config, controlSnapshot, walletControlMap, freshCopyTrades);
      scheduleQueueDrain();
      return;
    }

    const sellCopyTrades = await listQueuedCopySellTrades(QUEUE_BATCH_SIZE);
    if (sellCopyTrades.length > 0) {
      await processQueuedTradeBatch(config, controlSnapshot, walletControlMap, sellCopyTrades);
      scheduleQueueDrain();
      return;
    }

    await runLiquidationSweep(config, controlSnapshot);
    await runTokenAccountRentSweep(config, controlSnapshot);
    await runResidualExitSweep(config, controlSnapshot);

    const queuedTrades = await listQueuedPilotTrades(QUEUE_BATCH_SIZE);
    if (queuedTrades.length > 0) {
      await processQueuedTradeBatch(config, controlSnapshot, walletControlMap, queuedTrades);
      scheduleQueueDrain();
    }

    recordLoopSuccess('queue');
  } finally {
    isProcessingQueue = false;
  }
}

async function processRedisIntentMessage(
  message: LivePilotRedisStreamMessage,
  config: ReturnType<typeof getLivePilotConfig>,
  controlSnapshot: ReturnType<typeof buildPilotControlSnapshot>,
) {
  let trade = redisIntentToPilotTrade(message.payload);
  let dbMirrorTradeIdToClaim: string | null = null;
  let dbMirrorNextAttemptCount = 1;
  hydrateRedisIntentExecutionMetadata(message);
  const wallet = findPilotWalletByAlias(config, trade.wallet_alias);

  if (!wallet || !wallet.isEnabled || !wallet.isComplete || !wallet.hasSecret) {
    await publishLivePilotRedisAudit({
      source: 'redis_intent_skipped',
      reason: 'wallet_not_ready',
      streamId: message.streamId,
      intentId: message.payload.intentId,
      walletAlias: trade.wallet_alias,
    });
    await ackLivePilotRedisIntent(message.streamId);
    return;
  }

  const walletControl = controlSnapshot.wallets.find((row) => row.scope_key === wallet.alias);
  const isLiquidationTrade = trade.trigger_kind === 'liquidation';
  if (!isLiquidationTrade && (controlSnapshot.global.kill_switch_active || walletControl?.kill_switch_active)) {
    await publishLivePilotRedisAudit({
      source: 'redis_intent_skipped',
      reason: 'kill_switch_active',
      streamId: message.streamId,
      intentId: message.payload.intentId,
      walletAlias: wallet.alias,
    });
    await ackLivePilotRedisIntent(message.streamId);
    return;
  }

  if (!isLiquidationTrade && (controlSnapshot.global.is_paused || walletControl?.is_paused)) {
    await publishLivePilotRedisAudit({
      source: 'redis_intent_skipped',
      reason: controlSnapshot.global.is_paused ? 'global_paused' : 'wallet_paused',
      streamId: message.streamId,
      intentId: message.payload.intentId,
      walletAlias: wallet.alias,
    });
    await ackLivePilotRedisIntent(message.streamId);
    return;
  }

  const staleBuy = shouldSkipStaleBuyAtExecution(trade);
  if (staleBuy.stale && message.payload.source !== 'db_mirror') {
    await publishLivePilotRedisAudit({
      source: 'redis_intent_skipped',
      reason: 'stale_buy',
      streamId: message.streamId,
      intentId: message.payload.intentId,
      walletAlias: trade.wallet_alias,
      ageMs: staleBuy.ageMs,
    });
    await ackLivePilotRedisIntent(message.streamId);
    return;
  }

  if (message.payload.source === 'db_mirror' && message.payload.dbTradeId) {
    const dbTrade = await getPilotTradeById(message.payload.dbTradeId);
    if (!dbTrade) {
      await publishLivePilotRedisAudit({
        source: 'redis_intent_skipped',
        reason: 'db_trade_missing',
        streamId: message.streamId,
        intentId: message.payload.intentId,
        dbTradeId: message.payload.dbTradeId,
        walletAlias: message.payload.walletAlias,
      });
      await ackLivePilotRedisIntent(message.streamId);
      return;
    }

    if (dbTrade.status !== 'queued') {
      await publishLivePilotRedisAudit({
        source: 'redis_intent_skipped',
        reason: 'db_trade_not_queued',
        streamId: message.streamId,
        intentId: message.payload.intentId,
        dbTradeId: dbTrade.id,
        walletAlias: dbTrade.wallet_alias,
        dbStatus: dbTrade.status,
        dbSkipReason: dbTrade.skip_reason || '',
      });
      await ackLivePilotRedisIntent(message.streamId);
      return;
    }

    dbMirrorTradeIdToClaim = dbTrade.id;
    dbMirrorNextAttemptCount = (dbTrade.attempt_count || 0) + 1;
  }

  const redisLockOwner = `${redisConsumerName}:${message.streamId}`;
  const lockAcquired = await acquireLivePilotRedisWalletLock(wallet.alias, redisLockOwner);
  if (!lockAcquired) {
    await publishLivePilotRedisAudit({
      source: 'redis_intent_deferred',
      reason: 'wallet_busy',
      streamId: message.streamId,
      intentId: message.payload.intentId,
      walletAlias: wallet.alias,
    });
    return;
  }

  if (dbMirrorTradeIdToClaim) {
    const claimedTrade = await claimQueuedPilotTrade(dbMirrorTradeIdToClaim, dbMirrorNextAttemptCount);
    if (!claimedTrade) {
      await publishLivePilotRedisAudit({
        source: 'redis_intent_deferred',
        reason: 'db_trade_claim_failed',
        streamId: message.streamId,
        intentId: message.payload.intentId,
        dbTradeId: dbMirrorTradeIdToClaim,
        walletAlias: wallet.alias,
      });
      await ackLivePilotRedisIntent(message.streamId);
      await releaseLivePilotRedisWalletLock(wallet.alias, redisLockOwner).catch(() => undefined);
      return;
    }

    trade = claimedTrade;
  }

  try {
    const outcome = await executePilotTrade(
      {
        ...trade,
        status: 'building',
        attempt_count: Math.max(trade.attempt_count || 0, 1),
      },
      wallet,
      connection,
    );

    await publishLivePilotRedisAudit({
      source: 'redis_intent_executed',
      streamId: message.streamId,
      intentId: message.payload.intentId,
      walletAlias: wallet.alias,
      outcome: outcome.outcome,
      signature: 'signature' in outcome ? outcome.signature || '' : '',
      message: 'message' in outcome ? outcome.message : '',
      reason: 'reason' in outcome ? outcome.reason : '',
    });

    await ackLivePilotRedisIntent(message.streamId);
  } catch (error) {
    console.error(`[LIVE_PILOT_REDIS] Failed Redis intent ${message.payload.intentId}:`, error);
    await deadletterLivePilotRedisIntent(message, 'execution_error', error);
  } finally {
    await releaseLivePilotRedisWalletLock(wallet.alias, redisLockOwner).catch(() => undefined);
  }
}

async function processRedisPilotIntents() {
  if (!isLivePilotRedisAvailable() || !livePilotRedisConfig.executionEnabled) {
    return false;
  }

  const config = getLivePilotConfig();
  if (config.errors.length > 0) {
    throw new Error(`Live-pilot config errors: ${config.errors.join(' | ')}`);
  }
  const walletAliases = config.wallets.filter((wallet) => wallet.isEnabled).map((wallet) => wallet.alias);
  const controlSnapshot =
    await getRedisPilotControlSnapshot(walletAliases)
    || await getPilotControlSnapshot(walletAliases);

  const freshMessages = await readLivePilotRedisIntents(redisConsumerName);
  const staleMessages = freshMessages.length > 0
    ? []
    : await claimStaleLivePilotRedisIntents(redisConsumerName);
  const messages = freshMessages.length > 0 ? freshMessages : staleMessages;

  if (messages.length === 0) {
    return false;
  }

  for (const message of messages) {
    await processRedisIntentMessage(message, config, controlSnapshot);
  }

  return true;
}

async function runRecoveryLoop() {
  if (isRunningRecovery || isShuttingDown) {
    return;
  }

  if (Date.now() < recoveryBackoffUntil) {
    return;
  }

  isRunningRecovery = true;

  try {
    const config = getLivePilotConfig();
    if (config.errors.length > 0) {
      throw new Error(`Live-pilot config errors: ${config.errors.join(' | ')}`);
    }

    const summary = await recoverSubmittedPilotTrades({
      config,
      connection,
      lockOwner,
    });

    if (summary.scanned > 0) {
      console.log(
        '[LIVE_PILOT] Recovery summary:',
        JSON.stringify(summary),
      );
    }

    if (summary.requeued > 0) {
      scheduleQueueDrain();
    }

    recordLoopSuccess('recovery');
  } finally {
    isRunningRecovery = false;
  }
}

async function startWorker() {
  const config = getLivePilotConfig();
  if (config.errors.length > 0) {
    throw new Error(`Live-pilot config errors: ${config.errors.join(' | ')}`);
  }

  const wallets = config.wallets.filter((wallet) => wallet.isEnabled);
  const walletAliases = wallets.map((wallet) => wallet.alias);

  if (walletAliases.length === 0) {
    throw new Error('No enabled live-pilot wallets found in config');
  }

  await ensurePilotControlState(walletAliases);
  await ensurePilotRuntimeState(
    wallets.map((wallet) => ({
      alias: wallet.alias,
      starTrader: wallet.starTrader,
      mode: wallet.mode,
    }))
  );

  console.log(`[LIVE_PILOT] Worker starting with lock owner ${lockOwner}`);
  console.log(`[LIVE_PILOT] Enabled wallets: ${walletAliases.join(', ')}`);
  if (isLivePilotRedisAvailable()) {
    await ensureLivePilotRedisStreams();
    await hydrateRedisPilotControlState(walletAliases).catch((error) => {
      console.warn('[LIVE_PILOT_REDIS] Failed to hydrate control state; Redis execution will fail closed until control is available:', error);
    });
    console.log(
      `[LIVE_PILOT_REDIS] Redis hot path initialized `
      + `(execution=${livePilotRedisConfig.executionEnabled}, group=${livePilotRedisConfig.consumerGroup})`,
    );
  } else {
    console.log('[LIVE_PILOT_REDIS] Redis hot path disabled');
  }
  await sendLivePilotAlert('Worker startup', [
    `lockOwner=${lockOwner}`,
    `wallets=${walletAliases.join(', ')}`,
  ]).catch(() => undefined);

  try {
    queueWakeChannel = await subscribeToLivePilotQueueWake((payload) => {
      console.log('[LIVE_PILOT] Received queue wake:', JSON.stringify(payload));
      scheduleQueueDrain();
    });
  } catch (error) {
    console.warn('[LIVE_PILOT] Failed to subscribe to queue wake channel, falling back to polling only:', error);
  }

  await runRecoveryLoop();
  await processQueuedPilotTrades();

  setInterval(() => {
    processQueuedPilotTrades().catch((error) => {
      recordLoopFailure('queue', error);
    });
  }, QUEUE_POLL_INTERVAL_MS);

  setInterval(() => {
    runRecoveryLoop().catch((error) => {
      recordLoopFailure('recovery', error);
    });
  }, RECOVERY_INTERVAL_MS);
}

async function shutdown() {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  try {
    const config = getLivePilotConfig();
    const walletAliases = config.wallets
      .filter((wallet) => wallet.isEnabled)
      .map((wallet) => wallet.alias);

    await Promise.all(
      walletAliases.map((walletAlias) =>
        releasePilotRuntimeLock(walletAlias, lockOwner).catch(() => undefined)
      )
    );
    await unsubscribeFromLivePilotQueueWake(queueWakeChannel).catch(() => undefined);
    queueWakeChannel = null;
    await closeLivePilotRedisClient().catch(() => undefined);
    await sendLivePilotAlert('Worker shutdown', [
      `lockOwner=${lockOwner}`,
      `wallets=${walletAliases.join(', ')}`,
    ]).catch(() => undefined);
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => {
  console.log('[LIVE_PILOT] Shutting down...');
  void shutdown();
});

process.on('SIGTERM', () => {
  console.log('[LIVE_PILOT] Shutting down...');
  void shutdown();
});

startWorker().catch((error) => {
  console.error('[LIVE_PILOT] Worker failed to start:', error);
  process.exit(1);
});
