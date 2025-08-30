// In app/api/followed-stars/route.ts

import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const redis = Redis.fromEnv();

export async function POST(request: Request) {
  try {
    const { userSmartAccount } = await request.json();

    if (!userSmartAccount) {
      return NextResponse.json({ error: 'Missing userSmartAccount' }, { status: 400 });
    }

    console.log(`--- DATABASE READ for user: ${userSmartAccount} ---`);
    
    const allStarKeys = await redis.keys('follows:*');
    const followedWallets: string[] = [];

    for (const key of allStarKeys) {
        const isMember = await redis.sismember(key, userSmartAccount);
        if (isMember) {
            followedWallets.push(key.split(':')[1]);
        }
    }

    // --- LOG 2: Confirm what was read from the database ---
    console.log(`✅ DATABASE READ CONFIRMED. Found followed wallets:`, followedWallets);

    return NextResponse.json({ success: true, followedWallets });

  } catch (error) {
    console.error("Error in /api/followed-stars:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}