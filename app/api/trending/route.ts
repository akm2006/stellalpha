import { NextResponse } from "next/server";
import { getTrendingTokens } from "@/lib/analytics/trending";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const window = searchParams.get('window') as '1h' | '6h' | '24h' || '1h';

        const data = await getTrendingTokens(window);
        return NextResponse.json(data);
    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json({ error: "Failed to fetch trending tokens" }, { status: 500 });
    }
}
