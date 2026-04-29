// Run with: npx tsx worker/index.ts
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import bs58 from 'bs58';
import { Connection, PublicKey } from '@solana/web3.js';
import { supabase } from '../lib/supabase';
import { processBatch } from '../lib/ingestion/orchestrator';
import {
  archiveParsedTxMessages,
  enqueueParsedTxMessages,
  PARSED_TX_BATCH_SIZE,
  PARSED_TX_NON_TRADE_CACHE_TTL_MS,
  PARSED_TX_REQUEST_INTERVAL_MS,
  readParsedTxMessages,
  ParsedTxQueueRecord,
} from '../lib/ingestion/parsed-tx-queue';
import { fetchParsedTransactionsForQueue } from '../lib/ingestion/parsed-tx-client';
import { detectIngestedTrade } from '../lib/ingestion/detect-ingested-trade';
import {
  buildYellowstoneSubscribeRequest,
  pickTrackedWalletFromFilters,
  YELLOWSTONE_DEFAULT_ENDPOINT,
  YELLOWSTONE_RECEIVE_COMMITMENT,
  YellowstoneRawBlockMetaCapture,
} from '../lib/ingestion/yellowstone-stream';
import { cacheNonTradeSignatures, getCachedNonTradeSignatures } from '../lib/repositories/non-trade-signatures.repo';
import {
  initCarbonBridge,
  stopCarbonBridge,
  getCarbonBridge,
  getCarbonParserEnabled,
  type CarbonCaptureInput,
  type CarbonBlockMetaInput,
  type CarbonParseResult,
} from '../lib/ingestion/carbon-bridge';
import { IngestedTransaction } from '../lib/ingestion/types';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HTTP_RPC_URL = process.env.HELIUS_API_RPC_URL
  || `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const YELLOWSTONE_GRPC_URL = process.env.YELLOWSTONE_GRPC_URL
  || process.env.PUBLICNODE_YELLOWSTONE_ENDPOINT
  || YELLOWSTONE_DEFAULT_ENDPOINT;
const YELLOWSTONE_X_TOKEN = process.env.YELLOWSTONE_X_TOKEN
  || process.env.PUBLICNODE_YELLOWSTONE_TOKEN
  || process.env.PUBLICNODE_TOKEN
  || '';

if (!HELIUS_API_KEY) {
  console.error('[WORKER] Missing HELIUS_API_KEY environment variable');
  process.exit(1);
}

if (!YELLOWSTONE_X_TOKEN) {
  console.error('[WORKER] Missing Yellowstone token. Set YELLOWSTONE_X_TOKEN or PUBLICNODE_YELLOWSTONE_TOKEN.');
  process.exit(1);
}

function createConnection() {
  return new Connection(HTTP_RPC_URL, {
    commitment: 'confirmed',
  });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sameWalletSet(nextWallets: string[], currentWallets: string[]) {
  if (nextWallets.length !== currentWallets.length) {
    return false;
  }

  const currentSet = new Set(currentWallets);
  return nextWallets.every((wallet) => currentSet.has(wallet));
}

function isAbortLikeError(message: string) {
  return (
    message.includes('Cancelled on client')
    || message.includes('aborted')
    || message.includes('AbortError')
    || message.includes('1 CANCELLED')
  );
}

type CachedBlockMeta = {
  capture: YellowstoneRawBlockMetaCapture;
  seenAtMs: number;
};

let connection = createConnection();
let trackedWallets: string[] = [];
let lastYellowstoneMessageTime = Date.now();
let isReconnecting = false;
let isDrainingParsedQueue = false;
let isShuttingDown = false;
let parsedQueueBackoffUntil = 0;
let parsedQueueBackoffMs = 5_000;
let backoffMs = 1000;
let yellowstoneAbortController: AbortController | null = null;
let yellowstoneStreamTask: Promise<void> | null = null;

const signatureCache = new Set<string>();
const recentBlockMetaBySlot = new Map<number, CachedBlockMeta>();
const observedTransactionSlots = new Map<number, number>();

const MAX_BACKOFF = 30000;
const PARSED_QUEUE_FAILURE_BACKOFF_INITIAL_MS = 5_000;
const PARSED_QUEUE_FAILURE_BACKOFF_MAX_MS = 60_000;
const STARTUP_RECONCILE_LIMIT = 25;
const YELLOWSTONE_STALE_THRESHOLD_MS = 60 * 1000;
const BLOCK_META_CACHE_TTL_MS = 10 * 60 * 1000;
const OBSERVED_SLOT_TTL_MS = 10 * 60 * 1000;
const YELLOWSTONE_METADATA_TIMEOUT_MS = 30 * 1000;
const YELLOWSTONE_RECEIVE_TIMEOUT_MS = 5 * 60 * 1000;
const YELLOWSTONE_KEEPALIVE_TIME_MS = 30 * 1000;
const YELLOWSTONE_KEEPALIVE_TIMEOUT_MS = 10 * 1000;

type YellowstoneModule = typeof import('@kdt-sol/solana-grpc-client');
let yellowstoneModulePromise: Promise<YellowstoneModule> | null = null;

setInterval(() => {
  signatureCache.clear();
}, 60 * 60 * 1000);

async function loadYellowstoneModule() {
  if (!yellowstoneModulePromise) {
    yellowstoneModulePromise = import('@kdt-sol/solana-grpc-client');
  }

  return yellowstoneModulePromise;
}

function pruneYellowstoneCaches() {
  const cutoffMs = Date.now();

  for (const [slot, cached] of recentBlockMetaBySlot.entries()) {
    if (cutoffMs - cached.seenAtMs > BLOCK_META_CACHE_TTL_MS) {
      recentBlockMetaBySlot.delete(slot);
    }
  }

  for (const [slot, seenAtMs] of observedTransactionSlots.entries()) {
    if (cutoffMs - seenAtMs > OBSERVED_SLOT_TTL_MS) {
      observedTransactionSlots.delete(slot);
    }
  }
}

async function fetchTrackedWallets() {
  const { data, error } = await supabase.from('star_traders').select('address');
  if (error || !data) {
    console.error('[WORKER] Failed to fetch star traders:', error);
    return [];
  }
  return data.map((row) => row.address);
}

async function getClaimedSignatures(signatures: string[]): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('trades')
    .select('signature')
    .in('signature', signatures);

  if (error) {
    console.error('[WORKER] Failed to check existing trade claims:', error);
    return new Set();
  }

  return new Set((data || []).map((row) => row.signature));
}

async function cacheConfirmedNonTrades(
  recordsBySignature: Map<string, ParsedTxQueueRecord[]>,
  transactionsBySignature: Map<string, any>
) {
  const archiveIds: number[] = [];

  for (const [signature, records] of recordsBySignature.entries()) {
    const transaction = transactionsBySignature.get(signature);
    if (!transaction) {
      continue;
    }

    const wallets = Array.from(new Set(records.map((record) => record.message.wallet).filter(Boolean)));
    if (wallets.length === 0) {
      continue;
    }

    const detectionResults = await Promise.all(
      wallets.map(async (wallet) => ({
        wallet,
        trade: await detectIngestedTrade(transaction.raw, wallet),
      }))
    );

    const nonTradeWallets = detectionResults.filter((result) => !result.trade).map((result) => result.wallet);
    if (nonTradeWallets.length === 0 || nonTradeWallets.length !== wallets.length) {
      continue;
    }

    const expiresAtIso = new Date(Date.now() + PARSED_TX_NON_TRADE_CACHE_TTL_MS).toISOString();
    for (const wallet of nonTradeWallets) {
      await cacheNonTradeSignatures(wallet, [signature], expiresAtIso);
    }

    archiveIds.push(...records.map((record) => record.msg_id));
  }

  return archiveIds;
}

async function drainParsedTxQueue() {
  if (isDrainingParsedQueue) {
    return;
  }

  if (Date.now() < parsedQueueBackoffUntil) {
    return;
  }

  const queueRecords = await readParsedTxMessages(PARSED_TX_BATCH_SIZE);
  if (queueRecords.length === 0) {
    parsedQueueBackoffUntil = 0;
    parsedQueueBackoffMs = PARSED_QUEUE_FAILURE_BACKOFF_INITIAL_MS;
    return;
  }

  isDrainingParsedQueue = true;

  try {
    const queueBySignature = new Map<string, ParsedTxQueueRecord[]>();
    for (const record of queueRecords) {
      const signature = record.message?.signature;
      if (!signature) {
        continue;
      }

      const current = queueBySignature.get(signature) || [];
      current.push(record);
      queueBySignature.set(signature, current);
    }

    const signatures = Array.from(queueBySignature.keys());
    const alreadyClaimed = await getClaimedSignatures(signatures);
    const claimedMessageIds = signatures.flatMap((signature) =>
      alreadyClaimed.has(signature) ? (queueBySignature.get(signature) || []).map((record) => record.msg_id) : []
    );

    if (alreadyClaimed.size > 0) {
      console.log(`[WORKER] Skipping ${alreadyClaimed.size} queued signature(s) already claimed by webhook/reconcile`);
    }

    if (claimedMessageIds.length > 0) {
      await archiveParsedTxMessages(claimedMessageIds);
    }

    const fetchRecords = queueRecords.filter((record) => !alreadyClaimed.has(record.message.signature));
    if (fetchRecords.length === 0) {
      return;
    }

    const fetchResult = await fetchParsedTransactionsForQueue(fetchRecords);
    const transactionsBySignature = new Map(
      fetchResult.transactions.map((transaction) => [transaction.signature, transaction])
    );
    const nonTradeArchiveIds = await cacheConfirmedNonTrades(queueBySignature, transactionsBySignature);

    if (nonTradeArchiveIds.length > 0) {
      await archiveParsedTxMessages(nonTradeArchiveIds);
    }

    const processableTransactions = fetchResult.transactions.filter((transaction) => {
      const matchingRecords = queueBySignature.get(transaction.signature) || [];
      return !matchingRecords.every((record) => nonTradeArchiveIds.includes(record.msg_id));
    });

    if (processableTransactions.length === 0) {
      return;
    }

    console.log(`[WORKER] Triggering orchestrator for ${processableTransactions.length} parsed tx(s)`);
    const orchestratorStart = Date.now();

    try {
      const { processed, inserted } = await processBatch(processableTransactions, Date.now());
      console.log(
        `[WORKER] Orchestrator completed in ${Date.now() - orchestratorStart}ms | `
        + `Batch size: ${processableTransactions.length} | Processed: ${processed}, Inserted: ${inserted}`
      );
      await archiveParsedTxMessages(
        fetchResult.archivedMessageIds.filter((msgId) => !nonTradeArchiveIds.includes(msgId))
      );
      parsedQueueBackoffUntil = 0;
      parsedQueueBackoffMs = PARSED_QUEUE_FAILURE_BACKOFF_INITIAL_MS;
    } catch (error) {
      console.error('[WORKER] Orchestrator error on parsed batch:', error);
    }
  } finally {
    isDrainingParsedQueue = false;
  }
}

function recordParsedQueueFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  parsedQueueBackoffUntil = Date.now() + parsedQueueBackoffMs;
  console.error(`[WORKER] Parsed tx queue error; backing off ${parsedQueueBackoffMs}ms:`, message);
  parsedQueueBackoffMs = Math.min(parsedQueueBackoffMs * 2, PARSED_QUEUE_FAILURE_BACKOFF_MAX_MS);
}

// ── Carbon parser counters (logged periodically) ─────────────────────────────
const carbonCounters = { trade: 0, no_trade: 0, unknown: 0, error: 0 };

async function processCarbonSignature(
  signature: string,
  wallet: string,
  transactionUpdate: unknown,
  slot: number,
  createdAt: Date | undefined,
  receiveTimestamp: number,
): Promise<CarbonParseResult | 'error'> {
  const bridge = getCarbonBridge();
  if (!bridge?.isRunning) return 'error';

  const capture: CarbonCaptureInput = {
    signature,
    wallet,
    slot,
    receiveCommitment: YELLOWSTONE_RECEIVE_COMMITMENT,
    sourceReceivedAt: new Date(receiveTimestamp).toISOString(),
    yellowstoneCreatedAt: createdAt ? createdAt.toISOString() : null,
    transactionUpdate,
  };

  const cachedMeta = recentBlockMetaBySlot.get(slot);
  const blockMeta: CarbonBlockMetaInput | null = cachedMeta
    ? {
        slot: cachedMeta.capture.slot,
        blockTime: cachedMeta.capture.blockTime,
        blockMetaUpdate: cachedMeta.capture.blockMetaUpdate,
      }
    : null;

  try {
    return await bridge.parse(capture, blockMeta);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[CARBON] Parse error for ${signature.slice(0, 12)}...: ${msg}`);
    carbonCounters.error++;
    return 'error';
  }
}

