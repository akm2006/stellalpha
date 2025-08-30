// In app/api/settings/route.ts
import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

// GET handler to fetch settings
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userWallet = searchParams.get('userWallet');

  if (!userWallet) {
    return NextResponse.json({ success: false, error: 'userWallet is required' }, { status: 400 });
  }

  try {
    const settings = await redis.hgetall(`settings:${userWallet.toLowerCase()}`);
    return NextResponse.json({ success: true, settings: settings || {} });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST handler to save settings
export async function POST(request: Request) {
  try {
    const { userWallet, tradeSize } = await request.json();

    if (!userWallet || !tradeSize) {
      return NextResponse.json({ success: false, error: 'userWallet and tradeSize are required' }, { status: 400 });
    }

    await redis.hset(`settings:${userWallet.toLowerCase()}`, { tradeSize });

    return NextResponse.json({ success: true, message: 'Settings saved successfully!' });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}