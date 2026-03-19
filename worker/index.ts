// Run with: npx tsx worker/index.ts
import dotenv from 'dotenv';
// MUST load env BEFORE any module-level side effects (supabase, etc.)
dotenv.config({ path: '.env.local' });

import { Connection, PublicKey } from '@solana/web3.js';
import { supabase } from '../lib/supabase';
import { processBatch } from '../lib/ingestion/orchestrator';
import { normalizeWebsocketPayload } from '../lib/ingestion/websocket-adapter';

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

// Tracked wallets
let trackedWallets: string[] = [];
const activeSubscriptions = new Map<string, number>();

// Reconnection / Health state
let lastSlotTime = Date.now();
let slotSubId: number | null = null;
let isReconnecting = false;
let backoffMs = 1000;
const MAX_BACKOFF = 30000;

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
async function fetchEnhancedTransaction(signature: string, attempt = 1): Promise<any> {
  const start = Date.now();
  console.log(`[WORKER] Fetching enhanced tx: ${signature} (Attempt ${attempt})`);
  
  try {
    const res = await fetch(`https://api.helius.xyz/v0/transactions/?api-key=${HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: [signature] })
    });

    if (!res.ok) {
      console.error(`[WORKER] Helius fetch failed: ${res.status} ${res.statusText}`);
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, attempt === 1 ? 200 : attempt === 2 ? 500 : 1000));
        return fetchEnhancedTransaction(signature, attempt + 1);
      }
      return null;
    }

    const payload = await res.json();
    
    // Guard against Helius indexing delays — payload might be empty immediately after confirmation
    if (!payload || payload.length === 0 || !payload[0]) {
      console.log(`[WORKER] Enhanced payload empty for ${signature}, Helius indexing delay?`);
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, attempt === 1 ? 200 : attempt === 2 ? 500 : 1000));
        return fetchEnhancedTransaction(signature, attempt + 1);
      }
      return null;
    }

    console.log(`[WORKER] Enhanced tx fetch took ${Date.now() - start}ms`);
    return payload[0]; // Returns array of enriched txs
  } catch (err) {
    console.error(`[WORKER] Helius fetch error:`, err);
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, attempt === 1 ? 200 : attempt === 2 ? 500 : 1000));
      return fetchEnhancedTransaction(signature, attempt + 1);
    }
    return null;
  }
}

async function handleNewSignature(signature: string, wallet: string) {
  if (signatureCache.has(signature)) return;
  signatureCache.add(signature);

  const receiveTimestamp = Date.now();
  console.log(`[WORKER] New log for ${wallet.slice(0, 8)}... | SIG: ${signature}`);

  const enrichedTx = await fetchEnhancedTransaction(signature);
  if (!enrichedTx) {
    console.error(`[WORKER] Failed to pull payload for ${signature} after retries, skipping`);
    return;
  }

  const normalizedBatch = normalizeWebsocketPayload([enrichedTx]);

  if (normalizedBatch.length === 0) {
     console.error(`[WORKER] Normalization failed for ${signature}`);
     return;
  }

  console.log(`[WORKER] Triggering orchestrator for ${signature}`);
  const orchestratorStart = Date.now();
  
  try {
    const { processed, inserted } = await processBatch(normalizedBatch, receiveTimestamp);
    console.log(`[WORKER] Orchestrator completed in ${Date.now() - orchestratorStart}ms | Processed: ${processed}, Inserted: ${inserted}`);
  } catch (error) {
    console.error(`[WORKER] Orchestrator error on ${signature}:`, error);
  }
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
        handleNewSignature(logs.signature, wallet).catch(console.error);
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
    console.log(`[HEALTH] Active Subs: ${activeSubscriptions.size} | Last Slot: ${timeSinceLastSlot}ms ago | Cache Size: ${signatureCache.size}`);

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
  console.log(`[WORKER] Starting startup reconciliation...`);
  
  for (const wallet of trackedWallets) {
    try {
      // 1. Fetch last 10 confirmed signatures from RPC for this wallet
      const sigs = await connection.getSignaturesForAddress(new PublicKey(wallet), { limit: 10 }, 'confirmed');
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
        console.log(`[WORKER] Reconciliation: Found ${missingSigs.length} missing txs for ${wallet.slice(0, 8)}... Processing...`);
        for (const sig of missingSigs.reverse()) { // Process oldest to newest
           await handleNewSignature(sig, wallet);
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