function enqueueSHYFTPath(signature: string, wallet: string, receiveTimestamp: number) {
  void enqueueParsedTxMessages([
    {
      signature,
      wallet,
      source: 'websocket',
      discoveredAt: new Date(receiveTimestamp).toISOString(),
    },
  ]).catch((error) => {
    console.error(`[WORKER] Failed to enqueue signature ${signature.slice(0, 12)}...`, error);
  });
}

function handleNewSignature(signature: string, wallet: string, transactionUpdate: unknown, slot: number, createdAt: Date | undefined) {
  if (signatureCache.has(signature)) {
    return;
  }
  signatureCache.add(signature);

  const receiveTimestamp = Date.now();
  observedTransactionSlots.set(slot, receiveTimestamp);

  console.log(`[WORKER] New Yellowstone tx for ${wallet.slice(0, 8)}... | SIG: ${signature}`);

  // ── Carbon parser integration ──────────────────────────────────────────────
  const bridge = getCarbonBridge();

  if (!bridge?.isRunning) {
    // Carbon not available — fall back to SHYFT queue
    enqueueSHYFTPath(signature, wallet, receiveTimestamp);
    return;
  }

  void (async () => {
    const result = await processCarbonSignature(signature, wallet, transactionUpdate, slot, createdAt, receiveTimestamp);

    if (result === 'error') {
      enqueueSHYFTPath(signature, wallet, receiveTimestamp);
      return;
    }

    carbonCounters[result.status]++;

    if (result.status === 'trade' && result.trade) {
      const tx: IngestedTransaction = {
        signature: result.trade.signature,
        timestamp: result.trade.timestamp,
        feePayer: wallet,
        source: 'websocket',
        raw: { __carbonParsed: result.trade, feePayer: wallet },
      };

      try {
        const { processed, inserted } = await processBatch([tx], receiveTimestamp);
        console.log(
          `[CARBON] Trade: ${result.trade.type} ${result.trade.tokenMint.slice(0, 8)}... `
          + `| processed=${processed} inserted=${inserted} | Latency: ${Date.now() - receiveTimestamp}ms`
        );
      } catch (error) {
        console.error(`[CARBON] Orchestrator error for ${signature.slice(0, 12)}...:`, error);
      }
      return;
    }

    if (result.status === 'no_trade') {
      const expiresAtIso = new Date(Date.now() + PARSED_TX_NON_TRADE_CACHE_TTL_MS).toISOString();
      await cacheNonTradeSignatures(wallet, [signature], expiresAtIso).catch(() => {});
      return;
    }

    // unknown — fall through to SHYFT
    console.log(`[CARBON] Unknown for ${signature.slice(0, 12)}... — queuing SHYFT fallback`);
    enqueueSHYFTPath(signature, wallet, receiveTimestamp);
  })().catch((error) => {
    console.error(`[CARBON] Unhandled error for ${signature.slice(0, 12)}...:`, error);
    enqueueSHYFTPath(signature, wallet, receiveTimestamp);
  });
}

