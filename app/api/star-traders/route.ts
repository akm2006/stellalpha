import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: Fetch all star traders with complete stats
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userWallet = searchParams.get('userWallet'); // Optional: to check if user follows
    
    const { data: traders, error } = await supabase
      .from('star_traders')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    
    // Get 7D ago timestamp
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
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
    
    // Fetch stats for each trader
    const tradersWithStats = await Promise.all((traders || []).map(async (trader) => {
      // Get ALL trades for this trader with USD values
      const { data: allTrades } = await supabase
        .from('trades')
        .select('realized_pnl, block_timestamp, usd_value')
        .eq('wallet', trader.address);
      
      // Calculate total stats
      let totalPnl = 0;
      let pnl7d = 0;
      let wins = 0;
      let losses = 0;
      let totalVolume = 0; // Sum of all trade USD values
      let volume7d = 0;
      let totalGrossProfit = 0; // Sum of all winning trades
      let totalGrossLoss = 0; // Sum of all losing trades (absolute value)
      
      for (const trade of allTrades || []) {
        const tradeValue = Number(trade.usd_value) || 0;
        totalVolume += tradeValue;
        
        if (trade.realized_pnl !== null) {
          const pnl = Number(trade.realized_pnl);
          totalPnl += pnl;
          if (pnl > 0) {
            wins++;
            totalGrossProfit += pnl;
          } else if (pnl < 0) {
            losses++;
            totalGrossLoss += Math.abs(pnl); // Store as positive value
          }
          
          // 7D stats (block_timestamp is in seconds)
          const tradeTimestamp = Number(trade.block_timestamp) * 1000;
          if (tradeTimestamp >= sevenDaysAgo) {
            pnl7d += pnl;
            volume7d += tradeValue;
          }
        }
      }
      
      const totalWithPnl = wins + losses;
      const winRate = totalWithPnl > 0 ? Math.round((wins / totalWithPnl) * 100) : 0;
      
      // Get follower count and total allocated from demo_trader_states
      const { data: traderStates } = await supabase
        .from('demo_trader_states')
        .select('allocated_usd, realized_pnl_usd')
        .eq('star_trader', trader.address);
      
      const followerCount = traderStates?.length || 0;
      
      let totalAllocated = 0;
      for (const ts of traderStates || []) {
        totalAllocated += Number(ts.allocated_usd) || 0;
      }
      
      // Profit Factor Calculation
      // Profit Factor = Total Gross Profit / Total Gross Loss
      // This is the industry-standard "Gold Metric" for trading efficiency
      // It measures: For every $1 lost, how many $ were gained?
      let profitFactor = 0;
      const totalTrades = wins + losses;
      
      if (totalGrossLoss > 0) {
        profitFactor = totalGrossProfit / totalGrossLoss;
      } else if (totalGrossProfit > 0 && totalTrades > 0) {
        // If no losses but has profits, profit factor would be infinity
        // For traders with very few trades, cap it more reasonably based on trade count
        // This prevents 1-win traders from ranking at the top
        if (totalTrades < 5) {
          // For very few trades, cap profit factor based on trade count
          // 1 trade: max 2.0, 2 trades: max 3.0, 3 trades: max 4.0, 4 trades: max 5.0
          profitFactor = Math.min(1 + totalTrades, totalGrossProfit / 100); // Also consider actual profit amount
        } else if (totalTrades < 10) {
          // For 5-9 trades, cap at 10
          profitFactor = Math.min(10, totalGrossProfit / 50);
        } else {
          // For 10+ trades with no losses, cap at 50 (still very good but not infinite)
          profitFactor = Math.min(50, totalGrossProfit / 10);
        }
      }
      // Cap at reasonable values (0 to 50 for display)
      profitFactor = Math.max(0, Math.min(50, profitFactor));
      
      // 7D PnL percent - based on 7D volume or capped
      let pnl7dPercent = 0;
      if (volume7d > 0) {
        pnl7dPercent = (pnl7d / volume7d) * 100;
      } else if (totalAllocated > 0) {
        pnl7dPercent = (pnl7d / totalAllocated) * 100;
      }
      // Cap at reasonable values
      pnl7dPercent = Math.max(-100, Math.min(500, pnl7dPercent));
      
      return {
        wallet: trader.address,
        name: trader.name,
        image: trader.image_url,
        createdAt: trader.created_at,
        isFollowing: userFollowedTraders.has(trader.address),
        stats: {
          totalPnl,
          pnl7d,
          pnl7dPercent,
          winRate,
          wins,
          losses,
          tradesCount: allTrades?.length || 0,
          followerCount,
          totalAllocated,
          totalVolume,
          profitFactor
        }
      };
    }));
    
    // Sort by composite score: Profit Factor weighted by trade count and total profit
    // This prevents traders with few trades from ranking too high
    const tradersWithScores = tradersWithStats.map(trader => {
      const pf = trader.stats.profitFactor || 0;
      const trades = trader.stats.tradesCount || 0;
      const totalPnl = trader.stats.totalPnl || 0;
      
      // Composite score: Profit Factor * log(trade count + 1) * profit multiplier
      // This rewards consistent traders with more trades and actual profit
      const tradeWeight = Math.log10(trades + 1); // Log scale: 1 trade = 0.3, 10 trades = 1.0, 100 trades = 2.0
      const profitMultiplier = totalPnl > 0 ? Math.min(1 + (totalPnl / 1000), 2) : 0.5; // Bonus for actual profit
      
      // Only apply weights if trader has at least 3 trades, otherwise heavily penalize
      let compositeScore = 0;
      if (trades < 3) {
        compositeScore = pf * 0.1; // Heavy penalty for very few trades
      } else {
        compositeScore = pf * tradeWeight * profitMultiplier;
      }
      
      return { trader, compositeScore };
    });
    
    // Sort by composite score descending
    tradersWithScores.sort((a, b) => b.compositeScore - a.compositeScore);
    const sortedTraders = tradersWithScores.map(item => item.trader);
    
    return NextResponse.json({
      traders: sortedTraders,
      total: sortedTraders.length
    });
  } catch (error) {
    console.error('Error fetching star traders:', error);
    return NextResponse.json({ error: 'Failed to fetch traders' }, { status: 500 });
  }
}

// POST: Add a new star trader
export async function POST(request: Request) {
  try {
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
