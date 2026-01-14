import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const HELIUS_WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET || 'stellalpha-webhook-secret-2025';
const WSOL = "So11111111111111111111111111111111111111112";
const SOL_PRICE_USD = 200;

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
const decimalsCache = new Map<string, number>();

// Fetch token decimals from Jupiter Price API v3 (returns decimals in response)
async function getTokenDecimals(mint: string): Promise<number> {
  // Check cache first
  if (decimalsCache.has(mint)) {
    return decimalsCache.get(mint)!;
  }
  
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (JUPITER_API_KEY) headers['x-api-key'] = JUPITER_API_KEY;
    
    const response = await fetch(`https://api.jup.ag/price/v3?ids=${mint}`, { headers });
    if (response.ok) {
      const data = await response.json();
      const tokenData = data[mint];
      if (tokenData && typeof tokenData.decimals === 'number') {
        decimalsCache.set(mint, tokenData.decimals);
        return tokenData.decimals;
      }
    }
  } catch (error) {
    console.warn(`Failed to fetch decimals for ${mint}:`, error);
  }
  
  // Default: stablecoins use 6, most SPL tokens use 9
  const defaultDecimals = STABLECOIN_MINTS.has(mint) ? 6 : 9;
  decimalsCache.set(mint, defaultDecimals);
  return defaultDecimals;
}

function getUsdValue(mint: string, amount: number): number {
  if (STABLECOIN_MINTS.has(mint)) return amount;
  if (mint === 'SOL' || mint === WSOL) return amount * SOL_PRICE_USD;
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
  tokenOutMint: string;
  tokenOutAmount: number;
  timestamp: number;
  source: string;
  gas: number;
}

