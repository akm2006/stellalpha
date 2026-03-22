import { IngestedTransaction } from '@/lib/ingestion/types';
import {
  PARSED_TX_BATCH_SIZE,
  PARSED_TX_HISTORICAL_CUTOFF_MS,
  ParsedTxQueueRecord,
} from '@/lib/ingestion/parsed-tx-queue';

const SHYFT_COOLDOWN_FAILURE_LIMIT = 3;
const SHYFT_COOLDOWN_FAILURE_WINDOW_MS = 5 * 60 * 1000;
const SHYFT_COOLDOWN_DURATION_MS = 10 * 60 * 1000;

type ParsedProvider = 'shyft' | 'helius_fallback';

interface ProviderPayloadBySignature {
  provider: ParsedProvider;
  raw: any;
}

interface FetchProviderResponse {
  ok: boolean;
  status?: number;
  payloadBySignature: Map<string, any>;
}

export interface ParsedTxBatchFetchResult {
  transactions: IngestedTransaction[];
  archivedMessageIds: number[];
  failedMessageIds: number[];
  providerBySignature: Record<string, ParsedProvider>;
  usedHeliusFallback: boolean;
}

let shyftFailureTimestamps: number[] = [];
let shyftCooldownUntil = 0;

function getHeliusApiKey() {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    throw new Error('Missing HELIUS_API_KEY environment variable');
  }

  return apiKey;
}

function getShyftApiKey() {
  const apiKey = process.env.SHYFT_API_KEY;
  if (!apiKey) {
    throw new Error('Missing SHYFT_API_KEY environment variable');
  }

  return apiKey;
}

function getHeliusUrl() {
  const apiKey = getHeliusApiKey();
  return `https://api.helius.xyz/v0/transactions/?api-key=${apiKey}`;
}

function isOlderThanHistoricalCutoff(blockTime: number | null | undefined, now: number) {
  if (!blockTime) {
    return false;
  }

  return now - blockTime * 1000 > PARSED_TX_HISTORICAL_CUTOFF_MS;
}

function buildPayloadIndex(items: any[], signatures: string[]) {
  const payloadBySignature = new Map<string, any>();

  for (const item of items) {
    if (typeof item?.signature === 'string') {
      payloadBySignature.set(item.signature, {
        ...item,
        __parsedProvider: 'helius',
      });
      continue;
    }

    const itemSignatures = Array.isArray(item?.signatures) ? item.signatures : [];
    for (const signature of itemSignatures) {
      if (typeof signature === 'string' && signatures.includes(signature) && !payloadBySignature.has(signature)) {
        payloadBySignature.set(signature, {
          ...item,
          __parsedProvider: 'shyft',
        });
      }
    }
  }

  return payloadBySignature;
}

function recordShyftFailure(now: number) {
  shyftFailureTimestamps = [...shyftFailureTimestamps, now].filter(
    (timestamp) => now - timestamp <= SHYFT_COOLDOWN_FAILURE_WINDOW_MS
  );

  if (shyftFailureTimestamps.length >= SHYFT_COOLDOWN_FAILURE_LIMIT) {
    shyftCooldownUntil = now + SHYFT_COOLDOWN_DURATION_MS;
  }
}

function clearShyftFailures() {
  shyftFailureTimestamps = [];
}

export function isShyftCoolingDown(now: number = Date.now()) {
  return shyftCooldownUntil > now;
}

async function fetchShyft(signatures: string[]): Promise<FetchProviderResponse> {
  if (signatures.length === 0) {
    return { ok: true, payloadBySignature: new Map() };
  }

  const response = await fetch('https://api.shyft.to/sol/v1/transaction/parse_selected', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getShyftApiKey(),
    },
    body: JSON.stringify({
      network: 'mainnet-beta',
      transaction_signatures: signatures.slice(0, PARSED_TX_BATCH_SIZE),
      enable_raw: true,
      enable_events: true,
      commitment: 'confirmed',
    }),
  });

  if (!response.ok) {
    return { ok: false, status: response.status, payloadBySignature: new Map() };
  }

  const payload = await response.json();
  if (!payload?.success || !Array.isArray(payload?.result)) {
    return { ok: false, status: response.status, payloadBySignature: new Map() };
  }

  return {
    ok: true,
    status: response.status,
    payloadBySignature: buildPayloadIndex(payload.result, signatures),
  };
}

