// In app/api/performance/route.ts

import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const redis = Redis.fromEnv();

// A simplified P&L calculation for the hackathon
// This assumes every 'buy' is a potential win and 'sell' is a break-even for demonstration
const calculateMetrics = (trades: any[]) => {
    let totalPnl = 0;
    let winCount = 0;

    trades.forEach(trade => {
        const tradeValue = parseFloat(trade.amountInAVAX);
        if (trade.type === 'buy') {
            // Assume a random P&L for demonstration purposes (e.g., between -10% and +20%)
            const pnlPercentage = Math.random() * 0.30 - 0.10; // -10% to +20%
            const pnl = tradeValue * pnlPercentage;
            
            if (pnl > 0) {
                winCount++;
            }
            totalPnl += pnl;
        }
        // 'sell' trades are considered neutral in this simplified model
    });

    const winRate = trades.length > 0 ? (winCount / trades.length) * 100 : 0;

    return {
        totalPnl: totalPnl.toFixed(4),
        winRate: winRate.toFixed(0),
    };
};


export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userSmartAccount = searchParams.get('userSmartAccount');

    if (!userSmartAccount) {
      return NextResponse.json({ error: 'Missing userSmartAccount query parameter' }, { status: 400 });
    }

    // Fetch all trade records for the user
    const tradeHistoryJson = await redis.lrange(`trades:${userSmartAccount}`, 0, -1);
    const tradeHistory = tradeHistoryJson.map(t => JSON.parse(t as string));
    
    const metrics = calculateMetrics(tradeHistory);

    return NextResponse.json({ success: true, metrics });

  } catch (error) {
    console.error("Error in /api/performance:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}