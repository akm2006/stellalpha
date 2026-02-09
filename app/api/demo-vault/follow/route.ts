import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/session';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

// POST: Create a new TraderState with USD allocation (no auto-sync)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user?.wallet) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { wallet: requestedWallet, starTrader, allocationUsd } = await request.json();
    const wallet = session.user.wallet;

    if (requestedWallet && requestedWallet !== wallet) {
      return NextResponse.json({ error: 'Forbidden: wallet does not match authenticated user' }, { status: 403 });
    }
    
    if (!starTrader) {
      return NextResponse.json({ error: 'starTrader required' }, { status: 400 });
    }
    
    const usdAmount = Math.max(0, Number(allocationUsd) || 0);
    
    if (usdAmount < 10) {
      return NextResponse.json({ error: 'Minimum allocation is $10' }, { status: 400 });
    }
    
    // Get vault
    const { data: vault, error: vaultError } = await supabase
      .from('demo_vaults')
      .select('id, balance_usd')
      .eq('user_wallet', wallet)
      .single();
    
    if (vaultError || !vault) {
      return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
    }
    
    // Check sufficient balance
    if (usdAmount > Number(vault.balance_usd)) {
      return NextResponse.json({ 
        error: `Insufficient balance. Available: $${Number(vault.balance_usd).toFixed(2)}` 
      }, { status: 400 });
    }
    
    // Check if already following this trader
    const { data: existingTs } = await supabase
      .from('demo_trader_states')
      .select('id')
      .eq('vault_id', vault.id)
      .eq('star_trader', starTrader)
      .single();
    
    if (existingTs) {
      return NextResponse.json({ 
        error: 'Already following this trader. Unfollow first to change allocation.' 
      }, { status: 400 });
    }
    
    // INSERT new trader state - starts as pending (not synced, not initialized)
    const { data: traderState, error } = await supabase
      .from('demo_trader_states')
      .insert({
        vault_id: vault.id,
        star_trader: starTrader,
        allocated_usd: usdAmount,
        is_syncing: false,
        is_initialized: false,
        is_paused: false,
        is_settled: false
      })
      .select()
      .single();
    
    if (error) {
      console.error('Create trader state error:', error);
      return NextResponse.json({ error: 'Failed to create trader state' }, { status: 500 });
    }
    
    // Deduct from vault balance
    await supabase
      .from('demo_vaults')
      .update({ balance_usd: Number(vault.balance_usd) - usdAmount })
      .eq('id', vault.id);
    
    // Create initial USDC position (funds are reserved, not synced yet)
    await supabase.from('demo_positions').insert({
      trader_state_id: traderState.id,
      token_mint: USDC_MINT,
      token_symbol: 'USDC',
      size: usdAmount,
      cost_usd: usdAmount,
      avg_cost: 1
    });
    
    return NextResponse.json({
      success: true,
      traderState,
      message: 'Trader state created. Click Initialize to start copying.'
    });
  } catch (error) {
    console.error('Create trader state error:', error);
    return NextResponse.json({ error: 'Failed to create trader state' }, { status: 500 });
  }
}

