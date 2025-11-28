import { NextResponse } from "next/server";
import NodeCache from "node-cache";
import { Trader } from "@/lib/apify";

const cache = new NodeCache({ stdTTL: 300 }); // Cache for 5 minutes

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || process.env.NEXT_PUBLIC_APIFY_API_TOKEN;
const ACTOR_ID = "crypto-scraper~dexscreener-top-traders-scraper";

interface ApifyTraderItem {
    wallet: string;
    sol_scan_url: string;
    buy_usd_amount: number;
    sell_usd_amount: number;
    pnl: number;
    buy_token_amount: number;
    buy_txns: number;
    sell_token_amount: number;
    sell_txns: number;
}

/**
 * Fetch all top traders using Apify
 */
export async function GET() {
    try {
        if (!APIFY_API_TOKEN) {
            return NextResponse.json(
                { error: "APIFY_API_TOKEN is not configured" },
                { status: 500 }
            );
        }

        const cacheKey = "all-top-traders";
        const cached = cache.get<Trader[]>(cacheKey);
        if (cached) return NextResponse.json(cached);

        console.log("🔍 Fetching all top traders from Apify...");

        const response = await fetch(
            `https://api.apify.com/v2/acts/${ACTOR_ID}/runs/last/dataset/items?token=${APIFY_API_TOKEN}`,
            { next: { revalidate: 300 } } // Cache for 5 minutes
        );

        if (!response.ok) {
            throw new Error(`Apify API error: ${response.statusText}`);
        }

        const data: ApifyTraderItem[] = await response.json();

        // Transform data
        const traders: Trader[] = data.map((item, index) => {
            const totalTrades = (item.buy_txns || 0) + (item.sell_txns || 0);
            const roi = item.buy_usd_amount > 0
                ? (item.pnl / item.buy_usd_amount) * 100
                : 0;

            return {
                id: item.wallet,
                rank: index + 1,
                name: `${item.wallet.slice(0, 4)}...${item.wallet.slice(-4)}`,
                avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${item.wallet}`,
                roi: parseFloat(roi.toFixed(2)),
                pnl: parseFloat(item.pnl.toFixed(2)),
                winRate: 0, // Data not available
                totalTrades: totalTrades,
                aum: parseFloat((item.buy_usd_amount + item.sell_usd_amount).toFixed(2)),
                copiers: 0, // Data not available
                weeklyPnl: [], // History not available
                assets: [{ name: 'Token', value: 100, color: '#10B981' }], // Single asset assumption based on scraper scope
                recentTrades: [] // Trade history not available
            };
        }).slice(0, 50);

        console.log(`📈 Returning ${traders.length} top traders`);

        if (traders.length > 0) {
            cache.set(cacheKey, traders);
        }

        return NextResponse.json(traders);
    } catch (error: any) {
        console.error("Failed to fetch traders:", error);
        return NextResponse.json(
            { error: `Failed to fetch traders: ${error.message || 'Unknown error'}` },
            { status: 500 }
        );
    }
}

