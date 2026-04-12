import { RawTrade } from '@/lib/trade-parser';
import { PerformanceTimer } from '@/lib/utils/perf-timer';
import { getActiveFollowers } from '@/lib/repositories/demo-trader-states.repo';
import { queueTrade } from '@/lib/repositories/demo-trades.repo';
import { getTokenSymbol } from '@/lib/services/token-service';
import {
  BUY_STALENESS_THRESHOLD_MS,
  computeCopyTradeSignal,
} from '@/lib/ingestion/copy-signal';

// Import the consumer queue processor to trigger execution
import { processTradeQueue } from '@/lib/ingestion/follower-execution';

// ============ PRODUCER: Fast Queue Insert ============
export interface QueueCopyTradesResult {
  queuedTraderStateIds: string[];
}

export async function queueCopyTrades(trade: RawTrade, receivedAt: number): Promise<QueueCopyTradesResult> {
  const timer = new PerformanceTimer(`PRODUCER(${trade.signature?.slice(0, 8)}...)`);
  const queuedTraderStateIds: string[] = [];

  const starTrader = trade.wallet;
  const sourceMint = trade.tokenInMint;
  const destMint = trade.tokenOutMint;
  const type = trade.type;

  console.log(`[PRODUCER] Star trader: ${starTrader.slice(0, 20)}... | Source: ${sourceMint?.slice(0, 6)} → Dest: ${destMint?.slice(0, 6)}`);

  if (!sourceMint || !destMint) {
    console.log(`[PRODUCER] Missing sourceMint or destMint, skipping`);
    timer.finish('queueCopyTrades - ABORTED');
    return { queuedTraderStateIds };
  }

  timer.checkpoint('Validate inputs');

  // 1. Find all trader states following this star trader
  const { data: followers, error: followersError } = await getActiveFollowers(starTrader);

  timer.checkpoint('DB: Fetch followers');

  if (followersError) {
    console.log(`[PRODUCER] DB error fetching followers:`, followersError.message);
    timer.finish('queueCopyTrades - DB ERROR');
    throw new Error(`Failed to fetch followers: ${followersError.message}`);
  }

  if (!followers || followers.length === 0) {
    console.log(`[PRODUCER] No initialized followers found for ${starTrader.slice(0, 20)}...`);
    timer.finish('queueCopyTrades - NO FOLLOWERS');
    return { queuedTraderStateIds };
  }

  console.log(`[PRODUCER] Queueing trade for ${followers.length} trader state(s)`);

  const signal = await computeCopyTradeSignal(trade, receivedAt);
  const finalRatio = signal.finalRatio;
  const leaderMetric = signal.leaderMetric;
  const leaderUsdValue = signal.leaderUsdValue;
  const boostTier = signal.boostTier;
  const boostMultiplier = signal.boostMultiplier;
  const tradeAgeMs = signal.tradeAgeMs;
  const isStaleBuy = signal.isStaleBuy;

  timer.checkpoint('Calculate copy ratio + boost');

  if (isStaleBuy) {
    console.log(`[STALENESS] BUY is ${Math.round(tradeAgeMs / 1000)}s old (threshold ${BUY_STALENESS_THRESHOLD_MS / 1000}s) — skipping for all followers`);
  }

  // 4. Insert queued trades for all followers in parallel
  const insertPromises: Promise<void>[] = [];

  for (const traderState of followers) {
    const traderStateId = traderState.id;

    if (isStaleBuy) {
      console.log(`  [STALENESS] SKIP stale BUY | TS ${traderStateId.slice(0, 8)} (age: ${Math.round(tradeAgeMs / 1000)}s)`);
      continue;
    }

    if (type === 'sell' && tradeAgeMs > BUY_STALENESS_THRESHOLD_MS) {
      console.log(`  [STALENESS] Delayed SELL executing | TS ${traderStateId.slice(0, 8)} (age: ${Math.round(tradeAgeMs / 1000)}s)`);
    }

    insertPromises.push(
      (async () => {
        const { error: insertError } = await queueTrade({
          trader_state_id: traderStateId,
          star_trade_signature: trade.signature,
          type: trade.type,
          token_in_mint: sourceMint,
          token_in_symbol: getTokenSymbol(sourceMint),
          token_in_amount: null,
          token_out_mint: destMint,
          token_out_symbol: getTokenSymbol(destMint),
          token_out_amount: null,
          star_trade_timestamp: trade.timestamp,
          status: 'queued',
          leader_in_amount: trade.tokenInAmount,
          leader_out_amount: trade.tokenOutAmount,
          leader_usd_value: leaderUsdValue,
          leader_before_balance: leaderMetric,
          copy_ratio: finalRatio,
          boost_tier: boostTier,
          boost_multiplier: boostMultiplier,
          raw_data: trade
        });

        if (insertError) {
          throw new Error(`Failed to queue trade for ${traderStateId}: ${insertError.message}`);
        }

        queuedTraderStateIds.push(traderStateId);
        console.log(`  TS ${traderStateId.slice(0, 8)}: Trade queued (Ratio: ${(finalRatio * 100).toFixed(2)}%${boostMultiplier > 1 ? ` [${boostTier} ${boostMultiplier}x]` : ''})`);
      })()
    );
  }

  await Promise.all(insertPromises);

  timer.finish('queueCopyTrades - All queued');
  return { queuedTraderStateIds };
}

export function triggerQueuedTradeProcessors(traderStateIds: string[]) {
  for (const traderStateId of new Set(traderStateIds)) {
    processTradeQueue(traderStateId).catch(err => {
      console.error(`[PRODUCER] Queue processor error for ${traderStateId.slice(0, 8)}:`, err);
    });
  }
}

export async function executeCopyTrades(trade: RawTrade, receivedAt: number) {
  const { queuedTraderStateIds } = await queueCopyTrades(trade, receivedAt);
  triggerQueuedTradeProcessors(queuedTraderStateIds);
}