// PATCH: Handle actions - sync, initialize, pause, resume, settle
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user?.wallet) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { wallet: requestedWallet, traderStateId, action } = await request.json();
    const wallet = session.user.wallet;

    if (requestedWallet && requestedWallet !== wallet) {
      return NextResponse.json({ error: 'Forbidden: wallet does not match authenticated user' }, { status: 403 });
    }
    
    if (!traderStateId || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // Verify ownership
    const { data: vault } = await supabase
      .from('demo_vaults')
      .select('id')
      .eq('user_wallet', wallet)
      .single();
    
    if (!vault) {
      return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
    }
    
    const { data: ts } = await supabase
      .from('demo_trader_states')
      .select('*')
      .eq('id', traderStateId)
      .eq('vault_id', vault.id)
      .single();
    
    if (!ts) {
      return NextResponse.json({ error: 'Trader state not found' }, { status: 404 });
    }
    
    switch (action) {
      case 'initialize':
        return await handleInitialize(ts);
      case 'pause':
        if (ts.is_paused) return NextResponse.json({ error: 'Already paused' }, { status: 400 });
        await supabase.from('demo_trader_states').update({ is_paused: true }).eq('id', traderStateId);
        return NextResponse.json({ success: true, action: 'pause' });
      case 'resume':
        if (!ts.is_paused) return NextResponse.json({ error: 'Not paused' }, { status: 400 });
        await supabase.from('demo_trader_states').update({ is_paused: false }).eq('id', traderStateId);
        return NextResponse.json({ success: true, action: 'resume' });
      case 'settle':
        if (ts.is_settled) return NextResponse.json({ error: 'Already settled' }, { status: 400 });
        await supabase.from('demo_trader_states').update({ is_settled: true, is_paused: true }).eq('id', traderStateId);
        return NextResponse.json({ success: true, action: 'settle' });
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Update trader state error:', error);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}


// Handle initialize action - mark as ready for copy trading
async function handleInitialize(ts: any) {
  if (ts.is_initialized) {
    return NextResponse.json({ error: 'Already initialized' }, { status: 400 });
  }
  
  // V2 LOGIC: No sync required. We start fresh with USDC balance.
  
  await supabase.from('demo_trader_states')
    .update({ is_initialized: true })
    .eq('id', ts.id);
  
  return NextResponse.json({ 
    success: true, 
    action: 'initialize',
    message: 'Trader state initialized. Copy trading active.'
  });
}

// DELETE: Unfollow/withdraw trader state (return funds to vault)
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.user?.wallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedWallet = searchParams.get('wallet');
  const wallet = session.user.wallet;
  const traderStateId = searchParams.get('traderStateId');

  if (requestedWallet && requestedWallet !== wallet) {
    return NextResponse.json({ error: 'Forbidden: wallet does not match authenticated user' }, { status: 403 });
  }
  
  if (!traderStateId) {
    return NextResponse.json({ error: 'traderStateId required' }, { status: 400 });
  }
  
  try {
    // Get vault
    const { data: vault } = await supabase
      .from('demo_vaults')
      .select('id, balance_usd')
      .eq('user_wallet', wallet)
      .single();
    
    if (!vault) {
      return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
    }
    
    // Get trader state
    const { data: traderState } = await supabase
      .from('demo_trader_states')
      .select('id, allocated_usd')
      .eq('id', traderStateId)
      .eq('vault_id', vault.id)
      .single();
    
    if (!traderState) {
      return NextResponse.json({ error: 'Trader state not found' }, { status: 404 });
    }
    
    // Calculate current value of positions to return
    const { data: positions } = await supabase
      .from('demo_positions')
      .select('*')
      .eq('trader_state_id', traderState.id);
    
    // Fetch current prices to calculate actual return value
    const JUPITER_API_KEY = process.env.JUPITER_API_KEY;
    let totalReturnValue = 0;
    
    if (positions && positions.length > 0) {
      const mints = positions.map(p => p.token_mint);
      let prices: Record<string, number> = {};
      
      try {
        const pricesResponse = await fetch(
          `https://api.jup.ag/price/v3?ids=${mints.join(',')}`,
          { headers: JUPITER_API_KEY ? { 'x-api-key': JUPITER_API_KEY } : {} }
        );
        const pricesData = await pricesResponse.json();
        
        // Jupiter v3 returns prices directly on root object
        for (const [mint, info] of Object.entries(pricesData)) {
          if (info && typeof info === 'object' && 'usdPrice' in info) {
            prices[mint] = Number((info as { usdPrice: number }).usdPrice || 0);
          }
        }
      } catch {
        // Use cached prices
        const { data: cachedPrices } = await supabase
          .from('token_prices')
          .select('*')
          .in('mint', mints);
        
        if (cachedPrices) {
          for (const p of cachedPrices) {
            prices[p.mint] = p.price;
          }
        }
      }
      
      for (const pos of positions) {
        const price = prices[pos.token_mint] || 0;
        if (price > 0) {
          totalReturnValue += Number(pos.size) * price;
        } else {
          // No price, use cost basis
          totalReturnValue += Number(pos.cost_usd);
        }
      }
    }
    
    // If no value calculated, use allocated amount
    if (totalReturnValue === 0) {
      totalReturnValue = Number(traderState.allocated_usd);
    }
    
    // Return funds to vault
    await supabase
      .from('demo_vaults')
      .update({ balance_usd: Number(vault.balance_usd) + totalReturnValue })
      .eq('id', vault.id);
    
    // Delete trader state (cascades to positions and trades)
    await supabase
      .from('demo_trader_states')
      .delete()
      .eq('id', traderState.id);
    
    return NextResponse.json({ 
      success: true,
      returnedUsd: totalReturnValue 
    });
  } catch (error) {
    console.error('Delete trader state error:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
