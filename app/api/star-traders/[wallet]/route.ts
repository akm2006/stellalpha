import { NextRequest, NextResponse } from 'next/server';
import { formatCopyBuyModelConfigSummary, formatCopyBuyModelLabel } from '@/lib/copy-models/format';
import { getCopyModelRecommendationForTrader } from '@/lib/copy-models/recommendations';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import {
  getStarTraderFallbackImage,
  getStarTraderFallbackName,
  normalizeStarTraderStatsRow,
} from '@/lib/star-trader-stats';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ wallet: string }> }
) {
  try {
    const { wallet } = await context.params;
    const session = await getSession();
    const userWallet = session.isLoggedIn ? session.user?.wallet : null;

    const { data: trader, error: traderError } = await supabase
      .from('star_traders')
      .select('address, name, image_url, created_at')
      .eq('address', wallet)
      .single();

    if (traderError || !trader) {
      return NextResponse.json({ error: 'Trader not found' }, { status: 404 });
    }

    const { data: statsRows, error: statsError } = await supabase.rpc('get_star_trader_stats', {
      p_wallets: [wallet],
    });

    if (statsError) {
      console.error('Star trader summary stats error:', statsError);
      return NextResponse.json({ error: 'Failed to fetch trader stats' }, { status: 500 });
    }

    let isFollowing = false;
    if (userWallet) {
      const { data: userVault } = await supabase
        .from('demo_vaults')
        .select('id')
        .eq('user_wallet', userWallet)
        .single();

      if (userVault?.id) {
        const { count } = await supabase
          .from('demo_trader_states')
          .select('id', { head: true, count: 'exact' })
          .eq('vault_id', userVault.id)
          .eq('star_trader', wallet);

        isFollowing = Boolean((count || 0) > 0);
      }
    }
    const stats = normalizeStarTraderStatsRow(statsRows?.[0]);
    const recommendation = getCopyModelRecommendationForTrader(wallet);

    return NextResponse.json({
      trader: {
        wallet: trader.address,
        name: trader.name || getStarTraderFallbackName(trader.address),
        image: trader.image_url || getStarTraderFallbackImage(trader.address),
        createdAt: trader.created_at,
        isFollowing,
        stats,
        recommendedCopyModelKey: recommendation.modelKey,
        recommendedCopyModelConfig: recommendation.config,
        recommendedCopyModelReason: recommendation.reason,
        recommendedCopyModelLabel: formatCopyBuyModelLabel(recommendation.modelKey),
        recommendedCopyModelSummary: formatCopyBuyModelConfigSummary(
          recommendation.modelKey,
          recommendation.config,
        ),
      },
    });
  } catch (error) {
    console.error('Error fetching star trader summary:', error);
    return NextResponse.json({ error: 'Failed to fetch trader summary' }, { status: 500 });
  }
}