function cacheBlockMeta(capture: YellowstoneRawBlockMetaCapture) {
  recentBlockMetaBySlot.set(capture.slot, {
    capture,
    seenAtMs: Date.now(),
  });
}

async function consumeYellowstoneStream(stream: any, controller: AbortController, walletsSnapshot: string[]) {
  const trackedWalletSet = new Set(walletsSnapshot);

  try {
    for await (const update of stream) {
      lastYellowstoneMessageTime = Date.now();

      if (update.blockMeta?.slot) {
        const slot = Number(update.blockMeta.slot);
        if (Number.isFinite(slot)) {
          cacheBlockMeta({
            slot,
            blockTime: update.blockMeta.blockTime?.timestamp
              ? Number(update.blockMeta.blockTime.timestamp)
              : null,
            blockMetaUpdate: update.blockMeta,
          });
        }
        continue;
      }

      if (!update.transaction?.transaction?.signature || !update.transaction?.slot) {
        continue;
      }

      const wallet = pickTrackedWalletFromFilters(update.filters, trackedWalletSet);
      if (!wallet) {
        continue;
      }

      const signature = bs58.encode(update.transaction.transaction.signature);
      const slot = Number(update.transaction.slot);
      if (!Number.isFinite(slot)) {
        continue;
      }

      handleNewSignature(signature, wallet, update.transaction, slot, update.createdAt);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isAbortLikeError(message)) {
      console.error('[WORKER] Yellowstone stream error:', message);
    }
  } finally {
    await stream.close().catch(() => undefined);

    if (!isShuttingDown && !controller.signal.aborted) {
      console.warn('[WORKER] Yellowstone stream ended unexpectedly. Triggering reconnect...');
      void performReconnection();
    }
  }
}

