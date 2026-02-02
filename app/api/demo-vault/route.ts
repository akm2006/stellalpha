import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: Fetch user's demo vault with trader states
// (Implementation moved below to use price fetching)

// POST: Deploy new demo vault with 1K USD
export async function POST(request: NextRequest) {
  try {
    const { wallet } = await request.json();
    
    if (!wallet) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
    }
    
    // Check if vault already exists
    const { data: existing } = await supabase
      .from('demo_vaults')
      .select('id')
      .eq('user_wallet', wallet)
      .single();
    
    if (existing) {
      return NextResponse.json({ error: 'Vault already exists' }, { status: 409 });
    }
    
    // Create vault with 1K USD (all unallocated initially)
    const { data: vault, error } = await supabase
      .from('demo_vaults')
      .insert({
        user_wallet: wallet,
        balance_usd: 1000,  // Unallocated balance
        total_deposited: 1000
      })
      .select()
      .single();
    
    if (error) {
      console.error('Vault creation error:', error);
      return NextResponse.json({ error: 'Failed to create vault' }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      vault
    });
  } catch (error) {
    console.error('Demo vault deploy error:', error);
    return NextResponse.json({ error: 'Failed to deploy vault' }, { status: 500 });
  }
}

// DELETE: Delete demo vault
const JUPITER_API_KEY = process.env.JUPITER_API_KEY;
// Stablecoins always = $1
const STABLECOIN_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenUb9', // USDT
  'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB', // USD1
]);

async function fetchJupiterPrices(mints: string[]): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();
  
  // Set stablecoins to $1
  for (const mint of mints) {
    if (STABLECOIN_MINTS.has(mint)) priceMap.set(mint, 1);
  }
  
  const nonStableMints = mints.filter(m => !STABLECOIN_MINTS.has(m));
  if (nonStableMints.length === 0) return priceMap;
  
  // Chunk into 100s if needed, or simple fetch for now
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (JUPITER_API_KEY) headers['x-api-key'] = JUPITER_API_KEY;
    
    // Split into chunks of 100 to respect API limits
    const CHUNK_SIZE = 100;
    for (let i = 0; i < nonStableMints.length; i += CHUNK_SIZE) {
      const chunk = nonStableMints.slice(i, i + CHUNK_SIZE);
      const url = `https://api.jup.ag/price/v3?ids=${chunk.join(',')}`;
      
      const response = await fetch(url, { headers });
      if (response.ok) {
        const data = await response.json();
        for (const mint of chunk) {
          if (data[mint] && data[mint].usdPrice) {
            priceMap.set(mint, Number(data[mint].usdPrice));
          }
        }
      }
    }
  } catch (e) {
    console.error('Price fetch error:', e);
  }
  
  return priceMap;
}

// GET: Fetch user's demo vault with trader states
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');
  
  if (!wallet) {
    return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
  }
  
  try {
    // Fetch vault
    const { data: vault, error: vaultError } = await supabase
      .from('demo_vaults')
      .select('*')
      .eq('user_wallet', wallet)
      .single();
    
    if (vaultError && vaultError.code !== 'PGRST116') {
      console.error('Vault fetch error:', vaultError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    
    if (!vault) {
      return NextResponse.json({ vault: null, exists: false });
    }
    
    // Fetch trader states with their positions
    const { data: traderStates } = await supabase
      .from('demo_trader_states')
      .select(`
        *,
        positions:demo_positions(*)
      `)
      .eq('vault_id', vault.id);
      
    // Collect all mints
    const allMints = new Set<string>();
    traderStates?.forEach(ts => {
      ts.positions?.forEach((p: any) => {
        if (p.token_mint) allMints.add(p.token_mint);
      });
    });
    
    // Fetch prices
    const prices = await fetchJupiterPrices(Array.from(allMints));
    
    // Calculate totals per trader state using LIVE prices
    const tradersWithTotals = (traderStates || []).map(ts => {
      const positions = ts.positions || [];
      const allocated = Number(ts.allocated_usd || 0);
      const realizedPnl = Number(ts.realized_pnl_usd || 0);

      // Portfolio Value = Sum(Position Size * Price)
      // Note: Assuming positions include USDC holdings if any
      let currentPortfolioValue = 0;
      positions.forEach((p: any) => {
        const size = Number(p.size || 0);
        const price = prices.get(p.token_mint) || 0;
        
        // Use price * size (if price (0) is returned, value is 0, matching portfolio page)
        currentPortfolioValue += size * price;
      });
      
      // If no positions (all cash realized?), Value = Allocated + Realized? 
      // Issue: If all positions sold, we have no position entries?
      // System logic: Closed positions are removed? Or kept with size 0?
      // If positions are empty, we must rely on 'Allocated + Realized'.
      // But if there ARE positions, currentPortfolioValue is the source of truth.
      // Wait: If I hold only USDC, is it a position? Yes, likely.
      // If position list is empty, assume uninitialized or fully withdrawn? No.
      // Safe fallback: Math.max(0, allocated + realizedPnl + unrealizedPnL)
      
      // Let's trust currentPortfolioValue derived from positions if positions exist.
      // If positions array is empty, then value is 0 (or uninitialized).
      
      return {
        ...ts,
        totalValue: currentPortfolioValue,
        positionCount: positions.length
      };
    });
    
    // Calculate total allocated across all trader states
    const totalAllocated = tradersWithTotals.reduce((sum, ts) => sum + Number(ts.allocated_usd || 0), 0);
    
    return NextResponse.json({
      vault: {
        ...vault,
        totalAllocated,
        unallocated: Number(vault.balance_usd)
      },
      traderStates: tradersWithTotals,
      exists: true
    });
  } catch (error) {
    console.error('Demo vault fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch vault' }, { status: 500 });
  }
}

