import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: Fetch trades for a specific trader state with pagination and stats
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');
  const starTrader = searchParams.get('starTrader');
  const traderStateId = searchParams.get('traderStateId');
  
  // Pagination params
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);
  const offset = (page - 1) * pageSize;
  
  if (!wallet) {
    return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
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
      const { data: traderState } = await supabase
        .from('demo_trader_states')
        .select('id')
        .eq('vault_id', vault.id)
        .eq('star_trader', starTrader)
        .single();
      
      if (!traderState) {
        return NextResponse.json({ 
          trades: [], 
          pagination: { page: 1, pageSize, totalCount: 0, totalPages: 0 },
          stats: { avgLatency: 0, totalRealizedPnl: 0, completedCount: 0, failedCount: 0 }
        });
      }
      tsId = traderState.id;
    }
    
    if (!tsId) {
      // No specific trader state - return empty with proper structure
      return NextResponse.json({ 
        trades: [], 
        pagination: { page: 1, pageSize, totalCount: 0, totalPages: 0 },
        stats: { avgLatency: 0, totalRealizedPnl: 0, completedCount: 0, failedCount: 0 }
      });
    }
    
    // Get total count for pagination
    const { count: totalCount } = await supabase
      .from('demo_trades')
      .select('*', { count: 'exact', head: true })
      .eq('trader_state_id', tsId);
    
    // Get aggregate stats from ALL completed trades
    const { data: allTrades } = await supabase
      .from('demo_trades')
      .select('status, latency_diff_ms, realized_pnl')
      .eq('trader_state_id', tsId);
    
    const completedTrades = (allTrades || []).filter(t => t.status === 'completed');
    const failedTrades = (allTrades || []).filter(t => t.status === 'failed');
    
    // Win Rate Calculation: Only count SELLS that have realized PnL
    // Profitable = PnL > 0
    const profitableTrades = completedTrades.filter(t => (t.realized_pnl || 0) > 0);
    const lossTrades = completedTrades.filter(t => (t.realized_pnl || 0) < 0);
    
    const totalLatency = completedTrades.reduce((sum, t) => sum + (t.latency_diff_ms || 0), 0);
    const avgLatency = completedTrades.length > 0 ? totalLatency / completedTrades.length : 0;
    const totalRealizedPnl = completedTrades.reduce((sum, t) => sum + (t.realized_pnl || 0), 0);
    
    // Get paginated trades for display
    const { data: trades, error } = await supabase
      .from('demo_trades')
      .select('*')
      .eq('trader_state_id', tsId)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);
    
    if (error) {
      console.error('Trades fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
    }
    
    const total = totalCount || 0;
    const totalPages = Math.ceil(total / pageSize);
    
    return NextResponse.json({ 
      trades: trades || [],
      pagination: {
        page,
        pageSize,
        totalCount: total,
        totalPages
      },
      stats: {
        avgLatency: Math.round(avgLatency),
        totalRealizedPnl,
        completedCount: completedTrades.length,
        failedCount: failedTrades.length,
        profitableCount: profitableTrades.length,
        lossCount: lossTrades.length,
        profitFactor: (() => {
          let totalProfit = 0;
          let totalLoss = 0;
          completedTrades.forEach(t => {
            const pnl = t.realized_pnl || 0;
            if (pnl > 0) totalProfit += pnl;
            else if (pnl < 0) totalLoss += Math.abs(pnl);
          });
          return totalLoss > 0 ? (totalProfit / totalLoss) : (totalProfit > 0 ? 999 : 0);
        })()
      }
    });
    
  } catch (error) {
    console.error('Demo trades fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
  }
}
