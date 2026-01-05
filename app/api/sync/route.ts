import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const WSOL = "So11111111111111111111111111111111111111112";
const SOL_PRICE_USD = 200;

const BASE_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB',
  'So11111111111111111111111111111111111111112',
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
};

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
  const nonWSol = relevant.filter((x: any) => x.mint !== WSOL);
  
  const tokensSent = nonWSol.filter((x: any) => x.fromUserAccount === fp);
  const tokensReceived = nonWSol.filter((x: any) => x.toUserAccount === fp);
  
  let type: 'buy' | 'sell' = 'buy';
  let tokenMint = '';
  let tokenAmount = 0;
  let baseAmount = 0;
  let tokenInMint = '';
  let tokenInAmount = 0;
  let tokenOutMint = '';
  let tokenOutAmount = 0;
  
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
    
    // Skip stablecoin-to-stablecoin swaps (not a trade for PnL purposes)
    if (inIsBase && outIsBase) {
      return null;
    }
    
    if (inIsBase && !outIsBase) {
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

// POST: Sync historical trades from Helius to database
export async function POST(request: NextRequest) {
  const { wallet, limit = 100 } = await request.json();
  
  if (!wallet) {
    return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
  }
  
  if (!HELIUS_API_KEY) {
    return NextResponse.json({ error: 'Helius API key not configured' }, { status: 500 });
  }
  
  try {
    // Fetch from Helius
    const url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${HELIUS_API_KEY}&limit=${Math.min(limit, 100)}`;
    const response = await fetch(url);
    const transactions = await response.json();
    
    if (!Array.isArray(transactions)) {
      return NextResponse.json({ error: 'Invalid Helius response' }, { status: 500 });
    }
    
    // Detect and insert trades
    const rawTrades: RawTrade[] = [];
    for (const tx of transactions) {
      const trade = detectTrade(tx, wallet);
      if (trade) rawTrades.push(trade);
    }
    
    // Sort chronologically for PnL calculation
    rawTrades.sort((a, b) => a.timestamp - b.timestamp);
    
    // Track positions for PnL
    const positions = new Map<string, { size: number; costUsd: number; avgCost: number }>();
    let inserted = 0;
    
    for (const trade of rawTrades) {
      let pos = positions.get(trade.tokenMint) || { size: 0, costUsd: 0, avgCost: 0 };
      let realizedPnl: number | null = null;
      
      if (trade.type === 'buy') {
        const newSize = pos.size + trade.tokenAmount;
        const newCost = pos.costUsd + trade.baseAmount;
        pos = { size: newSize, costUsd: newCost, avgCost: newSize > 0 ? newCost / newSize : 0 };
      } else {
        if (pos.size > 0 && pos.avgCost > 0) {
          realizedPnl = trade.baseAmount - (pos.avgCost * trade.tokenAmount);
          const remainingSize = Math.max(0, pos.size - trade.tokenAmount);
          pos = { size: remainingSize, costUsd: pos.avgCost * remainingSize, avgCost: remainingSize > 0 ? pos.avgCost : 0 };
        }
      }
      positions.set(trade.tokenMint, pos);
      
      // Insert trade
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
        avg_cost_basis: pos.avgCost,
        block_timestamp: trade.timestamp,
        source: trade.source,
        gas: trade.gas,
        latency_ms: null // Historical sync, no latency
      }, { onConflict: 'signature', ignoreDuplicates: true });
      
      if (!error) inserted++;
    }
    
    // Update positions table
    for (const [mint, pos] of positions) {
      await supabase.from('positions').upsert({
        wallet,
        token_mint: mint,
        size: pos.size,
        cost_usd: pos.costUsd,
        avg_cost: pos.avgCost,
        updated_at: new Date().toISOString()
      }, { onConflict: 'wallet,token_mint' });
    }
    
    return NextResponse.json({
      wallet,
      fetched: transactions.length,
      trades: rawTrades.length,
      inserted,
      positions: positions.size
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
