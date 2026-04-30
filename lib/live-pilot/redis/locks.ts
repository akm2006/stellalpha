import { getLivePilotRedisClient } from './client';
import { livePilotRedisConfig } from './config';
import { livePilotWalletLockKey } from './keys';

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

const EXTEND_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return 0
`;

export async function acquireLivePilotRedisWalletLock(walletAlias: string, owner: string) {
  const client = await getLivePilotRedisClient();
  const result = await client.set(livePilotWalletLockKey(walletAlias), owner, {
    NX: true,
    PX: livePilotRedisConfig.lockTtlMs,
  });
  return result === 'OK';
}

export async function releaseLivePilotRedisWalletLock(walletAlias: string, owner: string) {
  const client = await getLivePilotRedisClient();
  await client.eval(RELEASE_LOCK_SCRIPT, {
    keys: [livePilotWalletLockKey(walletAlias)],
    arguments: [owner],
  });
}

export async function extendLivePilotRedisWalletLock(walletAlias: string, owner: string) {
  const client = await getLivePilotRedisClient();
  const result = await client.eval(EXTEND_LOCK_SCRIPT, {
    keys: [livePilotWalletLockKey(walletAlias)],
    arguments: [owner, String(livePilotRedisConfig.lockTtlMs)],
  });
  return result === 1;
}
