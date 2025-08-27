// In app/api/signals/route.ts

import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

// Initialize the Upstash Redis client from environment variables
const redis = Redis.fromEnv();

// This endpoint handles GET requests to fetch the latest trade signals.
export async function GET() {
  try {
    // Fetch the last 20 signals from the 'signal:log' list in Redis.
    // lrange returns an array of strings.
    const signalsJson = await redis.lrange('signal:log', 0, 19);
    
    // Parse each JSON string in the array into a JavaScript object.
    const signals = signalsJson.map(s => JSON.parse(s as string));

    return NextResponse.json({ success: true, signals });
  } catch (error) {
    console.error("Error in /api/signals:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
