import { toLivePilotConfigSummary } from '@/lib/live-pilot/config';
import type { LivePilotConfig } from '@/lib/live-pilot/config';
import type { LivePilotStatusResponse } from '@/lib/live-pilot/types';
import {
  buildPilotControlSnapshot,
  ensurePilotControlState,
  listPilotControlStates,
} from '@/lib/live-pilot/repositories/pilot-control-state.repo';
import {
  ensurePilotRuntimeState,
  listPilotRuntimeStates,
} from '@/lib/live-pilot/repositories/pilot-runtime-state.repo';
import { listRecentPilotTrades } from '@/lib/live-pilot/repositories/pilot-trades.repo';

export async function getLivePilotStatus(
  operatorWallet: string,
  config: LivePilotConfig,
): Promise<LivePilotStatusResponse> {
  const walletAliases = config.wallets.map((wallet) => wallet.alias);

  await ensurePilotControlState(walletAliases);
  await ensurePilotRuntimeState(config.wallets);

  const [controlRows, runtimeRows, recentTrades] = await Promise.all([
    listPilotControlStates(),
    listPilotRuntimeStates(walletAliases),
    listRecentPilotTrades(15),
  ]);

  const control = buildPilotControlSnapshot(controlRows, walletAliases);
  const walletStatuses = config.wallets.map((wallet) => {
    const { secret: _secret, ...publicWallet } = wallet;
    return {
      config: publicWallet,
      control: control.wallets.find((row) => row.scope_key === wallet.alias)!,
      runtime: runtimeRows.find((row) => row.wallet_alias === wallet.alias) || null,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    operatorWallet,
    controlPlaneOnly: false,
    config: toLivePilotConfigSummary(config),
    summary: {
      globalPaused: control.global.is_paused,
      killSwitchActive: control.global.kill_switch_active,
      configuredWalletCount: config.wallets.length,
      healthyWalletCount: config.wallets.filter((wallet) => wallet.isComplete && wallet.hasSecret).length,
      recentTradeCount: recentTrades.length,
    },
    control,
    runtime: runtimeRows,
    walletStatuses,
    recentTrades,
  };
}
