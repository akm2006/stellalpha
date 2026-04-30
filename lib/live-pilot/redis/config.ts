function boolEnv(name: string, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function intEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const livePilotRedisConfig = {
  url: process.env.REDIS_URL || '',
  enabled: boolEnv('LIVE_PILOT_REDIS_ENABLED', false),
  executionEnabled: boolEnv('LIVE_PILOT_REDIS_EXECUTION_ENABLED', false),
  mirrorEnabled: boolEnv('LIVE_PILOT_REDIS_MIRROR_ENABLED', true),
  consumerGroup: process.env.LIVE_PILOT_REDIS_CONSUMER_GROUP || 'live-pilot-executors',
  streamMaxLen: intEnv('LIVE_PILOT_REDIS_STREAM_MAXLEN', 50_000),
  lockTtlMs: intEnv('LIVE_PILOT_REDIS_LOCK_TTL_MS', 15_000),
  lockExtendMs: intEnv('LIVE_PILOT_REDIS_LOCK_EXTEND_MS', 8_000),
  pendingIdleMs: intEnv('LIVE_PILOT_REDIS_PENDING_IDLE_MS', 30_000),
  maxDeliveries: intEnv('LIVE_PILOT_REDIS_MAX_DELIVERIES', 3),
  dedupeTtlSeconds: intEnv('LIVE_PILOT_REDIS_DEDUPE_TTL_SECONDS', 7 * 24 * 60 * 60),
  readBlockMs: intEnv('LIVE_PILOT_REDIS_READ_BLOCK_MS', 250),
  readCount: intEnv('LIVE_PILOT_REDIS_READ_COUNT', 10),
};

export function isLivePilotRedisAvailable() {
  return livePilotRedisConfig.enabled && Boolean(livePilotRedisConfig.url);
}