async function stopYellowstoneSubscription() {
  const controller = yellowstoneAbortController;
  const task = yellowstoneStreamTask;

  yellowstoneAbortController = null;
  yellowstoneStreamTask = null;

  if (controller && !controller.signal.aborted) {
    controller.abort('Yellowstone subscription stopped');
  }

  if (task) {
    await task.catch(() => undefined);
  }
}

async function startYellowstoneSubscription(reason: string) {
  await stopYellowstoneSubscription();

  if (trackedWallets.length === 0) {
    console.log(`[WORKER] Yellowstone subscription skipped (${reason}) because there are no tracked wallets.`);
    return;
  }

  const controller = new AbortController();
  const { yellowstone } = await loadYellowstoneModule();
  const client = new yellowstone.YellowstoneGeyserClient(YELLOWSTONE_GRPC_URL, {
    token: YELLOWSTONE_X_TOKEN,
    signal: controller.signal,
    metadataTimeout: YELLOWSTONE_METADATA_TIMEOUT_MS,
    receiveTimeout: YELLOWSTONE_RECEIVE_TIMEOUT_MS,
    'grpc.max_receive_message_length': 64 * 1024 * 1024,
    'grpc.keepalive_time_ms': YELLOWSTONE_KEEPALIVE_TIME_MS,
    'grpc.keepalive_timeout_ms': YELLOWSTONE_KEEPALIVE_TIMEOUT_MS,
    'grpc.keepalive_permit_without_calls': true,
  });

  const stream = await client.subscribe();
  const rawStream = stream.duplexStream ?? stream.stream ?? null;
  rawStream?.on?.('error', (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (!controller.signal.aborted && !isAbortLikeError(message)) {
      console.error('[WORKER] Yellowstone stream transport error:', message);
    }
  });

  await stream.write(buildYellowstoneSubscribeRequest(trackedWallets));
  lastYellowstoneMessageTime = Date.now();
  yellowstoneAbortController = controller;
  yellowstoneStreamTask = consumeYellowstoneStream(stream, controller, trackedWallets);

  console.log(
    `[WORKER] Yellowstone subscription established (${reason}) | `
    + `Wallet filters: ${trackedWallets.length} | Commitment: ${YELLOWSTONE_RECEIVE_COMMITMENT} | `
    + `Metadata timeout: ${YELLOWSTONE_METADATA_TIMEOUT_MS}ms`
  );
}

