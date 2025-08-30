// In app/api/followed-stars/route.ts
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const redis = Redis.fromEnv();

// Changed from POST to GET to match the frontend request method.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // Reading 'userWallet' from query parameters instead of request body.
    const userWallet = searchParams.get('userWallet');

    if (!userWallet) {
      return NextResponse.json({ error: 'Missing userWallet query parameter' }, { status: 400 });
    }

    console.log(`--- DATABASE READ for user: ${userWallet} ---`);
    
    const allStarKeys = await redis.keys('follows:*');
    const followedWallets: string[] = [];

    for (const key of allStarKeys) {
        // userWallet is already lowercase from the context, but ensuring it here is good practice.
        const isMember = await redis.sismember(key, userWallet.toLowerCase());
        if (isMember) {
            followedWallets.push(key.split(':')[1]);
        }
    }

    console.log(`✅ DATABASE READ CONFIRMED. Found followed wallets:`, followedWallets);

    return NextResponse.json({ success: true, followedWallets });

  } catch (error) {
    console.error("Error in /api/followed-stars:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
