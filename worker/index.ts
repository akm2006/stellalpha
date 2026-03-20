// Run with: npx tsx worker/index.ts
import dotenv from 'dotenv';
// MUST load env BEFORE any module-level side effects (supabase, etc.)
dotenv.config({ path: '.env.local' });

import { Connection, PublicKey } from '@solana/web3.js';
import { supabase } from '../lib/supabase';
import { processBatch } from '../lib/ingestion/orchestrator';
import { normalizeWebsocketPayload } from '../lib/ingestion/websocket-adapter';
import {
  dequeueReadyBatch,
  ENHANCED_BATCH_SIZE,
  ENHANCED_REQUEST_INTERVAL_MS,
  enqueueSignature,
  PendingSignatureEntry,
  rescheduleEntries,
} from './enhanced-fetch-queue';

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

// Cache to deduplicate parsed signatures (if 1 tx mentions 2 tracked wallets, or if retries occur)
const signatureCache = new Set<string>();
const pendingEnhancedFetches = new Map<string, PendingSignatureEntry>();

// Tracked wallets
let trackedWallets: string[] = [];
const activeSubscriptions = new Map<string, number>();

// Reconnection / Health state
let lastSlotTime = Date.now();
let slotSubId: number | null = null;
let isReconnecting = false;
let isDrainingEnhancedQueue = false;
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

// ----------------------------------------------------------------------------
// MANDATORY FETCH RETRY (3 attempts)
// ----------------------------------------------------------------------------
async function fetchEnhancedTransactions(signatures: string[]): Promise<{ ok: true; payload: any[] } | { ok: false; status?: number; statusText?: string }> {
  const start = Date.now();
  console.log(`[WORKER] Fetching ${signatures.length} enhanced tx(s)`);
  
  try {
    const res = await fetch(`https://api.helius.xyz/v0/transactions/?api-key=${HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: signatures })
    });

    if (!res.ok) {
      console.error(`[WORKER] Helius fetch failed: ${res.status} ${res.statusText}`);
      return { ok: false, status: res.status, statusText: res.statusText };
    }

    const payload = await res.json();

    console.log(`[WORKER] Enhanced tx fetch took ${Date.now() - start}ms`);
    return { ok: true, payload: Array.isArray(payload) ? payload : [] };
  } catch (err) {
    console.error(`[WORKER] Helius fetch error:`, err);
    return { ok: false };
  }
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

async function drainEnhancedFetchQueue() {
  if (isDrainingEnhancedQueue || pendingEnhancedFetches.size === 0) {
    return;
  }

  const batch = dequeueReadyBatch(pendingEnhancedFetches, Date.now(), ENHANCED_BATCH_SIZE);
  if (batch.length === 0) {
    return;
  }

  isDrainingEnhancedQueue = true;

  try {
    const signatures = batch.map((entry) => entry.signature);
    const alreadyClaimed = await getClaimedSignatures(signatures);
    const fetchEntries = batch.filter((entry) => !alreadyClaimed.has(entry.signature));

    if (alreadyClaimed.size > 0) {
      console.log(`[WORKER] Skipping ${alreadyClaimed.size} queued signature(s) already claimed by webhook/reconcile`);
    }

    if (fetchEntries.length === 0) {
      return;
    }

    const fetchResult = await fetchEnhancedTransactions(fetchEntries.map((entry) => entry.signature));
    if (!fetchResult.ok) {
      rescheduleEntries(pendingEnhancedFetches, fetchEntries, fetchResult.status, Date.now());
      console.warn(
        `[WORKER] Re-queued ${fetchEntries.length} signature(s) after enhanced fetch failure` +
        `${fetchResult.status ? ` (${fetchResult.status}${fetchResult.statusText ? ` ${fetchResult.statusText}` : ''})` : ''}`
      );
      return;
    }

    const payloadBySignature = new Map<string, any>();
    for (const tx of fetchResult.payload) {
      if (tx?.signature) {
        payloadBySignature.set(tx.signature, tx);
      }
    }

    const missingPayloadEntries = fetchEntries.filter((entry) => !payloadBySignature.has(entry.signature));
    if (missingPayloadEntries.length > 0) {
      console.log(`[WORKER] Enhanced payload missing ${missingPayloadEntries.length} signature(s), re-queueing`);
      rescheduleEntries(pendingEnhancedFetches, missingPayloadEntries, undefined, Date.now());
    }

    const enrichedBatch = fetchEntries
      .map((entry) => payloadBySignature.get(entry.signature))
      .filter(Boolean);

    if (enrichedBatch.length === 0) {
      return;
    }

    const normalizedBatch = normalizeWebsocketPayload(enrichedBatch);
    if (normalizedBatch.length === 0) {
      console.error(`[WORKER] Normalization failed for ${enrichedBatch.length} enhanced tx(s)`);
      return;
    }

    console.log(`[WORKER] Triggering orchestrator for ${normalizedBatch.length} batched tx(s)`);
    const orchestratorStart = Date.now();

    try {
      const { processed, inserted } = await processBatch(normalizedBatch, Date.now());
      console.log(
        `[WORKER] Orchestrator completed in ${Date.now() - orchestratorStart}ms | ` +
        `Batch size: ${normalizedBatch.length} | Processed: ${processed}, Inserted: ${inserted}`
      );
    } catch (error) {
      console.error(`[WORKER] Orchestrator error on batched fetch:`, error);
    }
  } finally {
    isDrainingEnhancedQueue = false;
  }
}

function handleNewSignature(signature: string, wallet: string) {
  if (signatureCache.has(signature)) return;
  signatureCache.add(signature);

  const receiveTimestamp = Date.now();
  console.log(`[WORKER] New log for ${wallet.slice(0, 8)}... | SIG: ${signature}`);
  enqueueSignature(pendingEnhancedFetches, signature, wallet, receiveTimestamp);
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
      `Cache Size: ${signatureCache.size} | Pending Enhanced: ${pendingEnhancedFetches.size}`
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
      const signatureList = sigs.map(s => s.signature);
      
      if (signatureList.length === 0) continue;

      // 2. Check which ones are already in our DB
      const { data: existingTrades, error } = await supabase
        .from('trades')
        .select('signature')
        .in('signature', signatureList);

      if (error) {
        console.error(`[WORKER] Recon DB error for ${wallet}:`, error);
        continue;
      }

      const existingSet = new Set((existingTrades || []).map(t => t.signature));
      const missingSigs = signatureList.filter(s => !existingSet.has(s));
      
      if (missingSigs.length > 0) {
        console.log(`[WORKER] Reconciliation: Found ${missingSigs.length} missing txs for ${wallet.slice(0, 8)}... Queueing...`);
        for (const sig of missingSigs.reverse()) { // Process oldest to newest
           handleNewSignature(sig, wallet);
        }
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
    drainEnhancedFetchQueue().catch(console.error);
  }, ENHANCED_REQUEST_INTERVAL_MS);

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
