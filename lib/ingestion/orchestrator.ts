import { getTokenSymbol, enrichTradeSymbols, getUsdValue } from '@/lib/services/token-service';
import { getStarTradersByAddresses } from '@/lib/repositories/star-traders.repo';
import { claimTrade, deleteClaimedTrade, updateTradePnL } from '@/lib/repositories/trades.repo';
import { getPosition, upsertPosition } from '@/lib/repositories/positions.repo';
import { queueCopyTrades, triggerQueuedTradeProcessors } from '@/lib/ingestion/follower-producer';
import { deleteQueuedTradesBySignature } from '@/lib/repositories/demo-trades.repo';
import { RawTrade } from '@/lib/trade-parser';
import { PerformanceTimer } from '@/lib/utils/perf-timer';
import { extractInvolvedAddresses } from '@/lib/ingestion/utils';
import { detectIngestedTrade } from '@/lib/ingestion/detect-ingested-trade';
import { IngestedTransaction, IngestionResult } from './types';

// detectTrade is now delegated to the extracted, tested trade-parser module.
// Wrapper to maintain async interface and add performance logging.
async function detectTrade(tx: any, wallet: string): Promise<RawTrade | null> {
  const timer = new PerformanceTimer(`detectTrade(${tx.signature?.slice(0, 8)}...)`);

  const result = await detectIngestedTrade(tx, wallet);
  timer.checkpoint('Resolve trade using provider-aware parser');

  if (!result) {
    timer.checkpoint('No trade pattern detected');
    return null;
  }

  timer.checkpoint(`Trade detected: ${result.type} ${result.tokenMint?.slice(0, 8)}... (confidence: ${result.confidence})`);
  timer.finish('detectTrade');
  return result;
}

async function updatePositionAndGetPnL(trade: RawTrade, usdValue: number): Promise<{ realizedPnl: number | null; avgCostBasis: number | null }> {
  const { wallet, tokenMint, type, tokenAmount } = trade;

  // CONFIDENCE GUARD: If confidence is 'low', skip PnL to avoid phantom profit/loss.
  // The trade is still persisted for record-keeping, but realized_pnl stays null.
  if (trade.confidence === 'low') {
    console.log(`[PnL] Skipping PnL for low-confidence trade: ${trade.signature?.slice(0, 12)}...`);
    return { realizedPnl: null, avgCostBasis: null };
  }

  // Get current position
  const { data: position } = await getPosition(wallet, tokenMint);

  let currentSize = position?.size || 0;
  let currentCost = position?.cost_usd || 0;
  let avgCost = position?.avg_cost || 0;
  let realizedPnl: number | null = null;

  if (type === 'buy') {
    // Add to position
    const newSize = currentSize + tokenAmount;
    const newCost = currentCost + usdValue;
    avgCost = newSize > 0 ? newCost / newSize : 0;

    await upsertPosition(wallet, tokenMint, newSize, newCost, avgCost);
  } else {
    // Sell: calculate PnL
    if (currentSize > 0 && avgCost > 0) {
      const soldCost = avgCost * tokenAmount;
      realizedPnl = usdValue - soldCost;

      const remainingSize = Math.max(0, currentSize - tokenAmount);
      const remainingCost = remainingSize > 0 ? avgCost * remainingSize : 0;

      await upsertPosition(wallet, tokenMint, remainingSize, remainingCost, remainingSize > 0 ? avgCost : 0);
    }
  }

  return { realizedPnl, avgCostBasis: avgCost };
}

