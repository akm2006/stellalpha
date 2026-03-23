import { yellowstone } from '@kdt-sol/solana-grpc-client';

export const YELLOWSTONE_DEFAULT_ENDPOINT = 'https://solana-yellowstone-grpc.publicnode.com:443';
export const YELLOWSTONE_RECEIVE_COMMITMENT = 'confirmed' as const;
export const YELLOWSTONE_BLOCK_META_FILTER_KEY = '__yellowstone_block_meta__';

export interface YellowstoneRawTransactionCapture {
  signature: string;
  wallet: string;
  slot: number;
  receiveCommitment: typeof YELLOWSTONE_RECEIVE_COMMITMENT;
  sourceReceivedAt: string;
  yellowstoneCreatedAt: string | null;
  transactionUpdate: unknown;
}

export interface YellowstoneRawBlockMetaCapture {
  slot: number;
  blockTime: number | null;
  blockMetaUpdate: unknown;
}

export function buildYellowstoneSubscribeRequest(wallets: string[]) {
  const transactions = Object.fromEntries(
    wallets.map((wallet) => [
      wallet,
      {
        vote: false,
        failed: false,
        accountInclude: [wallet],
        accountExclude: [],
        accountRequired: [],
      },
    ])
  );

  return {
    accounts: {},
    slots: {},
    transactions,
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {
      [YELLOWSTONE_BLOCK_META_FILTER_KEY]: {},
    },
    entry: {},
    accountsDataSlice: [],
    commitment: yellowstone.CommitmentLevel.CONFIRMED,
  };
}

export function pickTrackedWalletFromFilters(filters: string[] | undefined, trackedWalletSet: Set<string>) {
  if (!Array.isArray(filters)) {
    return null;
  }

  for (const filter of filters) {
    if (trackedWalletSet.has(filter)) {
      return filter;
    }
  }

  return null;
}