async function fetchHelius(signatures: string[]): Promise<FetchProviderResponse> {
  if (signatures.length === 0) {
    return { ok: true, payloadBySignature: new Map() };
  }

  const response = await fetch(getHeliusUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions: signatures }),
  });

  if (!response.ok) {
    return { ok: false, status: response.status, payloadBySignature: new Map() };
  }

  const payload = await response.json();
  return {
    ok: true,
    status: response.status,
    payloadBySignature: buildPayloadIndex(Array.isArray(payload) ? payload : [], signatures),
  };
}

export async function fetchParsedTransactionsForQueue(records: ParsedTxQueueRecord[]): Promise<ParsedTxBatchFetchResult> {
  const now = Date.now();
  const signatureMap = new Map<
    string,
    {
      source: IngestedTransaction['source'];
      messageIds: number[];
      blockTimes: number[];
    }
  >();

  for (const record of records) {
    const signature = record.message?.signature;
    if (!signature) {
      continue;
    }

    const existing = signatureMap.get(signature) || {
      source: record.message.source,
      messageIds: [],
      blockTimes: [],
    };

    existing.messageIds.push(record.msg_id);
    if (typeof record.message.blockTime === 'number') {
      existing.blockTimes.push(record.message.blockTime);
    }
    signatureMap.set(signature, existing);
  }

  const signatures = Array.from(signatureMap.keys());
  const forceHelius = new Set(
    signatures.filter((signature) => {
      const blockTimes = signatureMap.get(signature)?.blockTimes || [];
      return blockTimes.some((blockTime) => isOlderThanHistoricalCutoff(blockTime, now));
    })
  );

  const providerPayloadBySignature = new Map<string, ProviderPayloadBySignature>();
  const archivedMessageIds: number[] = [];
  const providerBySignature: Record<string, ParsedProvider> = {};
  let usedHeliusFallback = false;
  let shyftFailedBatch = false;

  const shyftEligible = signatures.filter((signature) => !forceHelius.has(signature));
  if (shyftEligible.length > 0 && !isShyftCoolingDown(now)) {
    const shyftResult = await fetchShyft(shyftEligible);
    if (!shyftResult.ok) {
      recordShyftFailure(now);
      shyftFailedBatch = true;
    } else {
      clearShyftFailures();
      for (const [signature, raw] of shyftResult.payloadBySignature.entries()) {
        providerPayloadBySignature.set(signature, { provider: 'shyft', raw });
      }
    }
  }

  const heliusSubset = new Set<string>();
  for (const signature of signatures) {
    if (forceHelius.has(signature)) {
      heliusSubset.add(signature);
      continue;
    }

    if (isShyftCoolingDown(now) || shyftFailedBatch) {
      heliusSubset.add(signature);
      continue;
    }

    if (!providerPayloadBySignature.has(signature)) {
      heliusSubset.add(signature);
    }
  }

  if (heliusSubset.size > 0) {
    usedHeliusFallback = true;
    const heliusResult = await fetchHelius(Array.from(heliusSubset));
    if (heliusResult.ok) {
      for (const [signature, raw] of heliusResult.payloadBySignature.entries()) {
        providerPayloadBySignature.set(signature, { provider: 'helius_fallback', raw });
      }
    }
  }

  const transactions: IngestedTransaction[] = [];
  const failedMessageIds: number[] = [];

  for (const signature of signatures) {
    const signatureMeta = signatureMap.get(signature);
    if (!signatureMeta) {
      continue;
    }

    const providerPayload = providerPayloadBySignature.get(signature);
    if (!providerPayload) {
      failedMessageIds.push(...signatureMeta.messageIds);
      continue;
    }

    providerBySignature[signature] = providerPayload.provider;
    archivedMessageIds.push(...signatureMeta.messageIds);
    transactions.push({
      signature,
      timestamp:
        providerPayload.provider === 'helius_fallback'
          ? providerPayload.raw.timestamp || Math.floor(now / 1000)
          : providerPayload.raw.timestamp || providerPayload.raw.block_time || Math.floor(now / 1000),
      feePayer:
        providerPayload.provider === 'helius_fallback'
          ? providerPayload.raw.feePayer || ''
          : providerPayload.raw.fee_payer || '',
      source: signatureMeta.source,
      raw: providerPayload.raw,
    });
  }

  return {
    transactions,
    archivedMessageIds,
    failedMessageIds,
    providerBySignature,
    usedHeliusFallback,
  };
}
