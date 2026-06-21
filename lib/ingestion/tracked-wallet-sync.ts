export type TrackedWalletFetchResult =
  | {
      ok: true;
      wallets: string[];
    }
  | {
      ok: false;
      error: unknown;
    };

export type TrackedWalletSyncPlan = {
  wallets: string[];
  changed: boolean;
  retainedLastKnownGood: boolean;
  databaseAvailable: boolean;
};

function normalizeWallets(wallets: readonly unknown[]) {
  const uniqueWallets = new Set<string>();

  for (const wallet of wallets) {
    if (typeof wallet !== 'string') {
      continue;
    }

    const normalized = wallet.trim();
    if (normalized) {
      uniqueWallets.add(normalized);
    }
  }

  return Array.from(uniqueWallets);
}

function sameWalletSet(nextWallets: readonly string[], currentWallets: readonly string[]) {
  if (nextWallets.length !== currentWallets.length) {
    return false;
  }

  const currentSet = new Set(currentWallets);
  return nextWallets.every((wallet) => currentSet.has(wallet));
}

export function buildTrackedWalletSyncPlan(
  currentWallets: readonly string[],
  fetchResult: TrackedWalletFetchResult,
  requiredWallets: readonly string[] = [],
): TrackedWalletSyncPlan {
  const normalizedCurrent = normalizeWallets(currentWallets);
  const normalizedRequired = normalizeWallets(requiredWallets);
  const databaseWallets = fetchResult.ok
    ? normalizeWallets(fetchResult.wallets)
    : normalizedCurrent;
  const wallets = normalizeWallets([...databaseWallets, ...normalizedRequired]);

  return {
    wallets,
    changed: !sameWalletSet(wallets, normalizedCurrent),
    retainedLastKnownGood: !fetchResult.ok && normalizedCurrent.length > 0,
    databaseAvailable: fetchResult.ok,
  };
}
