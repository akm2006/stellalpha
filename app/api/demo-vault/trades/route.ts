import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: Fetch trades for a specific trader state
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');
  const starTrader = searchParams.get('starTrader');
  const traderStateId = searchParams.get('traderStateId');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  
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
    
    // If traderStateId provided, use it directly
    if (traderStateId) {
      const { data: trades, error } = await supabase
        .from('demo_trades')
        .select('*')
        .eq('trader_state_id', traderStateId)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) {
        console.error('Trades fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
      }
      
      return NextResponse.json({ trades: trades || [], total: trades?.length || 0 });
    }
    
    // Otherwise, find by star trader
    if (starTrader) {
      // Find trader state for this star trader
      const { data: traderState } = await supabase
        .from('demo_trader_states')
        .select('id')
        .eq('vault_id', vault.id)
        .eq('star_trader', starTrader)
        .single();
      
      if (!traderState) {
        return NextResponse.json({ trades: [], total: 0 });
      }
      
      const { data: trades, error } = await supabase
        .from('demo_trades')
        .select('*')
        .eq('trader_state_id', traderState.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) {
        console.error('Trades fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
      }
      
      return NextResponse.json({ trades: trades || [], total: trades?.length || 0 });
    }
    
    // If no filter, get all trades for all trader states in this vault
    const { data: traderStates } = await supabase
      .from('demo_trader_states')
      .select('id, star_trader')
      .eq('vault_id', vault.id);
    
    if (!traderStates || traderStates.length === 0) {
      return NextResponse.json({ trades: [], total: 0 });
    }
    
    const tsIds = traderStates.map(ts => ts.id);
    const tsMap = Object.fromEntries(traderStates.map(ts => [ts.id, ts.star_trader]));
    
    const { data: trades, error } = await supabase
      .from('demo_trades')
      .select('*')
      .in('trader_state_id', tsIds)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Trades fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
    }
    
    // Add star_trader to each trade for display
    const tradesWithTrader = (trades || []).map(trade => ({
      ...trade,
      star_trader: tsMap[trade.trader_state_id] || null
    }));
    
    return NextResponse.json({ trades: tradesWithTrader, total: tradesWithTrader.length });
  } catch (error) {
    console.error('Demo trades fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
  }
}
