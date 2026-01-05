import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');
  const limit = parseInt(searchParams.get('limit') || '20');
  
  if (!wallet) {
    return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
  }
  
  try {
    // Fetch trades from Supabase
    const { data: trades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('wallet', wallet)
      .order('block_timestamp', { ascending: false })
      .limit(limit);
    
    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    
    // Transform to frontend format
    const formattedTrades = (trades || []).map(trade => ({
      signature: trade.signature,
      type: trade.type,
      tokenMint: trade.token_mint,
      tokenSymbol: trade.token_symbol || trade.token_mint?.slice(0, 6),
      tokenInMint: trade.token_in_mint,
      tokenInSymbol: trade.token_in_symbol || 'SOL',
      tokenInAmount: parseFloat(trade.token_in_amount) || 0,
      tokenOutMint: trade.token_out_mint,
      tokenOutSymbol: trade.token_out_symbol || 'SOL',
      tokenOutAmount: parseFloat(trade.token_out_amount) || 0,
      usdValue: parseFloat(trade.usd_value) || 0,
      timestamp: trade.block_timestamp,
      source: trade.source || 'UNKNOWN',
      gas: parseFloat(trade.gas) || 0,
      realizedPnl: trade.realized_pnl !== null ? parseFloat(trade.realized_pnl) : null,
      avgCostBasis: trade.avg_cost_basis !== null ? parseFloat(trade.avg_cost_basis) : null,
      latencyMs: trade.latency_ms
    }));
    
    return NextResponse.json({
      wallet,
      trades: formattedTrades,
      totalTrades: formattedTrades.length,
      source: 'database'
    });
  } catch (error) {
    console.error('Error fetching trades:', error);
    return NextResponse.json({ error: 'Failed to fetch trades' }, { status: 500 });
  }
}
