import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { processBatch } from '@/lib/ingestion/orchestrator';
import { normalizeWebsocketPayload } from '@/lib/ingestion/websocket-adapter';
import { detectTrade } from '@/lib/trade-parser';
import { getSolPrice } from '@/lib/services/token-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60s timeout for Vercel

// ============================================================
// Phase 3: Reconciliation Cron — /api/cron/reconcile
// ============================================================
// Runs every 5 minutes (configure in vercel.json or Railway cron).
// For each tracked wallet:
//   1. Fetch last 50 signatures from Helius
//   2. Compare against `trades` table
//   3. For any missing signatures: fetch enhanced tx → processBatch()
//
// Already-processed trades are safely deduped by claimTrade() (unique
// constraint on `trades.signature`). The staleness policy in
// follower-producer.ts applies to recovered trades just as to live ones:
// stale BUYs with no follower position will be skipped.
// ============================================================

const HELIUS_API_KEY = process.env.HELIUS_API_KEY!;
const HELIUS_RPC_URL = process.env.HELIUS_API_RPC_URL || `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const LOOKBACK_LIMIT = 50; // last N signatures per wallet
const ENHANCED_TX_URL = `https://api.helius.xyz/v0/transactions/?api-key=${HELIUS_API_KEY}`;
const NON_TRADE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const nonTradeSignatureCache = new Map<string, number>();

// ── Auth ──────────────────────────────────────────────────────────────────────
function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // If CRON_SECRET is not configured, allow in dev, block in production
    return process.env.NODE_ENV !== 'production';
  }
  return authHeader === `Bearer ${cronSecret}`;
}

function pruneNonTradeCache(now: number) {
  for (const [signature, expiresAt] of nonTradeSignatureCache.entries()) {
    if (expiresAt <= now) {
      nonTradeSignatureCache.delete(signature);
    }
  }
}

function markNonTradeSignatures(signatures: string[], now: number) {
  const expiresAt = now + NON_TRADE_CACHE_TTL_MS;
  for (const signature of signatures) {
    nonTradeSignatureCache.set(signature, expiresAt);
  }
}

// ── Helius helpers ────────────────────────────────────────────────────────────

/**
 * Fetch last N signatures for a wallet from the Helius/Solana RPC.
 */
async function getRecentSignatures(wallet: string, limit: number): Promise<string[]> {
  const resp = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getSignaturesForAddress',
      params: [wallet, { limit, commitment: 'finalized' }],
    }),
  });

  if (!resp.ok) {
    throw new Error(`getSignaturesForAddress failed for ${wallet}: ${resp.statusText}`);
  }

  const json = await resp.json();
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);

  // Filter out failed transactions — we only care about confirmed ones
  const entries: { signature: string; err: any }[] = json.result || [];
  return entries.filter(e => e.err === null).map(e => e.signature);
}

/**
 * Fetch Helius Enhanced Transactions for the given signatures.
 * Returns an array of enriched transaction objects.
 */