function detectTrade(tx: any, wallet: string): RawTrade | null {
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
      baseAmount = getUsdValue(inToken.mint, inToken.tokenAmount);
    } else if (inIsBase && !outIsBase) {
      type = 'buy';
      tokenMint = outToken.mint;
      tokenAmount = outToken.tokenAmount;
      baseAmount = getUsdValue(inToken.mint, inToken.tokenAmount);
    } else if (!inIsBase && outIsBase) {
      type = 'sell';
      tokenMint = inToken.mint;
      tokenAmount = inToken.tokenAmount;
      baseAmount = getUsdValue(outToken.mint, outToken.tokenAmount);
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
    baseAmount = solChangeNet * SOL_PRICE_USD;
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
    baseAmount = Math.abs(solChangeNet) * SOL_PRICE_USD;
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

// ============ COPY TRADE ENGINE ============
// Canonical algorithm: Source-asset ratio sizing
// Each TraderState has its own positions (like on-chain ATAs)
const MIN_TRADE_THRESHOLD_USD = 0.10;

async function executeCopyTrades(trade: RawTrade, receivedAt: number) {
  const starTrader = trade.wallet;
  const sourceMint = trade.tokenInMint;
  const destMint = trade.tokenOutMint;
  
  console.log(`[COPY] Star trader: ${starTrader.slice(0, 20)}... | Source: ${sourceMint?.slice(0,6)} → Dest: ${destMint?.slice(0,6)}`);
  
  if (!sourceMint || !destMint) {
    console.log(`[COPY] Missing sourceMint or destMint, skipping`);
    return;
  }
  
  // 1. Find all trader states following this star trader
  // Positions now belong to trader_state, not vault
  const { data: followers, error: followersError } = await supabase
    .from('demo_trader_states')
    .select(`
      *,
      positions:demo_positions(*)
    `)
    .eq('star_trader', starTrader)
    .eq('is_initialized', true)
    .eq('is_paused', false);
  
  if (followersError) {
    console.log(`[COPY] DB error fetching followers:`, followersError.message);
    return;
  }
  
  if (!followers || followers.length === 0) {
    console.log(`[COPY] No initialized followers found for ${starTrader.slice(0, 20)}...`);
    return; // No followers to copy trade for
  }
  
  console.log(`[COPY] Found ${followers.length} trader state(s) following ${starTrader.slice(0, 8)}...`);
  
  for (const traderState of followers) {
    const traderStateId = traderState.id;
    const positions = traderState.positions || [];
    
    // 2. Get this trader state's balance of SOURCE asset
    const sourcePosition = positions.find(
      (p: any) => p.token_mint === sourceMint
    );
    const sourceBalance = Number(sourcePosition?.size || 0);
    
    if (sourceBalance <= 0) {
      console.log(`  TS ${traderStateId.slice(0,8)}: No ${sourceMint.slice(0,6)} balance, skipping`);
      continue;
    }
    
    // 3. Compute leader's source-asset ratio
    const leaderTradeAmount = trade.tokenInAmount;
    const leaderBeforeBalance = leaderTradeAmount * 2; // Approximate
    const tradeRatio = leaderTradeAmount / leaderBeforeBalance;
    
    // 4. Compute copy amount
    let copyAmount = sourceBalance * tradeRatio;
    copyAmount = Math.min(copyAmount, sourceBalance);
    
    // 5. Get Jupiter QUOTE
    try {
      const inputDecimals = await getTokenDecimals(sourceMint);
      const rawInputAmount = Math.floor(copyAmount * Math.pow(10, inputDecimals));
      
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
        console.log(`  TS ${traderStateId.slice(0,8)}: Jupiter quote failed with status ${quoteResponse.status}`);
        continue;
      }
      
      const quote = await quoteResponse.json();
      
      if (!quote.outAmount) {
         console.error(`  TS ${traderStateId.slice(0,8)}: No quote output amount found`);
         continue;
      }

      // Use token-specific decimals for output amount
      const outputDecimals = await getTokenDecimals(destMint);
      const quoteOutAmount = Number(quote.outAmount || 0) / Math.pow(10, outputDecimals);
      const priceImpact = Number(quote.priceImpactPct || 0);

      // ============ FIX: ROBUST BUY/SELL DETECTION ============
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      const isStableSource = STABLECOIN_MINTS.has(sourceMint);
      const isSolSource = sourceMint === SOL_MINT || sourceMint === WSOL;
      
      const isStableDest = STABLECOIN_MINTS.has(destMint);
      const isSolDest = destMint === SOL_MINT || destMint === WSOL;

      // Buy = Spending "Money" (SOL or USDC) to get "Tokens"
      const isBuy = isStableSource || isSolSource;
      
      // Sell = Spending "Tokens" to get "Money" (SOL or USDC)
      const isSell = isStableDest || isSolDest;

      // ============ FIX: ACCURATE USD VALUE CALCULATION ============
      // We must calculate value based on the "Money" side of the trade, not the volatile token side.
      let tradeUsdValue = 0;

      if (isSell) {
        // We received SOL or USDC. Calculate value from the OUTPUT.
        // getUsdValue MUST handle SOL conversion (Amount * SolPrice)
        tradeUsdValue = getUsdValue(destMint, quoteOutAmount);
      } else if (isBuy) {
        // We spent SOL or USDC. Calculate value from the INPUT.
        tradeUsdValue = getUsdValue(sourceMint, copyAmount);
      } else {
        // Token -> Token swap. Try to value the output if it's a known token, otherwise 0
        // (This matches getUsdValue logic which handles stable/SOL, returns 0 otherwise)
        tradeUsdValue = getUsdValue(destMint, quoteOutAmount);
      }

      // Safety check for threshold
      if (tradeUsdValue < MIN_TRADE_THRESHOLD_USD) {
         console.log(`  TS ${traderStateId.slice(0,8)}: Trade value $${tradeUsdValue.toFixed(2)} below threshold, skipping`);
         continue;
      }

      // 6. Store trade (IDEMPOTENT via trader_state_id + signature)
      const copyTradeTimestamp = Date.now();
      const latencyDiff = copyTradeTimestamp - (trade.timestamp * 1000);
      
      const { error: insertError } = await supabase.from('demo_trades').upsert({
        trader_state_id: traderStateId,  // Linked to trader state, not vault
        star_trade_signature: trade.signature,
        type: trade.type,
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
        star_trade_timestamp: trade.timestamp,
        copy_trade_timestamp: Math.floor(copyTradeTimestamp / 1000),
        latency_diff_ms: latencyDiff
      }, { onConflict: 'trader_state_id,star_trade_signature', ignoreDuplicates: true });
      
      if (insertError) {
        console.log(`  TS ${traderStateId.slice(0,8)}: Trade already processed or error`);
        continue;
      }
      
      // ================================================================
      // 7. AUTHORITATIVE ACCOUNTING (per user spec)
      // - Cost basis is stateful
      // - PnL is derived (never stored as primary)
      // - Realized PnL updates trader_state.realized_pnl_usd cumulatively
      // ================================================================
      
      let realizedPnl: number | null = null;
      
      if (isBuy) {
        // ============ BUY (USDC/SOL → TOKEN) ============
        // amount += token_received
        // cost_basis_usd += usd_spent
        // avg_cost_usd = cost_basis_usd / amount
        // ✔ No PnL generated on buy
        
        const usdSpent = tradeUsdValue; // Source is stablecoin/SOL -> calculated USD value
        const tokenReceived = quoteOutAmount;
        
        // Decrease source (stablecoin/SOL) position
        await supabase.from('demo_positions').update({
          size: sourceBalance - copyAmount,
          cost_usd: getUsdValue(sourceMint, sourceBalance - copyAmount), // Re-calc cost based on new size
          avg_cost: isSolSource ? SOL_PRICE_USD : 1, // Reset avg cost for money assets
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
        // ============ SELL (TOKEN → USDC) ============
        // Step 1: Use existing Average Cost to determine cost of sold tokens
        const tokenSold = copyAmount;
        const usdReceived = quoteOutAmount;
        
        const oldAmount = Number(sourcePosition.size) || 0;
        // FIX: Use avg_cost for calculations to match Star Trader logic
        const currentAvgCost = Number(sourcePosition.avg_cost) || 0;
        
        // Cost of the specific tokens being sold (Cost Basis Reduction)
        const costRemoved = currentAvgCost * tokenSold;
        
        // Step 2: Update source (token) position
        const remainingAmount = oldAmount - tokenSold;
        
        // FIX: Derive new total cost from the preserved Average Cost
        // This prevents "drift" between cost_usd and avg_cost
        const remainingCostBasis = currentAvgCost * remainingAmount;
        
        // FIX: Do NOT recalculate avg_cost. It stays the same unless we sold everything.
        const newAvgCost = remainingAmount > 0 ? currentAvgCost : 0;
        
        await supabase.from('demo_positions').update({
          size: remainingAmount,
          cost_usd: remainingCostBasis, // Now perfectly synced with avg_cost * size
          avg_cost: newAvgCost,
          updated_at: new Date().toISOString()
        }).eq('trader_state_id', traderStateId).eq('token_mint', sourceMint);
        
        // Step 3: Calculate realized PnL
        realizedPnl = usdReceived - costRemoved;
        
        // Update cumulative realized_pnl_usd on trader_state
        const currentRealizedPnl = Number(traderState.realized_pnl_usd) || 0;
        await supabase.from('demo_trader_states').update({
          realized_pnl_usd: currentRealizedPnl + realizedPnl
        }).eq('id', traderStateId);
        
        // Increase destination (stablecoin) position
        const destPosition = positions.find((p: any) => p.token_mint === destMint);
        if (destPosition) {
          const newSize = Number(destPosition.size) + usdReceived;
          await supabase.from('demo_positions').update({
            size: newSize,
            cost_usd: newSize, // For stablecoins, cost = size
            avg_cost: 1,
            updated_at: new Date().toISOString()
          }).eq('trader_state_id', traderStateId).eq('token_mint', destMint);
        } else {
          await supabase.from('demo_positions').insert({
            trader_state_id: traderStateId,
            token_mint: destMint,
            token_symbol: getTokenSymbol(destMint),
            size: usdReceived,
            cost_usd: usdReceived,
            avg_cost: 1
          });
        }
        
      } else {
        // Token → Token swap (rare case) - no proper cost tracking possible
        console.log(`  TS ${traderStateId.slice(0,8)}: Token→Token swap, no USD cost tracking`);
        
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
      
      // Update trade with realized PnL for record (derived, for display only)
      if (realizedPnl !== null) {
        await supabase.from('demo_trades').update({
          realized_pnl: realizedPnl
        }).eq('trader_state_id', traderStateId).eq('star_trade_signature', trade.signature);
      }
      
      console.log(`  TS ${traderStateId.slice(0,8)}: Copied ${copyAmount.toFixed(4)} ${getTokenSymbol(sourceMint)} → ${quoteOutAmount.toFixed(4)} ${getTokenSymbol(destMint)} | PnL: ${realizedPnl !== null ? '$' + realizedPnl.toFixed(2) : 'N/A'} | Latency: ${latencyDiff}ms`);
      
    } catch (quoteError) {
      console.error(`  TS ${traderStateId.slice(0,8)}: Quote error`, quoteError);
    }
  }
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
      
      const trade = detectTrade(tx, tx.feePayer);
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
        
        // COPY TRADE ENGINE: Execute copy trades FIRST
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
