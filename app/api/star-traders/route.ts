import { NextRequest, NextResponse } from 'next/server';
import { formatCopyBuyModelConfigSummary, formatCopyBuyModelLabel } from '@/lib/copy-models/format';
import { supabase } from '@/lib/supabase';
import {
  createStarTraderStatsMap,
  sortStarTradersByCompositeScore,
} from '@/lib/star-trader-stats';
import {
  listStarTraderRecords,
  resolveUserRecommendationFromRecord,
  resolveStarTraderDisplayName,
  resolveStarTraderImage,
} from '@/lib/star-trader-management/repository';

// GET: Fetch all star traders with complete stats
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userWallet = searchParams.get('userWallet'); // Optional: to check if user follows
    const { records: traders } = await listStarTraderRecords();
    const traderWallets = traders.map((trader) => trader.address);
    
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
      traders.map((trader) => ({
        recommendation: resolveUserRecommendationFromRecord(trader),
        wallet: trader.address,
        name: resolveStarTraderDisplayName(trader),
        image: resolveStarTraderImage(trader),
        createdAt: trader.created_at,
        isFollowing: userFollowedTraders.has(trader.address),
        stats: statsMap[trader.address],
      }))
    );

    const response = NextResponse.json({
      traders: sortedTraders.map((trader) => {
        const { recommendation, ...traderWithoutRecommendation } = trader;

        return {
          ...traderWithoutRecommendation,
          recommendedCopyModelKey: recommendation.modelKey,
          recommendedCopyModelConfig: recommendation.config,
          recommendedCopyModelReason: recommendation.reason,
          recommendedCopyModelLabel: formatCopyBuyModelLabel(recommendation.modelKey),
          recommendedCopyModelSummary: formatCopyBuyModelConfigSummary(
            recommendation.modelKey,
            recommendation.config,
          ),
        };
      }),
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
