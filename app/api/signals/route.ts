// In app/api/signals/route.ts
import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

interface Signal {
  id: string;
  type: string;
  action: string;
  starWallet: string;
  timestamp: string;
  txHash: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userWallet = searchParams.get('userWallet');

  if (!userWallet) {
    return NextResponse.json({ success: false, error: 'userWallet is required' }, { status: 400 });
  }

  try {
    const redisKey = `signals:${userWallet.toLowerCase()}`;
    const signalsJson = await redis.lrange(redisKey, 0, 49);

    if (signalsJson.length === 0) {
        return NextResponse.json({ success: true, signals: [] });
    }

    const signals: Signal[] = [];
    for (const item of signalsJson) {
        if (typeof item === 'string') {
            // If it's a string, try to parse it
            try {
                signals.push(JSON.parse(item));
            } catch (e) {
                console.warn(`[API/signals] Skipped invalid JSON string:`, item);
            }
        } else if (typeof item === 'object' && item !== null) {
            // If it's already an object, use it directly
            signals.push(item as Signal);
        }
    }
    
    console.log(`[API/signals] Successfully processed ${signals.length} valid signal(s).`);
    return NextResponse.json({ success: true, signals });

} catch (error) {
    console.error("[API/signals] Unexpected error during signal fetching:", error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
}
}