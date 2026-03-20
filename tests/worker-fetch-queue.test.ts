import { describe, expect, it } from 'vitest';
import {
  dequeueReadyBatch,
  enqueueSignature,
  ENHANCED_BATCH_SIZE,
  ENHANCED_FETCH_DEBOUNCE_MS,
  rescheduleEntries,
} from '@/worker/enhanced-fetch-queue';

describe('worker enhanced fetch queue', () => {
  it('coalesces duplicate signatures instead of extending their delay', () => {
    const queue = new Map();

    const first = enqueueSignature(queue, 'sig-1', 'wallet-1', 1_000);
    const second = enqueueSignature(queue, 'sig-1', 'wallet-2', 2_000);

    expect(queue.size).toBe(1);
    expect(first).toBe(second);
    expect(queue.get('sig-1')).toEqual({
      signature: 'sig-1',
      wallet: 'wallet-1',
      firstSeenAt: 1_000,
      readyAt: 1_000 + ENHANCED_FETCH_DEBOUNCE_MS,
      attempts: 0,
    });
  });

  it('dequeues only ready signatures up to the batch cap', () => {
    const queue = new Map();

    for (let index = 0; index < ENHANCED_BATCH_SIZE + 5; index++) {
      queue.set(`sig-${index}`, {
        signature: `sig-${index}`,
        wallet: 'wallet',
        firstSeenAt: index,
        readyAt: index,
        attempts: 0,
      });
    }

    queue.set('future', {
      signature: 'future',
      wallet: 'wallet',
      firstSeenAt: 99,
      readyAt: Date.now() + 10_000,
      attempts: 0,
    });

    const batch = dequeueReadyBatch(queue, ENHANCED_BATCH_SIZE, ENHANCED_BATCH_SIZE);

    expect(batch).toHaveLength(ENHANCED_BATCH_SIZE);
    expect(queue.has('future')).toBe(true);
    expect(queue.size).toBe(6);
  });

  it('reschedules rate-limited entries with a retry delay and bounded attempts', () => {
    const queue = new Map();
    const now = 10_000;

    const entries = [
      {
        signature: 'sig-1',
        wallet: 'wallet',
        firstSeenAt: 1,
        readyAt: 2,
        attempts: 0,
      },
      {
        signature: 'sig-2',
        wallet: 'wallet',
        firstSeenAt: 1,
        readyAt: 2,
        attempts: 3,
      },
    ];

    rescheduleEntries(queue, entries, 429, now);

    expect(queue.get('sig-1')).toEqual({
      signature: 'sig-1',
      wallet: 'wallet',
      firstSeenAt: 1,
      readyAt: now + 5_000,
      attempts: 1,
    });
    expect(queue.has('sig-2')).toBe(false);
  });
});
