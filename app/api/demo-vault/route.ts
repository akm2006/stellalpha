import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createDemoTradeStatsMap } from '@/lib/demo-trade-stats';
import {
  calculateDemoVaultPortfolioValue,
  fetchDemoVaultPriceMap,
  normalizeDemoVaultPositions,
} from '@/lib/demo-vault-pricing';
import { getSession } from '@/lib/session';

// GET: Fetch user's demo vault with trader states
// (Implementation moved below to use price fetching)

// POST: Deploy new demo vault with 1K USD
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user?.wallet) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { wallet: requestedWallet } = await request.json();
    const wallet = session.user.wallet;

    if (requestedWallet && requestedWallet !== wallet) {
      return NextResponse.json({ error: 'Forbidden: wallet does not match authenticated user' }, { status: 403 });
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

// DELETE: Delete user's demo vault and related demo state
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user?.wallet) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestedWallet = searchParams.get('wallet');
    const wallet = session.user.wallet;

    if (requestedWallet && requestedWallet !== wallet) {
      return NextResponse.json({ error: 'Forbidden: wallet does not match authenticated user' }, { status: 403 });
    }

    const { data: vault, error: vaultLookupError } = await supabase
      .from('demo_vaults')
      .select('id')
      .eq('user_wallet', wallet)
      .single();

    if (vaultLookupError && vaultLookupError.code !== 'PGRST116') {
      console.error('Vault lookup error:', vaultLookupError);
      return NextResponse.json({ error: 'Failed to lookup vault' }, { status: 500 });
    }

    if (!vault) {
      return NextResponse.json({
        success: true,
        deleted: false,
        message: 'No vault found',
      });
    }

    const { data: traderStates, error: tsError } = await supabase
      .from('demo_trader_states')
      .select('id')
      .eq('vault_id', vault.id);

    if (tsError) {
      console.error('Trader states lookup error:', tsError);
      return NextResponse.json({ error: 'Failed to lookup trader states' }, { status: 500 });
    }

    const traderStateIds = (traderStates || []).map((ts) => ts.id);

    if (traderStateIds.length > 0) {
      const { error: tradesDeleteError } = await supabase
        .from('demo_trades')
        .delete()
        .in('trader_state_id', traderStateIds);

      if (tradesDeleteError) {
        console.error('Demo trades delete error:', tradesDeleteError);
        return NextResponse.json({ error: 'Failed to delete demo trades' }, { status: 500 });
      }

      const { error: positionsDeleteError } = await supabase
        .from('demo_positions')
        .delete()
        .in('trader_state_id', traderStateIds);

      if (positionsDeleteError) {
        console.error('Demo positions delete error:', positionsDeleteError);
        return NextResponse.json({ error: 'Failed to delete demo positions' }, { status: 500 });
      }

      const { error: lifecycleDeleteError } = await supabase
        .from('copy_position_states')
        .delete()
        .eq('scope_type', 'demo')
        .in('scope_key', traderStateIds);

      if (lifecycleDeleteError) {
        console.error('Copy position lifecycle delete error:', lifecycleDeleteError);
        return NextResponse.json({ error: 'Failed to delete copy position lifecycle state' }, { status: 500 });
      }

      const { error: statesDeleteError } = await supabase
        .from('demo_trader_states')
        .delete()
        .eq('vault_id', vault.id);

      if (statesDeleteError) {
        console.error('Demo trader states delete error:', statesDeleteError);
        return NextResponse.json({ error: 'Failed to delete trader states' }, { status: 500 });
      }
    }

    const { error: vaultDeleteError } = await supabase
      .from('demo_vaults')
      .delete()
      .eq('id', vault.id);

    if (vaultDeleteError) {
      console.error('Demo vault delete error:', vaultDeleteError);
      return NextResponse.json({ error: 'Failed to delete vault' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deleted: true,
    });
  } catch (error) {
    console.error('Demo vault delete error:', error);
    return NextResponse.json({ error: 'Failed to delete vault' }, { status: 500 });
  }
}

const JUPITER_API_KEY = process.env.JUPITER_API_KEY;

// GET: Fetch user's demo vault with trader states
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.user?.wallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedWallet = searchParams.get('wallet');
  const wallet = session.user.wallet;

  if (requestedWallet && requestedWallet !== wallet) {
    return NextResponse.json({ error: 'Forbidden: wallet does not match authenticated user' }, { status: 403 });
  }
  
  try {
    // Fetch vault
    const { data: vault, error: vaultError } = await supabase
      .from('demo_vaults')
      .select('id, user_wallet, balance_usd, total_deposited, created_at')
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
        id,
        star_trader,
        allocated_usd,
        realized_pnl_usd,
        copy_model_key,
        copy_model_config,
        starting_capital_usd,
        recommended_model_key,
        recommended_model_reason,
        is_syncing,
        is_initialized,
        is_paused,
        is_settled,
        positions:demo_positions(token_mint, token_symbol, size, cost_usd)
      `)
      .eq('vault_id', vault.id);

    const traderStateIds = (traderStates || []).map((state) => state.id);
    const { data: tradeStatsRows, error: tradeStatsError } = traderStateIds.length > 0
      ? await supabase.rpc('get_demo_trade_stats', { p_trader_state_ids: traderStateIds })
      : { data: [], error: null };

    if (tradeStatsError) {
      console.error('Demo vault stats fetch error:', tradeStatsError);
      return NextResponse.json({ error: 'Failed to fetch trader state stats' }, { status: 500 });
    }

    const tradeStatsMap = createDemoTradeStatsMap(traderStateIds, tradeStatsRows);
      
    // Collect all mints
    const allMints = new Set<string>();
    traderStates?.forEach(ts => {
      const activePositions = normalizeDemoVaultPositions(ts.positions);
      activePositions.forEach((p) => {
        if (p.token_mint) allMints.add(p.token_mint);
      });
    });
    
    // Fetch prices only for active positions and use the same chunking path as the detail view.
    const prices = await fetchDemoVaultPriceMap(Array.from(allMints), {
      apiKey: JUPITER_API_KEY,
    });
    
    // Calculate totals per trader state using LIVE prices
    const tradersWithTotals = (traderStates || []).map(ts => {
      const positions = normalizeDemoVaultPositions(ts.positions);
      const { portfolioValue } = calculateDemoVaultPortfolioValue(positions, prices);

      return {
        ...ts,
        positions,
        totalValue: portfolioValue,
        positionCount: positions.length,
        tradeStats: tradeStatsMap[ts.id]
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

