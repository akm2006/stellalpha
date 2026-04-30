import type { PilotControlStateRow } from '@/lib/live-pilot/types';
import { getLivePilotRedisClient } from './client';
import { isLivePilotRedisAvailable } from './config';
import { livePilotGlobalControlKey, livePilotWalletControlKey } from './keys';

function defaultControl(scopeType: 'global' | 'wallet', scopeKey: string): PilotControlStateRow {
  return {
    scope_type: scopeType,
    scope_key: scopeKey,
    is_paused: true,
    kill_switch_active: false,
    liquidation_requested: false,
    updated_by_wallet: null,
    updated_at: new Date().toISOString(),
  };
}

async function getJson<T>(key: string) {
  const client = await getLivePilotRedisClient();
  const raw = await client.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function buildRedisPilotControlSnapshot(
  rows: PilotControlStateRow[],
  walletAliases: string[],
) {
  const global =
    rows.find((row) => row.scope_type === 'global')
    || defaultControl('global', 'global');

  const wallets = walletAliases.map(
    (alias) =>
      rows.find((row) => row.scope_type === 'wallet' && row.scope_key === alias)
      || defaultControl('wallet', alias),
  );

  return { global, wallets };
}

export async function getRedisPilotControlSnapshot(walletAliases: string[]) {
  if (!isLivePilotRedisAvailable()) return null;

  const [global, ...wallets] = await Promise.all([
    getJson<PilotControlStateRow>(livePilotGlobalControlKey()),
    ...walletAliases.map((alias) => getJson<PilotControlStateRow>(livePilotWalletControlKey(alias))),
  ]);

  if (!global) {
    return null;
  }

  return buildRedisPilotControlSnapshot(
    [
      global,
      ...wallets.map((row, index) => row || defaultControl('wallet', walletAliases[index]!)),
    ],
    walletAliases,
  );
}
