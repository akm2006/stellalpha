import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { Connection, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

const HELIUS_WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET;
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

// Background enrichment: fetch real symbols from Jupiter and update trades table
async function enrichTradeSymbols(signature: string, tokenInMint: string, tokenOutMint: string): Promise<void> {
  try {
    // Collect mints that need enrichment (not in KNOWN_TOKENS)
    const mintsToFetch: string[] = [];
    if (!KNOWN_TOKENS[tokenInMint] && tokenInMint !== 'SOL') mintsToFetch.push(tokenInMint);
    if (!KNOWN_TOKENS[tokenOutMint] && tokenOutMint !== 'SOL') mintsToFetch.push(tokenOutMint);
    
    if (mintsToFetch.length === 0) return; // All known, nothing to do
    
    // Fetch metadata from Jupiter
    const symbolMap: Record<string, string> = {};
    for (const mint of mintsToFetch) {
      const meta = await getTokenMetadata(mint);
      if (meta?.symbol && meta.symbol.length <= 12) {
        symbolMap[mint] = meta.symbol;
      }
    }
    
    if (Object.keys(symbolMap).length === 0) return; // No symbols found
    
    // Update trades table with real symbols
    const updates: Record<string, string> = {};
    if (symbolMap[tokenInMint]) updates.token_in_symbol = symbolMap[tokenInMint];
    if (symbolMap[tokenOutMint]) updates.token_out_symbol = symbolMap[tokenOutMint];
    
    if (Object.keys(updates).length > 0) {
      await supabase.from('trades').update(updates).eq('signature', signature);
    }
  } catch (err) {
    // Silently fail - enrichment is best-effort
  }
}

// ============ EXTRACT ALL INVOLVED ADDRESSES FROM HELIUS PAYLOAD ============
// Used to detect trades even when Star Trader uses a relayer/bot as feePayer
// Performance: Uses Set for O(1) deduplication, then single DB query with .in()
function extractInvolvedAddresses(tx: any): Set<string> {
  const addresses = new Set<string>();
  
  // 1. Always include feePayer (may be the trader or a relayer)
  if (tx.feePayer) {
    addresses.add(tx.feePayer);
  }
  
  // 2. Extract from tokenTransfers (PRIMARY - most reliable for swaps)
  // This is where the actual trader appears even when using bots
  for (const transfer of tx.tokenTransfers || []) {
    if (transfer.fromUserAccount) addresses.add(transfer.fromUserAccount);
    if (transfer.toUserAccount) addresses.add(transfer.toUserAccount);
  }
  
  // 3. Extract from nativeTransfers (SOL movements)
  for (const transfer of tx.nativeTransfers || []) {
    if (transfer.fromUserAccount) addresses.add(transfer.fromUserAccount);
    if (transfer.toUserAccount) addresses.add(transfer.toUserAccount);
  }
  
  // 4. Extract from accountData (all touched accounts)
  // Note: This can include many program accounts, but our star_traders
  // table will filter to only real wallets
  for (const acc of tx.accountData || []) {
    if (acc.account) addresses.add(acc.account);
  }
  
  // 5. Remove known system program addresses to reduce false positives
  addresses.delete('11111111111111111111111111111111'); // System Program
  addresses.delete('ComputeBudget111111111111111111111111111111'); // Compute Budget
  addresses.delete('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'); // Token Program
  addresses.delete('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'); // Associated Token
  addresses.delete('SysvarRent111111111111111111111111111111111'); // Rent Sysvar
  
  return addresses;
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
    // 1. NATIVE SOL OVERRIDE Check
    // If we see token transfers (like USD1), but SOL was ALSO spent (> 0.01 to filter gas),
    // it's likely a SOL -> USD1 -> Token route. Trust the SOL spend as the true source.
    if (solChangeNet < -0.01) {
      const largestOut = tokensReceived.reduce((a: any, b: any) => a.tokenAmount > b.tokenAmount ? a : b);
       
      return {
        signature: tx.signature,
        wallet: fp,
        type: 'buy',
        tokenMint: largestOut.mint,
        tokenAmount: largestOut.tokenAmount,
        baseAmount: (await getSolPrice()) * Math.abs(solChangeNet),
        tokenInMint: 'SOL',           // <--- Correctly identified as SOL
        tokenInAmount: Math.abs(solChangeNet),
        tokenInPreBalance: 0,         
        tokenOutMint: largestOut.mint,
        tokenOutAmount: largestOut.tokenAmount,
        timestamp: tx.timestamp,
        source: tx.source || 'UNKNOWN',
        gas: fee / 1e9
      };
    }

    // 2. NATIVE SOL SELL OVERRIDE Check
    // Intercepts Token -> [Router] -> SOL
    // If we gained significant SOL (> 0.01), treat this as a Sell to SOL,
    // (ignoring wSOL/USD1), UNLESS we also received a hard Priority Asset (USDC/USDT).
    if (solChangeNet > 0.01) {
      // FIX For Rent Refund False Positives:
      // If we received USDC/USDT, that is likely the real output, 
      // and the SOL gain is just rent refund (e.g. closing multiple accounts).
      const PRIORITY_SAFE_OUTPUTS = new Set([
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
      ]);
      const hasSafeOutput = tokensReceived.some((t: any) => PRIORITY_SAFE_OUTPUTS.has(t.mint));

      if (!hasSafeOutput) {
        // Only override if we didn't get a safe stablecoin output
        const largestIn = tokensSent.reduce((a: any, b: any) => a.tokenAmount > b.tokenAmount ? a : b);
        
        console.log(`[Trade] Detected SOL gain masked by routing asset. Forcing Native SOL Sell.`);

        return {
          signature: tx.signature,
          wallet: fp,
          type: 'sell',
          tokenMint: largestIn.mint,
          tokenAmount: largestIn.tokenAmount,
          baseAmount: (await getSolPrice()) * Math.abs(solChangeNet),
          tokenInMint: largestIn.mint,
          tokenInAmount: largestIn.tokenAmount,
          tokenInPreBalance: 0, 
          tokenOutMint: 'SOL',            // <--- Correctly identified as SOL
          tokenOutAmount: solChangeNet,   // <--- Correct SOL amount
          timestamp: tx.timestamp,
          source: tx.source || 'UNKNOWN',
          gas: fee / 1e9
        };
      }
    }


    // 3. ROUTER TOKEN EXCLUSION (Intersection Logic)
    // Identify tokens that act as intermediate hops (appear in BOTH Sent and Received)
    // e.g. Swap Token A -> USD1 -> Token B usually shows:
    // Sent: [Token A, USD1]
    // Received: [USD1, Token B]
    // We must exclude USD1 to find the real source (Token A) and dest (Token B).
    const sentMints = new Set(tokensSent.map((t: any) => t.mint));
    const receivedMints = new Set(tokensReceived.map((t: any) => t.mint));
    const routingMints = new Set([...sentMints].filter(x => receivedMints.has(x)));
    
    // Filter candidates (unless they are the ONLY candidate)
    const validSent = tokensSent.filter((t: any) => !routingMints.has(t.mint));
    const validReceived = tokensReceived.filter((t: any) => !routingMints.has(t.mint));
    
    const candidatesSent = validSent.length > 0 ? validSent : tokensSent;
    const candidatesReceived = validReceived.length > 0 ? validReceived : tokensReceived;

    // 4. Base Asset Priority Logic (Input & Output)
    // Prioritize Known Bases (USDC, USDT, wSOL) over random tokens (USD1)
    const PRIORITY_MINTS = new Set([
      'So11111111111111111111111111111111111111112', // wSOL
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
    ]);

    // INPUT SELECTION
    let inToken = candidatesSent.find((t: any) => PRIORITY_MINTS.has(t.mint));
    if (!inToken) {
      inToken = candidatesSent.reduce((a: any, b: any) => a.tokenAmount > b.tokenAmount ? a : b);
    }
    
    // OUTPUT SELECTION (New Fix)
    // Prioritize receiving a known base asset over a random router token
    // OUTPUT SELECTION
    // Prioritize receiving a known base asset over a random router token
    let outToken = candidatesReceived.find((t: any) => PRIORITY_MINTS.has(t.mint));
    if (!outToken) {
      outToken = candidatesReceived.reduce((a: any, b: any) => a.tokenAmount > b.tokenAmount ? a : b);
    }
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
const MIN_TRADE_THRESHOLD_USD = 0.05;

// ============ VERCEL OPTIMIZATION: Batch limit to prevent timeouts ============
// Vercel Pro has 60s limit, but we aim for <10s per batch for reliability
const MAX_TRADES_PER_BATCH = 5;

// Track active queue processors to prevent duplicate processing
const activeQueueProcessors = new Set<string>();

// ============ PRODUCER: Fast Queue Insert ============
// Helper: Fetches CURRENT (Post-Trade) Liquid Equity
// Helper: Fetches CURRENT (Post-Trade) Liquid Equity
async function getTraderBuyingPower(walletAddress: string, connection: Connection, solPrice: number): Promise<number> {
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
async function executeCopyTrades(trade: RawTrade, receivedAt: number) {
  const starTrader = trade.wallet;
  const sourceMint = trade.tokenInMint;
  const destMint = trade.tokenOutMint;
  const type = trade.type;

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

  const solPrice = await getSolPrice(); // Use cached price
  
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
        
        console.log(`[V2-Buy] Spent $${leaderUsdValue.toFixed(2)} / Pre-Equity $${preTradeBuyingPower.toFixed(2)} = ${(ratio*100).toFixed(2)}%`);
      } else {
        console.log('[V2-Buy] Skipped Equity Model (No RPC Connection)');
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
        
        console.log(`[V2-Sell] Sold ${trade.tokenInAmount.toFixed(2)} / Pre-Bag ${preTradeTokenBalance.toFixed(2)} = ${(ratio*100).toFixed(2)}%`);
      } else {
        console.log('[V2-Sell] Skipped Equity Model (No RPC Connection)');
      }
    }
  } catch (err: any) {
    console.warn(`[PRODUCER] V2 Calculation Logic Failed:`, err.message);
    ratio = 0;
  }

  // Safety Clamp (0% to 100%)
  ratio = Math.min(Math.max(ratio, 0), 1);
  if (isNaN(ratio)) ratio = 0;

  // 4. Insert queued trade for each follower
  for (const traderState of followers) {
    const traderStateId = traderState.id;

    try {
      // Insert with status='queued' and STORE V2 COPY RATIO
      const { error: insertError } = await supabase.from('demo_trades').upsert({
        trader_state_id: traderStateId,
        star_trade_signature: trade.signature,
        type: trade.type,
        token_in_mint: sourceMint,
        token_in_symbol: getTokenSymbol(sourceMint),
        token_in_amount: null,  // Copy amount - populated by Consumer using copy_ratio
        token_out_mint: destMint,
        token_out_symbol: getTokenSymbol(destMint),
        token_out_amount: null,
        star_trade_timestamp: trade.timestamp,
        status: 'queued',
        // Store metadata
        leader_in_amount: trade.tokenInAmount,
        leader_out_amount: trade.tokenOutAmount,
        leader_usd_value: leaderUsdValue,
        leader_before_balance: leaderMetric,
        copy_ratio: ratio,  // <--- V2 CRITICAL FIELD
        raw_data: trade
      }, { onConflict: 'trader_state_id,star_trade_signature', ignoreDuplicates: true });

      if (insertError) {
        console.log(`  TS ${traderStateId.slice(0,8)}: Trade already queued or error: ${insertError.message}`);
        continue;
      }

      console.log(`  TS ${traderStateId.slice(0,8)}: Trade queued (Ratio: ${(ratio*100).toFixed(2)}%)`);

      // 5. Trigger queue processor (fire and forget)
      processTradeQueue(traderStateId).catch(err => {
        console.error(`[PRODUCER] Queue processor error for ${traderStateId.slice(0,8)}:`, err);
      });

    } catch (err) {
      console.error(`  TS ${traderStateId.slice(0,8)}: Queue insert error`, err);
    }
  }
}

