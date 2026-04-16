import type { Connection } from '@solana/web3.js';
import { findPilotWalletByAlias, type LivePilotConfig } from '@/lib/live-pilot/config';
import { formatSolscanTxUrl, sendLivePilotAlert } from '@/lib/live-pilot/alerts';
import { evaluateSellExitProtection, evaluateWalletCircuitBreaker } from '@/lib/live-pilot/breaker';
import {
  classifyJupiterFailure,
  computeRetryDelayMs,
  executeSignedOrder,
  getTradeRetryDelayMs,
  getPilotTradeMaxAttempts,
  isAmbiguousExecuteError,
  isExecuteRetryWindowOpen,
  isNoRouteFailure,
  maybeQueueResidualExitTrade,
  quarantineFailedMint,
  isRetryableBuyExecutionFailure,
  isRetryableExecutionCode,
  isRetryableSellExecutionFailure,
} from '@/lib/live-pilot/executor';
import { broadcastLivePilotQueueWake } from '@/lib/live-pilot/queue-wake';
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
const PENDING_EXECUTE_RETRY_MIN_INTERVAL_MS = 5_000;

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

  await evaluateWalletCircuitBreaker(walletAlias).catch(() => undefined);
  await sendLivePilotAlert('Trade failed during recovery', [
    `wallet=${walletAlias}`,
    `trade=${tradeId}`,
    `attempt=${attemptId}`,
    message,
  ]).catch(() => undefined);
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
    const nextRetryAt = new Date(Date.now() + computeRetryDelayMs(tradeAttemptCount)).toISOString();
    await updatePilotTradeIfStatus(tradeId, 'submitted', {
      status: 'queued',
      next_retry_at: nextRetryAt,
      tx_signature: null,
      tx_submitted_at: null,
      tx_confirmed_at: null,
      confirmation_slot: null,
      error_message: message,
    });
    await broadcastLivePilotQueueWake({
      source: 'recovery_requeue',
      walletAlias,
      tradeId,
    });
  } else {
    await updatePilotTradeIfStatus(tradeId, 'submitted', {
      status: 'failed',
      next_retry_at: null,
      error_message: message,
    });
  }

  await updatePilotRuntimeState(walletAlias, {
    last_error: message,
    last_reconcile_at: new Date().toISOString(),
  });

  await sendLivePilotAlert('Submitted trade expired before confirmation', [
    `wallet=${walletAlias}`,
    `trade=${tradeId}`,
    message,
  ]).catch(() => undefined);
}