async function fetchEnhancedTransactions(signatures: string[]): Promise<any[]> {
  if (signatures.length === 0) return [];

  const resp = await fetch(ENHANCED_TX_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactions: signatures }),
  });

  if (!resp.ok) {
    throw new Error(`Enhanced tx fetch failed: ${resp.statusText}`);
  }

  return resp.json();
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const startedAt = Date.now();
  pruneNonTradeCache(startedAt);
  console.log('[RECONCILE] Starting reconciliation run...');

  try {
    // 1. Load all tracked wallets
    const { data: traders, error: tradersError } = await supabase
      .from('star_traders')
      .select('address');

    if (tradersError || !traders) {
      console.error('[RECONCILE] Failed to fetch star_traders:', tradersError?.message);
      return NextResponse.json({ error: 'Failed to load wallets' }, { status: 500 });
    }

    console.log(`[RECONCILE] Checking ${traders.length} wallets (lookback: last ${LOOKBACK_LIMIT} signatures each)`);

    const solPrice = await getSolPrice();
    let totalMissing = 0;
    let totalProcessed = 0;
    let totalInserted = 0;
    const walletSummaries: { wallet: string; missing: number; inserted: number }[] = [];

    for (const trader of traders) {
      const wallet = trader.address;

      try {
        // 2. Fetch recent signatures from Helius RPC
        const recentSigs = await getRecentSignatures(wallet, LOOKBACK_LIMIT);

        if (recentSigs.length === 0) continue;

        // 3. Cross-check against the `trades` table
        const { data: knownTrades } = await supabase
          .from('trades')
          .select('signature')
          .in('signature', recentSigs);

        const knownSigs = new Set((knownTrades || []).map(t => t.signature));
        const unseenSigs = recentSigs.filter(sig => !knownSigs.has(sig));
        const missingSigs = unseenSigs.filter(sig => !nonTradeSignatureCache.has(sig));

        if (missingSigs.length === 0) {
          console.log(`[RECONCILE] ${wallet.slice(0, 8)}...: all ${recentSigs.length} sigs are known or recently classified as non-trades`);
          continue;
        }

        console.log(
          `[RECONCILE] ${wallet.slice(0, 8)}...: found ${missingSigs.length} unresolved sig(s) ` +
          `(raw missing: ${unseenSigs.length}) — fetching enhanced txs`
        );

        // 4. Fetch enhanced transactions for missing signatures
        const enhancedTxs = await fetchEnhancedTransactions(missingSigs);

        if (enhancedTxs.length === 0) {
          console.log(`[RECONCILE] ${wallet.slice(0, 8)}...: no enhanced txs returned for missing sigs`);
          continue;
        }

        const tradeCandidates: any[] = [];
        const nonTradeSignatures: string[] = [];

        for (const tx of enhancedTxs) {
          if (!tx?.signature) continue;

          const detectedTrade = detectTrade(tx, wallet, solPrice);
          if (!detectedTrade) {
            nonTradeSignatures.push(tx.signature);
            continue;
          }

          tradeCandidates.push(tx);
        }

        if (nonTradeSignatures.length > 0) {
          markNonTradeSignatures(nonTradeSignatures, Date.now());
        }

        if (tradeCandidates.length === 0) {
          console.log(`[RECONCILE] ${wallet.slice(0, 8)}...: ${missingSigs.length} unresolved sig(s) were non-trades`);
          continue;
        }

        totalMissing += tradeCandidates.length;

        // 5. Normalize and run through the shared orchestrator pipeline.
        //    claimTrade() inside processBatch() provides idempotency:
        //    already-processed signatures will be safely skipped.
        const ingestedTxs = normalizeWebsocketPayload(tradeCandidates);
        const receivedAt = Date.now();
        const result = await processBatch(ingestedTxs, receivedAt);

        totalProcessed += result.processed;
        totalInserted += result.inserted;
        walletSummaries.push({ wallet: wallet.slice(0, 8), missing: tradeCandidates.length, inserted: result.inserted });

        console.log(
          `[RECONCILE] ${wallet.slice(0, 8)}...: processed ${result.processed}, inserted ${result.inserted} ` +
          `(trade candidates: ${tradeCandidates.length}, cached non-trades: ${nonTradeSignatures.length})`
        );

      } catch (walletErr: any) {
        console.error(`[RECONCILE] Error for wallet ${wallet.slice(0, 8)}...:`, walletErr.message);
        // Continue with other wallets — don't fail the whole run
      }
    }

    const durationMs = Date.now() - startedAt;
    console.log(
      `[RECONCILE] Run complete in ${durationMs}ms | ` +
      `Wallets: ${traders.length} | Missing sigs found: ${totalMissing} | ` +
      `Processed: ${totalProcessed} | Inserted: ${totalInserted}`
    );

    return NextResponse.json({
      success: true,
      durationMs,
      walletsChecked: traders.length,
      missingFound: totalMissing,
      processed: totalProcessed,
      inserted: totalInserted,
      details: walletSummaries,
    });

  } catch (err: any) {
    console.error('[RECONCILE] Fatal error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
