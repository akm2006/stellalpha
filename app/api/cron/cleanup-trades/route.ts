
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Set timeout to 60s for vercel

const DELETE_BATCH_SIZE = 500;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const isProduction = process.env.NODE_ENV === 'production';
    const cronSecret = process.env.CRON_SECRET;

    if (isProduction) {
      if (!cronSecret) {
        console.error('CRON_SECRET is required in production for cleanup route');
        return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
      }

      if (authHeader !== `Bearer ${cronSecret}`) {
        return new NextResponse('Unauthorized', { status: 401 });
      }
    }

    console.log('Starting scheduled trade cleanup...');

    const { data: traders, error: tradersError } = await supabase.from('star_traders').select('address');
     
    if (tradersError || !traders) {
      return NextResponse.json({ error: 'Failed to fetch traders' }, { status: 500 });
    }

    let totalDeleted = 0;
    const results = [];

    for (const trader of traders) {
      const { data: idsToDelete, error: idsError } = await supabase
        .from('trades')
        .select('id')
        .eq('wallet', trader.address)
        .order('block_timestamp', { ascending: false })
        .range(1000, 10000);

      if (idsError) {
        throw new Error(`Failed to fetch trade IDs for ${trader.address}: ${idsError.message}`);
      }

      if (idsToDelete && idsToDelete.length > 0) {
        const ids = idsToDelete.map(t => t.id);
        let deletedForWallet = 0;

        for (const idBatch of chunkArray(ids, DELETE_BATCH_SIZE)) {
          const { count: deleteCount, error } = await supabase
            .from('trades')
            .delete({ count: 'exact' })
            .in('id', idBatch);

          if (error) {
            throw new Error(`Failed to delete trades for ${trader.address}: ${error.message}`);
          }

          deletedForWallet += deleteCount || 0;
        }

        if (deletedForWallet > 0) {
          totalDeleted += deletedForWallet;
          results.push({ wallet: trader.address, deleted: deletedForWallet });
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
