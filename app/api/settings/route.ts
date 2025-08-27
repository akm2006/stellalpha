// In app/api/settings/route.ts

import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const redis = Redis.fromEnv();

// Handler to GET the user's current settings
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userSmartAccount = searchParams.get('userSmartAccount');

    if (!userSmartAccount) {
      return NextResponse.json({ error: 'Missing userSmartAccount query parameter' }, { status: 400 });
    }

    // Fetch the trade size from a Redis hash for the user
    // Using a hash allows us to store multiple settings for a user in the future
    const tradeSize = await redis.hget(`settings:${userSmartAccount}`, 'tradeSize');

    return NextResponse.json({ success: true, settings: { tradeSize: tradeSize ?? '0.01' } }); // Default to 0.01 if not set

  } catch (error) {
    console.error("Error in GET /api/settings:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}


// Handler to POST (save) new settings for the user
export async function POST(request: Request) {
  try {
    const { userSmartAccount, tradeSize } = await request.json();

    if (!userSmartAccount || !tradeSize) {
      return NextResponse.json({ error: 'Missing userSmartAccount or tradeSize' }, { status: 400 });
    }

    // Save the trade size to a Redis hash
    await redis.hset(`settings:${userSmartAccount}`, { tradeSize });

    console.log(`✅ SETTINGS UPDATE: User ${userSmartAccount} set trade size to ${tradeSize}`);

    return NextResponse.json({ success: true, message: 'Settings saved successfully.' });

  } catch (error) {
    console.error("Error in POST /api/settings:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
