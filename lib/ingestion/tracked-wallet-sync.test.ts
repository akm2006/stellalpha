import { describe, expect, it } from 'vitest';
import {
  buildTrackedWalletSyncPlan,
  type TrackedWalletFetchResult,
} from '@/lib/ingestion/tracked-wallet-sync';

describe('tracked wallet synchronization', () => {
  it('applies a successful database snapshot and includes required live-pilot leaders', () => {
    const result: TrackedWalletFetchResult = {
      ok: true,
      wallets: ['db-wallet', 'shared-wallet'],
    };

    expect(
      buildTrackedWalletSyncPlan(
        ['old-wallet'],
        result,
        ['pilot-wallet', 'shared-wallet'],
      ),
    ).toEqual({
      wallets: ['db-wallet', 'shared-wallet', 'pilot-wallet'],
      changed: true,
      retainedLastKnownGood: false,
      databaseAvailable: true,
    });
  });

  it('retains the last-known-good wallets when the database fetch fails', () => {
    const result: TrackedWalletFetchResult = {
      ok: false,
      error: new Error('database unavailable'),
    };

    expect(
      buildTrackedWalletSyncPlan(
        ['db-wallet', 'pilot-wallet'],
        result,
        ['pilot-wallet'],
      ),
    ).toEqual({
      wallets: ['db-wallet', 'pilot-wallet'],
      changed: false,
      retainedLastKnownGood: true,
      databaseAvailable: false,
    });
  });

  it('starts with env-backed live-pilot leaders during a database outage', () => {
    const result: TrackedWalletFetchResult = {
      ok: false,
      error: new Error('database unavailable'),
    };

    expect(
      buildTrackedWalletSyncPlan([], result, ['pilot-wallet']),
    ).toEqual({
      wallets: ['pilot-wallet'],
      changed: true,
      retainedLastKnownGood: false,
      databaseAvailable: false,
    });
  });

  it('accepts a successful empty database snapshot without dropping required leaders', () => {
    const result: TrackedWalletFetchResult = {
      ok: true,
      wallets: [],
    };

    expect(
      buildTrackedWalletSyncPlan(
        ['removed-db-wallet', 'pilot-wallet'],
        result,
        ['pilot-wallet'],
      ),
    ).toEqual({
      wallets: ['pilot-wallet'],
      changed: true,
      retainedLastKnownGood: false,
      databaseAvailable: true,
    });
  });

  it('normalizes duplicate and blank wallet values without false changes', () => {
    const result: TrackedWalletFetchResult = {
      ok: true,
      wallets: [' wallet-a ', '', 'wallet-a'],
    };

    expect(
      buildTrackedWalletSyncPlan(['wallet-a'], result, ['wallet-a']),
    ).toEqual({
      wallets: ['wallet-a'],
      changed: false,
      retainedLastKnownGood: false,
      databaseAvailable: true,
    });
  });
});
