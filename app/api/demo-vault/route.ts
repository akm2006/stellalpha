import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createDemoTradeStatsMap } from '@/lib/demo-trade-stats';
import {
  calculateDemoVaultPortfolioValue,
  fetchDemoVaultPriceMap,
  normalizeDemoVaultPositions,
} from '@/lib/demo-vault-pricing';
import { getSession } from '@/lib/session';

type PositionSummary = {
  trader_state_id: string;
  position_count: number | string | null;
  cost_basis_usd: number | string | null;
};

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

    const { data, error } = await supabase.rpc('delete_demo_vault_by_wallet', {
      p_wallet: wallet,
    });

    if (error) {
      console.error('Demo vault delete RPC error:', error);
      return NextResponse.json({ error: 'Failed to delete vault' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      ...(data && typeof data === 'object' ? data : { deleted: Boolean(data) }),
    });
  } catch (error) {
    console.error('Demo vault delete error:', error);
    return NextResponse.json({ error: 'Failed to delete vault' }, { status: 500 });
  }
}

// GET: Fetch user's demo vault with trader states
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.user?.wallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedWallet = searchParams.get('wallet');
  const includeLivePrices = searchParams.get('includeLivePrices') !== '0';
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
    
    // Fetch trader states without embedding positions. The dashboard needs
    // summary values only; raw positions belong on the detail page.
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
        is_settled
      `)
      .eq('vault_id', vault.id);

    const traderStateIds = (traderStates || []).map((state) => state.id);
    let tradeStatsMap = createDemoTradeStatsMap(traderStateIds, []);
    const positionSummaryMap = new Map<string, { positionCount: number; costBasisUsd: number }>();

    if (traderStateIds.length > 0) {
      const [tradeStatsResult, positionSummaryResult] = await Promise.all([
        supabase.rpc('get_demo_trade_stats', {
          p_trader_state_ids: traderStateIds,
        }),
        supabase.rpc('get_demo_position_summaries', {
          p_trader_state_ids: traderStateIds,
        }),
      ]);

      const { data: tradeStatsRows, error: tradeStatsError } = tradeStatsResult;

      if (tradeStatsError) {
        console.warn('Demo vault stats fetch failed; continuing without aggregate stats:', tradeStatsError);
      } else {
        tradeStatsMap = createDemoTradeStatsMap(traderStateIds, tradeStatsRows);
      }

      const { data: positionSummaryRows, error: positionSummaryError } = positionSummaryResult;
      if (positionSummaryError) {
        console.warn('Demo vault position summary fetch failed; using zero position summaries:', positionSummaryError);
      } else {
        for (const row of (positionSummaryRows || []) as PositionSummary[]) {
          positionSummaryMap.set(row.trader_state_id, {
            positionCount: Number(row.position_count || 0),
            costBasisUsd: Number(row.cost_basis_usd || 0),
          });
        }
      }
    }
      
    // Live pricing is intentionally opt-in. It requires raw position rows and
    // should not be used by the main dashboard load path.
    const livePositionsByState = new Map<string, any[]>();
    if (includeLivePrices) {
      const { data: livePositions, error: livePositionsError } = await supabase
        .from('demo_positions')
        .select('trader_state_id, token_mint, token_symbol, size, cost_usd')
        .in('trader_state_id', traderStateIds)
        .gt('size', 0);

      if (livePositionsError) {
        console.warn('Demo vault live position fetch failed; falling back to cost basis:', livePositionsError);
      } else {
        for (const position of livePositions || []) {
          const list = livePositionsByState.get(position.trader_state_id) || [];
          list.push(position);
          livePositionsByState.set(position.trader_state_id, list);
        }
      }
    }
    
    const allMints = new Set<string>();
    for (const positions of livePositionsByState.values()) {
      normalizeDemoVaultPositions(positions).forEach((position) => {
        if (position.token_mint) allMints.add(position.token_mint);
      });
    }

    const prices = includeLivePrices
      ? await fetchDemoVaultPriceMap(Array.from(allMints))
      : new Map();
    
    const tradersWithTotals = (traderStates || []).map(ts => {
      const summary = positionSummaryMap.get(ts.id) || { positionCount: 0, costBasisUsd: 0 };
      const livePositions = normalizeDemoVaultPositions(livePositionsByState.get(ts.id));
      const { portfolioValue } = includeLivePrices && livePositions.length > 0
        ? calculateDemoVaultPortfolioValue(livePositions, prices)
        : { portfolioValue: summary.costBasisUsd };

      return {
        ...ts,
        positions: includeLivePrices ? livePositions : [],
        totalValue: portfolioValue,
        positionCount: includeLivePrices ? livePositions.length : summary.positionCount,
        tradeStats: tradeStatsMap[ts.id],
        valuationMode: includeLivePrices ? 'live' : 'cost_basis',
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

