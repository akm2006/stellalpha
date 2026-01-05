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
        
        // Auto-add new wallet to star_traders table (ignore if already exists)
        await supabase.from('star_traders').upsert({
          address: trade.wallet,  // Use 'address' column
          name: `Trader ${trade.wallet.slice(0, 6)}`,
          created_at: new Date().toISOString()
        }, { onConflict: 'address', ignoreDuplicates: true });
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