async function maybeRecoverMissingExecuteSignature(args: {
  wallet: LivePilotConfig['wallets'][number];
  walletAlias: string;
  trade: NonNullable<Awaited<ReturnType<typeof getPilotTradeById>>>;
  attempt: Awaited<ReturnType<typeof listSubmittedPilotTradeAttempts>>[number];
  maxAttempts: number;
}) {
  const { wallet, walletAlias, trade, attempt, maxAttempts } = args;

  if (!attempt.jupiter_request_id || !attempt.signed_transaction) {
    await failSubmittedAttempt(
      walletAlias,
      trade.id,
      attempt.id,
      'Submitted attempt is missing Jupiter request metadata for execute recovery',
      'missing_execute_context',
    );
    return { outcome: 'failed' as const, signature: null as string | null };
  }

  const submittedAt = attempt.tx_submitted_at || attempt.created_at;
  if (!isExecuteRetryWindowOpen(submittedAt)) {
    const message = 'Jupiter execute response stayed ambiguous for longer than 2 minutes';
    await updatePilotTradeAttempt(attempt.id, {
      status: 'failed',
      error_code: 'execute_retry_window_expired',
      error_message: message,
    });

    if (trade.attempt_count < maxAttempts) {
      const nextRetryAt = new Date(
        Date.now() + getTradeRetryDelayMs(trade, trade.attempt_count, 'execute_retry_window_expired', message),
      ).toISOString();
      await updatePilotTradeIfStatus(trade.id, 'submitted', {
        status: 'queued',
        next_retry_at: nextRetryAt,
        tx_submitted_at: null,
        error_message: message,
      });
      await updatePilotRuntimeState(walletAlias, {
        last_error: message,
        last_reconcile_at: new Date().toISOString(),
      });
      await broadcastLivePilotQueueWake({
        source: 'recovery_requeue',
        walletAlias,
        tradeId: trade.id,
      });
      await sendLivePilotAlert('Ambiguous execute requeued', [
        `wallet=${walletAlias}`,
        `trade=${trade.id}`,
        `nextRetryAt=${nextRetryAt}`,
        message,
      ]).catch(() => undefined);
      return { outcome: 'requeued' as const, signature: null as string | null };
    }

    await failSubmittedAttempt(
      walletAlias,
      trade.id,
      attempt.id,
      message,
      'execute_retry_window_expired',
    );
    return { outcome: 'failed' as const, signature: null as string | null };
  }

  if (
    attempt.execute_last_attempt_at
    && Date.now() - new Date(attempt.execute_last_attempt_at).getTime() < PENDING_EXECUTE_RETRY_MIN_INTERVAL_MS
  ) {
    return { outcome: 'pending' as const, signature: null as string | null };
  }

  try {
    const executeResponse = await executeSignedOrder(attempt.jupiter_request_id, attempt.signed_transaction);
    const signature = executeResponse.signature || executeResponse.txid || executeResponse.transactionId || null;
    const retriedAt = new Date().toISOString();

    if (!signature && executeResponse.status !== 'Failed') {
      await updatePilotTradeAttempt(attempt.id, {
        execute_retry_count: (attempt.execute_retry_count || 0) + 1,
        execute_last_attempt_at: retriedAt,
      });
      return { outcome: 'pending' as const, signature: null as string | null };
    }

    if (!signature || executeResponse.status === 'Failed') {
      const code = String(executeResponse.errorCode ?? executeResponse.code ?? 'execute_failed');
      const message = executeResponse.message || executeResponse.error || 'Jupiter execute did not return a transaction signature';
      const classification = classifyJupiterFailure(message, code, isRetryableExecutionCode(code));
      const shouldQuarantineMint =
        trade.leader_type === 'sell'
        && isNoRouteFailure(message)
        && trade.attempt_count >= maxAttempts;

      await updatePilotTradeAttempt(attempt.id, {
        status: 'failed',
        error_code: code,
        error_message: message,
        execute_retry_count: (attempt.execute_retry_count || 0) + 1,
        execute_last_attempt_at: retriedAt,
      });

      if (classification.retryable && trade.attempt_count < maxAttempts) {
        const nextRetryAt = new Date(Date.now() + computeRetryDelayMs(trade.attempt_count)).toISOString();
        await updatePilotTradeIfStatus(trade.id, 'submitted', {
          status: 'queued',
          next_retry_at: nextRetryAt,
          tx_submitted_at: null,
          error_message: message,
        });
        await updatePilotRuntimeState(walletAlias, {
          last_error: message,
          last_reconcile_at: retriedAt,
        });
        await broadcastLivePilotQueueWake({
          source: 'recovery_requeue',
          walletAlias,
          tradeId: trade.id,
        });
        return { outcome: 'requeued' as const, signature: null as string | null };
      }

      if (shouldQuarantineMint) {
        await quarantineFailedMint({
          trade,
          walletAlias,
          message,
        }).catch(() => undefined);
        await updatePilotTradeIfStatus(trade.id, 'submitted', {
          status: 'skipped',
          skip_reason: 'trapped_unquotable',
          next_retry_at: null,
          error_message: message,
        });
        await updatePilotRuntimeState(walletAlias, {
          last_error: message,
          last_reconcile_at: retriedAt,
        });
        return { outcome: 'failed' as const, signature: null as string | null };
      }

      await failSubmittedAttempt(walletAlias, trade.id, attempt.id, message, code);
      if (trade.leader_type === 'sell') {
        await evaluateSellExitProtection(walletAlias).catch(() => undefined);
      }
      return { outcome: classification.terminalStatus === 'skipped' ? 'failed' as const : 'failed' as const, signature: null as string | null };
    }

    await updatePilotTradeAttempt(attempt.id, {
      tx_signature: signature,
      tx_submitted_at: attempt.tx_submitted_at || retriedAt,
      execute_retry_count: (attempt.execute_retry_count || 0) + 1,
      execute_last_attempt_at: retriedAt,
      error_code: null,
      error_message: null,
    });
    await updatePilotTradeIfStatus(trade.id, 'submitted', {
      tx_signature: signature,
      tx_submitted_at: attempt.tx_submitted_at || retriedAt,
      error_message: null,
    });
    await updatePilotRuntimeState(walletAlias, {
      last_submitted_tx_signature: signature,
      last_error: null,
      last_reconcile_at: retriedAt,
    });
    await sendLivePilotAlert('Recovered execute submission', [
      `wallet=${walletAlias}`,
      `trade=${trade.id}`,
      `signature=${signature}`,
      formatSolscanTxUrl(signature),
    ]).catch(() => undefined);
    return { outcome: 'pending' as const, signature };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retriedAt = new Date().toISOString();

    if (isAmbiguousExecuteError(error)) {
      await updatePilotTradeAttempt(attempt.id, {
        execute_retry_count: (attempt.execute_retry_count || 0) + 1,
        execute_last_attempt_at: retriedAt,
        error_message: message,
      });
      await updatePilotRuntimeState(walletAlias, {
        last_error: message,
        last_reconcile_at: retriedAt,
      });
      return { outcome: 'pending' as const, signature: null as string | null };
    }

    const code = (error as { code?: string } | undefined)?.code || 'execute_recovery_error';
      const retryable =
        isRetryableExecutionCode(code)
        || isRetryableSellExecutionFailure(trade, code, message)
        || isRetryableBuyExecutionFailure(trade, code, message);
    const classification = classifyJupiterFailure(message, code, retryable, {
      retryNoRoute: trade.leader_type === 'sell',
    });
    const shouldQuarantineMint =
      trade.leader_type === 'sell'
      && isNoRouteFailure(message)
      && trade.attempt_count >= maxAttempts;
    await updatePilotTradeAttempt(attempt.id, {
      status: 'failed',
      error_code: code,
      error_message: message,
      execute_retry_count: (attempt.execute_retry_count || 0) + 1,
      execute_last_attempt_at: retriedAt,
    });

    if (classification.retryable && trade.attempt_count < maxAttempts) {
        const nextRetryAt = new Date(Date.now() + getTradeRetryDelayMs(trade, trade.attempt_count, code, message)).toISOString();
        await updatePilotTradeIfStatus(trade.id, 'submitted', {
          status: 'queued',
          next_retry_at: nextRetryAt,
        tx_submitted_at: null,
        error_message: message,
      });
      await updatePilotRuntimeState(walletAlias, {
        last_error: message,
        last_reconcile_at: retriedAt,
      });
      await broadcastLivePilotQueueWake({
        source: 'recovery_requeue',
        walletAlias,
        tradeId: trade.id,
      });
      return { outcome: 'requeued' as const, signature: null as string | null };
    }

    if (shouldQuarantineMint) {
      await quarantineFailedMint({
        trade,
        walletAlias,
        message,
      }).catch(() => undefined);
      await updatePilotTradeIfStatus(trade.id, 'submitted', {
        status: 'skipped',
        skip_reason: 'trapped_unquotable',
        next_retry_at: null,
        error_message: message,
      });
      await updatePilotRuntimeState(walletAlias, {
        last_error: message,
        last_reconcile_at: retriedAt,
      });
      return { outcome: 'failed' as const, signature: null as string | null };
    }

    await failSubmittedAttempt(walletAlias, trade.id, attempt.id, message, code);
    if (trade.leader_type === 'sell') {
      await evaluateSellExitProtection(walletAlias).catch(() => undefined);
    }
    return { outcome: 'failed' as const, signature: null as string | null };
  }
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

      let signature = attempt.tx_signature;
      if (!signature) {
        const executeRecovery = await maybeRecoverMissingExecuteSignature({
          wallet,
          walletAlias: wallet.alias,
          trade,
          attempt,
          maxAttempts: getPilotTradeMaxAttempts(wallet, trade),
        });
        outcome = executeRecovery.outcome;
        signature = executeRecovery.signature;
      }

      if (signature && outcome === 'pending') {
        const statuses = await connection.getSignatureStatuses([signature], {
          searchTransactionHistory: true,
        });
        const status = statuses.value[0];

        if (status?.err) {
          const serializedErr = JSON.stringify(status.err);
          const code = serializedErr.includes('15001') ? '15001' : 'chain_failure';
          const message = `Submitted transaction failed on chain: ${serializedErr}`;
    const retryable =
      isRetryableExecutionCode(code)
      || isRetryableSellExecutionFailure(trade, code, message)
      || isRetryableBuyExecutionFailure(trade, code, message);

          if (retryable && trade.attempt_count < getPilotTradeMaxAttempts(wallet, trade)) {
            await updatePilotTradeAttempt(attempt.id, {
              status: 'failed',
              error_code: code,
              error_message: message,
            });

      const nextRetryAt = new Date(Date.now() + getTradeRetryDelayMs(trade, trade.attempt_count, code, message)).toISOString();
      await updatePilotTradeIfStatus(trade.id, 'submitted', {
        status: 'queued',
        next_retry_at: nextRetryAt,
              error_message: message,
            });
            await updatePilotRuntimeState(wallet.alias, {
              last_error: message,
              last_reconcile_at: new Date().toISOString(),
            });
            await broadcastLivePilotQueueWake({
              source: 'recovery_requeue',
              walletAlias: wallet.alias,
              tradeId: trade.id,
            });
            outcome = 'requeued';
          } else {
            await failSubmittedAttempt(
              wallet.alias,
              trade.id,
              attempt.id,
              message,
              code,
            );
            if (trade.leader_type === 'sell') {
              await evaluateSellExitProtection(wallet.alias).catch(() => undefined);
            }
            outcome = 'failed';
          }
        } else if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
          const confirmedAt = new Date().toISOString();
          await updatePilotTradeAttempt(attempt.id, {
            status: 'confirmed',
            tx_confirmed_at: confirmedAt,
            confirmation_slot: status.slot ?? null,
          });
          await updatePilotTradeIfStatus(trade.id, 'submitted', {
            status: 'confirmed',
            tx_confirmed_at: confirmedAt,
            confirmation_slot: status.slot ?? null,
            winning_attempt_id: attempt.id,
            next_retry_at: null,
            error_message: null,
          });
          await updatePilotRuntimeState(wallet.alias, {
            last_confirmed_tx_signature: signature,
            last_error: null,
            last_reconcile_at: confirmedAt,
          });
          const residualTrade = await maybeQueueResidualExitTrade({
            trade,
            wallet,
            connection,
            attemptedInputRaw: attempt.quoted_input_amount_raw,
          });
          await sendLivePilotAlert('Trade confirmed in recovery', [
            `wallet=${wallet.alias}`,
            `trade=${trade.id}`,
            `signature=${signature}`,
            formatSolscanTxUrl(signature),
          ]).catch(() => undefined);
          if (residualTrade) {
            await sendLivePilotAlert('Residual exit queued', [
              `wallet=${wallet.alias}`,
              `sourceTrade=${trade.id}`,
              `residualTrade=${residualTrade.id}`,
              `mint=${trade.token_in_mint}`,
            ]).catch(() => undefined);
          }
          outcome = 'confirmed';
        } else if (attempt.last_valid_block_height) {
          const currentBlockHeight = await connection.getBlockHeight('confirmed');
          const expiryThreshold = attempt.last_valid_block_height - BLOCK_EXPIRY_SAFETY_BUFFER;
          if (currentBlockHeight >= expiryThreshold) {
            const message =
              `Submitted transaction ${signature} expired before confirmation `
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
