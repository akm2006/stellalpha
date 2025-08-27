// In app/api/performance/route.ts

import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const redis = Redis.fromEnv();

// This function now also calculates the best performing star
const calculateMetrics = (trades: any[]) => {
    let totalPnl = 0;
    let winCount = 0;
    const starPerformance: { [star: string]: number } = {};

    trades.forEach(trade => {
        const tradeValue = parseFloat(trade.amountInAVAX);
        let pnl = 0;

        if (trade.type === 'buy') {
            // Using the same simplified P&L logic for the hackathon
            const pnlPercentage = Math.random() * 0.30 - 0.10; // -10% to +20%
            pnl = tradeValue * pnlPercentage;
            
            if (pnl > 0) {
                winCount++;
            }
            totalPnl += pnl;
        }
        
        // Aggregate P&L for each star
        if (starPerformance[trade.star]) {
            starPerformance[trade.star] += pnl;
        } else {
            starPerformance[trade.star] = pnl;
        }
    });

    const winRate = trades.length > 0 ? (winCount / trades.length) * 100 : 0;

    // Find the best performing star
    let bestStar = 'N/A';
    let maxPnl = -Infinity;
    if (Object.keys(starPerformance).length > 0) {
        const bestStarEntry = Object.entries(starPerformance).reduce((prev, current) => {
            return prev[1] > current[1] ? prev : current;
        });
        
        // Only show the best star if their performance is positive
        if (bestStarEntry[1] > 0) {
            bestStar = bestStarEntry[0];
        }
    }

    return {
        totalPnl: totalPnl.toFixed(4),
        winRate: winRate.toFixed(0),
        bestStar: bestStar, // Add the new metric to the response
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
