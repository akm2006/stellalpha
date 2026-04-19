import { RawTrade } from '@/lib/trade-parser';
import {
  parseCopyBuyModelSelection,
} from '@/lib/copy-models/catalog';
import { resolveDemoBuySpend } from '@/lib/copy-models/resolve-demo-buy-spend';
import { PerformanceTimer } from '@/lib/utils/perf-timer';
import { 
  getOldestQueuedTrade, 
  claimQueuedTrade, 
  getProcessingTrades,
  getQueuedTradeCount,
  requeueProcessingTrade,
  updateDemoTrade 
} from '@/lib/repositories/demo-trades.repo';
import { 
  getTraderStateWithPositions, 
  updateTraderStateRealizedPnl 
} from '@/lib/repositories/demo-trader-states.repo';
import { 
  updateDemoPosition, 
  insertDemoPosition 
} from '@/lib/repositories/demo-positions.repo';
import {
  recordSuccessfulCopiedBuy,
  recordSuccessfulCopiedSell,
} from '@/lib/repositories/copy-position-states.repo';
import { 
  getSolPrice, 
  getTokenDecimals, 
  getUsdValue, 
  getTokenSymbol,
  STABLECOIN_MINTS,
  WSOL
} from '@/lib/services/token-service';

// ============ VERCEL OPTIMIZATION: Batch limit to prevent timeouts ============
// Vercel Pro has 60s limit, but we aim for <10s per batch for reliability
export const MAX_TRADES_PER_BATCH = 5;

// Track active queue processors to prevent duplicate processing
export const activeQueueProcessors = new Set<string>();

const JUPITER_API_KEY = process.env.JUPITER_API_KEY;
const PROCESSING_STALE_MS = 5 * 60 * 1000;

function getProcessorStartedAt(processorId: string | null | undefined): number | null {
  if (!processorId) return null;

  const [timestamp] = processorId.split('-', 1);
  const startedAt = Number(timestamp);
  return Number.isFinite(startedAt) ? startedAt : null;
}

async function reclaimStaleProcessingTrades(traderStateId: string) {
  const { data: processingTrades, error } = await getProcessingTrades(traderStateId);

  if (error) {
    console.error(`[CONSUMER] Failed to inspect processing trades:`, error.message);
    return 0;
  }

  let reclaimed = 0;
  for (const trade of processingTrades || []) {
    const startedAt = getProcessorStartedAt(trade.processor_id);
    if (!startedAt) continue;

    if (Date.now() - startedAt <= PROCESSING_STALE_MS) {
      continue;
    }

    const { error: requeueError } = await requeueProcessingTrade(trade.id);
    if (requeueError) {
      console.error(`[CONSUMER] Failed to requeue stale trade ${trade.id.slice(0, 8)}:`, requeueError.message);
      continue;
    }

    reclaimed++;
    console.warn(`[CONSUMER] Reclaimed stale processing trade ${trade.id.slice(0, 8)}`);
  }

  return reclaimed;
}

