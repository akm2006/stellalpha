import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const HELIUS_WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET || 'stellalpha-webhook-secret-2025';
const WSOL = "So11111111111111111111111111111111111111112";

// Dynamic SOL price cache (refreshed every 60 seconds)
let solPriceCache: { price: number; timestamp: number } | null = null;
const SOL_PRICE_CACHE_TTL = 60000; // 60 seconds

async function getSolPrice(): Promise<number> {
  // Return cached price if still valid
  if (solPriceCache && Date.now() - solPriceCache.timestamp < SOL_PRICE_CACHE_TTL) {
    return solPriceCache.price;
  }
  
  try {
    const headers: Record<string, string> = {};
    if (JUPITER_API_KEY) headers['x-api-key'] = JUPITER_API_KEY;
    
    const response = await fetch(`https://api.jup.ag/price/v3?ids=${WSOL}`, { headers });
    if (response.ok) {
      const data = await response.json();
      const price = data[WSOL]?.usdPrice;
      if (typeof price === 'number' && price > 0) {
        solPriceCache = { price, timestamp: Date.now() };
        console.log(`[SOL Price] Fetched: $${price.toFixed(2)}`);
        return price;
      }
    }
  } catch (error) {
    console.warn('[SOL Price] Fetch failed:', error);
  }
  
  // Fallback to cached price or default
  return solPriceCache?.price || 150; // $150 fallback (safer than $200)
}

const BASE_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB', // USD1
  'So11111111111111111111111111111111111111112',   // wSOL
]);

const STABLECOIN_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB',
]);

const KNOWN_TOKENS: Record<string, string> = {
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
  'So11111111111111111111111111111111111111112': 'SOL',
  'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB': 'USD1',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'Bonk',
};

const JUPITER_API_KEY = process.env.JUPITER_API_KEY;

// Cache for token decimals to avoid repeated API calls
import { getTokenMetadata } from '@/lib/jupiter-tokens';

// Cache for token decimals to avoid repeated API calls
const decimalsCache = new Map<string, number>();

// Fetch token decimals using shared utility (handles DB + Jupiter API + Fallback)
async function getTokenDecimals(mint: string): Promise<number> {
  // Check cache first
  if (decimalsCache.has(mint)) {
    return decimalsCache.get(mint)!;
  }
  
  try {
    const meta = await getTokenMetadata(mint);
    if (typeof meta.decimals === 'number') {
      decimalsCache.set(mint, meta.decimals);
      return meta.decimals;
    }
  } catch (error) {
    console.warn(`Failed to fetch decimals for ${mint}:`, error);
  }
  
  // Default fallback (should rarely be reached as getTokenMetadata has its own fallback)
  const defaultDecimals = STABLECOIN_MINTS.has(mint) ? 6 : 9;
  decimalsCache.set(mint, defaultDecimals);
  return defaultDecimals;
}

async function getUsdValue(mint: string, amount: number): Promise<number> {
  if (STABLECOIN_MINTS.has(mint)) return amount;
  if (mint === 'SOL' || mint === WSOL) {
    const solPrice = await getSolPrice();
    return amount * solPrice;
  }
  return 0;
}

function getTokenSymbol(mint: string): string {
  return KNOWN_TOKENS[mint] || mint.slice(0, 6);
}

interface RawTrade {
  signature: string;
  wallet: string;
  type: 'buy' | 'sell';
  tokenMint: string;
  tokenAmount: number;
  baseAmount: number;
  tokenInMint: string;
  tokenInAmount: number;
  tokenInPreBalance: number;  // NEW: Leader's pre-trade balance for ratio calculation
  tokenOutMint: string;
  tokenOutAmount: number;
  timestamp: number;
  source: string;
  gas: number;
}

