// In app/api/unfollow/route.ts

import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

// Initialize the Upstash Redis client from environment variables
const redis = Redis.fromEnv();

export async function POST(request: Request) {
  try {
    const { userSmartAccount, targetWallet } = await request.json();

    if (!userSmartAccount || !targetWallet) {
      return NextResponse.json({ error: 'Missing userSmartAccount or targetWallet' }, { status: 400 });
    }

    // Remove the user from the targetWallet's set of followers
    await redis.srem(`follows:${targetWallet}`, userSmartAccount);

    console.log(`✅ DATABASE UPDATE: User ${userSmartAccount} has unfollowed ${targetWallet}`);

    return NextResponse.json({ success: true, message: 'Successfully unfollowed the star.' });

  } catch (error) {
    console.error("Error in /api/unfollow:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
