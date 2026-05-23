import type { Connection } from '@solana/web3.js';

const DEFAULT_RPC_MIN_INTERVAL_MS = 40;
const DEFAULT_RPC_MAX_CONCURRENCY = 2;
const DEFAULT_RPC_429_BACKOFF_MS = 1_500;
const DEFAULT_RPC_429_BACKOFF_MAX_MS = 15_000;

const RPC_METHODS_TO_LIMIT = new Set([
  'confirmTransaction',
  'getAccountInfo',
  'getBalance',
  'getLatestBlockhash',
  'getParsedAccountInfo',
  'getParsedTokenAccountsByOwner',
  'getSignatureStatuses',
  'getTokenAccountBalance',
  'sendRawTransaction',
  'sendTransaction',
]);

type QueueItem<T> = {
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

let active = 0;
let lastStartAt = 0;
let backoffUntil = 0;
const queue: QueueItem<unknown>[] = [];

function readPositiveIntEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function isRpc429(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('429') || message.toLowerCase().includes('too many requests');
}

function nextDelayMs() {
  const minIntervalMs = readPositiveIntEnv(
    'LIVE_PILOT_RPC_MIN_INTERVAL_MS',
    DEFAULT_RPC_MIN_INTERVAL_MS,
  );
  return Math.max(0, Math.max(lastStartAt + minIntervalMs, backoffUntil) - Date.now());
}

function drainQueue() {
  const maxConcurrency = readPositiveIntEnv(
    'LIVE_PILOT_RPC_MAX_CONCURRENCY',
    DEFAULT_RPC_MAX_CONCURRENCY,
  );
  if (active >= maxConcurrency || queue.length === 0) {
    return;
  }

  const delayMs = nextDelayMs();
  if (delayMs > 0) {
    setTimeout(drainQueue, delayMs);
    return;
  }

  const item = queue.shift();
  if (!item) {
    return;
  }

  active += 1;
  lastStartAt = Date.now();

  item.run()
    .then(item.resolve)
    .catch((error) => {
      if (isRpc429(error)) {
        const baseBackoffMs = readPositiveIntEnv(
          'LIVE_PILOT_RPC_429_BACKOFF_MS',
          DEFAULT_RPC_429_BACKOFF_MS,
        );
        const maxBackoffMs = readPositiveIntEnv(
          'LIVE_PILOT_RPC_429_BACKOFF_MAX_MS',
          DEFAULT_RPC_429_BACKOFF_MAX_MS,
        );
        const jitterMs = Math.floor(Math.random() * 250);
        backoffUntil = Math.max(
          backoffUntil,
          Date.now() + Math.min(baseBackoffMs + jitterMs, maxBackoffMs),
        );
      }
      item.reject(error);
    })
    .finally(() => {
      active -= 1;
      drainQueue();
    });

  drainQueue();
}

function scheduleRpc<T>(run: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      run,
      resolve: (value) => resolve(value as T),
      reject,
    });
    drainQueue();
  });
}

function redactRpcUrl(url: string) {
  try {
    const parsed = new URL(url);
    const label = parsed.hostname.includes('alchemy')
      ? 'alchemy'
      : parsed.hostname.includes('helius')
        ? 'helius'
        : parsed.hostname.includes('chainstack')
          ? 'chainstack'
          : parsed.hostname;
    return `${label}:${parsed.hostname}`;
  } catch {
    return 'custom-rpc';
  }
}

export function describeLivePilotRpcUrl(url: string) {
  return redactRpcUrl(url);
}

export function withLivePilotRpcRateLimit<T extends Connection>(connection: T): T {
  return new Proxy(connection, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop !== 'string' || typeof value !== 'function' || !RPC_METHODS_TO_LIMIT.has(prop)) {
        return value;
      }

      return (...args: unknown[]) =>
        scheduleRpc(() => Promise.resolve(value.apply(target, args)));
    },
  }) as T;
}