async function detectTrade(tx: any, wallet: string): Promise<RawTrade | null> {
  const t = tx.tokenTransfers || [];
  const fp = wallet;
  
  const walletAccountData = tx.accountData?.find((a: any) => a.account === fp);
  const solChange = walletAccountData?.nativeBalanceChange || 0;
  const fee = tx.fee || 0;
  const solChangeNet = (solChange + fee) / 1e9;
  
  const relevant = t.filter((x: any) => x.fromUserAccount === fp || x.toUserAccount === fp);
  // Don't filter out wSOL - we want to track SOL swaps too
  const tokensSent = relevant.filter((x: any) => x.fromUserAccount === fp);
  const tokensReceived = relevant.filter((x: any) => x.toUserAccount === fp);
  
  let type: 'buy' | 'sell' = 'buy';
  let tokenMint = '';
  let tokenAmount = 0;
  let baseAmount = 0;
  let tokenInMint = '';
  let tokenInAmount = 0;
  let tokenOutMint = '';
  let tokenOutAmount = 0;
  
  // Token → Token swap
  if (tokensSent.length > 0 && tokensReceived.length > 0) {
    const inToken = tokensSent.reduce((a: any, b: any) => a.tokenAmount > b.tokenAmount ? a : b);
    const outToken = tokensReceived.reduce((a: any, b: any) => a.tokenAmount > b.tokenAmount ? a : b);
    if (inToken.mint === outToken.mint) return null;
    
    tokenInMint = inToken.mint;
    tokenInAmount = inToken.tokenAmount;
    tokenOutMint = outToken.mint;
    tokenOutAmount = outToken.tokenAmount;
    
    const inIsBase = BASE_MINTS.has(inToken.mint);
    const outIsBase = BASE_MINTS.has(outToken.mint);
    
    // Base-to-base swaps (USDC→SOL, SOL→USDC, etc): treat as buy/sell for the output token
    // This allows copying without PnL (both are base assets at $1 or SOL price)
    if (inIsBase && outIsBase) {
      type = 'buy';  // Use 'buy' for DB compatibility, PnL handled separately
      tokenMint = outToken.mint;
      tokenAmount = outToken.tokenAmount;
      baseAmount = await getUsdValue(inToken.mint, inToken.tokenAmount);
    } else if (inIsBase && !outIsBase) {
      type = 'buy';
      tokenMint = outToken.mint;
      tokenAmount = outToken.tokenAmount;
      baseAmount = await getUsdValue(inToken.mint, inToken.tokenAmount);
    } else if (!inIsBase && outIsBase) {
      type = 'sell';
      tokenMint = inToken.mint;
      tokenAmount = inToken.tokenAmount;
      baseAmount = await getUsdValue(outToken.mint, outToken.tokenAmount);
    } else {
      // Both non-base: treat as sell of inToken (can't determine USD value)
      type = 'sell';
      tokenMint = inToken.mint;
      tokenAmount = inToken.tokenAmount;
      baseAmount = 0;
    }
  }
  // Token → SOL (sell)
  else if (tokensSent.length > 0 && solChangeNet > 0.001) {
    const largest = tokensSent.reduce((a: any, b: any) => a.tokenAmount > b.tokenAmount ? a : b);
    type = 'sell';
    tokenMint = largest.mint;
    tokenAmount = largest.tokenAmount;
    baseAmount = (await getSolPrice()) * solChangeNet;
    tokenInMint = largest.mint;
    tokenInAmount = largest.tokenAmount;
    tokenOutMint = 'SOL';
    tokenOutAmount = solChangeNet;
  }
  // SOL → Token (buy)
  else if (tokensReceived.length > 0 && solChangeNet < -0.001) {
    const largest = tokensReceived.reduce((a: any, b: any) => a.tokenAmount > b.tokenAmount ? a : b);
    type = 'buy';
    tokenMint = largest.mint;
    tokenAmount = largest.tokenAmount;
    baseAmount = (await getSolPrice()) * Math.abs(solChangeNet);
    tokenInMint = 'SOL';
    tokenInAmount = Math.abs(solChangeNet);
    tokenOutMint = largest.mint;
    tokenOutAmount = largest.tokenAmount;
  }
  else {
    return null;
  }
  
  if (tokenAmount < 0.000001) return null;
  
  return {
    signature: tx.signature,
    wallet: fp,
    type,
    tokenMint,
    tokenAmount,
    baseAmount,
    tokenInMint,
    tokenInAmount,
    tokenInPreBalance: tokensSent.length > 0 
      ? Number(tokensSent.reduce((a: any, b: any) => a.tokenAmount > b.tokenAmount ? a : b).preTokenBalance || 0)
      : 0,
    tokenOutMint,
    tokenOutAmount,
    timestamp: tx.timestamp,
    source: tx.source || 'UNKNOWN',
    gas: fee / 1e9
  };
}

