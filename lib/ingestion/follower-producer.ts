import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { RawTrade } from '@/lib/trade-parser';
import { PerformanceTimer } from '@/lib/utils/perf-timer';
import { getActiveFollowers } from '@/lib/repositories/demo-trader-states.repo';
import { queueTrade } from '@/lib/repositories/demo-trades.repo';
import { 
  getSolPrice, 
  getTokenDecimals, 
  getUsdValue, 
  getTokenSymbol 
} from '@/lib/services/token-service';

// Import the consumer queue processor to trigger execution
import { processTradeQueue } from '@/lib/ingestion/follower-execution';

// ============ PHASE 3: BUY STALENESS POLICY ============
// Stale BUY: always skip once the leader signal is too old for latency-sensitive
// memecoin trading. Late entries are treated as invalid regardless of whether
// the follower already holds the token.
// SELL: always execute regardless of age — exiting late beats not exiting.
const BUY_STALENESS_THRESHOLD_MS = 10_000; // 10 seconds

const SAFE_BOOST_TIERS = [
  { maxRatio: 0.0025, multiplier: 15, name: 'Micro Dust' },   // < 0.25% → 15x
  { maxRatio: 0.0050, multiplier: 10, name: 'Deep Value' },   // 0.25% - 0.50% → 10x
  { maxRatio: 0.0100, multiplier: 5, name: 'Small Bet' },    // 0.50% - 1.00% → 5x
  { maxRatio: 0.0300, multiplier: 2, name: 'Standard' },     // 1.00% - 3.00% → 2x
  { maxRatio: 1.0000, multiplier: 1, name: 'High Conviction' } // > 3.00% → 1x (no boost)
];

export function applySafeBoost(rawRatio: number): { boostedRatio: number; tier: string; multiplier: number } {
  for (const tier of SAFE_BOOST_TIERS) {
    if (rawRatio <= tier.maxRatio) {
      return {
        boostedRatio: rawRatio * tier.multiplier,
        tier: tier.name,
        multiplier: tier.multiplier
      };
    }
  }
  // Fallback for trades > 100% (edge case)
  return { boostedRatio: rawRatio, tier: 'High Conviction', multiplier: 1 };
}

