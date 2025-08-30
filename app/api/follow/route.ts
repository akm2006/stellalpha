// In app/api/follow/route.ts

import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const redis = Redis.fromEnv();

export async function POST(request: Request) {
  try {
    const { userWallet, targetWallet } = await request.json();

    if (!userWallet || !targetWallet) {
      return NextResponse.json({ error: 'Missing userWallet or targetWallet' }, { status: 400 });
    }

    const key = `follows:${targetWallet}`;
    
    // 1. WRITE to the database
    await redis.sadd(key, userWallet);
    console.log(`✅ DATABASE WRITE: Added ${userWallet} to the followers of ${targetWallet}`);

    // --- NEW LOG: Read and log all stars the user is now following ---
    console.log(`--- Verifying all followed stars for user ${userWallet}... ---`);
    
    const allStarKeys = await redis.keys('follows:*');
    const followedWallets: string[] = [];

    for (const starKey of allStarKeys) {
        const isMember = await redis.sismember(starKey, userWallet);
        if (isMember) {
            followedWallets.push(starKey.split(':')[1]);
        }
    }

    console.log(`✅ DATABASE READ CONFIRMED. User ${userWallet} is now following:`, followedWallets);
    console.log(`   (Total: ${followedWallets.length} star(s))`);
    console.log(`--- Verification Complete ---`);


    return NextResponse.json({ success: true, message: 'Successfully followed the star.' });

  } catch (error) {
    console.error("Error in /api/follow:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}