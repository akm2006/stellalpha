// In app/api/unfollow/route.ts

import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

// Initialize the Upstash Redis client from environment variables
const redis = Redis.fromEnv();

export async function POST(request: Request) {
  try {
    const { userWallet, targetWallet } = await request.json();

    if (!userWallet || !targetWallet) {
      return NextResponse.json({ error: 'Missing userWallet or targetWallet' }, { status: 400 });
    }

    // Remove the user from the targetWallet's set of followers
    await redis.srem(`follows:${targetWallet}`, userWallet);

    console.log(`✅ DATABASE UPDATE: User ${userWallet} has unfollowed ${targetWallet}`);

    return NextResponse.json({ success: true, message: 'Successfully unfollowed the star.' });

  } catch (error) {
    console.error("Error in /api/unfollow:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
