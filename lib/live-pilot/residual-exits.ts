import type { Connection } from '@solana/web3.js';
import type { LivePilotWalletConfig } from '@/lib/live-pilot/config';
import { sendLivePilotAlert } from '@/lib/live-pilot/alerts';
import { getTokenBalance } from '@/lib/live-pilot/executor';
import {
  listActivePilotMintQuarantines,
  quarantinePilotMint,
} from '@/lib/live-pilot/repositories/pilot-mint-quarantines.repo';
import {
  createPilotTrade,
  listActiveCopyExitTradesForWallet,
  listRecentCopyExitTradesForWallet,
} from '@/lib/live-pilot/repositories/pilot-trades.repo';
import { listLeaderClosedCopiedOpenPilotStates } from '@/lib/repositories/copy-position-states.repo';
import { getSolPrice, getTokenSymbol, WSOL } from '@/lib/services/token-service';

const RESIDUAL_EXIT_COOLDOWN_MS = 5 * 60 * 1000;
const RESIDUAL_NO_ROUTE_WINDOW_MS = 30 * 60 * 1000;
const RESIDUAL_NO_ROUTE_QUARANTINE_THRESHOLD = 2;

function isResidualExitReason(value: string | null | undefined) {
  return Boolean(value?.startsWith('residual_'));
}

function isNoRouteResidualFailure(row: {
  trigger_reason: string | null;
  skip_reason: string | null;
  error_message: string | null;
}) {
  if (!isResidualExitReason(row.trigger_reason)) {
    return false;
  }

  const text = `${row.skip_reason || ''} ${row.error_message || ''}`.toLowerCase();
  return (
    text.includes('no_route')
    || text.includes('trapped_unquotable')
    || text.includes('no route')
    || text.includes('no quote')
    || text.includes('route not found')
    || text.includes('failed to get quotes')
    || text.includes('failed to get quote')
  );
}

export async function enqueueResidualExitIntentsForWallet(args: {
  wallet: LivePilotWalletConfig;
  connection: Connection;
}) {
  const { wallet, connection } = args;
  const sinceIso = new Date(Date.now() - RESIDUAL_EXIT_COOLDOWN_MS).toISOString();
  const noRouteSinceIso = new Date(Date.now() - RESIDUAL_NO_ROUTE_WINDOW_MS).toISOString();
  const [copyStates, cooldownExitTrades, recentNoRouteExitTrades, activeExitTrades, quarantines, solPrice] = await Promise.all([
    listLeaderClosedCopiedOpenPilotStates({
      scopeKey: wallet.alias,
      starTrader: wallet.starTrader,
    }),
    listRecentCopyExitTradesForWallet(wallet.alias, sinceIso),
    listRecentCopyExitTradesForWallet(wallet.alias, noRouteSinceIso),
    listActiveCopyExitTradesForWallet(wallet.alias),
    listActivePilotMintQuarantines(),
    getSolPrice(),
  ]);

  const quarantinedMints = new Set(quarantines.map((row) => row.mint));
  const blockedExitMints = new Set(
    activeExitTrades
      .filter((row) => row.token_in_mint)
      .map((row) => row.token_in_mint!)
  );

  for (const row of cooldownExitTrades
      .filter((row) =>
        row.token_in_mint
        && (
          ['queued', 'building', 'submitted'].includes(row.status)
          || isResidualExitReason(row.trigger_reason)
        )
      )
  ) {
    blockedExitMints.add(row.token_in_mint!);
  }

  const recentNoRouteCounts = new Map<string, number>();
  for (const row of recentNoRouteExitTrades) {
    if (!row.token_in_mint || !isNoRouteResidualFailure(row)) {
      continue;
    }

    recentNoRouteCounts.set(row.token_in_mint, (recentNoRouteCounts.get(row.token_in_mint) || 0) + 1);
  }

  let created = 0;
  const skipped: string[] = [];
  const createdAt = new Date().toISOString();

  for (const state of copyStates) {
    if (quarantinedMints.has(state.mint)) {
      skipped.push(`${state.mint}:quarantined`);
      continue;
    }

    if ((recentNoRouteCounts.get(state.mint) || 0) >= RESIDUAL_NO_ROUTE_QUARANTINE_THRESHOLD) {
      const note =
        `Residual exit saw ${recentNoRouteCounts.get(state.mint)} no-route failure(s) `
        + `within ${Math.round(RESIDUAL_NO_ROUTE_WINDOW_MS / 60_000)}m`;
      await quarantinePilotMint({
        mint: state.mint,
        reason: 'trapped_unquotable',
        firstWalletAlias: wallet.alias,
        firstStarTrader: wallet.starTrader,
        note,
      }).catch(() => undefined);
      skipped.push(`${state.mint}:residual_no_route_quarantined`);
      quarantinedMints.add(state.mint);
      continue;
    }

    if (blockedExitMints.has(state.mint)) {
      skipped.push(`${state.mint}:active_or_recent_exit`);
      continue;
    }

    const tokenBalance = await getTokenBalance(connection, wallet.publicKey, state.mint);
    if (tokenBalance.uiAmount <= 0) {
      skipped.push(`${state.mint}:no_onchain_balance`);
      continue;
    }

    const copiedPositionBefore = Math.min(Number(state.copied_open_amount || 0), tokenBalance.uiAmount);
    if (copiedPositionBefore <= 0) {
      skipped.push(`${state.mint}:zero_copied_position`);
      continue;
    }

    const result = await createPilotTrade({
      wallet_alias: wallet.alias,
      wallet_public_key: wallet.publicKey,
      trigger_kind: 'copy',
      trigger_reason: `residual_sweep:${state.mint}`,
      star_trader: wallet.starTrader,
      star_trade_signature: null,
      leader_type: 'sell',
      token_in_mint: state.mint,
      token_out_mint: WSOL,
      copy_ratio: 1,
      leader_position_before: 0,
      leader_position_after: 0,
      copied_position_before: copiedPositionBefore,
      copied_position_after: copiedPositionBefore,
      sell_fraction: 1,
      leader_block_timestamp: state.last_leader_trade_at,
      received_at: createdAt,
      intent_created_at: createdAt,
      sol_price_at_intent: solPrice,
      status: 'queued',
      skip_reason: null,
      error_message: null,
      next_retry_at: null,
    });

    if (result.created) {
      created += 1;
      blockedExitMints.add(state.mint);
    }
  }

  if (created > 0) {
    await sendLivePilotAlert('Residual copy exits queued', [
      `wallet=${wallet.alias}`,
      `count=${created}`,
      `tokens=${copyStates.map((state) => getTokenSymbol(state.mint)).slice(0, 12).join(', ')}`,
    ]).catch(() => undefined);
  }

  return {
    scanned: copyStates.length,
    created,
    skipped,
  };
}
