import type { Connection } from '@solana/web3.js';
import { describe, expect, it, vi } from 'vitest';
import { waitForSignatureConfirmation } from '@/lib/live-pilot/signature-confirmation';

describe('live-pilot signature confirmation', () => {
  it('confirms by polling getSignatureStatuses without websocket subscriptions', async () => {
    const getSignatureStatuses = vi.fn().mockResolvedValue({
      value: [
        {
          confirmationStatus: 'confirmed',
          confirmations: 1,
          err: null,
          slot: 123,
        },
      ],
    });
    const connection = { getSignatureStatuses } as unknown as Connection;

    const result = await waitForSignatureConfirmation(connection, 'sig', {
      timeoutMs: 100,
      pollIntervalMs: 10,
    });

    expect(result).toEqual({ state: 'confirmed', slot: 123 });
    expect(getSignatureStatuses).toHaveBeenCalledWith(['sig'], {
      searchTransactionHistory: false,
    });
  });

  it('returns failed when the signature status contains an on-chain error', async () => {
    const connection = {
      getSignatureStatuses: vi.fn().mockResolvedValue({
        value: [
          {
            confirmationStatus: 'confirmed',
            confirmations: 1,
            err: { InstructionError: [0, 'Custom'] },
            slot: 124,
          },
        ],
      }),
    } as unknown as Connection;

    const result = await waitForSignatureConfirmation(connection, 'sig', {
      timeoutMs: 100,
      pollIntervalMs: 10,
    });

    expect(result).toEqual({
      state: 'failed',
      message: JSON.stringify({ InstructionError: [0, 'Custom'] }),
    });
  });
});
