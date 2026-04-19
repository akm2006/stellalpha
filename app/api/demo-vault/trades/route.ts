import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { emptyDemoTradeStats, normalizeDemoTradeStatsRow } from '@/lib/demo-trade-stats';
import { getSession } from '@/lib/session';

// GET: Fetch trades for a specific trader state with pagination and stats
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.user?.wallet) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedWallet = searchParams.get('wallet');
  const wallet = session.user.wallet;
  const starTrader = searchParams.get('starTrader');
  const traderStateId = searchParams.get('traderStateId');
  
  // Pagination params
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
  const cursor = searchParams.get('cursor'); // Format: "timestamp,id"
  const includeSummary = searchParams.get('includeSummary') !== '0';
  const offset = (page - 1) * pageSize;
  
  if (requestedWallet && requestedWallet !== wallet) {
    return NextResponse.json({ error: 'Forbidden: wallet does not match authenticated user' }, { status: 403 });
  }
  
  try {
    // Get vault
    const { data: vault, error: vaultError } = await supabase
      .from('demo_vaults')
      .select('id')
      .eq('user_wallet', wallet)
      .single();
    
    if (vaultError || !vault) {
      return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
    }
    
    // Determine trader state ID
    let tsId = traderStateId;
    
    if (!tsId && starTrader) {
      const { data: traderStates } = await supabase
        .from('demo_trader_states')
        .select('id')
        .eq('vault_id', vault.id)
        .eq('star_trader', starTrader);
      
      if (!traderStates || traderStates.length === 0) {
        return NextResponse.json({ 
          trades: [], 
          pagination: { page: 1, pageSize, totalCount: 0, totalPages: 0 },
          stats: { avgLatency: 0, totalRealizedPnl: 0, completedCount: 0, failedCount: 0 }
        });
      }
      if (traderStates.length > 1) {
        return NextResponse.json({ error: 'Multiple trader states found for this star trader. Use traderStateId.' }, { status: 400 });
      }
      tsId = traderStates[0].id;
    }
    
    if (!tsId) {
      // No specific trader state - return empty with proper structure
      return NextResponse.json({ 
        trades: [], 
        pagination: { page: 1, pageSize, totalCount: 0, totalPages: 0 },
        stats: { avgLatency: 0, totalRealizedPnl: 0, completedCount: 0, failedCount: 0 }
      });
    }
    
    let stats = emptyDemoTradeStats();
    if (includeSummary) {
      const { data: statsRows, error: statsError } = await supabase.rpc('get_demo_trade_stats', {
        p_trader_state_ids: [tsId],
      });

      if (statsError) {
        console.error('Trades summary fetch error:', statsError);
        return NextResponse.json({ error: 'Failed to fetch trade summary' }, { status: 500 });
      }

      stats = normalizeDemoTradeStatsRow(statsRows?.[0]);
    }
    
    // Get paginated trades for display
    let query = supabase
      .from('demo_trades')
      .select(`
        id,
        type,
        token_in_mint,
        token_in_symbol,
        token_in_amount,
        token_out_mint,
        token_out_symbol,
        token_out_amount,
        usd_value,
        realized_pnl,
        latency_diff_ms,
        star_trade_signature,
        created_at,
        status,
        error_message,
        leader_in_amount,
        leader_out_amount,
        leader_usd_value
      `)
      .eq('trader_state_id', tsId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }) // Secondary sort for stable pagination
      .limit(pageSize);

    if (cursor) {
      const [cursorTime, cursorId] = cursor.split(',');
      if (cursorTime && cursorId) {
        // Filter: created_at < cursorTime OR (created_at = cursorTime AND id < cursorId)
        // usage of 'or' syntax in supabase:
        // .or(`created_at.lt.${cursorTime},and(created_at.eq.${cursorTime},id.lt.${cursorId})`)
        query = query.or(`created_at.lt.${cursorTime},and(created_at.eq.${cursorTime},id.lt.${cursorId})`);
      }
    } else {
        // Fallback to offset if NO cursor is provided (legacy/page support)
        // If cursor IS provided, we ignore offset to ensure correctness
        if (offset > 0) {
             query = query.range(offset, offset + pageSize - 1);
        }
    }

    const { data: trades, error } = await query;
    
    if (error) {
      console.error('Trades fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
    }
    
    // Calculate next cursor
    let nextCursor = null;
    if (trades && trades.length === pageSize) {
      const lastTrade = trades[trades.length - 1];
      nextCursor = `${lastTrade.created_at},${lastTrade.id}`;
    }
    
    const total = includeSummary ? stats.totalCount : null;
    const totalPages = typeof total === 'number' ? Math.ceil(total / pageSize) : null;
    
    return NextResponse.json({ 
      trades: trades || [],
      pagination: {
        page,
        pageSize,
        totalCount: total,
        totalPages,
        nextCursor
      },
      stats: includeSummary ? stats : null
    });
    
  } catch (error) {
    console.error('Demo trades fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
  }
}
