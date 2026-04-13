import type { Connection } from '@solana/web3.js';
import { findPilotWalletByAlias, type LivePilotConfig } from '@/lib/live-pilot/config';
import { getPilotTradeMaxAttempts } from '@/lib/live-pilot/executor';
import {
  listSubmittedPilotTradeAttempts,
  updatePilotTradeAttempt,
} from '@/lib/live-pilot/repositories/pilot-trade-attempts.repo';
import {
  getPilotRuntimeState,
  releasePilotRuntimeLock,
  tryAcquirePilotRuntimeLock,
  updatePilotRuntimeState,
} from '@/lib/live-pilot/repositories/pilot-runtime-state.repo';
import {
  getPilotTradeById,
  updatePilotTrade,
  updatePilotTradeIfStatus,
} from '@/lib/live-pilot/repositories/pilot-trades.repo';

const BLOCK_EXPIRY_SAFETY_BUFFER = 10;

type RecoveryAttemptOutcome = 'confirmed' | 'requeued' | 'failed' | 'pending' | 'busy';

async function ensureRecoveryLock(walletAlias: string, lockOwner: string) {
  const runtime = await getPilotRuntimeState(walletAlias);
  if (runtime?.lock_owner === lockOwner) {
    return true;
  }

  const acquired = await tryAcquirePilotRuntimeLock(walletAlias, lockOwner);
  return Boolean(acquired);
}

async function failSubmittedAttempt(
  walletAlias: string,
  tradeId: string,
  attemptId: string,
  message: string,
  code: string,
) {
  await updatePilotTradeAttempt(attemptId, {
    status: 'failed',
    error_code: code,
    error_message: message,
  });

  await updatePilotTradeIfStatus(tradeId, 'submitted', {
    status: 'failed',
    error_message: message,
  });

  await updatePilotRuntimeState(walletAlias, {
    last_error: message,
    last_reconcile_at: new Date().toISOString(),
  });
}

async function maybeRequeueExpiredAttempt(args: {
  walletAlias: string;
  tradeId: string;
  attemptId: string;
  tradeAttemptCount: number;
  maxAttempts: number;
  message: string;
}) {
  const {
    walletAlias,
    tradeId,
    attemptId,
    tradeAttemptCount,
    maxAttempts,
    message,
  } = args;

  await updatePilotTradeAttempt(attemptId, {
    status: 'failed',
    error_code: 'expired_blockhash',
    error_message: message,
  });

  if (tradeAttemptCount < maxAttempts) {
    await updatePilotTradeIfStatus(tradeId, 'submitted', {
      status: 'queued',
      tx_signature: null,
      tx_submitted_at: null,
      tx_confirmed_at: null,
      confirmation_slot: null,
      error_message: message,
    });
  } else {
    await updatePilotTradeIfStatus(tradeId, 'submitted', {
      status: 'failed',
      error_message: message,
    });
  }

  await updatePilotRuntimeState(walletAlias, {
    last_error: message,
    last_reconcile_at: new Date().toISOString(),
  });
}

export async function recoverSubmittedPilotTrades(args: {
  config: LivePilotConfig;
  connection: Connection;
  lockOwner: string;
  limit?: number;
}) {
  const { config, connection, lockOwner, limit = 50 } = args;
  const attempts = await listSubmittedPilotTradeAttempts(limit);

  const summary = {
    scanned: attempts.length,
    confirmed: 0,
    requeued: 0,
    failed: 0,
    pending: 0,
    busy: 0,
  };

  for (const attempt of attempts) {
    const trade = await getPilotTradeById(attempt.pilot_trade_id);
    if (!trade || trade.status !== 'submitted') {
      continue;
    }

    const wallet = findPilotWalletByAlias(config, trade.wallet_alias);
    if (!wallet) {
      await failSubmittedAttempt(
        trade.wallet_alias,
        trade.id,
        attempt.id,
        `Configured wallet ${trade.wallet_alias} no longer exists for submitted recovery`,
        'wallet_missing',
      );
      summary.failed += 1;
      continue;
    }

    const lockAcquired = await ensureRecoveryLock(wallet.alias, lockOwner);
    if (!lockAcquired) {
      summary.busy += 1;
      continue;
    }

    let outcome: RecoveryAttemptOutcome = 'pending';
    let encounteredError = false;

    try {
      await updatePilotRuntimeState(wallet.alias, {
        last_reconcile_at: new Date().toISOString(),
      });

      if (!attempt.tx_signature) {
        await failSubmittedAttempt(
          wallet.alias,
          trade.id,
          attempt.id,
          'Submitted attempt is missing a transaction signature',
          'missing_signature',
        );
        outcome = 'failed';
      } else {
        const statuses = await connection.getSignatureStatuses([attempt.tx_signature], {
          searchTransactionHistory: true,
        });
        const status = statuses.value[0];

        if (status?.err) {
          const message = `Submitted transaction failed on chain: ${JSON.stringify(status.err)}`;
          await failSubmittedAttempt(
            wallet.alias,
            trade.id,
            attempt.id,
            message,
            'chain_failure',
          );
          outcome = 'failed';
        } else if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
          const transaction = await connection.getTransaction(attempt.tx_signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
          }).catch(() => null);

          const confirmedAt = new Date().toISOString();
          await updatePilotTradeAttempt(attempt.id, {
            status: 'confirmed',
            tx_confirmed_at: confirmedAt,
            confirmation_slot: transaction?.slot ?? status.slot ?? null,
          });
          await updatePilotTradeIfStatus(trade.id, 'submitted', {
            status: 'confirmed',
            tx_confirmed_at: confirmedAt,
            confirmation_slot: transaction?.slot ?? status.slot ?? null,
            winning_attempt_id: attempt.id,
            error_message: null,
          });
          await updatePilotRuntimeState(wallet.alias, {
            last_confirmed_tx_signature: attempt.tx_signature,
            last_error: null,
            last_reconcile_at: confirmedAt,
          });
          outcome = 'confirmed';
        } else if (attempt.last_valid_block_height) {
          const currentBlockHeight = await connection.getBlockHeight('confirmed');
          const expiryThreshold = attempt.last_valid_block_height - BLOCK_EXPIRY_SAFETY_BUFFER;
          if (currentBlockHeight >= expiryThreshold) {
            const message =
              `Submitted transaction ${attempt.tx_signature} expired before confirmation `
              + `(block height ${currentBlockHeight} >= ${expiryThreshold})`;

            await maybeRequeueExpiredAttempt({
              walletAlias: wallet.alias,
              tradeId: trade.id,
              attemptId: attempt.id,
              tradeAttemptCount: trade.attempt_count,
              maxAttempts: getPilotTradeMaxAttempts(wallet, trade),
              message,
            });

            outcome = trade.attempt_count < getPilotTradeMaxAttempts(wallet, trade) ? 'requeued' : 'failed';
          }
        }
      }
    } catch (error) {
      encounteredError = true;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[LIVE_PILOT] Recovery error for trade ${trade.id}:`, error);
      await updatePilotRuntimeState(wallet.alias, {
        last_error: message,
        last_reconcile_at: new Date().toISOString(),
      });
    } finally {
      if (outcome !== 'pending' || encounteredError) {
        await releasePilotRuntimeLock(wallet.alias, lockOwner);
      }
    }

    if (encounteredError) {
      summary.failed += 1;
    } else {
      summary[outcome] += 1;
    }
  }

  return summary;
}
