import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import {
  createStarTraderStatsMap,
  getStarTraderFallbackImage,
  getStarTraderFallbackName,
  sortStarTradersByCompositeScore,
} from '@/lib/star-trader-stats';

// GET: Fetch all star traders with complete stats
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userWallet = searchParams.get('userWallet'); // Optional: to check if user follows
    
    const { data: traders, error } = await supabase
      .from('star_traders')
      .select('address, name, image_url, created_at')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    const traderWallets = (traders || []).map((trader) => trader.address);
    
    // Get user's followed traders if wallet provided
    let userFollowedTraders: Set<string> = new Set();
    if (userWallet) {
      const { data: userVault } = await supabase
        .from('demo_vaults')
        .select('id')
        .eq('user_wallet', userWallet)
        .single();
      
      if (userVault) {
        const { data: userTraderStates } = await supabase
          .from('demo_trader_states')
          .select('star_trader')
          .eq('vault_id', userVault.id);
        
        userFollowedTraders = new Set((userTraderStates || []).map(ts => ts.star_trader));
      }
    }

    const { data: statsRows, error: statsError } = traderWallets.length > 0
      ? await supabase.rpc('get_star_trader_stats', { p_wallets: traderWallets })
      : { data: [], error: null };

    if (statsError) {
      console.error('Star trader stats error:', statsError);
      return NextResponse.json({ error: 'Failed to fetch trader stats' }, { status: 500 });
    }

    const statsMap = createStarTraderStatsMap(traderWallets, statsRows);

    const sortedTraders = sortStarTradersByCompositeScore(
      (traders || []).map((trader) => ({
        wallet: trader.address,
        name: trader.name || getStarTraderFallbackName(trader.address),
        image: trader.image_url || getStarTraderFallbackImage(trader.address),
        createdAt: trader.created_at,
        isFollowing: userFollowedTraders.has(trader.address),
        stats: statsMap[trader.address],
      }))
    );

    const response = NextResponse.json({
      traders: sortedTraders,
      total: sortedTraders.length
    });

    response.headers.set(
      'Cache-Control',
      userWallet
        ? 'private, no-store'
        : 'public, max-age=0, s-maxage=30, stale-while-revalidate=120'
    );

    return response;
  } catch (error) {
    console.error('Error fetching star traders:', error);
    return NextResponse.json({ error: 'Failed to fetch traders' }, { status: 500 });
  }
}

// POST: Add a new star trader
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user?.wallet) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { wallet, name } = await request.json();
    
    if (!wallet) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
    }
    
    const traderName = name || `Trader ${wallet.slice(0, 6)}`;
    
    const { data, error } = await supabase
      .from('star_traders')
      .upsert({
        address: wallet,
        name: traderName,
        created_at: new Date().toISOString()
      }, { onConflict: 'address' })
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