async function updatePositionAndGetPnL(trade: RawTrade): Promise<{ realizedPnl: number | null; avgCostBasis: number | null }> {
  const { wallet, tokenMint, type, tokenAmount, baseAmount } = trade;
  
  // Get current position
  const { data: position } = await supabase
    .from('positions')
    .select('*')
    .eq('wallet', wallet)
    .eq('token_mint', tokenMint)
    .single();
  
  let currentSize = position?.size || 0;
  let currentCost = position?.cost_usd || 0;
  let avgCost = position?.avg_cost || 0;
  let realizedPnl: number | null = null;
  
  if (type === 'buy') {
    // Add to position
    const newSize = currentSize + tokenAmount;
    const newCost = currentCost + baseAmount;
    avgCost = newSize > 0 ? newCost / newSize : 0;
    
    await supabase.from('positions').upsert({
      wallet,
      token_mint: tokenMint,
      size: newSize,
      cost_usd: newCost,
      avg_cost: avgCost,
      updated_at: new Date().toISOString()
    }, { onConflict: 'wallet,token_mint' });
  } else {
    // Sell: calculate PnL
    if (currentSize > 0 && avgCost > 0) {
      const soldCost = avgCost * tokenAmount;
      realizedPnl = baseAmount - soldCost;
      
      const remainingSize = Math.max(0, currentSize - tokenAmount);
      const remainingCost = remainingSize > 0 ? avgCost * remainingSize : 0;
      
      await supabase.from('positions').upsert({
        wallet,
        token_mint: tokenMint,
        size: remainingSize,
        cost_usd: remainingCost,
        avg_cost: remainingSize > 0 ? avgCost : 0,
        updated_at: new Date().toISOString()
      }, { onConflict: 'wallet,token_mint' });
    }
  }
  
  return { realizedPnl, avgCostBasis: avgCost };
}

// ============ COPY TRADE ENGINE (Producer/Consumer Pattern) ============
// Producer: Quick insert to queue
// Consumer: Sequential processing to avoid race conditions
const MIN_TRADE_THRESHOLD_USD = 0.10;

// ============ VERCEL OPTIMIZATION: Batch limit to prevent timeouts ============
// Vercel Pro has 60s limit, but we aim for <10s per batch for reliability
const MAX_TRADES_PER_BATCH = 5;

// Track active queue processors to prevent duplicate processing
const activeQueueProcessors = new Set<string>();

