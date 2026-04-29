import os from 'os';
import { findPilotWalletByAlias, getLivePilotConfig } from '@/lib/live-pilot/config';
import { createLivePilotConnection, executePilotTrade } from '@/lib/live-pilot/executor';
import {
  releasePilotRuntimeLock,
  tryAcquirePilotRuntimeLock,
} from '@/lib/live-pilot/repositories/pilot-runtime-state.repo';
import { claimQueuedPilotTrade } from '@/lib/live-pilot/repositories/pilot-trades.repo';
import type { PilotTradeRow } from '@/lib/live-pilot/types';

const FAST_LANE_LOCK_WAIT_MS = 250;
const FAST_LANE_LOCK_POLL_MS = 25;

let connection: ReturnType<typeof createLivePilotConnection> | null = null;

function isFastLaneEnabled() {
  return ['1', 'true', 'yes', 'on'].includes(
    (process.env.LIVE_PILOT_FAST_LANE_ENABLED || 'true').trim().toLowerCase(),
  );
}

function getConnection() {
  if (!connection) {
    connection = createLivePilotConnection();
  }
  return connection;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryAcquireFastLaneLock(walletAlias: string, lockOwner: string) {
  const deadline = Date.now() + FAST_LANE_LOCK_WAIT_MS;
  while (Date.now() <= deadline) {
    const lock = await tryAcquirePilotRuntimeLock(walletAlias, lockOwner);
    if (lock) {
      return true;
    }
    await wait(FAST_LANE_LOCK_POLL_MS);
  }
  return false;
}

export async function maybeExecuteLivePilotFastLane(trade: PilotTradeRow | null | undefined) {
  if (!trade || trade.status !== 'queued' || !isFastLaneEnabled()) {
    return {
      attempted: false as const,
      reason: trade ? 'not_queued_or_disabled' : 'missing_trade',
    };
  }

  const config = getLivePilotConfig();
  if (config.errors.length > 0) {
    console.warn(`[LIVE_PILOT_FAST_LANE] Disabled by config errors: ${config.errors.join(' | ')}`);
    return { attempted: false as const, reason: 'config_error' };
  }

  const wallet = findPilotWalletByAlias(config, trade.wallet_alias);
  if (!wallet?.isEnabled || !wallet.isComplete || !wallet.hasSecret) {
    return { attempted: false as const, reason: 'wallet_not_ready' };
  }

  const lockOwner = `${os.hostname()}:${process.pid}:live-pilot-fast-lane`;
  const lockAcquired = await tryAcquireFastLaneLock(wallet.alias, lockOwner);
  if (!lockAcquired) {
    return { attempted: false as const, reason: 'wallet_busy' };
  }

  try {
    const claimedTrade = await claimQueuedPilotTrade(trade.id, trade.attempt_count + 1);
    if (!claimedTrade) {
      return { attempted: false as const, reason: 'already_claimed' };
    }

    const outcome = await executePilotTrade(claimedTrade, wallet, getConnection());
    console.log(
      `[LIVE_PILOT_FAST_LANE] ${wallet.alias}: ${claimedTrade.id} ${outcome.outcome}`,
    );
    return { attempted: true as const, outcome };
  } finally {
    await releasePilotRuntimeLock(wallet.alias, lockOwner).catch(() => undefined);
  }
}