async function startYellowstoneSubscriptionWithRetry(reason: string) {
  while (!isShuttingDown) {
    try {
      await startYellowstoneSubscription(reason);
      backoffMs = 1000;
      return;
    } catch (error) {
      console.error(
        `[WORKER] Yellowstone subscription failed during ${reason}. Retrying in ${backoffMs}ms:`,
        error
      );
      await wait(backoffMs);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF);
    }
  }
}

async function performReconnection() {
  if (isReconnecting || isShuttingDown) {
    return;
  }

  isReconnecting = true;
  console.log(
    `[WS_DISCONNECT] Yellowstone stream stale/dropped. Attempting reconnect in ${backoffMs}ms... `
    + `(backoff: ${backoffMs}ms)`
  );
  console.log(`[WS_DISCONNECT] Tracked wallets: ${trackedWallets.length}`);

  await wait(backoffMs);

  try {
    connection = createConnection();
    await startYellowstoneSubscription('reconnect');
    backoffMs = 1000;
    console.log(
      `[WS_RECONNECT] Yellowstone reconnect successful | Wallet filters: ${trackedWallets.length} | `
      + `Backoff reset to ${backoffMs}ms`
    );
  } catch (error) {
    console.error(
      `[WS_RECONNECT] Yellowstone reconnect failed (backoff will increase to ${Math.min(backoffMs * 2, MAX_BACKOFF)}ms):`,
      error
    );
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF);
    isReconnecting = false;
    if (!isShuttingDown) {
      void performReconnection();
    }
    return;
  }

  isReconnecting = false;
}

function monitorConnectionHealth() {
  setInterval(() => {
    const timeSinceLastMessage = Date.now() - lastYellowstoneMessageTime;
    console.log(
      `[HEALTH] Tracked Wallets: ${trackedWallets.length} | Last Yellowstone Msg: ${timeSinceLastMessage}ms ago | `
      + `Cache Size: ${signatureCache.size} | Parsed Queue Drain Active: ${isDrainingParsedQueue}`
    );

    if (trackedWallets.length > 0 && timeSinceLastMessage > YELLOWSTONE_STALE_THRESHOLD_MS) {
      console.warn(`[WARNING] No Yellowstone updates for ${timeSinceLastMessage}ms. Triggering reconnect...`);
      void performReconnection();
    }
  }, 10 * 1000);
}

