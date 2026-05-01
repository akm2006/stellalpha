import type { Connection } from '@solana/web3.js';
import type { LivePilotWalletConfig } from '@/lib/live-pilot/config';
import { sendLivePilotAlert } from '@/lib/live-pilot/alerts';
import { getTokenBalance } from '@/lib/live-pilot/executor';
import { listActivePilotMintQuarantines } from '@/lib/live-pilot/repositories/pilot-mint-quarantines.repo';
import {
  createPilotTrade,
  listRecentCopyExitTradesForWallet,
} from '@/lib/live-pilot/repositories/pilot-trades.repo';
import { listLeaderClosedCopiedOpenPilotStates } from '@/lib/repositories/copy-position-states.repo';
import { getSolPrice, getTokenSymbol, WSOL } from '@/lib/services/token-service';

const RESIDUAL_EXIT_COOLDOWN_MS = 5 * 60 * 1000;

export async function enqueueResidualExitIntentsForWallet(args: {
  wallet: LivePilotWalletConfig;
  connection: Connection;
}) {
  const { wallet, connection } = args;
  const sinceIso = new Date(Date.now() - RESIDUAL_EXIT_COOLDOWN_MS).toISOString();
  const [copyStates, recentExitTrades, quarantines, solPrice] = await Promise.all([
    listLeaderClosedCopiedOpenPilotStates({
      scopeKey: wallet.alias,
      starTrader: wallet.starTrader,
    }),
    listRecentCopyExitTradesForWallet(wallet.alias, sinceIso),
    listActivePilotMintQuarantines(),
    getSolPrice(),
  ]);

  const quarantinedMints = new Set(quarantines.map((row) => row.mint));
  const recentExitMints = new Set(
    recentExitTrades
      .filter((row) =>
        row.token_in_mint
        && (
          ['queued', 'building', 'submitted'].includes(row.status)
          || row.trigger_reason?.startsWith('residual_')
        )
      )
      .map((row) => row.token_in_mint!)
  );

  let created = 0;
  const skipped: string[] = [];
  const createdAt = new Date().toISOString();

  for (const state of copyStates) {
    if (quarantinedMints.has(state.mint)) {
      skipped.push(`${state.mint}:quarantined`);
      continue;
    }

    if (recentExitMints.has(state.mint)) {
      skipped.push(`${state.mint}:cooldown`);
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
      recentExitMints.add(state.mint);
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
