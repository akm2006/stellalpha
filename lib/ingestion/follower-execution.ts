import { RawTrade } from '@/lib/trade-parser';
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

          // Don't retry on fatal logic errors (e.g. "No Balance"), only on potentially transient ones?
          // For simplicity/robustness in V2, we retry EVERYTHING except explicit skips.
          // Exponential Backoff: 1s, 2s, 3s
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

      // Small delay to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 50));
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

  // 3. DYNAMIC RATIO CALCULATION
  let tradeRatio = 0;

  // V2: Use pre-calculated Equity Model ratio from Producer (High Precision)
  if (tradeRow.copy_ratio !== undefined && tradeRow.copy_ratio !== null) {
    tradeRatio = Number(tradeRow.copy_ratio);
    console.log(`  [V2] Using Pre-calculated Ratio: ${(tradeRatio * 100).toFixed(2)}%`);
  }
  // V1 Fallback (Legacy)
  else {
    const leaderTradeAmount = trade.tokenInAmount;
    const leaderBeforeBalance = Number(tradeRow.leader_before_balance) > 0
      ? Number(tradeRow.leader_before_balance)
      : leaderTradeAmount;

    tradeRatio = leaderBeforeBalance > 0 ? leaderTradeAmount / leaderBeforeBalance : 1;
    console.log(`  [V1-Legacy] Dynamic Ratio: ${(tradeRatio * 100).toFixed(1)}% (Leader: ${leaderTradeAmount.toFixed(4)}/${leaderBeforeBalance.toFixed(4)})`);
  }

  tradeRatio = Math.min(Math.max(tradeRatio, 0), 1);

  // Apply Ratio to Follower's Balance
  let copyAmount = sourceBalance * tradeRatio;
  copyAmount = Math.min(copyAmount, sourceBalance);

  if (copyAmount <= 0) {
    throw new Error(`Copy amount 0 after ratio calculation`);
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

  // Log detailed latency breakdown
  console.log(`[LATENCY] Trade ${tradeRow.id.slice(0, 8)}: Total=${latencyDiff}ms | Queue=${queueWaitTime}ms | Execution=${latencyDiff - queueWaitTime}ms`);

  await updateDemoTrade(tradeRow.id, {
    token_in_mint: sourceMint,  // <--- V2 FIX: Save actual source (USDC)
    token_in_symbol: getTokenSymbol(sourceMint),
    token_in_amount: copyAmount,
    token_out_mint: destMint,   // <--- V2 FIX: Save actual dest (Token)
    token_out_symbol: getTokenSymbol(destMint),
    token_out_amount: quoteOutAmount,
    usd_value: tradeUsdValue,
    quote_in_amount: copyAmount,
    quote_out_amount: quoteOutAmount,
    price_impact: priceImpact,
    copy_trade_timestamp: Math.floor(copyTradeTimestamp / 1000),
    latency_diff_ms: latencyDiff
  });

  timer.checkpoint('DB: Update trade with quote');

  // 8. POSITION & PNL UPDATES (Master Fix Logic)
  let realizedPnl: number | null = null;

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

  } else if (isSell) {
    // ============ SELL LOGIC (Realize PnL - WAC Method) ============
    const usdReceived = tradeUsdValue;
    const currentAvgCost = Number(sourcePosition?.avg_cost || 0);
    const costRemoved = currentAvgCost * copyAmount;

    realizedPnl = usdReceived - costRemoved;

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
    await updateTraderStateRealizedPnl(traderStateId, currentRealizedPnl + realizedPnl);

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

  // 9. Update trade with realized PnL
  if (realizedPnl !== null) {
    await updateDemoTrade(tradeRow.id, {
      realized_pnl: realizedPnl
    });
  }

  timer.checkpoint('DB: Update positions + PnL');

  console.log(`  Copied ${copyAmount.toFixed(4)} ${getTokenSymbol(sourceMint)} → ${quoteOutAmount.toFixed(4)} ${getTokenSymbol(destMint)} | USD: $${tradeUsdValue.toFixed(2)} | PnL: ${realizedPnl !== null ? '$' + realizedPnl.toFixed(2) : 'N/A'} | Latency: ${latencyDiff}ms`);

  timer.finish('executeQueuedTrade - SUCCESS');
}
