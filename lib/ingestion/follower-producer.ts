import { RawTrade } from '@/lib/trade-parser';
import {
  modelRequiresLeaderRatio,
  parseCopyBuyModelSelection,
} from '@/lib/copy-models/catalog';
import { PerformanceTimer } from '@/lib/utils/perf-timer';
import { getActiveFollowers } from '@/lib/repositories/demo-trader-states.repo';
import { queueTrade } from '@/lib/repositories/demo-trades.repo';
import {
  recordObservedLeaderBuy,
  recordObservedLeaderSell,
} from '@/lib/repositories/copy-position-states.repo';
import { getTokenSymbol, getUsdValue } from '@/lib/services/token-service';
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

  const signal = trade.type === 'buy'
    ? await computeCopyTradeSignal(trade, receivedAt)
    : null;
  const rawRatio = signal?.rawRatio ?? 0;
  const finalRatio = signal?.finalRatio ?? 0;
  const leaderMetric = signal?.leaderMetric ?? 0;
  const leaderUsdValue = signal?.leaderUsdValue ?? await getUsdValue(destMint, trade.tokenOutAmount);
  const boostTier = signal?.boostTier ?? 'Disabled';
  const boostMultiplier = signal?.boostMultiplier ?? 1;
  const tradeAgeMs = signal?.tradeAgeMs ?? receivedAt - trade.timestamp * 1000;
  const isStaleBuy = signal?.isStaleBuy ?? false;

  timer.checkpoint('Calculate copy ratio + boost');

  // 4. Insert queued trades for all followers in parallel
  const insertPromises: Promise<void>[] = [];

  for (const traderState of followers) {
    const traderStateId = traderState.id;

    insertPromises.push(
      (async () => {
        const { modelKey: buyModelKey, config: buyModelConfig } = parseCopyBuyModelSelection(
          traderState.copy_model_key,
          traderState.copy_model_config,
        );
        const buySizingContext = {
          leaderBuyUsdValue: leaderUsdValue,
          leaderRawRatio: rawRatio,
          leaderFinalRatio: finalRatio,
          leaderMetric,
          tradeAgeMs,
        };
        const transitionMetadata = {
          scopeType: 'demo' as const,
          scopeKey: traderStateId,
          starTrader,
          tokenSymbol: getTokenSymbol(type === 'buy' ? destMint : sourceMint),
          tradeSignature: trade.signature,
          tradeTimestampIso: new Date(trade.timestamp * 1000).toISOString(),
        };

        let status: 'queued' | 'skipped' = 'queued';
        let errorMessage: string | null = null;
        let copyRatio: number | null = trade.type === 'buy' && buyModelKey === 'current_ratio'
          ? finalRatio
          : null;
        let leaderPositionBefore = leaderMetric;
        let leaderPositionAfter = leaderMetric;
        let copiedPositionBefore = 0;
        let sellFraction: number | null = null;

        if (trade.type === 'buy') {
          const leaderBuyTransition = await recordObservedLeaderBuy({
            ...transitionMetadata,
            mint: destMint,
            leaderBuyAmount: trade.tokenOutAmount,
          });

          leaderPositionBefore = leaderBuyTransition.leaderPositionBefore;
          leaderPositionAfter = leaderBuyTransition.leaderPositionAfter;
          copiedPositionBefore = leaderBuyTransition.copiedPositionBefore;

          if (isStaleBuy) {
            status = 'skipped';
            errorMessage = 'stale_buy';
          } else if (
            modelRequiresLeaderRatio(buyModelKey)
            && (buyModelKey === 'current_ratio' ? finalRatio <= 0 : rawRatio <= 0)
          ) {
            status = 'skipped';
            errorMessage = 'zero_copy_ratio';
          } else if (buyModelKey === 'target_buy_pct_with_cap' && leaderUsdValue <= 0) {
            status = 'skipped';
            errorMessage = 'missing_leader_buy_value';
          }
        } else {
          const leaderSellTransition = await recordObservedLeaderSell({
            ...transitionMetadata,
            mint: sourceMint,
            leaderSellAmount: trade.tokenInAmount,
          });

          copyRatio = leaderSellTransition.sellFraction;
          leaderPositionBefore = leaderSellTransition.leaderPositionBefore;
          leaderPositionAfter = leaderSellTransition.leaderPositionAfter;
          copiedPositionBefore = leaderSellTransition.copiedPositionBefore;
          sellFraction = leaderSellTransition.sellFraction;

          if (leaderSellTransition.notFollowedPosition || copyRatio <= 0) {
            status = 'skipped';
            errorMessage = 'not_followed_position';
          }
        }

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
          status,
          leader_in_amount: trade.tokenInAmount,
          leader_out_amount: trade.tokenOutAmount,
          leader_usd_value: leaderUsdValue,
          leader_before_balance: leaderPositionBefore,
          copy_ratio: copyRatio,
          boost_tier: boostTier,
          boost_multiplier: boostMultiplier,
          raw_data: trade,
          error_message: errorMessage,
          leader_position_before: leaderPositionBefore,
          leader_position_after: leaderPositionAfter,
          copied_position_before: copiedPositionBefore,
          copied_position_after: copiedPositionBefore,
          sell_fraction: sellFraction,
          buy_model_key: trade.type === 'buy' ? buyModelKey : null,
          buy_model_config: trade.type === 'buy' ? buyModelConfig : null,
          leader_buy_ratio: trade.type === 'buy' ? rawRatio : null,
          buy_sizing_context: trade.type === 'buy' ? buySizingContext : null,
        });

        if (insertError) {
          throw new Error(`Failed to queue trade for ${traderStateId}: ${insertError.message}`);
        }

        if (status === 'queued') {
          queuedTraderStateIds.push(traderStateId);
          const ratioLabel = copyRatio !== null
            ? `Ratio: ${(copyRatio * 100).toFixed(2)}%`
            : `Model: ${buyModelKey}`;
          console.log(`  TS ${traderStateId.slice(0, 8)}: Trade queued (${ratioLabel}${boostMultiplier > 1 ? ` [${boostTier} ${boostMultiplier}x]` : ''})`);
          return;
        }

        console.log(`  TS ${traderStateId.slice(0, 8)}: Trade skipped (${errorMessage})`);
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
