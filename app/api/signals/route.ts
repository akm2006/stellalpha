import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userWallet = searchParams.get("userWallet");

  try {
    // Fetch recent signals from a global list or user specific queue
    // For now, let's fetch from a global 'signals:recent' list or similar
    // Or scan keys.
    // Assuming the worker pushes to 'signals:<userWallet>'
    
    let signals: any[] = [];
    if (userWallet) {
        const queueKey = `signals:${userWallet}`;
        // Peek at the list
        signals = await redis.lrange(queueKey, 0, 19); // Last 20 signals
    }

    // If no user specific signals, maybe return some global ones for demo?
    // Or just return empty.
    
    // Parse strings if they are JSON strings
    const parsedSignals = signals.map(s => typeof s === 'string' ? JSON.parse(s) : s);

    return NextResponse.json({ success: true, signals: parsedSignals });
  } catch (error) {
    console.error("Error fetching signals:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch signals" }, { status: 500 });
  }
}