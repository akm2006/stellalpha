import { NextRequest, NextResponse } from 'next/server';
import { sendLivePilotAlert } from '@/lib/live-pilot/alerts';
import { getLivePilotOperatorAccess } from '@/lib/live-pilot/auth';
import { findPilotWalletByAlias } from '@/lib/live-pilot/config';
import { createLivePilotConnection } from '@/lib/live-pilot/executor';
import { getWalletLiquidationStatus } from '@/lib/live-pilot/liquidation';
import { clearPilotMintQuarantine } from '@/lib/live-pilot/repositories/pilot-mint-quarantines.repo';
import {
  buildPilotControlSnapshot,
  ensurePilotControlState,
  listPilotControlStates,
  updatePilotControlState,
} from '@/lib/live-pilot/repositories/pilot-control-state.repo';
import { getLivePilotStatus } from '@/lib/live-pilot/status';
import { getRedisPilotControlSnapshot, setRedisPilotControlState } from '@/lib/live-pilot/redis/control';
import { reconcileAllWalletPositions } from '@/lib/live-pilot/reconciliation';
import type { PilotControlAction, PilotControlScopeType, PilotControlStateRow } from '@/lib/live-pilot/types';

export const dynamic = 'force-dynamic';

const VALID_ACTIONS: PilotControlAction[] = [
  'global_pause',
  'global_resume',
  'wallet_pause',
  'wallet_resume',
  'kill_switch_activate',
  'wallet_liquidate',
  'mint_quarantine_clear',
];

function isWalletScopedAction(action: PilotControlAction) {
  return action === 'wallet_pause' || action === 'wallet_resume' || action === 'wallet_liquidate';
}

function isEmergencyStopAction(action: PilotControlAction) {
  return (
    action === 'global_pause'
    || action === 'wallet_pause'
    || action === 'kill_switch_activate'
    || action === 'wallet_liquidate'
  );
}

function buildRedisControlFallbackRow(
  scopeType: PilotControlScopeType,
  scopeKey: string,
  patch: Parameters<typeof updatePilotControlState>[2],
  existing?: PilotControlStateRow | null,
): PilotControlStateRow {
  return {
    scope_type: scopeType,
    scope_key: scopeKey,
    // Emergency Redis fallbacks fail closed. Resume still requires DB/reconciliation.
    is_paused: patch.is_paused ?? existing?.is_paused ?? true,
    kill_switch_active: patch.kill_switch_active ?? existing?.kill_switch_active ?? false,
    liquidation_requested: patch.liquidation_requested ?? existing?.liquidation_requested ?? false,
    updated_by_wallet: patch.updated_by_wallet ?? existing?.updated_by_wallet ?? null,
    updated_at: new Date().toISOString(),
  };
}

async function updateMirroredPilotControlState(
  ...args: Parameters<typeof updatePilotControlState>
) {
  const [scopeType, scopeKey, patch] = args;
  const emergencyStop = patch.is_paused === true || patch.kill_switch_active === true || patch.liquidation_requested === true;
  const redisSnapshot = emergencyStop
    ? await getRedisPilotControlSnapshot(scopeType === 'wallet' ? [scopeKey] : []).catch(() => null)
    : null;
  const existingRedisRow = scopeType === 'global'
    ? redisSnapshot?.global
    : redisSnapshot?.wallets.find((row) => row.scope_key === scopeKey);
  const redisFallbackRow = buildRedisControlFallbackRow(scopeType, scopeKey, patch, existingRedisRow);

  if (emergencyStop) {
    await setRedisPilotControlState(redisFallbackRow).catch(() => undefined);
  }

  try {
    const row = await updatePilotControlState(...args);
    await setRedisPilotControlState(row).catch(() => undefined);
    return row;
  } catch (error) {
    if (!emergencyStop) {
      throw error;
    }

    console.warn(
      `[LIVE_PILOT_CONTROL] DB control update failed for ${scopeType}:${scopeKey}; Redis emergency stop state was still written.`,
      error,
    );
    return redisFallbackRow;
  }
}