// ============ CONSUMER: Sequential Trade Processor with Atomic Locking ============
// RACE CONDITION FIX: Uses atomic UPDATE with conditional WHERE to claim trades
// Even if multiple Vercel instances run simultaneously, only one will successfully claim each trade
export async function processTradeQueue(traderStateId: string) {
  // Instance-level guard (same-process safety)
  if (activeQueueProcessors.has(traderStateId)) {
    console.log(`[CONSUMER] Queue processor already running for ${traderStateId.slice(0, 8)}`);
    return;
  }

  activeQueueProcessors.add(traderStateId);
  console.log(`[CONSUMER] Starting queue processor for ${traderStateId.slice(0, 8)}`);

  let tradesProcessed = 0;
  const processorId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let shouldScheduleFollowUp = false;

  try {
    await reclaimStaleProcessingTrades(traderStateId);

    // Process trades one-by-one until batch limit or no more queued trades
    while (tradesProcessed < MAX_TRADES_PER_BATCH) {
      // ========== ATOMIC CLAIM PATTERN ==========
      // Step 1: Find oldest queued trade
      const { data: candidates, error: findError } = await getOldestQueuedTrade(traderStateId);

      if (findError) {
        console.error(`[CONSUMER] Find error:`, findError.message);
        break;
      }

      if (!candidates || candidates.length === 0) {
        console.log(`[CONSUMER] No more queued trades for ${traderStateId.slice(0, 8)}`);
        break;
      }

      const tradeId = candidates[0].id;

      // Step 2: ATOMIC CLAIM - Only succeeds if status is still 'queued'
      // If another instance claimed it between Step 1 and now, this returns 0 rows updated
      const { data: claimResult, error: claimError } = await claimQueuedTrade(tradeId, processorId);

      if (claimError) {
        console.error(`[CONSUMER] Claim error:`, claimError.message);
        break;
      }

      // If claim returned no rows, another processor got it - skip and try next
      if (!claimResult || claimResult.length === 0) {
        console.log(`[CONSUMER] Trade ${tradeId.slice(0, 8)} already claimed by another processor`);
        continue; // Try to find another trade
      }

      // ========== PROCESS CLAIMED TRADE ==========
      const tradeRow = claimResult[0];
      const trade = tradeRow.raw_data as RawTrade;

      if (!trade) {
        console.error(`[CONSUMER] No raw_data in trade row ${tradeRow.id}`);
        await updateDemoTrade(tradeRow.id, {
          status: 'failed',
          error_message: 'Missing raw_data in trade row'
        });
        tradesProcessed++;
        continue;
      }

      console.log(`[CONSUMER] Processing trade ${tradeRow.id.slice(0, 8)} (sig: ${trade.signature?.slice(0, 12)})`);

      let success = false;
      let lastError: any = null;
      const MAX_RETRIES = 3;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          if (attempt > 1) console.log(`[CONSUMER] Retrying trade ${tradeRow.id.slice(0, 8)} (Attempt ${attempt}/${MAX_RETRIES})...`);

          const execTimer = new PerformanceTimer(`executeQueuedTrade(${tradeRow.id.slice(0, 8)})`);
          await executeQueuedTrade(traderStateId, tradeRow, trade);
          execTimer.finish('Trade execution');
          success = true;
          break; // Success! Exit loop

        } catch (err: any) {
          lastError = err;
          console.warn(`[CONSUMER] Attempt ${attempt} failed:`, err.message);

          // Fast-fail on deterministic errors that will never succeed on retry.
          // "No balance" = follower doesn't hold the token; retrying wastes 4.3s and blocks the queue.
          const msg = err.message || '';
          const isDeterministic = /No .+ balance \(have: 0\)/.test(msg)
                               || msg === 'Copy amount 0 after ratio calculation'
                               || /^Copy amount 0 after model resolution/.test(msg);
          if (isDeterministic) {
            console.log(`[CONSUMER] Non-retryable: ${msg.slice(0, 60)} — skipping remaining attempts`);
            break;
          }

          // Transient errors (Jupiter 400, network timeout) still retry with backoff
          if (attempt < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
          }
        }
      }

      if (success) {
        // Mark as completed
        await updateDemoTrade(tradeRow.id, {
          status: 'completed'
        });

        console.log(`[CONSUMER] Trade ${tradeRow.id.slice(0, 8)} completed successfully`);
      } else {
        // Mark as failed with final error message
        await updateDemoTrade(tradeRow.id, {
          status: 'failed',
          error_message: lastError?.message || 'Unknown processing error after retries'
        });

        console.error(`[CONSUMER] Trade ${tradeRow.id.slice(0, 8)} PERMANENTLY FAILED after ${MAX_RETRIES} attempts:`, lastError?.message);
      }

      tradesProcessed++;
    }

    // Log if we hit batch limit
    if (tradesProcessed >= MAX_TRADES_PER_BATCH) {
      const { count: queuedCount, error: countError } = await getQueuedTradeCount(traderStateId);
      if (countError) {
        console.error(`[CONSUMER] Failed to count remaining queued trades:`, countError.message);
      } else if ((queuedCount || 0) > 0) {
        shouldScheduleFollowUp = true;
      }
      console.log(`[CONSUMER] Batch limit reached (${MAX_TRADES_PER_BATCH}). Remaining trades will be processed in a follow-up pass.`);
    }
  } finally {
    activeQueueProcessors.delete(traderStateId);
    console.log(`[CONSUMER] Queue processor finished for ${traderStateId.slice(0, 8)} (processed ${tradesProcessed} trades)`);
  }

  if (shouldScheduleFollowUp) {
    setTimeout(() => {
      processTradeQueue(traderStateId).catch(err => {
        console.error(`[CONSUMER] Follow-up queue processor error for ${traderStateId.slice(0, 8)}:`, err);
      });
    }, 0);
  }
}

