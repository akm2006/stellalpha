import { sendLivePilotAlert } from '@/lib/live-pilot/alerts';
import {
  buildPilotControlSnapshot,
  listPilotControlStates,
  updatePilotControlState,
} from '@/lib/live-pilot/repositories/pilot-control-state.repo';
import { countRecentFailedPilotTradeAttempts } from '@/lib/live-pilot/repositories/pilot-trade-attempts.repo';

const CIRCUIT_BREAKER_WINDOW_MINUTES = 10;
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const CIRCUIT_BREAKER_ACTOR = 'system:circuit-breaker';
const EXIT_PROTECTION_WINDOW_MINUTES = Number(process.env.PILOT_EXIT_PROTECTION_WINDOW_MINUTES || 10);
const EXIT_PROTECTION_FAILURE_THRESHOLD = Number(process.env.PILOT_EXIT_PROTECTION_FAILURE_THRESHOLD || 2);
const EXIT_PROTECTION_ACTOR = 'system:exit-protection';

export async function evaluateWalletCircuitBreaker(walletAlias: string) {
  const sinceIso = new Date(Date.now() - CIRCUIT_BREAKER_WINDOW_MINUTES * 60_000).toISOString();
  const failureCount = await countRecentFailedPilotTradeAttempts(walletAlias, sinceIso);

  if (failureCount < CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
    return { tripped: false, failureCount };
  }

  const snapshot = buildPilotControlSnapshot(await listPilotControlStates(), [walletAlias]);
  const walletControl = snapshot.wallets[0];
  const alreadyTripped =
    walletControl.is_paused
    && walletControl.updated_by_wallet === CIRCUIT_BREAKER_ACTOR;

  if (!alreadyTripped) {
    await updatePilotControlState('wallet', walletAlias, {
      is_paused: true,
      updated_by_wallet: CIRCUIT_BREAKER_ACTOR,
    });

    await sendLivePilotAlert('Wallet circuit breaker tripped', [
      `wallet=${walletAlias}`,
      `failed_attempts_last_${CIRCUIT_BREAKER_WINDOW_MINUTES}m=${failureCount}`,
      'The wallet was auto-paused after repeated live-pilot execution failures.',
    ]).catch(() => undefined);
  }

  return { tripped: true, failureCount };
}

export async function evaluateSellExitProtection(walletAlias: string) {
  const sinceIso = new Date(Date.now() - EXIT_PROTECTION_WINDOW_MINUTES * 60_000).toISOString();
  const failureCount = await countRecentFailedPilotTradeAttempts(walletAlias, sinceIso, {
    leaderType: 'sell',
  });

  if (failureCount < EXIT_PROTECTION_FAILURE_THRESHOLD) {
    return { activated: false, failureCount };
  }

  const snapshot = buildPilotControlSnapshot(await listPilotControlStates(), [walletAlias]);
  const walletControl = snapshot.wallets[0];
  const alreadyProtected =
    walletControl.is_paused
    && walletControl.kill_switch_active
    && walletControl.liquidation_requested
    && walletControl.updated_by_wallet === EXIT_PROTECTION_ACTOR;

  if (!alreadyProtected) {
    await updatePilotControlState('wallet', walletAlias, {
      is_paused: true,
      kill_switch_active: true,
      liquidation_requested: true,
      updated_by_wallet: EXIT_PROTECTION_ACTOR,
    });

    await sendLivePilotAlert('Sell exit protection activated', [
      `wallet=${walletAlias}`,
      `failed_sell_attempts_last_${EXIT_PROTECTION_WINDOW_MINUTES}m=${failureCount}`,
      'New buys are blocked for this wallet and liquidation mode has been requested until the wallet is flat.',
    ]).catch(() => undefined);
  }

  return { activated: true, failureCount };
}