// ============ PRODUCER: Fast Queue Insert ============
async function executeCopyTrades(trade: RawTrade, receivedAt: number) {
  const starTrader = trade.wallet;
  const sourceMint = trade.tokenInMint;
  const destMint = trade.tokenOutMint;

  console.log(`[PRODUCER] Star trader: ${starTrader.slice(0, 20)}... | Source: ${sourceMint?.slice(0,6)} → Dest: ${destMint?.slice(0,6)}`);

  if (!sourceMint || !destMint) {
    console.log(`[PRODUCER] Missing sourceMint or destMint, skipping`);
    return;
  }

  // 1. Find all trader states following this star trader
  const { data: followers, error: followersError } = await supabase
    .from('demo_trader_states')
    .select('id')
    .eq('star_trader', starTrader)
    .eq('is_initialized', true)
    .eq('is_paused', false);

  if (followersError) {
    console.log(`[PRODUCER] DB error fetching followers:`, followersError.message);
    return;
  }

  if (!followers || followers.length === 0) {
    console.log(`[PRODUCER] No initialized followers found for ${starTrader.slice(0, 20)}...`);
    return;
  }

  console.log(`[PRODUCER] Queueing trade for ${followers.length} trader state(s)`);

  // 2. Insert queued trade for each follower (fast, no complex logic)
  for (const traderState of followers) {
    const traderStateId = traderState.id;

    try {
      // Insert with status='queued' and store raw_data for processing later
      const { error: insertError } = await supabase.from('demo_trades').upsert({
        trader_state_id: traderStateId,
        star_trade_signature: trade.signature,
        type: trade.type,
        token_in_mint: sourceMint,
        token_in_symbol: getTokenSymbol(sourceMint),
        token_out_mint: destMint,
        token_out_symbol: getTokenSymbol(destMint),
        star_trade_timestamp: trade.timestamp,
        status: 'queued',
        raw_data: trade  // Store full trade object for processing
      }, { onConflict: 'trader_state_id,star_trade_signature', ignoreDuplicates: true });

      if (insertError) {
        console.log(`  TS ${traderStateId.slice(0,8)}: Trade already queued or error: ${insertError.message}`);
        continue;
      }

      console.log(`  TS ${traderStateId.slice(0,8)}: Trade queued successfully`);

      // 3. Trigger queue processor (fire and forget - don't await to keep webhook fast)
      processTradeQueue(traderStateId).catch(err => {
        console.error(`[PRODUCER] Queue processor error for ${traderStateId.slice(0,8)}:`, err);
      });

    } catch (err) {
      console.error(`  TS ${traderStateId.slice(0,8)}: Queue insert error`, err);
    }
  }
}

