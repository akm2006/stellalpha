import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');
  
  if (!wallet) {
    return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
  }
  
  try {
    // Fetch positions from Supabase
    const { data: positions, error } = await supabase
      .from('positions')
      .select('*')
      .eq('wallet', wallet)
      .gt('size', 0)  // Only show positions with holdings
      .order('cost_usd', { ascending: false });
    
    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    
    // Transform to frontend format
    const formattedPositions = (positions || []).map(pos => ({
      tokenMint: pos.token_mint,
      size: parseFloat(pos.size) || 0,
      costUsd: parseFloat(pos.cost_usd) || 0,
      avgCost: parseFloat(pos.avg_cost) || 0,
      updatedAt: pos.updated_at
    }));
    
    return NextResponse.json({
      wallet,
      positions: formattedPositions,
      totalPositions: formattedPositions.length
    });
  } catch (error) {
    console.error('Error fetching positions:', error);
    return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 });
  }
}
