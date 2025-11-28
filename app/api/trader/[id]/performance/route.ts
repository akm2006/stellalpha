import { NextResponse } from "next/server";
import { getTraderPerformance } from "@/lib/analytics/trader";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const { searchParams } = new URL(request.url);
        const window = searchParams.get('window') as '1D' | '7D' | '30D' || '30D';

        const data = await getTraderPerformance(id, window);
        return NextResponse.json(data);
    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json({ error: "Failed to fetch performance data" }, { status: 500 });
    }
}
