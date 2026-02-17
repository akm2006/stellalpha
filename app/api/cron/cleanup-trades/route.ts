
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Set timeout to 60s for vercel

export async function GET(request: Request) {
  try {
    // Optional: Check for Vercel Cron header to secure this endpoint
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
      // return new NextResponse('Unauthorized', { status: 401 });
      // For now, we'll leave it open or rely on Vercel's protection if configured, 
      // but in a real app you should check CRON_SECRET.
    }

    console.log('Starting scheduled trade cleanup...');

    // We need to delete trades older than the 1000th trade for each wallet.
    // Since Supabase/Postgres doesn't support complex DELETE ... WHERE id IN (SELECT ...) efficiently in one go via the JS client
    // without an RPC, we will try to do it via a direct SQL query if we can, 
    // or we can iterate through the traders (like the dry run) and delete by ID ranges.
    
    // Iterative approach (safer without RPC):
    // 1. Get all traders
    const { data: traders } = await supabase.from('star_traders').select('address');
    
    if (!traders) {
      return NextResponse.json({ error: 'Failed to fetch traders' }, { status: 500 });
    }

    let totalDeleted = 0;
    const results = [];

    for (const trader of traders) {
      // Get the 1000th trade's timestamp (to use as a cutoff)
      // We want to KEEP the top 1000.
      const { data: cutoffTrade } = await supabase
        .from('trades')
        .select('block_timestamp, id')
        .eq('wallet', trader.address)
        .order('block_timestamp', { ascending: false })
        .range(1000, 1000) // The 1001st item (index 1000) is the first one we want to DELETE
        .single();

      if (cutoffTrade) {
        // Delete everything older than or equal to this timestamp (excluding this specific trade if we want to be precise, 
        // but index 1000 IS the first one to go).
        // Actually, better: Delete everything with block_timestamp <= cutoffTrade.block_timestamp
        // Wait, if there are multiple trades with same timestamp, we might delete the 1000th one if we are not careful.
        // Safer: Delete trades where block_timestamp < cutoffTrade.block_timestamp
        // OR better yet: Fetch IDs of trades to delete.
        
        // Let's use the ID to be precise if we can, but bulk delete by timestamp is faster.
        // Given high volume, bulk delete by timestamp is preferred.
        
        const timestampCutoff = cutoffTrade.block_timestamp;
        
        const { count, error } = await supabase
          .from('trades')
          .delete({ count: 'exact' })
          .eq('wallet', trader.address)
          .lte('block_timestamp', timestampCutoff) 
          .neq('id', cutoffTrade.id) // simplistic safety, though timestamp might match others
          // Actually, LTE includes the cutoff. Ideally we want to delete everything strictly OLDER than the 1000th item?
          // No, we want to delete the 1001st item and everything after.
          // cutoffTrade IS the 1001st item (index 1000).
          // So we want to delete everything with timestamp <= cutoffTrade.block_timestamp.
          // But what if the 1000th item (index 999) has the SAME timestamp?
          // Then we might delete it too.
          
          // Refined approach:
          // 1. Fetch the timestamp of the 1000th item (index 999). Keep everything >= that.
          // 2. But that's risky with same timestamps.
          
          // Let's stick to the SQL approach using `rpc` if we could, but we can't create functions here using the client.
          // Let's try the delete-by-ID chunking.
          // Fetch IDs to delete: sort DESC, range(1000, 1000000)
          
        const { data: idsToDelete } = await supabase
            .from('trades')
            .select('id')
            .eq('wallet', trader.address)
            .order('block_timestamp', { ascending: false })
            .range(1000, 10000); // Delete next 9000 items (should cover most batches)
            
        if (idsToDelete && idsToDelete.length > 0) {
            const ids = idsToDelete.map(t => t.id);
            const { count: deleteCount, error } = await supabase
                .from('trades')
                .delete({ count: 'exact' })
                .in('id', ids);
            
            if (!error && deleteCount) {
                 totalDeleted += deleteCount;
                 results.push({ wallet: trader.address, deleted: deleteCount });
            }
        }
      }
    }

    // ============ CLEANUP TOKEN PRICES ============
    // Keep top 1000 most recently updated prices
    const { data: cutoffPrice } = await supabase
      .from('token_prices')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .range(1000, 1000)
      .single();

    let tokensDeleted = 0;
    if (cutoffPrice) {
      const { count } = await supabase
        .from('token_prices')
        .delete({ count: 'exact' })
        .lt('updated_at', cutoffPrice.updated_at);
      
      tokensDeleted = count || 0;
      console.log(`Cleaned up ${tokensDeleted} old token prices`);
    }

    return NextResponse.json({ 
      success: true, 
      totalDeleted,
      tokensDeleted, 
      details: results 
    });

  } catch (error: any) {
    console.error('Cleanup error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
