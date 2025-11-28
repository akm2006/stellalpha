import { NextResponse } from "next/server";
import { ApifyClient } from 'apify-client';

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || process.env.NEXT_PUBLIC_APIFY_API_TOKEN;

if (!APIFY_API_TOKEN) {
    console.error("❌ APIFY_API_TOKEN environment variable is not set. Cannot fetch trader details from Apify.");
}
const APIFY_ACTOR_ID = "crypto-scraper~dexscreener-top-traders-scraper";

const client = new ApifyClient({
    token: APIFY_API_TOKEN,
});

interface ExtendedTraderData {
    wallet: string;
    sol_scan_url: string;
    buy_usd_amount: number;
    sell_usd_amount: number;
    pnl: number;
    buy_token_amount: number;
    buy_txns: number;
    sell_token_amount: number;
    sell_txns: number;
    roi: number;
    totalTrades: number;
    totalVolume: number;
    netPosition: number; // buy_token_amount - sell_token_amount
    token?: string; // Token mint this data is for
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!APIFY_API_TOKEN) {
            return NextResponse.json(
                { error: "APIFY_API_TOKEN is not configured" },
                { status: 500 }
            );
        }

        const { id } = await params;
        
        if (!id) {
            return NextResponse.json({ error: "Trader wallet address is required" }, { status: 400 });
        }

        // Search for trader - fetch from last run's dataset
        // Note: This actor doesn't support per-token queries via new runs
        try {
            const response = await fetch(
                `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/runs/last/dataset/items?token=${APIFY_API_TOKEN}`,
                { next: { revalidate: 300 } }
            );

            if (!response.ok) {
                throw new Error(`Apify API error: ${response.statusText}`);
            }

            const items: any[] = await response.json();
            
            const traderData = items.find((item: any) => 
                item.wallet && item.wallet.toLowerCase() === id.toLowerCase()
            );
            
            if (traderData) {
                const buyUsdAmount = parseFloat(traderData.buy_usd_amount?.toString() || '0');
                const sellUsdAmount = parseFloat(traderData.sell_usd_amount?.toString() || '0');
                const pnl = parseFloat(traderData.pnl?.toString() || '0');
                const buyTxns = parseInt(traderData.buy_txns?.toString() || '0', 10);
                const sellTxns = parseInt(traderData.sell_txns?.toString() || '0', 10);
                const buyTokenAmount = parseFloat(traderData.buy_token_amount?.toString() || '0');
                const sellTokenAmount = parseFloat(traderData.sell_token_amount?.toString() || '0');
                const totalTrades = buyTxns + sellTxns;
                const totalVolume = buyUsdAmount + sellUsdAmount;
                const roi = buyUsdAmount > 0 ? (pnl / buyUsdAmount) * 100 : 0;
                const netPosition = buyTokenAmount - sellTokenAmount;

                const extendedData: ExtendedTraderData = {
                    wallet: traderData.wallet,
                    sol_scan_url: traderData.sol_scan_url || `https://solscan.io/account/${traderData.wallet}`,
                    buy_usd_amount: buyUsdAmount,
                    sell_usd_amount: sellUsdAmount,
                    pnl: pnl,
                    buy_token_amount: buyTokenAmount,
                    buy_txns: buyTxns,
                    sell_token_amount: sellTokenAmount,
                    sell_txns: sellTxns,
                    roi: parseFloat(roi.toFixed(2)),
                    totalTrades: totalTrades,
                    totalVolume: totalVolume,
                    netPosition: netPosition,
                };

                return NextResponse.json(extendedData);
            }
        } catch (error) {
            console.error(`Error fetching trader data:`, error);
        }

        return NextResponse.json({ error: "Trader not found" }, { status: 404 });
    } catch (error: any) {
        console.error("API Error:", error);
        return NextResponse.json({ error: "Failed to fetch trader details" }, { status: 500 });
    }
}