export async function processBatch(transactions: IngestedTransaction[], receivedAt: number): Promise<IngestionResult> {
  let processed = 0;
  let inserted = 0;
  let batchError: Error | null = null;

  // ── Phase 3: Observability — source win counters ───────────────────────────
  // Tracks which ingestion source (webhook vs websocket) claimed the trade first
  // in this batch. Logged at the end for operational visibility.
  const winCounts: Record<string, number> = {};
  const skipCounts: Record<string, number> = {};

  for (const tx of transactions) {
    if (!tx.signature) continue;

    // ============ FIX: Detect Star Traders from ANY involved address ============
    // Handles cases where Star Trader uses a bot/relayer as feePayer
    // Performance: Single DB query with .in() instead of per-address queries

    // 1. Extract all unique addresses involved in this transaction
    const involvedAddresses = extractInvolvedAddresses(tx.raw);
    const txTimer = new PerformanceTimer(`TX(${tx.signature?.slice(0, 8)}...)`);

    if (involvedAddresses.size === 0) {
      console.log(`No involved addresses in tx: ${tx.signature.slice(0, 12)}...`);
      continue;
    }

    txTimer.checkpoint('Extract addresses');

    // 2. Query star_traders for ANY match (single efficient query)
    const { data: matchedStarTraders, error: starTraderError } = await getStarTradersByAddresses(Array.from(involvedAddresses));

    txTimer.checkpoint('DB: Star trader query');

    if (starTraderError) {
      console.error(`Star trader query error:`, starTraderError.message);
      continue;
    }

    if (!matchedStarTraders || matchedStarTraders.length === 0) {
      // Log which addresses we checked (first 3 for brevity)
      const sampleAddresses = Array.from(involvedAddresses).slice(0, 3).map(a => a.slice(0, 8));
      console.log(`No star traders in tx ${tx.signature.slice(0, 12)}... (checked ${involvedAddresses.size} addrs: ${sampleAddresses.join(', ')}...)`);
      txTimer.finish('TX - No star traders');
      continue;
    }

    // 3. Process trade for EACH matched star trader
    // (Important: A single tx could involve multiple tracked wallets)
    for (const starTrader of matchedStarTraders) {
      const traderAddress = starTrader.address;
      const isFeePayer = traderAddress === tx.feePayer;

      console.log(`[${tx.source?.toUpperCase() || 'UNKNOWN'}] Matched Star Trader: ${traderAddress.slice(0, 12)}... (${isFeePayer ? 'feePayer' : 'involved, not feePayer'})`);

      const trade = await detectTrade(tx.raw, traderAddress);
      if (!trade) {
        txTimer.checkpoint(`Trade detection failed for ${traderAddress.slice(0, 8)}`);
        continue;
      }

      processed++;
      txTimer.checkpoint('Trade detected');

      // Convert raw denomination baseAmount to USD for DB storage and PnL
      const usdValue = await getUsdValue(trade.baseMint, trade.baseAmount);
      txTimer.checkpoint('USD conversion');

      // Calculate latency (time from on-chain to now)
      const latencyMs = receivedAt - (trade.timestamp * 1000);
      let leaderPositionUpdated = false;

      // 1. CLAIM the trade — INSERT is the gate
      // Trade row built WITHOUT PnL fields (backfilled after position update)
      try {
        let queuedTraderStateIds: string[] = [];

        const { claimed } = await claimTrade({
          signature: trade.signature,
          wallet: trade.wallet,
          type: trade.type,
          token_mint: trade.tokenMint,
          token_symbol: getTokenSymbol(trade.tokenMint),
          token_in_mint: trade.tokenInMint,
          token_in_symbol: getTokenSymbol(trade.tokenInMint),
          token_in_amount: trade.tokenInAmount,
          token_out_mint: trade.tokenOutMint,
          token_out_symbol: getTokenSymbol(trade.tokenOutMint),
          token_out_amount: trade.tokenOutAmount,
          usd_value: usdValue,
          realized_pnl: null,     // will be backfilled
          avg_cost_basis: null,   // will be backfilled
          block_timestamp: trade.timestamp,
          source: trade.source,
          gas: trade.gas,
          latency_ms: latencyMs
        });

        if (!claimed) {
          // Another source already owns this signature — skip everything
          const skipSrc = tx.source?.toUpperCase() || 'UNKNOWN';
          console.log(`[ORCHESTRATOR] [${skipSrc}] Signature ${trade.signature.slice(0, 12)}... already claimed, skipping`);
          skipCounts[skipSrc] = (skipCounts[skipSrc] || 0) + 1;
          txTimer.finish('TX skipped - already claimed');
          continue;
        }

        inserted++;
        txTimer.checkpoint('DB: Insert leader trade (Claimed)');
        const winSrc = tx.source?.toUpperCase() || 'UNKNOWN';
        winCounts[winSrc] = (winCounts[winSrc] || 0) + 1;
        console.log(`[${winSrc}] Inserted trade: ${trade.type} ${trade.tokenMint.slice(0, 8)}... | Latency: ${latencyMs}ms`);

        // === FROM HERE, ONLY THE WINNER EXECUTES ===

        // 2+3. Queue followers and update leader position in parallel (different tables).
        const [queueResult, pnlResult] = await Promise.allSettled([
          queueCopyTrades(trade, receivedAt),
          updatePositionAndGetPnL(trade, usdValue),
        ]);

        // Handle partial failures individually
        if (queueResult.status === 'rejected') {
          if (pnlResult.status === 'fulfilled') {
            // Position updated but no followers queued. Leader position is still correct.
            leaderPositionUpdated = true;
            try {
              await updateTradePnL(trade.signature, pnlResult.value.realizedPnl, pnlResult.value.avgCostBasis);
            } catch (_) { /* best effort */ }
            console.warn(`[ORCHESTRATOR] Follower queueing failed but leader position updated for ${trade.signature.slice(0, 12)}...`);
          }
          throw queueResult.reason;
        }

        if (pnlResult.status === 'rejected') {
          // Position update failed but followers were queued.
          // Don't set leaderPositionUpdated — let error handler clean up trade + queued rows.
          queuedTraderStateIds = queueResult.value.queuedTraderStateIds;
          throw pnlResult.reason;
        }

        // Both succeeded
        queuedTraderStateIds = queueResult.value.queuedTraderStateIds;
        leaderPositionUpdated = true;
        txTimer.checkpoint('Queue followers + Update position (parallel)');

        // 4. Backfill PnL on the trade row (best-effort, depends on position result).
        try {
          await updateTradePnL(trade.signature, pnlResult.value.realizedPnl, pnlResult.value.avgCostBasis);
          txTimer.checkpoint('Backfill Trade PnL');
        } catch (pnlError: any) {
          console.warn(`[ORCHESTRATOR] Failed to backfill PnL for ${trade.signature.slice(0, 12)}...`, pnlError.message);
        }

        // 5. Trigger queue processors only after the leader position commit point.
        triggerQueuedTradeProcessors(queuedTraderStateIds);
        txTimer.checkpoint('Trigger queue processors');

        // 6. BACKGROUND: Enrich token symbols (fire-and-forget, doesn't block)
        enrichTradeSymbols(trade.signature, trade.tokenInMint, trade.tokenOutMint).catch(() => { });

      } catch (error: any) {
        if (!leaderPositionUpdated) {
          const { error: queuedDeleteError } = await deleteQueuedTradesBySignature(trade.signature);
          if (queuedDeleteError) {
            throw new Error(`Failed to delete queued follower trades for ${trade.signature}: ${queuedDeleteError.message}`);
          }

          const { error: tradeDeleteError } = await deleteClaimedTrade(trade.signature);
          if (tradeDeleteError) {
            throw new Error(`Failed to delete claimed trade for ${trade.signature}: ${tradeDeleteError.message}`);
          }
        }
        console.log(`Trade insert/process error for ${trade.signature}:`, error.message);
        batchError ??= error instanceof Error ? error : new Error(String(error));
      }

      txTimer.finish('TX processing complete');
    } // End of for (starTrader of matchedStarTraders)
  }

  // ── Phase 3: Batch observability summary ──────────────────────────────────
  if (processed > 0 || inserted > 0) {
    const winStr = Object.entries(winCounts).map(([k, v]) => `${k}=${v}`).join(', ') || 'none';
    const skipStr = Object.entries(skipCounts).map(([k, v]) => `${k}=${v}`).join(', ') || 'none';
    console.log(`[ORCHESTRATOR] Batch summary — processed: ${processed}, inserted: ${inserted} | wins: {${winStr}} | dedup-skips: {${skipStr}}`);
  }

  if (batchError) {
    throw batchError;
  }

  return { processed, inserted };
}