// ============ PRODUCER: Fast Queue Insert ============
// Helper: Fetches CURRENT (Post-Trade) Liquid Equity
export async function getTraderBuyingPower(walletAddress: string, connection: Connection, solPrice: number): Promise<number> {
  try {
    const wallet = new PublicKey(walletAddress);

    // 1. Derive ATAs locally (Instant - 0ms)
    const usdcAta = getAssociatedTokenAddressSync(new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), wallet);
    const usdtAta = getAssociatedTokenAddressSync(new PublicKey('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'), wallet);
    const usd1Ata = getAssociatedTokenAddressSync(new PublicKey('USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB'), wallet); // USD1
    const wsolAta = getAssociatedTokenAddressSync(new PublicKey('So11111111111111111111111111111111111111112'), wallet);

    // 2. Fetch ALL accounts in ONE RPC call (~100ms)
    // Index mapping: [0: SOL, 1: USDC, 2: USDT, 3: USD1, 4: wSOL]
    const accounts = await connection.getMultipleAccountsInfo([wallet, usdcAta, usdtAta, usd1Ata, wsolAta]);

    let totalUsdValue = 0;

    // Helper to read u64 Amount from Raw SPL Token Account Data (Offset 64)
    const parseAmount = (data: Buffer) => {
      if (data.length < 72) return BigInt(0);
      return data.readBigUInt64LE(64);
    };

    // Process Native SOL
    if (accounts[0]) {
      totalUsdValue += (accounts[0].lamports / 1e9) * solPrice;
    }

    // Process USDC (6 decimals, $1)
    if (accounts[1]) {
      totalUsdValue += Number(parseAmount(accounts[1].data)) / 1e6;
    }

    // Process USDT (6 decimals, $1)
    if (accounts[2]) {
      totalUsdValue += Number(parseAmount(accounts[2].data)) / 1e6;
    }

    // Process USD1 (6 decimals - Verified on-chain, $1)
    if (accounts[3]) {
      totalUsdValue += Number(parseAmount(accounts[3].data)) / 1e6;
    }

    // Process wSOL (9 decimals, SOL Price)
    if (accounts[4]) {
      totalUsdValue += (Number(parseAmount(accounts[4].data)) / 1e9) * solPrice;
    }

    return totalUsdValue;
  } catch (e) {
    console.error(`[BuyingPower] Error for ${walletAddress}:`, e);
    return 0; // Safe fallback
  }
}

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

  // 2. V2 EQUITY MODEL CALCULATIONS
  // FIX: Safe Connection Initialization
  // SECURITY: Use private server-side RPC URL
  const rpcUrl = process.env.HELIUS_API_RPC_URL;
  let connection: Connection | null = null;

  if (rpcUrl && rpcUrl.startsWith('http')) {
    try {
      connection = new Connection(rpcUrl);
    } catch (err) {
      console.warn('[PRODUCER] Failed to create Connection object:', err);
    }
  } else {
    console.warn('[PRODUCER] Missing HELIUS_API_RPC_URL. V2 Equity Model disabled.');
  }

  timer.checkpoint('RPC connection setup');

  const solPrice = await getSolPrice(); // Use cached price
  timer.checkpoint('Get SOL price');

  let ratio = 0;
  let leaderMetric = 0; // "Buying Power" (Buy) or "Inventory" (Sell)
  let leaderUsdValue = 0;

  try {
    if (type === 'buy') {
      // ================= SCENARIO A: BUY (Entry) =================
      // Logic: "How big was this bet relative to their available capital?"

      if (connection) {
        // 1. Get CURRENT (Post-Trade) Buying Power
        const postTradeBuyingPower = await getTraderBuyingPower(starTrader, connection, solPrice);

        // 2. Get Value of the Trade (The amount they spent)
        leaderUsdValue = await getUsdValue(sourceMint, trade.tokenInAmount);

        // 3. RECONSTRUCT PRE-TRADE BUYING POWER
        // "Wallet Before" = "Wallet Now" + "Money Spent"
        const preTradeBuyingPower = postTradeBuyingPower + leaderUsdValue;

        // 4. Calculate Ratio
        leaderMetric = preTradeBuyingPower;
        ratio = preTradeBuyingPower > 0 ? leaderUsdValue / preTradeBuyingPower : 0;

        console.log(`[V2-Buy] Spent $${leaderUsdValue.toFixed(2)} / Pre-Equity $${preTradeBuyingPower.toFixed(2)} = ${(ratio * 100).toFixed(2)}%`);

        timer.checkpoint('V2-Buy: RPC fetch buying power');
      } else {
        console.log('[V2-Buy] Skipped Equity Model (No RPC Connection)');
        timer.checkpoint('V2-Buy: Skipped (no RPC)');
      }

    } else {
      // ================= SCENARIO B: SELL (Exit) =================
      // Logic: "What % of their specific position did they close?"
      // STRICT RPC FETCH (No Helius DAS) for minimal latency

      const mintPubkey = new PublicKey(sourceMint);
      const ata = getAssociatedTokenAddressSync(mintPubkey, new PublicKey(starTrader));

      // Calculate approximate USD value for logging
      leaderUsdValue = await getUsdValue(destMint, trade.tokenOutAmount);

      if (connection) {
        // 1. Get CURRENT (Post-Trade) Token Balance
        const accountInfo = await connection.getAccountInfo(ata);
        let postTradeTokenBalance = 0;

        if (accountInfo && accountInfo.data.length >= 72) {
          const rawAmount = Number(accountInfo.data.readBigUInt64LE(64));
          const decimals = await getTokenDecimals(sourceMint);
          postTradeTokenBalance = rawAmount / Math.pow(10, decimals);
        }

        // 2. RECONSTRUCT PRE-TRADE INVENTORY
        // "Bag Before" = "Bag Now" + "Sold Amount"
        const preTradeTokenBalance = postTradeTokenBalance + trade.tokenInAmount;

        // 3. Calculate Ratio
        leaderMetric = preTradeTokenBalance;
        ratio = preTradeTokenBalance > 0 ? trade.tokenInAmount / preTradeTokenBalance : 0;

        console.log(`[V2-Sell] Sold ${trade.tokenInAmount.toFixed(2)} / Pre-Bag ${preTradeTokenBalance.toFixed(2)} = ${(ratio * 100).toFixed(2)}%`);

        timer.checkpoint('V2-Sell: RPC fetch inventory');
      } else {
        console.log('[V2-Sell] Skipped Equity Model (No RPC Connection)');
        timer.checkpoint('V2-Sell: Skipped (no RPC)');
      }
    }
  } catch (err: any) {
    console.warn(`[PRODUCER] V2 Calculation Logic Failed:`, err.message);
    ratio = 0;
  }

  // Safety Clamp (0% to 100%)
  ratio = Math.min(Math.max(ratio, 0), 1);
  if (isNaN(ratio)) ratio = 0;

  // ============ SAFE BOOST (BUY trades only) ============
  // Boost tiny signals from whales into meaningful trades for retail followers
  let finalRatio = ratio;
  let boostTier = 'None';
  let boostMultiplier = 1;

  if (type === 'buy' && ratio > 0) {
    const boost = applySafeBoost(ratio);
    finalRatio = boost.boostedRatio;
    boostTier = boost.tier;
    boostMultiplier = boost.multiplier;
    console.log(`[Safe Boost] Raw: ${(ratio * 100).toFixed(3)}% → Boosted: ${(finalRatio * 100).toFixed(2)}% (${boostTier}, ${boostMultiplier}x)`);
  }

  timer.checkpoint('Calculate copy ratio + boost');

  // ── Phase 3: BUY Staleness Policy ─────────────────────────────────────────
  // Compute trade age at the moment we are about to queue follower trades.
  // Transport-agnostic: applies identically to webhook and websocket paths.
  const tradeAgeMs = receivedAt - trade.timestamp * 1000;
  const isStaleBuy = type === 'buy' && tradeAgeMs > BUY_STALENESS_THRESHOLD_MS;
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
