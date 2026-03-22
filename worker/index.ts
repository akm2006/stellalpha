// Run with: npx tsx worker/index.ts
import dotenv from 'dotenv';
// MUST load env BEFORE any module-level side effects (supabase, etc.)
dotenv.config({ path: '.env.local' });

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
import { cacheNonTradeSignatures, getCachedNonTradeSignatures } from '../lib/repositories/non-trade-signatures.repo';
import { getSolPrice } from '../lib/services/token-service';

// Env config
// Connection() first arg = HTTP/HTTPS endpoint (for RPC calls)
// wsEndpoint = WSS endpoint (for subscriptions)
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const HTTP_RPC_URL = process.env.HELIUS_API_RPC_URL
  || `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const WS_RPC_URL = process.env.CHAINSTACK_WSS_URL
  || 'wss://api.mainnet-beta.solana.com';

if (!HELIUS_API_KEY) {
  console.error("[WORKER] Missing HELIUS_API_KEY environment variable");
  process.exit(1);
}
if (!process.env.CHAINSTACK_WSS_URL) {
  console.warn("[WORKER] WARNING: CHAINSTACK_WSS_URL not set, falling back to public RPC");
}

function createConnection() {
  return new Connection(HTTP_RPC_URL, {
    commitment: 'confirmed',
    wsEndpoint: WS_RPC_URL,
  });
}

let connection = createConnection();

// Cache to deduplicate websocket signature notifications before durable enqueue.
const signatureCache = new Set<string>();

// Tracked wallets
let trackedWallets: string[] = [];
const activeSubscriptions = new Map<string, number>();

// Reconnection / Health state
let lastSlotTime = Date.now();
let slotSubId: number | null = null;
let isReconnecting = false;
let isDrainingParsedQueue = false;
let backoffMs = 1000;
const MAX_BACKOFF = 30000;
const STARTUP_RECONCILE_LIMIT = 25;

// Helper to clean up cache periodically to prevent memory leaks
setInterval(() => {
  signatureCache.clear();
}, 60 * 60 * 1000); // 1 hour 

async function fetchTrackedWallets() {
  const { data, error } = await supabase.from('star_traders').select('address');
  if (error || !data) {
    console.error('[WORKER] Failed to fetch star traders:', error);
    return [];
  }
  return data.map(d => d.address);
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
  const solPrice = await getSolPrice();
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
        trade: await detectIngestedTrade(transaction.raw, wallet, { solPrice }),
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

  const queueRecords = await readParsedTxMessages(PARSED_TX_BATCH_SIZE);
  if (queueRecords.length === 0) {
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
        `[WORKER] Orchestrator completed in ${Date.now() - orchestratorStart}ms | ` +
        `Batch size: ${processableTransactions.length} | Processed: ${processed}, Inserted: ${inserted}`
      );
      await archiveParsedTxMessages(
        fetchResult.archivedMessageIds.filter((msgId) => !nonTradeArchiveIds.includes(msgId))
      );
    } catch (error) {
      console.error(`[WORKER] Orchestrator error on parsed batch:`, error);
    }
  } finally {
    isDrainingParsedQueue = false;
  }
}

function handleNewSignature(signature: string, wallet: string) {
  if (signatureCache.has(signature)) return;
  signatureCache.add(signature);

  const receiveTimestamp = Date.now();
  console.log(`[WORKER] New log for ${wallet.slice(0, 8)}... | SIG: ${signature}`);
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

// ----------------------------------------------------------------------------
// SUBSCRIPTION & RECONNECTION LOGIC
// ----------------------------------------------------------------------------
function subscribeToWallet(wallet: string) {
  try {
    const pubkey = new PublicKey(wallet);
    const subId = connection.onLogs(
      pubkey,
      (logs, ctx) => {
        if (logs.err) return; // Skip failed txs early
        handleNewSignature(logs.signature, wallet);
      },
      'confirmed'
    );
    activeSubscriptions.set(wallet, subId);
    console.log(`[WORKER] Subscribed to logs for ${wallet.slice(0, 8)}... (Sub ID: ${subId})`);
  } catch (e) {
    console.error(`[WORKER] Failed to subscribe to ${wallet}`, e);
  }
}

async function unsubscribeFromWallet(wallet: string) {
  const subId = activeSubscriptions.get(wallet);
  if (subId !== undefined) {
    try {
      await connection.removeOnLogsListener(subId);
      activeSubscriptions.delete(wallet);
      console.log(`[WORKER] Unsubscribed from logs for ${wallet.slice(0, 8)}...`);
    } catch (e) {
      console.error(`[WORKER] Failed to unsubscribe from ${wallet}`, e);
    }
  }
}

function setupHeartbeat() {
  if (slotSubId !== null) {
    connection.removeSlotChangeListener(slotSubId).catch(console.error);
  }
  try {
    slotSubId = connection.onSlotChange(slot => {
      lastSlotTime = Date.now();
    });
    console.log(`[WORKER] Slot heartbeat listener established.`);
  } catch (e) {
    console.error(`[WORKER] Failed to setup heartbeat:`, e);
  }
}

async function performReconnection() {
  if (isReconnecting) return;
  isReconnecting = true;
  console.log(`[WS_DISCONNECT] Connection stale/dropped. Attempting reconnect in ${backoffMs}ms... (backoff: ${backoffMs}ms)`);
  console.log(`[WS_DISCONNECT] Active subs lost: ${activeSubscriptions.size} | Tracked wallets: ${trackedWallets.length}`);
  
  await new Promise(r => setTimeout(r, backoffMs));
  
  try {
     // Cleanup old
     for (const [wallet, subId] of activeSubscriptions.entries()) {
       try { await connection.removeOnLogsListener(subId); } catch(e) {}
     }
     if (slotSubId !== null) {
       try { await connection.removeSlotChangeListener(slotSubId); } catch(e) {}
     }
     activeSubscriptions.clear();
     
     // Rebuild connection
     connection = createConnection();

     setupHeartbeat();
     
     // Resubscribe everyone
     for (const wallet of trackedWallets) {
       subscribeToWallet(wallet);
     }
     
     // Success! Reset backoff
     backoffMs = 1000;
     isReconnecting = false;
     console.log(`[WS_RECONNECT] Reconnection successful! Active subs: ${activeSubscriptions.size} | Backoff reset to ${backoffMs}ms`);
  } catch (error) {
     console.error(`[WS_RECONNECT] Reconnection attempt failed (backoff will increase to ${Math.min(backoffMs * 2, MAX_BACKOFF)}ms):`, error);
     backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF);
     isReconnecting = false;
     // Trigger another attempt
     performReconnection();
  }
}

// ----------------------------------------------------------------------------
// PERIODIC TASKS
// ----------------------------------------------------------------------------
function monitorConnectionHealth() {
  setInterval(() => {
    const timeSinceLastSlot = Date.now() - lastSlotTime;
    
    // Log basic health stats
    console.log(
      `[HEALTH] Active Subs: ${activeSubscriptions.size} | Last Slot: ${timeSinceLastSlot}ms ago | ` +
      `Cache Size: ${signatureCache.size} | Parsed Queue Drain Active: ${isDrainingParsedQueue}`
    );

    // Idle timeout detection (Chainstack drops idle over 1h, but 60s without slot is anomalous)
    if (timeSinceLastSlot > 60 * 1000) {
      console.warn(`[WARNING] No slot change for ${timeSinceLastSlot}ms. Triggering reconnect...`);
      performReconnection();
    }
  }, 10 * 1000); // Check every 10s
}

async function syncTrackedWallets() {
  if (isReconnecting) return;

  const currentWallets = await fetchTrackedWallets();
  const newSet = new Set(currentWallets);
  const oldSet = new Set(trackedWallets);

  // Subscribe to new wallets
  for (const wallet of currentWallets) {
    if (!oldSet.has(wallet)) {
      subscribeToWallet(wallet);
    }
  }

  // Unsubscribe from removed wallets
  for (const wallet of trackedWallets) {
    if (!newSet.has(wallet)) {
      await unsubscribeFromWallet(wallet);
    }
  }

  trackedWallets = currentWallets;
}

// ----------------------------------------------------------------------------
// STARTUP RECONCILIATION
// ----------------------------------------------------------------------------
async function reconcileStartup() {
  console.log(`[WORKER] Starting startup reconciliation (lookback: last ${STARTUP_RECONCILE_LIMIT} confirmed signatures per wallet)...`);
  
  for (const wallet of trackedWallets) {
    try {
      // 1. Fetch a modestly deeper confirmed-signature window for startup recovery.
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

      // 2. Check which ones are already in our DB
      const { data: existingTrades, error } = await supabase
        .from('trades')
        .select('signature')
        .in('signature', signatureList.map((entry) => entry.signature));

      if (error) {
        console.error(`[WORKER] Recon DB error for ${wallet}:`, error);
        continue;
      }

      const existingSet = new Set((existingTrades || []).map(t => t.signature));
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
    } catch (e) {
      console.error(`[WORKER] Recon error for ${wallet}:`, e);
    }
  }
  
  console.log(`[WORKER] Startup reconciliation complete.`);
}

// ----------------------------------------------------------------------------
// ENTRYPOINT
// ----------------------------------------------------------------------------
async function startWorker() {
  console.log(`[WORKER] Starting WebSocket Ingestion Worker...`);
  console.log(`[WORKER] Target RPC: ${WS_RPC_URL}`);
  
  trackedWallets = await fetchTrackedWallets();
  console.log(`[WORKER] Loaded ${trackedWallets.length} tracked wallets from DB.`);

  setupHeartbeat();

  // Stagger subscriptions to avoid Chainstack RPS limit on startup
  // (all-at-once fires N requests simultaneously, hitting the per-second limit)
  for (const wallet of trackedWallets) {
    subscribeToWallet(wallet);
    await new Promise(r => setTimeout(r, 500)); // 500ms between each sub — stays within Chainstack RPS limit
  }

  // Periodic polling for wallet updates (every 60s)
  setInterval(syncTrackedWallets, 60 * 1000);
  setInterval(() => {
    drainParsedTxQueue().catch(console.error);
  }, PARSED_TX_REQUEST_INTERVAL_MS);

  // Monitor connection health continually
  monitorConnectionHealth();

  // Run startup reconciliation once subscriptions are active
  // Small delay to let initial websocket burst settle
  setTimeout(() => {
    reconcileStartup().catch(console.error);
  }, 5000);
}

process.on('SIGINT', async () => {
  console.log(`\n[WORKER] Shutting down... cleaning up ${activeSubscriptions.size} subscriptions`);
  for (const [wallet, subId] of activeSubscriptions.entries()) {
    try { await connection.removeOnLogsListener(subId); } catch(e) {}
  }
  if (slotSubId !== null) {
    try { await connection.removeSlotChangeListener(slotSubId); } catch(e) {}
  }
  process.exit(0);
});

startWorker().catch(console.error);