// ============ EXECUTE QUEUED TRADE (Master Fix Logic) ============
export async function executeQueuedTrade(traderStateId: string, tradeRow: any, trade: RawTrade) {
  const timer = new PerformanceTimer(`EXEC(${tradeRow.id.slice(0, 8)})`);

  // Calculate queue waiting time
  const queuedAt = new Date(tradeRow.created_at).getTime();
  const processingStarted = Date.now();
  const queueWaitTime = processingStarted - queuedAt;
  console.log(`[QUEUE] Trade ${tradeRow.id.slice(0, 8)} waited ${queueWaitTime}ms in queue`);

  // Route Override: For router token trades, skip execution (avoid selling before MEV swap)
  if (tradeRow.is_router_token_trade) {
    console.log(`[CONSUMER] Skipping router token trade ${tradeRow.id} (safety override)`);
    await updateDemoTrade(tradeRow.id, { status: 'completed' });
    return;
  }

  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  // V2 LOGIC: Override Source/Dest based on Trade Type (USDC-Centric)
  // If Leader BUY (Input=SOL/USDC -> Output=Token): Follower uses Source=USDC -> Dest=Token
  // If Leader SELL (Input=Token -> Output=SOL/USDC): Follower uses Source=Token -> Dest=USDC

  let sourceMint = '';
  let destMint = '';

  if (trade.type === 'buy') {
    // BUY: Always spend USDC to buy the target token
    sourceMint = USDC_MINT;
    destMint = trade.tokenOutMint === 'SOL' ? SOL_MINT : trade.tokenOutMint;
  } else {
    // SELL: Always sell the target token for USDC
    sourceMint = trade.tokenInMint === 'SOL' ? SOL_MINT : trade.tokenInMint;
    destMint = USDC_MINT;
  }

  // 1. Fetch FRESH trader state and positions (not stale from queue time)
  const { data: traderState, error: tsError } = await getTraderStateWithPositions(traderStateId);

  if (tsError || !traderState) {
    throw new Error(`Trader state not found: ${tsError?.message}`);
  }

  timer.checkpoint('DB: Fetch trader state + positions');

  const positions = traderState.positions || [];

  // 2. Get FRESH source position balance
  const sourcePosition = positions.find((p: any) => p.token_mint === sourceMint);
  const sourceBalance = Number(sourcePosition?.size || 0);

  if (sourceBalance <= 0) {
    throw new Error(`No ${getTokenSymbol(sourceMint)} balance (have: ${sourceBalance})`);
  }

  // 3. RESOLVE BUY/SELL SIZE
  let tradeRatio = 0;
  let copyAmount = 0;

  if (trade.type === 'buy') {
    const { modelKey, config } = parseCopyBuyModelSelection(
      tradeRow.buy_model_key ?? traderState.copy_model_key,
      tradeRow.buy_model_config ?? traderState.copy_model_config,
    );
    const rawSizingContext = tradeRow.buy_sizing_context && typeof tradeRow.buy_sizing_context === 'object'
      ? tradeRow.buy_sizing_context as Record<string, unknown>
      : {};
    const resolution = resolveDemoBuySpend({
      modelKey,
      modelConfig: config,
      availableCashUsd: sourceBalance,
      startingCapitalUsd: Number(traderState.starting_capital_usd || traderState.allocated_usd || 0),
      leaderContext: {
        leaderBuyUsdValue: Number(rawSizingContext.leaderBuyUsdValue ?? tradeRow.leader_usd_value ?? 0),
        leaderRawRatio: Number(rawSizingContext.leaderRawRatio ?? tradeRow.leader_buy_ratio ?? 0),
        leaderFinalRatio: Number(rawSizingContext.leaderFinalRatio ?? tradeRow.copy_ratio ?? 0),
        leaderMetric: Number(rawSizingContext.leaderMetric ?? tradeRow.leader_before_balance ?? 0),
        tradeAgeMs: Number(rawSizingContext.tradeAgeMs ?? 0),
      },
    });

    copyAmount = Math.min(resolution.buyAmount, sourceBalance);
    tradeRatio = sourceBalance > 0 ? copyAmount / sourceBalance : 0;

    console.log(
      `  [BUY MODEL] ${modelKey} -> ${copyAmount.toFixed(4)} ${getTokenSymbol(sourceMint)} (${(tradeRatio * 100).toFixed(2)}% of available cash)`,
    );

    if (copyAmount <= 0) {
      throw new Error(`Copy amount 0 after model resolution (${resolution.reason || modelKey})`);
    }
  } else {
    // V2: Use pre-calculated sell fraction from copied-position lifecycle
    if (tradeRow.copy_ratio !== undefined && tradeRow.copy_ratio !== null) {
      tradeRatio = Number(tradeRow.copy_ratio);
      console.log(`  [SELL] Using copied-position sell fraction: ${(tradeRatio * 100).toFixed(2)}%`);
    } else {
      // Legacy fallback for old queued rows
      const leaderTradeAmount = trade.tokenInAmount;
      const leaderBeforeBalance = Number(tradeRow.leader_before_balance) > 0
        ? Number(tradeRow.leader_before_balance)
        : leaderTradeAmount;

      tradeRatio = leaderBeforeBalance > 0 ? leaderTradeAmount / leaderBeforeBalance : 1;
      console.log(`  [V1-Legacy] Dynamic Ratio: ${(tradeRatio * 100).toFixed(1)}% (Leader: ${leaderTradeAmount.toFixed(4)}/${leaderBeforeBalance.toFixed(4)})`);
    }

    tradeRatio = Math.min(Math.max(tradeRatio, 0), 1);

    const copiedPositionBefore = Number(tradeRow.copied_position_before || 0);
    copyAmount = Math.min(copiedPositionBefore * tradeRatio, sourceBalance);
    copyAmount = Math.min(copyAmount, sourceBalance);

    if (copyAmount <= 0) {
      throw new Error(`Copy amount 0 after ratio calculation`);
    }
  }

  // 4. GET JUPITER QUOTE
  // VERCEL OPTIMIZATION: Fetch both decimals in parallel
  const [sourceDecimals, destDecimals] = await Promise.all([
    getTokenDecimals(sourceMint),
    getTokenDecimals(destMint)
  ]);

  timer.checkpoint('Fetch token decimals');

  const rawInputAmount = Math.floor(copyAmount * Math.pow(10, sourceDecimals));

  // Dynamic Slippage Scaling
  let slippageBps = '100'; // Default 1%
  const STABLE_OR_BLUE_CHIP = new Set([...STABLECOIN_MINTS, SOL_MINT, WSOL]);

  if (STABLE_OR_BLUE_CHIP.has(sourceMint) && STABLE_OR_BLUE_CHIP.has(destMint)) {
    slippageBps = '50'; // 0.5% for Stable/Major pairs
  } else {
    // SNIPER-GRADE SLIPPAGE for Micro-Caps / Memes
    // Research shows $5k vol coins need 25-40%. We start at 15% to be safe but effective.
    slippageBps = '1500'; // 15.0% for Memecoins
  }

  const quoteUrl = new URL('https://api.jup.ag/swap/v1/quote');
  quoteUrl.searchParams.append('inputMint', sourceMint);
  quoteUrl.searchParams.append('outputMint', destMint);
  quoteUrl.searchParams.append('amount', rawInputAmount.toString());
  quoteUrl.searchParams.append('slippageBps', slippageBps);
  // Also request auto-slippage if available, or just rely on the wider 4% band

  const quoteResponse = await fetch(quoteUrl.toString(), {
    headers: {
      'x-api-key': JUPITER_API_KEY || '',
      'Content-Type': 'application/json'
    }
  });

  timer.checkpoint('Jupiter: Quote request');

  if (!quoteResponse.ok) {
    throw new Error(`Jupiter quote failed with status ${quoteResponse.status}`);
  }

  const quote = await quoteResponse.json();

  if (!quote.outAmount) {
    throw new Error('No quote output amount from Jupiter');
  }

  timer.checkpoint('Jupiter: Parse quote');

  const quoteOutAmount = Number(quote.outAmount) / Math.pow(10, destDecimals);
  const priceImpact = Number(quote.priceImpactPct || 0);

  // 5. BUY/SELL DETECTION
  const isStableSource = STABLECOIN_MINTS.has(sourceMint);
  const isSolSource = sourceMint === SOL_MINT || sourceMint === WSOL;
  const isStableDest = STABLECOIN_MINTS.has(destMint);
  const isSolDest = destMint === SOL_MINT || destMint === WSOL;

  const isBuy = isStableSource || isSolSource;
  const isSell = isStableDest || isSolDest;

  // 6. USD VALUE CALCULATION
  let tradeUsdValue = 0;
  if (isSell) {
    tradeUsdValue = await getUsdValue(destMint, quoteOutAmount);
  } else if (isBuy) {
    tradeUsdValue = await getUsdValue(sourceMint, copyAmount);
  } else {
    tradeUsdValue = await getUsdValue(destMint, quoteOutAmount);
  }

  // Note: No minimum threshold - intent-based copy trading mirrors star trader regardless of value
  // Only skip if value calculation completely failed (NaN)
  if (isNaN(tradeUsdValue)) {
    console.warn(`[WARN] USD value calculation returned NaN, proceeding with value=0`);
    tradeUsdValue = 0;
  }

  // 7. UPDATE TRADE ROW WITH QUOTE DATA
  const copyTradeTimestamp = Date.now();
  const latencyDiff = copyTradeTimestamp - (trade.timestamp * 1000);
  const actualExecutionRuntimeMs = Math.max(0, copyTradeTimestamp - processingStarted);
  const upstreamPreQueueDelayMs = Math.max(0, latencyDiff - queueWaitTime - actualExecutionRuntimeMs);

  // Log a real latency breakdown instead of folding upstream delay into "execution".
  console.log(
    `[LATENCY] Trade ${tradeRow.id.slice(0, 8)}: Total=${latencyDiff}ms | Queue=${queueWaitTime}ms | Runtime=${actualExecutionRuntimeMs}ms | Upstream=${upstreamPreQueueDelayMs}ms`
  );

  // 7+8. Run quote write and position update concurrently (different tables, no shared state)
  async function updatePositions(): Promise<{ pnl: number | null; copiedPositionAfter: number | null }> {
    let pnl: number | null = null;
    let copiedPositionAfter: number | null = null;
    const transitionMetadata = {
      scopeType: 'demo' as const,
      scopeKey: traderStateId,
      starTrader: trade.wallet,
      tradeSignature: trade.signature,
      tradeTimestampIso: new Date(trade.timestamp * 1000).toISOString(),
    };

    if (isBuy) {
      // ============ BUY LOGIC (Weighted Average Cost) ============
      const usdSpent = tradeUsdValue;
      const tokenReceived = quoteOutAmount;

      // Decrease source (stablecoin/SOL) position
      await updateDemoPosition(traderStateId, sourceMint, {
        size: sourceBalance - copyAmount,
        cost_usd: await getUsdValue(sourceMint, sourceBalance - copyAmount),
        avg_cost: isSolSource ? await getSolPrice() : 1
      });

      // Increase/create destination (token) position
      const destPosition = positions.find((p: any) => p.token_mint === destMint);
      const oldAmount = Number(destPosition?.size || 0);
      const oldCostBasis = Number(destPosition?.cost_usd || 0);

      const newAmount = oldAmount + tokenReceived;
      const newCostBasis = oldCostBasis + usdSpent;
      const newAvgCost = newAmount > 0 ? newCostBasis / newAmount : 0;

      if (destPosition) {
        await updateDemoPosition(traderStateId, destMint, {
          size: newAmount,
          cost_usd: newCostBasis,
          avg_cost: newAvgCost
        });
      } else {
        await insertDemoPosition(traderStateId, destMint, getTokenSymbol(destMint), newAmount, newCostBasis, newAvgCost);
      }

      const lifecycle = await recordSuccessfulCopiedBuy({
        ...transitionMetadata,
        mint: destMint,
        tokenSymbol: getTokenSymbol(destMint),
        copiedBuyAmount: tokenReceived,
        copiedCostUsd: usdSpent,
      });
      copiedPositionAfter = lifecycle.copiedPositionAfter;

    } else if (isSell) {
      // ============ SELL LOGIC (Realize PnL - WAC Method) ============
      const usdReceived = tradeUsdValue;
      const currentAvgCost = Number(sourcePosition?.avg_cost || 0);
      const costRemoved = currentAvgCost * copyAmount;

      pnl = usdReceived - costRemoved;

      // Update Source Position
      const remainingAmount = sourceBalance - copyAmount;
      const remainingCostBasis = remainingAmount * currentAvgCost;

      await updateDemoPosition(traderStateId, sourceMint, {
        size: remainingAmount,
        cost_usd: remainingCostBasis,
        avg_cost: remainingAmount > 0 ? currentAvgCost : 0
      });

      // Update Trader State PnL
      const currentRealizedPnl = Number(traderState.realized_pnl_usd) || 0;
      await updateTraderStateRealizedPnl(traderStateId, currentRealizedPnl + pnl);

      // Increase destination (stablecoin/SOL) position
      const destPosition = positions.find((p: any) => p.token_mint === destMint);
      if (destPosition) {
        const newSize = Number(destPosition.size) + quoteOutAmount;
        await updateDemoPosition(traderStateId, destMint, {
          size: newSize,
          cost_usd: await getUsdValue(destMint, newSize),
          avg_cost: isSolDest ? await getSolPrice() : 1
        });
      } else {
        await insertDemoPosition(
          traderStateId,
          destMint,
          getTokenSymbol(destMint),
          quoteOutAmount,
          await getUsdValue(destMint, quoteOutAmount),
          isSolDest ? await getSolPrice() : 1
        );
      }

      const lifecycle = await recordSuccessfulCopiedSell({
        ...transitionMetadata,
        mint: sourceMint,
        tokenSymbol: getTokenSymbol(sourceMint),
        copiedSellAmount: copyAmount,
      });
      copiedPositionAfter = lifecycle.copiedPositionAfter;

    } else {
      // Token → Token swap (rare)
      console.log(`  Token→Token swap, no USD cost tracking`);

      await updateDemoPosition(traderStateId, sourceMint, {
        size: sourceBalance - copyAmount
      });

      const destPosition = positions.find((p: any) => p.token_mint === destMint);
      if (destPosition) {
        await updateDemoPosition(traderStateId, destMint, {
          size: Number(destPosition.size) + quoteOutAmount
        });
      } else {
        await insertDemoPosition(traderStateId, destMint, getTokenSymbol(destMint), quoteOutAmount, 0, 0);
      }
    }

    return { pnl, copiedPositionAfter };
  }

  const [, positionUpdateResult] = await Promise.all([
    updateDemoTrade(tradeRow.id, {
      token_in_mint: sourceMint,
      token_in_symbol: getTokenSymbol(sourceMint),
      token_in_amount: copyAmount,
      token_out_mint: destMint,
      token_out_symbol: getTokenSymbol(destMint),
      token_out_amount: quoteOutAmount,
      usd_value: tradeUsdValue,
      quote_in_amount: copyAmount,
      quote_out_amount: quoteOutAmount,
      price_impact: priceImpact,
      copy_trade_timestamp: Math.floor(copyTradeTimestamp / 1000),
      latency_diff_ms: latencyDiff,
      copy_ratio: tradeRatio,
    }),
    updatePositions(),
  ]);

  timer.checkpoint('DB: Update trade + positions (parallel)');

  // 9. Backfill PnL — sequential, depends on position result
  if (positionUpdateResult.pnl !== null || positionUpdateResult.copiedPositionAfter !== null) {
    await updateDemoTrade(tradeRow.id, {
      realized_pnl: positionUpdateResult.pnl,
      copied_position_after: positionUpdateResult.copiedPositionAfter,
    });
  }

  timer.checkpoint('DB: Backfill PnL');

  console.log(`  Copied ${copyAmount.toFixed(4)} ${getTokenSymbol(sourceMint)} → ${quoteOutAmount.toFixed(4)} ${getTokenSymbol(destMint)} | USD: $${tradeUsdValue.toFixed(2)} | PnL: ${positionUpdateResult.pnl !== null ? '$' + positionUpdateResult.pnl.toFixed(2) : 'N/A'} | Latency: ${latencyDiff}ms`);

  timer.finish('executeQueuedTrade - SUCCESS');
}