// ============ CONSUMER: Sequential Trade Processor ============
// VERCEL OPTIMIZATION: Batch limit prevents timeouts, remaining trades picked up by next webhook
async function processTradeQueue(traderStateId: string) {
  // Prevent duplicate processors for same trader state
  if (activeQueueProcessors.has(traderStateId)) {
    console.log(`[CONSUMER] Queue processor already running for ${traderStateId.slice(0,8)}`);
    return;
  }

  activeQueueProcessors.add(traderStateId);
  console.log(`[CONSUMER] Starting queue processor for ${traderStateId.slice(0,8)}`);

  let tradesProcessed = 0;

  try {
    // Process trades one-by-one until batch limit or no more queued trades
    while (tradesProcessed < MAX_TRADES_PER_BATCH) {
      // 1. Fetch oldest queued trade for this trader state
      const { data: queuedTrades, error: fetchError } = await supabase
        .from('demo_trades')
        .select('*')
        .eq('trader_state_id', traderStateId)
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(1);

      if (fetchError) {
        console.error(`[CONSUMER] Fetch error:`, fetchError.message);
        break;
      }

      if (!queuedTrades || queuedTrades.length === 0) {
        console.log(`[CONSUMER] No more queued trades for ${traderStateId.slice(0,8)}`);
        break;
      }

      const tradeRow = queuedTrades[0];
      const trade = tradeRow.raw_data as RawTrade;

      if (!trade) {
        console.error(`[CONSUMER] No raw_data in trade row ${tradeRow.id}`);
        await supabase.from('demo_trades').update({
          status: 'failed',
          error_message: 'Missing raw_data in trade row'
        }).eq('id', tradeRow.id);
        continue;
      }

      console.log(`[CONSUMER] Processing trade ${tradeRow.id.slice(0,8)} (sig: ${trade.signature?.slice(0,12)})`);

      // 2. Mark as 'processing' to prevent re-processing
      await supabase.from('demo_trades').update({
        status: 'processing'
      }).eq('id', tradeRow.id);

      // 3. Execute the trade (full Master Fix logic)
      try {
        await executeQueuedTrade(traderStateId, tradeRow, trade);

        // 4. Mark as completed
        await supabase.from('demo_trades').update({
          status: 'completed'
        }).eq('id', tradeRow.id);

        console.log(`[CONSUMER] Trade ${tradeRow.id.slice(0,8)} completed successfully`);

      } catch (processError: any) {
        // 5. Mark as failed with error message
        await supabase.from('demo_trades').update({
          status: 'failed',
          error_message: processError.message || 'Unknown processing error'
        }).eq('id', tradeRow.id);

        console.error(`[CONSUMER] Trade ${tradeRow.id.slice(0,8)} failed:`, processError.message);
      }

      tradesProcessed++;

      // Small delay to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Log if we hit batch limit (remaining trades will be picked up by next webhook)
    if (tradesProcessed >= MAX_TRADES_PER_BATCH) {
      console.log(`[CONSUMER] Batch limit reached (${MAX_TRADES_PER_BATCH}). Remaining trades will be processed on next trigger.`);
    }
  } finally {
    activeQueueProcessors.delete(traderStateId);
    console.log(`[CONSUMER] Queue processor finished for ${traderStateId.slice(0,8)} (processed ${tradesProcessed} trades)`);
  }
}

// ============ EXECUTE QUEUED TRADE (Master Fix Logic) ============
async function executeQueuedTrade(traderStateId: string, tradeRow: any, trade: RawTrade) {
  const sourceMint = trade.tokenInMint;
  const destMint = trade.tokenOutMint;
  const SOL_MINT = 'So11111111111111111111111111111111111111112';

  // 1. Fetch FRESH trader state and positions (not stale from queue time)
  const { data: traderState, error: tsError } = await supabase
    .from('demo_trader_states')
    .select(`*, positions:demo_positions(*)`)
    .eq('id', traderStateId)
    .single();

  if (tsError || !traderState) {
    throw new Error(`Trader state not found: ${tsError?.message}`);
  }

  const positions = traderState.positions || [];

  // 2. Get FRESH source position balance
  const sourcePosition = positions.find((p: any) => p.token_mint === sourceMint);
  const sourceBalance = Number(sourcePosition?.size || 0);

  if (sourceBalance <= 0) {
    throw new Error(`No ${sourceMint?.slice(0,6)} balance (have: ${sourceBalance})`);
  }

  // 3. DYNAMIC RATIO CALCULATION
  const leaderTradeAmount = trade.tokenInAmount;
  const leaderBeforeBalance = trade.tokenInPreBalance && trade.tokenInPreBalance > 0 
      ? trade.tokenInPreBalance 
      : leaderTradeAmount;
  
  let tradeRatio = leaderBeforeBalance > 0 ? leaderTradeAmount / leaderBeforeBalance : 1;
  tradeRatio = Math.min(Math.max(tradeRatio, 0), 1);

  console.log(`  Ratio=${(tradeRatio*100).toFixed(1)}% (Leader: ${leaderTradeAmount.toFixed(4)}/${leaderBeforeBalance.toFixed(4)})`);

  // Apply Ratio to Our Balance
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
  const rawInputAmount = Math.floor(copyAmount * Math.pow(10, sourceDecimals));

  const quoteUrl = new URL('https://api.jup.ag/swap/v1/quote');
  quoteUrl.searchParams.append('inputMint', sourceMint);
  quoteUrl.searchParams.append('outputMint', destMint);
  quoteUrl.searchParams.append('amount', rawInputAmount.toString());
  quoteUrl.searchParams.append('slippageBps', '100');

  const quoteResponse = await fetch(quoteUrl.toString(), {
    headers: {
      'x-api-key': JUPITER_API_KEY || '',
      'Content-Type': 'application/json'
    }
  });

  if (!quoteResponse.ok) {
    throw new Error(`Jupiter quote failed with status ${quoteResponse.status}`);
  }

  const quote = await quoteResponse.json();

  if (!quote.outAmount) {
    throw new Error('No quote output amount from Jupiter');
  }

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

  if (!tradeUsdValue || isNaN(tradeUsdValue) || tradeUsdValue < MIN_TRADE_THRESHOLD_USD) {
    throw new Error(`Trade value $${tradeUsdValue?.toFixed(2) || 0} below threshold or invalid`);
  }

  // 7. UPDATE TRADE ROW WITH QUOTE DATA
  const copyTradeTimestamp = Date.now();
  const latencyDiff = copyTradeTimestamp - (trade.timestamp * 1000);

  await supabase.from('demo_trades').update({
    token_in_amount: copyAmount,
    token_out_amount: quoteOutAmount,
    usd_value: tradeUsdValue,
    quote_in_amount: copyAmount,
    quote_out_amount: quoteOutAmount,
    price_impact: priceImpact,
    copy_trade_timestamp: Math.floor(copyTradeTimestamp / 1000),
    latency_diff_ms: latencyDiff
  }).eq('id', tradeRow.id);

  // 8. POSITION & PNL UPDATES (Master Fix Logic)
  let realizedPnl: number | null = null;

  if (isBuy) {
    // ============ BUY LOGIC (Weighted Average Cost) ============
    const usdSpent = tradeUsdValue;
    const tokenReceived = quoteOutAmount;

    // Decrease source (stablecoin/SOL) position
    await supabase.from('demo_positions').update({
      size: sourceBalance - copyAmount,
      cost_usd: await getUsdValue(sourceMint, sourceBalance - copyAmount),
      avg_cost: isSolSource ? await getSolPrice() : 1,
      updated_at: new Date().toISOString()
    }).eq('trader_state_id', traderStateId).eq('token_mint', sourceMint);

    // Increase/create destination (token) position
    const destPosition = positions.find((p: any) => p.token_mint === destMint);
    const oldAmount = Number(destPosition?.size || 0);
    const oldCostBasis = Number(destPosition?.cost_usd || 0);

    const newAmount = oldAmount + tokenReceived;
    const newCostBasis = oldCostBasis + usdSpent;
    const newAvgCost = newAmount > 0 ? newCostBasis / newAmount : 0;

    if (destPosition) {
      await supabase.from('demo_positions').update({
        size: newAmount,
        cost_usd: newCostBasis,
        avg_cost: newAvgCost,
        updated_at: new Date().toISOString()
      }).eq('trader_state_id', traderStateId).eq('token_mint', destMint);
    } else {
      await supabase.from('demo_positions').insert({
        trader_state_id: traderStateId,
        token_mint: destMint,
        token_symbol: getTokenSymbol(destMint),
        size: newAmount,
        cost_usd: newCostBasis,
        avg_cost: newAvgCost
      });
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

    await supabase.from('demo_positions').update({
      size: remainingAmount,
      cost_usd: remainingCostBasis,
      avg_cost: remainingAmount > 0 ? currentAvgCost : 0,
      updated_at: new Date().toISOString()
    }).eq('trader_state_id', traderStateId).eq('token_mint', sourceMint);

    // Update Trader State PnL
    const currentRealizedPnl = Number(traderState.realized_pnl_usd) || 0;
    await supabase.from('demo_trader_states').update({
      realized_pnl_usd: currentRealizedPnl + realizedPnl
    }).eq('id', traderStateId);

    // Increase destination (stablecoin/SOL) position
    const destPosition = positions.find((p: any) => p.token_mint === destMint);
    if (destPosition) {
      const newSize = Number(destPosition.size) + quoteOutAmount;
      await supabase.from('demo_positions').update({
        size: newSize,
        cost_usd: await getUsdValue(destMint, newSize),
        avg_cost: isSolDest ? await getSolPrice() : 1,
        updated_at: new Date().toISOString()
      }).eq('trader_state_id', traderStateId).eq('token_mint', destMint);
    } else {
      await supabase.from('demo_positions').insert({
        trader_state_id: traderStateId,
        token_mint: destMint,
        token_symbol: getTokenSymbol(destMint),
        size: quoteOutAmount,
        cost_usd: await getUsdValue(destMint, quoteOutAmount),
        avg_cost: isSolDest ? await getSolPrice() : 1
      });
    }

  } else {
    // Token → Token swap (rare)
    console.log(`  Token→Token swap, no USD cost tracking`);

    await supabase.from('demo_positions').update({
      size: sourceBalance - copyAmount,
      updated_at: new Date().toISOString()
    }).eq('trader_state_id', traderStateId).eq('token_mint', sourceMint);

    const destPosition = positions.find((p: any) => p.token_mint === destMint);
    if (destPosition) {
      await supabase.from('demo_positions').update({
        size: Number(destPosition.size) + quoteOutAmount,
        updated_at: new Date().toISOString()
      }).eq('trader_state_id', traderStateId).eq('token_mint', destMint);
    } else {
      await supabase.from('demo_positions').insert({
        trader_state_id: traderStateId,
        token_mint: destMint,
        token_symbol: getTokenSymbol(destMint),
        size: quoteOutAmount,
        cost_usd: 0,
        avg_cost: 0
      });
    }
  }

  // 9. Update trade with realized PnL
  if (realizedPnl !== null) {
    await supabase.from('demo_trades').update({
      realized_pnl: realizedPnl
    }).eq('id', tradeRow.id);
  }

  console.log(`  Copied ${copyAmount.toFixed(4)} ${getTokenSymbol(sourceMint)} → ${quoteOutAmount.toFixed(4)} ${getTokenSymbol(destMint)} | USD: $${tradeUsdValue.toFixed(2)} | PnL: ${realizedPnl !== null ? '$' + realizedPnl.toFixed(2) : 'N/A'} | Latency: ${latencyDiff}ms`);
}

export async function POST(request: NextRequest) {
  const receivedAt = Date.now();
  
  // Verify auth header
  const authHeader = request.headers.get('authorization');
  if (authHeader !== HELIUS_WEBHOOK_SECRET) {
    console.warn('Webhook auth failed:', authHeader?.slice(0, 20));
    // Still return 200 to prevent retries, but log the failure
  }
  
  try {
    const body = await request.json();
    const transactions = Array.isArray(body) ? body : [body];
    
    console.log(`Received ${transactions.length} transaction(s) from webhook`);
    
    let processed = 0;
    let inserted = 0;
    
    for (const tx of transactions) {
      if (!tx.signature || !tx.feePayer) continue;
      
      const trade = await detectTrade(tx, tx.feePayer);
      if (!trade) continue;
      
      processed++;
      
      // Calculate latency (time from on-chain to now)
      const latencyMs = receivedAt - (trade.timestamp * 1000);
      
      // Update position and get PnL
      const { realizedPnl, avgCostBasis } = await updatePositionAndGetPnL(trade);
      
      // Insert trade (ignore if duplicate)
      const { error } = await supabase.from('trades').upsert({
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
        usd_value: trade.baseAmount,
        realized_pnl: realizedPnl,
        avg_cost_basis: avgCostBasis,
        block_timestamp: trade.timestamp,
        source: trade.source,
        gas: trade.gas,
        latency_ms: latencyMs
      }, { onConflict: 'signature', ignoreDuplicates: true });
      
      if (!error) {
        inserted++;
        console.log(`Inserted trade: ${trade.type} ${trade.tokenMint.slice(0,8)}... | Latency: ${latencyMs}ms`);
        
        // COPY TRADE ENGINE: Process copy trades
        // CRITICAL: We MUST await on Vercel serverless - CPU freezes when response returns!
        // With batch limit of 5 trades and parallel fetching, this completes in ~3-5 seconds.
        await executeCopyTrades(trade, receivedAt);
        
        // Auto-add new wallet to star_traders table (ignore if already exists)
        await supabase.from('star_traders').upsert({
          address: trade.wallet,  // Use 'address' column
          name: `Trader ${trade.wallet.slice(0, 6)}`,
          created_at: new Date().toISOString()
        }, { onConflict: 'address', ignoreDuplicates: true });
      } else {
        console.log(`Trade insert error for ${trade.signature}:`, error.message);
      }
    }
    
    return NextResponse.json({ 
      ok: true, 
      processed, 
      inserted,
      receivedAt: new Date(receivedAt).toISOString()
    });
  } catch (error) {
    console.error('Webhook error:', error);
    // Always return 200 to prevent Helius retries
    return NextResponse.json({ ok: true, error: 'Processing failed' });
  }
}

// For testing - GET returns info about the endpoint
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/helius-webhook',
    method: 'POST',
    description: 'Helius webhook receiver for trade tracking',
    authHeader: 'Authorization header required',
    testPayload: {
      signature: 'test-sig-123',
      feePayer: '2ySF5KLP8WQW1FLVTY5xZEnoJgM6xMpZnhFtoXjadYar',
      timestamp: Math.floor(Date.now() / 1000),
      tokenTransfers: [],
      accountData: []
    }
  });
}
