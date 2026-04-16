import { PublicKey } from '@solana/web3.js';
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
import { createPilotTrade } from '@/lib/live-pilot/repositories/pilot-trades.repo';
import {
  BUY_STALENESS_THRESHOLD_MS,
  computeCopyTradeSignal,
  createPrivateRpcConnection,
} from '@/lib/ingestion/copy-signal';
import { findPilotWalletForStarTrader, getLivePilotPublicConfig } from '@/lib/live-pilot/config';

const LIVE_PILOT_TECHNICAL_MIN_SOL = 0.005;

export interface PilotIntentResult {
  considered: boolean;
  created: boolean;
  duplicate: boolean;
  status?: 'queued' | 'skipped';
  skipReason?: string;
}

function toIso(ms: number) {
  return new Date(ms).toISOString();
}

function toBlockTimestampIso(timestampSeconds: number) {
  return new Date(timestampSeconds * 1000).toISOString();
}

export async function maybeCreatePilotIntent(trade: RawTrade, receivedAt: number): Promise<PilotIntentResult> {
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

  await ensurePilotControlState([pilotWallet.alias]);
  await ensurePilotRuntimeState([pilotWallet]);

  const runtimePatchBase = {
    star_trader: trade.wallet,
    last_seen_star_trade_signature: trade.signature,
  };

  try {
    const controlRows = await listPilotControlStates();
    const control = buildPilotControlSnapshot(controlRows, [pilotWallet.alias]);
    const walletControl = control.wallets[0];

    const connection = createPrivateRpcConnection();
    const signal = await computeCopyTradeSignal(trade, receivedAt, connection);
    const copyRatio = Math.min(Math.max(signal.finalRatio, 0), 1);

    let deployableSol: number | null = null;
    let skipReason: string | null = null;

    if (!connection) {
      skipReason = 'rpc_unavailable';
    } else {
      try {
        const lamports = await connection.getBalance(new PublicKey(pilotWallet.publicKey), 'confirmed');
        const walletBalanceSol = lamports / 1e9;
        const reserveSol = Math.max(
          walletBalanceSol * pilotWallet.feeReservePct,
          pilotWallet.minFeeReserveSol,
        );
        deployableSol = Math.max(0, walletBalanceSol - reserveSol);
      } catch (error: any) {
        console.warn(`[LIVE_PILOT] Failed to fetch pilot wallet balance for ${pilotWallet.alias}:`, error?.message || error);
        skipReason = 'balance_unavailable';
      }
    }

    if (!skipReason && control.global.kill_switch_active) {
      skipReason = 'kill_switch_active';
    } else if (!skipReason && walletControl.kill_switch_active) {
      skipReason = 'wallet_kill_switch_active';
    } else if (!skipReason && control.global.is_paused) {
      skipReason = 'global_paused';
    } else if (!skipReason && walletControl.is_paused) {
      skipReason = 'wallet_paused';
    } else if (!skipReason && copyRatio <= 0) {
      skipReason = 'zero_copy_ratio';
    } else if (!skipReason && signal.isStaleBuy) {
      skipReason = 'stale_buy';
    } else if (!skipReason && trade.type === 'buy') {
      const outputMint = trade.tokenOutMint || null;
      if (outputMint && await isPilotMintQuarantined(outputMint)) {
        skipReason = 'mint_quarantined';
      }

      const desiredInputSol = (deployableSol || 0) * copyRatio;

      if (!skipReason && (deployableSol || 0) <= 0) {
        skipReason = 'insufficient_deployable_sol';
      } else if (!skipReason && desiredInputSol < LIVE_PILOT_TECHNICAL_MIN_SOL) {
        skipReason = 'technically_too_small';
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
      leader_block_timestamp: toBlockTimestampIso(trade.timestamp),
      received_at: toIso(receivedAt),
      intent_created_at: toIso(intentCreatedAt),
      deployable_sol_at_intent: deployableSol,
      sol_price_at_intent: signal.solPrice,
      status,
      skip_reason: skipReason,
      error_message: null,
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
        + `(${skipReason}, age=${Math.round(signal.tradeAgeMs / 1000)}s, stale-threshold=${BUY_STALENESS_THRESHOLD_MS / 1000}s)`
      );
    } else {
      console.log(
        `[LIVE_PILOT] Queued pilot intent for ${pilotWallet.alias} / ${trade.signature.slice(0, 12)}... `
        + `(ratio=${(copyRatio * 100).toFixed(2)}%, deployable=${(deployableSol || 0).toFixed(4)} SOL)`
      );
    }

    return { considered: true, created: true, duplicate: false, status, skipReason: skipReason || undefined };
  } catch (error: any) {
    await updatePilotRuntimeState(pilotWallet.alias, {
      ...runtimePatchBase,
      last_error: error?.message || 'Intent production failed',
    }).catch(() => undefined);

    throw error;
  }
}
