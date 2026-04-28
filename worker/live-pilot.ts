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
  listQueuedPilotTrades,
  updatePilotTradeIfStatus,
} from '@/lib/live-pilot/repositories/pilot-trades.repo';
import { executePilotTrade, createLivePilotConnection, loadPilotWalletKeypair } from '@/lib/live-pilot/executor';
import { getLivePilotConfig, findPilotWalletByAlias } from '@/lib/live-pilot/config';
import { enqueueLiquidationIntentsForWallet } from '@/lib/live-pilot/liquidation';
import { enqueueResidualExitIntentsForWallet } from '@/lib/live-pilot/residual-exits';
import { subscribeToLivePilotQueueWake, unsubscribeFromLivePilotQueueWake } from '@/lib/live-pilot/queue-wake';
import { recoverSubmittedPilotTrades } from '@/lib/live-pilot/recovery';
import { closeZeroTokenAccounts } from '@/lib/live-pilot/token-account-rent';

const QUEUE_POLL_INTERVAL_MS = 250;
const RECOVERY_INTERVAL_MS = 5_000;
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

type PilotControlSnapshot = ReturnType<typeof buildPilotControlSnapshot>;

let controlSnapshotCache: {
  walletAliasesKey: string;
  expiresAt: number;
  snapshot: PilotControlSnapshot;
} | null = null;

const lockOwner = `${os.hostname()}:${process.pid}:live-pilot`;
const connection = createLivePilotConnection();

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scheduleQueueDrain() {
  if (isShuttingDown || isQueueDrainScheduled) {
    return;
  }

  isQueueDrainScheduled = true;
  setTimeout(() => {
    isQueueDrainScheduled = false;
    processQueuedPilotTrades().catch((error) => {
      console.error('[LIVE_PILOT] Scheduled queue drain error:', error);
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

async function processQueuedPilotTrades() {
  if (isProcessingQueue || isShuttingDown) {
    return;
  }

  isProcessingQueue = true;

  try {
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

    await runLiquidationSweep(config, controlSnapshot);
    await runTokenAccountRentSweep(config, controlSnapshot);
    await runResidualExitSweep(config, controlSnapshot);

    const queuedTrades = await listQueuedPilotTrades(QUEUE_BATCH_SIZE);
    if (queuedTrades.length === 0) {
      return;
    }

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

      let keepLock = false;

      try {
        const claimedTrade = await claimQueuedPilotTrade(trade.id, trade.attempt_count + 1);
        if (!claimedTrade) {
          continue;
        }

        const outcome = await executePilotTrade(claimedTrade, wallet, connection);
        keepLock = outcome.outcome === 'submitted';

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
        if (!keepLock) {
          await releasePilotRuntimeLock(wallet.alias, lockOwner).catch(() => undefined);
        }
      }
    }

    scheduleQueueDrain();
  } finally {
    isProcessingQueue = false;
  }
}

async function runRecoveryLoop() {
  if (isRunningRecovery || isShuttingDown) {
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
      console.error('[LIVE_PILOT] Queue loop error:', error);
    });
  }, QUEUE_POLL_INTERVAL_MS);

  setInterval(() => {
    runRecoveryLoop().catch((error) => {
      console.error('[LIVE_PILOT] Recovery loop error:', error);
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