// ============ CONSUMER: Sequential Trade Processor with Atomic Locking ============
// RACE CONDITION FIX: Uses atomic UPDATE with conditional WHERE to claim trades
// Even if multiple Vercel instances run simultaneously, only one will successfully claim each trade
async function processTradeQueue(traderStateId: string) {
  // Instance-level guard (same-process safety)
  if (activeQueueProcessors.has(traderStateId)) {
    console.log(`[CONSUMER] Queue processor already running for ${traderStateId.slice(0,8)}`);
    return;
  }

  activeQueueProcessors.add(traderStateId);
  console.log(`[CONSUMER] Starting queue processor for ${traderStateId.slice(0,8)}`);

  let tradesProcessed = 0;
  const processorId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    // Process trades one-by-one until batch limit or no more queued trades
    while (tradesProcessed < MAX_TRADES_PER_BATCH) {
      // ========== ATOMIC CLAIM PATTERN ==========
      // Step 1: Find oldest queued trade
      const { data: candidates, error: findError } = await supabase
        .from('demo_trades')
        .select('id')
        .eq('trader_state_id', traderStateId)
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(1);

      if (findError) {
        console.error(`[CONSUMER] Find error:`, findError.message);
        break;
      }

      if (!candidates || candidates.length === 0) {
        console.log(`[CONSUMER] No more queued trades for ${traderStateId.slice(0,8)}`);
        break;
      }

      const tradeId = candidates[0].id;

      // Step 2: ATOMIC CLAIM - Only succeeds if status is still 'queued'
      // If another instance claimed it between Step 1 and now, this returns 0 rows updated
      const { data: claimResult, error: claimError } = await supabase
        .from('demo_trades')
        .update({ 
          status: 'processing',
          processor_id: processorId  // Track which processor claimed it
        })
        .eq('id', tradeId)
        .eq('status', 'queued')  // CRITICAL: Only update if still queued
        .select('*');

      if (claimError) {
        console.error(`[CONSUMER] Claim error:`, claimError.message);
        break;
      }

      // If claim returned no rows, another processor got it - skip and try next
      if (!claimResult || claimResult.length === 0) {
        console.log(`[CONSUMER] Trade ${tradeId.slice(0,8)} already claimed by another processor`);
        continue; // Try to find another trade
      }

      // ========== PROCESS CLAIMED TRADE ==========
      const tradeRow = claimResult[0];
      const trade = tradeRow.raw_data as RawTrade;

      if (!trade) {
        console.error(`[CONSUMER] No raw_data in trade row ${tradeRow.id}`);
        await supabase.from('demo_trades').update({
          status: 'failed',
          error_message: 'Missing raw_data in trade row'
        }).eq('id', tradeRow.id);
        tradesProcessed++;
        continue;
      }

      console.log(`[CONSUMER] Processing trade ${tradeRow.id.slice(0,8)} (sig: ${trade.signature?.slice(0,12)})`);

      try {
        await executeQueuedTrade(traderStateId, tradeRow, trade);

        // Mark as completed
        await supabase.from('demo_trades').update({
          status: 'completed'
        }).eq('id', tradeRow.id);

        console.log(`[CONSUMER] Trade ${tradeRow.id.slice(0,8)} completed successfully`);

      } catch (processError: any) {
        // Mark as failed with error message
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

    // Log if we hit batch limit
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
    throw new Error(`No ${getTokenSymbol(sourceMint)} balance (have: ${sourceBalance})`);
  }

  // 3. DYNAMIC RATIO CALCULATION
  let tradeRatio = 0;

  // V2: Use pre-calculated Equity Model ratio from Producer (High Precision)
  if (tradeRow.copy_ratio !== undefined && tradeRow.copy_ratio !== null) {
      tradeRatio = Number(tradeRow.copy_ratio);
      console.log(`  [V2] Using Pre-calculated Ratio: ${(tradeRatio*100).toFixed(2)}%`);
  } 
  // V1 Fallback (Legacy)
  else {
      const leaderTradeAmount = trade.tokenInAmount;
      const leaderBeforeBalance = Number(tradeRow.leader_before_balance) > 0
          ? Number(tradeRow.leader_before_balance)
          : leaderTradeAmount; 
      
      tradeRatio = leaderBeforeBalance > 0 ? leaderTradeAmount / leaderBeforeBalance : 1;
      console.log(`  [V1-Legacy] Dynamic Ratio: ${(tradeRatio*100).toFixed(1)}% (Leader: ${leaderTradeAmount.toFixed(4)}/${leaderBeforeBalance.toFixed(4)})`);
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
    throw new Error(`Skipping: Value $${tradeUsdValue?.toFixed(2) || 0} is less than minimum $${MIN_TRADE_THRESHOLD_USD}`);
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
  
  // Verify auth header - REJECT if invalid
  const authHeader = request.headers.get('authorization');
  if (!HELIUS_WEBHOOK_SECRET) {
    console.error('HELIUS_WEBHOOK_SECRET not configured!');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  
  if (authHeader !== HELIUS_WEBHOOK_SECRET) {
    console.warn('Webhook auth failed - rejecting request. Header:', authHeader?.slice(0, 10) + '...');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const body = await request.json();
    const transactions = Array.isArray(body) ? body : [body];
    
    console.log(`Received ${transactions.length} transaction(s) from webhook`);
    
    let processed = 0;
    let inserted = 0;
    
    for (const tx of transactions) {
      if (!tx.signature) continue;
      
      // ============ FIX: Detect Star Traders from ANY involved address ============
      // Handles cases where Star Trader uses a bot/relayer as feePayer
      // Performance: Single DB query with .in() instead of per-address queries
      
      // 1. Extract all unique addresses involved in this transaction
      const involvedAddresses = extractInvolvedAddresses(tx);
      
      if (involvedAddresses.size === 0) {
        console.log(`No involved addresses in tx: ${tx.signature.slice(0, 12)}...`);
        continue;
      }
      
      // 2. Query star_traders for ANY match (single efficient query)
      const { data: matchedStarTraders, error: starTraderError } = await supabase
        .from('star_traders')
        .select('address')
        .in('address', Array.from(involvedAddresses));
      
      if (starTraderError) {
        console.error(`Star trader query error:`, starTraderError.message);
        continue;
      }
      
      if (!matchedStarTraders || matchedStarTraders.length === 0) {
        // Log which addresses we checked (first 3 for brevity)
        const sampleAddresses = Array.from(involvedAddresses).slice(0, 3).map(a => a.slice(0, 8));
        console.log(`No star traders in tx ${tx.signature.slice(0, 12)}... (checked ${involvedAddresses.size} addrs: ${sampleAddresses.join(', ')}...)`);
        continue;
      }
      
      // 3. Process trade for EACH matched star trader
      // (Important: A single tx could involve multiple tracked wallets)
      for (const starTrader of matchedStarTraders) {
        const traderAddress = starTrader.address;
        const isFeePayer = traderAddress === tx.feePayer;
        
        console.log(`Matched Star Trader: ${traderAddress.slice(0, 12)}... (${isFeePayer ? 'feePayer' : 'involved, not feePayer'})`);
        
        const trade = await detectTrade(tx, traderAddress);
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
        
          // BACKGROUND: Enrich token symbols (fire-and-forget, doesn't block)
          enrichTradeSymbols(trade.signature, trade.tokenInMint, trade.tokenOutMint).catch(() => {});
        
          // NOTE: Star traders are no longer auto-added here.
          // They must be added manually via database to prevent unauthorized wallet tracking.
        } else {
          console.log(`Trade insert error for ${trade.signature}:`, error.message);
        }
      } // End of for (starTrader of matchedStarTraders)
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
