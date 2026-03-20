export interface PendingSignatureEntry {
  signature: string;
  wallet: string;
  firstSeenAt: number;
  readyAt: number;
  attempts: number;
}

export const ENHANCED_BATCH_SIZE = 100;
export const ENHANCED_FETCH_DEBOUNCE_MS = 2000;
export const ENHANCED_REQUEST_INTERVAL_MS = 1000;

const RETRY_DELAYS_MS = [1000, 5000, 15000];
const RATE_LIMIT_RETRY_DELAY_MS = 5000;

export function enqueueSignature(
  queue: Map<string, PendingSignatureEntry>,
  signature: string,
  wallet: string,
  now: number = Date.now()
) {
  const existing = queue.get(signature);
  if (existing) {
    return existing;
  }

  const entry: PendingSignatureEntry = {
    signature,
    wallet,
    firstSeenAt: now,
    readyAt: now + ENHANCED_FETCH_DEBOUNCE_MS,
    attempts: 0,
  };

  queue.set(signature, entry);
  return entry;
}

export function dequeueReadyBatch(
  queue: Map<string, PendingSignatureEntry>,
  now: number = Date.now(),
  batchSize: number = ENHANCED_BATCH_SIZE
) {
  const readyEntries = Array.from(queue.values())
    .filter((entry) => entry.readyAt <= now)
    .sort((left, right) => left.readyAt - right.readyAt || left.firstSeenAt - right.firstSeenAt)
    .slice(0, batchSize);

  for (const entry of readyEntries) {
    queue.delete(entry.signature);
  }

  return readyEntries;
}

export function rescheduleEntries(
  queue: Map<string, PendingSignatureEntry>,
  entries: PendingSignatureEntry[],
  status: number | undefined,
  now: number = Date.now()
) {
  for (const entry of entries) {
    const nextAttempt = entry.attempts + 1;
    const retryDelay =
      status === 429
        ? RATE_LIMIT_RETRY_DELAY_MS
        : RETRY_DELAYS_MS[Math.min(entry.attempts, RETRY_DELAYS_MS.length - 1)];

    if (nextAttempt > RETRY_DELAYS_MS.length) {
      continue;
    }

    queue.set(entry.signature, {
      ...entry,
      attempts: nextAttempt,
      readyAt: now + retryDelay,
    });
  }
}
