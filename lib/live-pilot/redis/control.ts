import {
  buildPilotControlSnapshot,
  listPilotControlStates,
} from '@/lib/live-pilot/repositories/pilot-control-state.repo';
import type { PilotControlStateRow } from '@/lib/live-pilot/types';
import { getLivePilotRedisClient } from './client';
import { isLivePilotRedisAvailable } from './config';
import { livePilotGlobalControlKey, livePilotWalletControlKey } from './keys';
export { getRedisPilotControlSnapshot } from './control-snapshot';

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

async function setJson(key: string, value: unknown) {
  const client = await getLivePilotRedisClient();
  await client.set(key, JSON.stringify(value));
}

export async function setRedisPilotControlState(row: PilotControlStateRow) {
  if (!isLivePilotRedisAvailable()) return;
  await setJson(
    row.scope_type === 'global' ? livePilotGlobalControlKey() : livePilotWalletControlKey(row.scope_key),
    row,
  );
}

export async function hydrateRedisPilotControlState(walletAliases: string[]) {
  if (!isLivePilotRedisAvailable()) return false;
  const rows = await listPilotControlStates();
  const snapshot = buildPilotControlSnapshot(rows, walletAliases);
  await Promise.all([
    setRedisPilotControlState(snapshot.global),
    ...snapshot.wallets.map((row) => setRedisPilotControlState(row)),
  ]);
  return true;
}
