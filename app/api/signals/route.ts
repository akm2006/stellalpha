// In app/api/signals/route.ts
import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // The API will receive the user's EOA wallet address
  const userWallet = searchParams.get('userWallet');

  if (!userWallet) {
    return NextResponse.json({ success: false, error: 'userWallet is required' }, { status: 400 });
  }

  try {
    // Fetch the list of signals stored for this user's EOA
    const signalsJson = await redis.lrange(`signals:${userWallet.toLowerCase()}`, 0, 49);
    const signals = signalsJson.map(s => JSON.parse(s as string));
    
    return NextResponse.json({ success: true, signals });

  } catch (error) {
    console.error("Error fetching signals:", error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}