export async function POST(request: NextRequest) {
  const access = await getLivePilotOperatorAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: { action?: PilotControlAction; walletAlias?: string; mint?: string; note?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 });
  }

  const action = body.action;
  if (!action || !VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'Unknown live-pilot control action' }, { status: 400 });
  }

  const walletAlias = body.walletAlias?.trim();
  const mint = body.mint?.trim();
  const note = body.note?.trim();
  const configuredAliases = new Set(access.config.wallets.map((wallet) => wallet.alias));

  if (isWalletScopedAction(action)) {
    if (!walletAlias) {
      return NextResponse.json({ error: 'walletAlias is required for wallet-scoped actions' }, { status: 400 });
    }

    if (!configuredAliases.has(walletAlias)) {
      return NextResponse.json({ error: 'walletAlias is not configured for the live pilot' }, { status: 400 });
    }
  }

  try {
    const aliases = Array.from(configuredAliases);
    const emergencyStop = isEmergencyStopAction(action);
    await ensurePilotControlState(aliases).catch((error) => {
      if (!emergencyStop) {
        throw error;
      }
      console.warn(
        '[LIVE_PILOT_CONTROL] Failed to ensure DB control rows before emergency stop; continuing with Redis control.',
        error,
      );
    });

    const controlSnapshot = action === 'wallet_resume'
      ? buildPilotControlSnapshot(await listPilotControlStates(), aliases)
      : buildPilotControlSnapshot([], aliases);

    switch (action) {
      case 'global_pause':
        await updateMirroredPilotControlState('global', 'global', {
          is_paused: true,
          updated_by_wallet: access.operatorWallet,
        });
        break;
      case 'global_resume':
        const resumeConn = createLivePilotConnection();
        await Promise.all(
          access.config.wallets.map((wallet) =>
            reconcileAllWalletPositions(wallet, resumeConn).catch((err) => {
              console.error(`[CONTROL] Failed to reconcile ${wallet.alias} on global resume:`, err);
            })
          )
        );
        await updateMirroredPilotControlState('global', 'global', {
          is_paused: false,
          kill_switch_active: false,
          liquidation_requested: false,
          updated_by_wallet: access.operatorWallet,
        });
        break;
      case 'wallet_pause':
        await updateMirroredPilotControlState('wallet', walletAlias!, {
          is_paused: true,
          updated_by_wallet: access.operatorWallet,
        });
        break;
      case 'wallet_resume':
        const walletConfig = findPilotWalletByAlias(access.config, walletAlias!);
        if (!walletConfig) {
          return NextResponse.json({ error: 'walletAlias is not configured for the live pilot' }, { status: 400 });
        }

        const walletControl = controlSnapshot.wallets.find((row) => row.scope_key === walletAlias!);
        const isProtectedWallet = Boolean(walletControl?.kill_switch_active || walletControl?.liquidation_requested);
        const connection = createLivePilotConnection();

        if (isProtectedWallet) {
          const liquidationStatus = await getWalletLiquidationStatus({
            walletAlias: walletAlias!,
            walletPublicKey: walletConfig.publicKey,
            connection,
          });

          if (!liquidationStatus.isFlat || liquidationStatus.activeLiquidationCount > 0) {
            return NextResponse.json(
              {
                error: 'Wallet cannot resume until it is flat and all liquidation work has settled',
                details: {
                  walletAlias,
                  meaningfulHoldingCount: liquidationStatus.meaningfulHoldingCount,
                  activeLiquidationCount: liquidationStatus.activeLiquidationCount,
                },
              },
              { status: 409 },
            );
          }
        }

        await reconcileAllWalletPositions(walletConfig, connection).catch((err) => {
          console.error(`[CONTROL] Failed to reconcile ${walletAlias} on resume:`, err);
        });
        await updateMirroredPilotControlState('wallet', walletAlias!, {
          is_paused: false,
          kill_switch_active: false,
          liquidation_requested: false,
          updated_by_wallet: access.operatorWallet,
        });
        break;
      case 'kill_switch_activate':
        await updateMirroredPilotControlState('global', 'global', {
          is_paused: true,
          kill_switch_active: true,
          liquidation_requested: true,
          updated_by_wallet: access.operatorWallet,
        });
        await Promise.all(
          access.config.wallets.map((wallet) =>
            updateMirroredPilotControlState('wallet', wallet.alias, {
              is_paused: true,
              kill_switch_active: true,
              liquidation_requested: true,
              updated_by_wallet: access.operatorWallet,
            })
          )
        );
        await sendLivePilotAlert('Kill switch activated', [
          `operator=${access.operatorWallet}`,
          `wallets=${access.config.wallets.map((wallet) => wallet.alias).join(', ')}`,
          'New automated copy trades are paused and liquidation intents will be generated for non-SOL balances.',
        ]).catch(() => undefined);
        break;
      case 'wallet_liquidate':
        await updateMirroredPilotControlState('wallet', walletAlias!, {
          is_paused: true,
          liquidation_requested: true,
          updated_by_wallet: access.operatorWallet,
        });
        await sendLivePilotAlert('Wallet liquidation requested', [
          `operator=${access.operatorWallet}`,
          `wallet=${walletAlias!}`,
        ]).catch(() => undefined);
        break;
      case 'mint_quarantine_clear':
        if (!mint) {
          return NextResponse.json({ error: 'mint is required for mint_quarantine_clear' }, { status: 400 });
        }
        await clearPilotMintQuarantine({
          mint,
          clearedByWallet: access.operatorWallet,
          note: note || null,
        });
        await sendLivePilotAlert('Mint quarantine cleared', [
          `operator=${access.operatorWallet}`,
          `mint=${mint}`,
          ...(note ? [`note=${note}`] : []),
        ]).catch(() => undefined);
        break;
      default:
        return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
    }

    const status = await getLivePilotStatus(access.operatorWallet, access.config).catch((error) => {
      console.warn(
        '[LIVE_PILOT_CONTROL] Control mutation succeeded but status refresh failed.',
        error,
      );
      return null;
    });
    return NextResponse.json({
      success: true,
      action,
      degradedStatus: status === null,
      status,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || 'Failed to mutate live-pilot control state',
        hint: 'Apply migrations/live-pilot-foundation.sql and verify the pilot_* tables exist in Supabase.',
      },
      { status: 500 }
    );
  }
}
