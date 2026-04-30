import { createClient, type RedisClientType } from 'redis';
import { livePilotRedisConfig } from './config';

let clientPromise: Promise<RedisClientType> | null = null;

export async function getLivePilotRedisClient() {
  if (!livePilotRedisConfig.url) {
    throw new Error('Missing REDIS_URL for live-pilot Redis');
  }

  if (!clientPromise) {
    const client = createClient({
      url: livePilotRedisConfig.url,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 50, 1_000),
      },
    });

    client.on('error', (error) => {
      console.error('[LIVE_PILOT_REDIS] Client error:', error);
    });

    clientPromise = client.connect().then(() => client as RedisClientType);
  }

  return clientPromise;
}

export async function closeLivePilotRedisClient() {
  if (!clientPromise) return;
  const client = await clientPromise.catch(() => null);
  clientPromise = null;
  if (client) {
    await client.quit().catch(() => undefined);
  }
}
