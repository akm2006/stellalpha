import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DEFAULT_BATCH_SIZE = 500;

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function intervalDays(value: string | null, fallbackDays: number) {
  const parsed = Number(value);
  const days = Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackDays;
  return `${days} days`;
}

function assertCronAuth(request: Request) {
  const isProduction = process.env.NODE_ENV === 'production';
  const cronSecret = process.env.CRON_SECRET;

  if (!isProduction) return null;
  if (!cronSecret) {
    console.error('CRON_SECRET is required in production for cleanup-demo-vault route');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  return null;
}

export async function GET(request: Request) {
  const authError = assertCronAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const tradeRetention = intervalDays(searchParams.get('tradeRetentionDays'), 7);
  const debugRetention = intervalDays(searchParams.get('debugRetentionDays'), 2);
  const batchSize = positiveInt(searchParams.get('batchSize'), DEFAULT_BATCH_SIZE);
  const keepTradesPerState = positiveInt(searchParams.get('keepTradesPerState'), 100);

  const { data, error } = await supabase.rpc('cleanup_demo_vault_storage_batch', {
    p_trade_retention: tradeRetention,
    p_debug_retention: debugRetention,
    p_batch_size: batchSize,
    p_keep_per_state: keepTradesPerState,
  });

  if (error) {
    console.error('Demo vault storage cleanup failed:', error);
    return NextResponse.json({ error: 'Failed to clean demo vault storage' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    retention: {
      trades: tradeRetention,
      debugPayloads: debugRetention,
      batchSize,
      keepTradesPerState,
    },
    result: data,
  });
}
