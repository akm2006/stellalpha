import { NextResponse } from 'next/server';
import { cleanupLivePilotHistoryBatch } from '@/lib/live-pilot/retention';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function assertCronAuth(request: Request) {
  const isProduction = process.env.NODE_ENV === 'production';
  const cronSecret = process.env.CRON_SECRET;

  if (!isProduction) return null;
  if (!cronSecret) {
    console.error('CRON_SECRET is required in production for cleanup-live-pilot route');
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
  const retentionDays = positiveInt(searchParams.get('retentionDays'), 14);
  const batchSize = positiveInt(searchParams.get('batchSize'), 500);
  const dryRun = ['1', 'true', 'yes', 'on'].includes(
    (searchParams.get('dryRun') || '').trim().toLowerCase(),
  );

  try {
    const result = await cleanupLivePilotHistoryBatch({
      retentionDays,
      batchSize,
      dryRun,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Live-pilot cleanup failed:', error);
    return NextResponse.json({
      error: 'Failed to clean live-pilot history',
      message: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
