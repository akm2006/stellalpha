// In app/api/follow/route.ts

import { kv } from '@vercel/kv';
import { NextResponse } from 'next/server';

// This function handles POST requests to save a new follow relationship
export async function POST(request: Request) {
  try {
    // We expect the frontend to send the user's Smart Account and the wallet they want to follow
    const { userSmartAccount, targetWallet } = await request.json();

    if (!userSmartAccount || !targetWallet) {
      return NextResponse.json({ error: 'Missing userSmartAccount or targetWallet' }, { status: 400 });
    }

    // We will store the data in a way that's easy for our agent to look up.
    // We use a Redis Set, which allows one target wallet to be followed by many users.
    await kv.sadd(`follows:${targetWallet}`, userSmartAccount);

    console.log(`✅ DATABASE UPDATE: User ${userSmartAccount} is now following ${targetWallet}`);

    return NextResponse.json({ success: true, message: 'Agent is now activated for this wallet.' });

  } catch (error) {
    console.error("Error in /api/follow:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
