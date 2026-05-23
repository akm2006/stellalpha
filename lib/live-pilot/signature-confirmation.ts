import type { Connection } from '@solana/web3.js';

export type SignatureConfirmationResult =
  | { state: 'confirmed'; slot: number | null }
  | { state: 'failed'; message: string }
  | { state: 'pending' };

const DEFAULT_CONFIRMATION_TIMEOUT_MS = 8_000;
const DEFAULT_CONFIRMATION_POLL_INTERVAL_MS = 500;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForSignatureConfirmation(
  connection: Connection,
  signature: string,
  options: {
    timeoutMs?: number;
    pollIntervalMs?: number;
    searchTransactionHistory?: boolean;
  } = {},
): Promise<SignatureConfirmationResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CONFIRMATION_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_CONFIRMATION_POLL_INTERVAL_MS;
  const searchTransactionHistory = options.searchTransactionHistory ?? false;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const statuses = await connection.getSignatureStatuses([signature], {
        searchTransactionHistory,
      });
      const status = statuses.value[0];

      if (status?.err) {
        return {
          state: 'failed',
          message: JSON.stringify(status.err),
        };
      }

      if (
        status?.confirmationStatus === 'confirmed'
        || status?.confirmationStatus === 'finalized'
        || status?.confirmations === null
      ) {
        return {
          state: 'confirmed',
          slot: status.slot ?? null,
        };
      }
    } catch {
      // Polling is intentionally tolerant: a transient RPC miss should not
      // turn a submitted transaction into a failed trade before recovery runs.
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      break;
    }
    await wait(Math.min(pollIntervalMs, remainingMs));
  }

  return { state: 'pending' };
}