async function syncTrackedWallets() {
  if (isReconnecting) {
    return;
  }

  const currentWallets = await fetchTrackedWallets();
  const changed = !sameWalletSet(currentWallets, trackedWallets);
  trackedWallets = currentWallets;

  if (changed) {
    console.log('[WORKER] Tracked wallet set changed. Restarting Yellowstone subscription...');
    try {
      await startYellowstoneSubscription('wallet sync');
    } catch (error) {
      console.error('[WORKER] Yellowstone wallet sync restart failed. Falling back to reconnect loop:', error);
      void performReconnection();
    }
  }
}

async function reconcileStartup() {
  console.log(`[WORKER] Starting startup reconciliation (lookback: last ${STARTUP_RECONCILE_LIMIT} confirmed signatures per wallet)...`);

  for (const wallet of trackedWallets) {
    try {
      const sigs = await connection.getSignaturesForAddress(
        new PublicKey(wallet),
        { limit: STARTUP_RECONCILE_LIMIT },
        'confirmed'
      );
      const signatureList = sigs.map((entry) => ({
        signature: entry.signature,
        blockTime: entry.blockTime ?? null,
      }));

      if (signatureList.length === 0) continue;

      const { data: existingTrades, error } = await supabase
        .from('trades')
        .select('signature')
        .in('signature', signatureList.map((entry) => entry.signature));

      if (error) {
        console.error(`[WORKER] Recon DB error for ${wallet}:`, error);
        continue;
      }

      const existingSet = new Set((existingTrades || []).map((trade) => trade.signature));
      const cachedNonTrades = await getCachedNonTradeSignatures(
        wallet,
        signatureList.map((entry) => entry.signature),
        new Date().toISOString()
      );
      const missingSigs = signatureList.filter(
        (entry) => !existingSet.has(entry.signature) && !cachedNonTrades.has(entry.signature)
      );

      if (missingSigs.length > 0) {
        console.log(`[WORKER] Reconciliation: Found ${missingSigs.length} missing txs for ${wallet.slice(0, 8)}... Queueing...`);
        await enqueueParsedTxMessages(
          missingSigs
            .slice()
            .reverse()
            .map((entry) => ({
              signature: entry.signature,
              wallet,
              source: 'startup_reconcile' as const,
              discoveredAt: new Date().toISOString(),
              blockTime: entry.blockTime,
            }))
        );
      }
    } catch (error) {
      console.error(`[WORKER] Recon error for ${wallet}:`, error);
    }
  }

  console.log('[WORKER] Startup reconciliation complete.');
}

async function startWorker() {
  console.log('[WORKER] Starting Yellowstone Ingestion Worker...');
  console.log(`[WORKER] Target Yellowstone: ${YELLOWSTONE_GRPC_URL}`);

  trackedWallets = await fetchTrackedWallets();
  console.log(`[WORKER] Loaded ${trackedWallets.length} tracked wallets from DB.`);

  // ── Carbon parser init ─────────────────────────────────────────────────────
  if (getCarbonParserEnabled()) {
    const bridge = await initCarbonBridge();
    if (bridge) {
      console.log('[WORKER] Carbon parser active');
    }
  }

  await startYellowstoneSubscriptionWithRetry('startup');

  setInterval(syncTrackedWallets, 60 * 1000);
  setInterval(() => {
    drainParsedTxQueue().catch(recordParsedQueueFailure);
  }, PARSED_TX_REQUEST_INTERVAL_MS);
  setInterval(pruneYellowstoneCaches, 60 * 1000);

  // Carbon parser observability: log counters every 60s
  setInterval(() => {
    const bridge = getCarbonBridge();
    if (!bridge?.isRunning) return;
    const { trade, no_trade, unknown, error } = carbonCounters;
    if (trade + no_trade + unknown + error === 0) return;
    console.log(
      `[CARBON] Stats — trade=${trade} no_trade=${no_trade} unknown=${unknown} error=${error} `
      + `| pending=${bridge.pendingCount}`
    );
  }, 60 * 1000);

  monitorConnectionHealth();

  setTimeout(() => {
    reconcileStartup().catch(console.error);
  }, 5000);
}

process.on('SIGINT', async () => {
  isShuttingDown = true;
  console.log(`\n[WORKER] Shutting down... tracked wallets: ${trackedWallets.length}`);
  await stopYellowstoneSubscription();
  await stopCarbonBridge().catch(console.error);
  process.exit(0);
});

startWorker().catch(console.error);
