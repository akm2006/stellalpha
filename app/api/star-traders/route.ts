import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: Fetch all star traders
export async function GET() {
  try {
    const { data: traders, error } = await supabase
      .from('star_traders')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    
    // Fetch stats for each trader
    const tradersWithStats = await Promise.all((traders || []).map(async (trader) => {
      // Get trade stats - use trader.address (column name in star_traders table)
      const { data: trades } = await supabase
        .from('trades')
        .select('realized_pnl')
        .eq('wallet', trader.address);  // trades table uses 'wallet' column
      
      let totalPnl = 0;
      let wins = 0;
      let losses = 0;
      
      for (const trade of trades || []) {
        if (trade.realized_pnl !== null) {
          totalPnl += trade.realized_pnl;
          if (trade.realized_pnl > 0) wins++;
          else if (trade.realized_pnl < 0) losses++;
        }
      }
      
      const totalWithPnl = wins + losses;
      const winRate = totalWithPnl > 0 ? Math.round((wins / totalWithPnl) * 100) : 0;
      
      return {
        wallet: trader.address,  // Map address to wallet for frontend consistency
        name: trader.name,
        createdAt: trader.created_at,
        stats: {
          totalPnl,
          winRate,
          wins,
          losses,
          tradesCount: trades?.length || 0
        }
      };
    }));
    
    return NextResponse.json({
      traders: tradersWithStats,
      total: tradersWithStats.length
    });
  } catch (error) {
    console.error('Error fetching star traders:', error);
    return NextResponse.json({ error: 'Failed to fetch traders' }, { status: 500 });
  }
}

// POST: Add a new star trader
export async function POST(request: NextRequest) {
  try {
    const { wallet, name } = await request.json();
    
    if (!wallet) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
    }
    
    const traderName = name || `Trader ${wallet.slice(0, 6)}`;
    
    const { data, error } = await supabase
      .from('star_traders')
      .upsert({
        address: wallet,  // Use 'address' column name
        name: traderName,
        created_at: new Date().toISOString()
      }, { onConflict: 'address' })  // Use 'address' for conflict
      .select()
      .single();
    
    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      trader: data
    });
  } catch (error) {
    console.error('Error adding star trader:', error);
    return NextResponse.json({ error: 'Failed to add trader' }, { status: 500 });
  }
}
