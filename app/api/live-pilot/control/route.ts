import { NextRequest, NextResponse } from 'next/server';
import { getLivePilotOperatorAccess } from '@/lib/live-pilot/auth';
import {
  ensurePilotControlState,
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
];

function isWalletScopedAction(action: PilotControlAction) {
  return action === 'wallet_pause' || action === 'wallet_resume' || action === 'wallet_liquidate';
}

export async function POST(request: NextRequest) {
  const access = await getLivePilotOperatorAccess();
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  let body: { action?: PilotControlAction; walletAlias?: string } = {};
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
        break;
      case 'wallet_liquidate':
        await updatePilotControlState('wallet', walletAlias!, {
          is_paused: true,
          liquidation_requested: true,
          updated_by_wallet: access.operatorWallet,
        });
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
