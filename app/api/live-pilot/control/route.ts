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
import type { PilotControlAction } from '@/lib/live-pilot/types';

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
    await ensurePilotControlState(Array.from(configuredAliases));
    const controlSnapshot = buildPilotControlSnapshot(await listPilotControlStates(), Array.from(configuredAliases));

    switch (action) {
      case 'global_pause':
        await updatePilotControlState('global', 'global', {
          is_paused: true,
          updated_by_wallet: access.operatorWallet,
        });
        break;
      case 'global_resume':
        await updatePilotControlState('global', 'global', {
          is_paused: false,
          kill_switch_active: false,
          liquidation_requested: false,
          updated_by_wallet: access.operatorWallet,
        });
        break;
      case 'wallet_pause':
        await updatePilotControlState('wallet', walletAlias!, {
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
        if (isProtectedWallet) {
          const connection = createLivePilotConnection();
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

        await updatePilotControlState('wallet', walletAlias!, {
          is_paused: false,
          kill_switch_active: false,
          liquidation_requested: false,
          updated_by_wallet: access.operatorWallet,
        });
        break;
      case 'kill_switch_activate':
        await updatePilotControlState('global', 'global', {
          is_paused: true,
          kill_switch_active: true,
          liquidation_requested: true,
          updated_by_wallet: access.operatorWallet,
        });
        await Promise.all(
          access.config.wallets.map((wallet) =>
            updatePilotControlState('wallet', wallet.alias, {
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
        await updatePilotControlState('wallet', walletAlias!, {
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

    const status = await getLivePilotStatus(access.operatorWallet, access.config);
    return NextResponse.json({
      success: true,
      action,
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
