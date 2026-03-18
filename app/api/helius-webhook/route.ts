import { NextRequest, NextResponse } from 'next/server';
import { PerformanceTimer } from '@/lib/utils/perf-timer';
import { processBatch } from '@/lib/ingestion/orchestrator';
import { normalizeWebhookPayload } from '@/lib/ingestion/webhook-adapter';

const HELIUS_WEBHOOK_SECRET = process.env.HELIUS_WEBHOOK_SECRET;
export async function POST(request: NextRequest) {
  const receivedAt = Date.now();
  const webhookTimer = new PerformanceTimer('WEBHOOK HANDLER');

  // Verify auth header - REJECT if invalid
  const authHeader = request.headers.get('authorization');
  if (!HELIUS_WEBHOOK_SECRET) {
    console.error('HELIUS_WEBHOOK_SECRET not configured!');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  if (authHeader !== HELIUS_WEBHOOK_SECRET) {
    console.warn('Webhook auth failed - rejecting request. Header:', authHeader?.slice(0, 10) + '...');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  webhookTimer.checkpoint('Auth verification');

  try {
    const body = await request.json();
    const transactions = Array.isArray(body) ? body : [body];

    webhookTimer.checkpoint('Parse request body');

    console.log(`Received ${transactions.length} transaction(s) from webhook`);

    // Track Helius delay stats
    let totalHeliusDelay = 0;
    let heliusDelayCount = 0;

    // Log individual Helius delays
    for (const tx of transactions) {
      if (tx.timestamp && tx.signature) {
        const heliusDelay = receivedAt - (tx.timestamp * 1000);
        totalHeliusDelay += heliusDelay;
        heliusDelayCount++;
        console.log(`[HELIUS] TX(${tx.signature.slice(0, 8)}...): ${heliusDelay}ms delay (on-chain: ${new Date(tx.timestamp * 1000).toISOString()})`);
      }
    }

    // Log aggregate Helius delay stats
    if (heliusDelayCount > 0) {
      const avgHeliusDelay = Math.round(totalHeliusDelay / heliusDelayCount);
      console.log(`[HELIUS] Average delay: ${avgHeliusDelay}ms across ${heliusDelayCount} transaction(s)`);
    }

    const normalizedBatch = normalizeWebhookPayload(transactions);
    const { processed, inserted } = await processBatch(normalizedBatch, receivedAt);

    webhookTimer.finish('WEBHOOK COMPLETE');

    return NextResponse.json({
      ok: true,
      processed,
      inserted,
      receivedAt: new Date(receivedAt).toISOString()
    });
  } catch (error) {
    console.error('Webhook error:', error);
    // Always return 200 to prevent Helius retries
    return NextResponse.json({ ok: true, error: 'Processing failed' });
  }
}

// For testing - GET returns info about the endpoint
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/helius-webhook',
    method: 'POST',
    description: 'Helius webhook receiver for trade tracking',
    authHeader: 'Authorization header required',
    testPayload: {
      signature: 'test-sig-123',
      feePayer: '2ySF5KLP8WQW1FLVTY5xZEnoJgM6xMpZnhFtoXjadYar',
      timestamp: Math.floor(Date.now() / 1000),
      tokenTransfers: [],
      accountData: []
    }
  });
}
