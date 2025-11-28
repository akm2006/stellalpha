import { NextResponse } from "next/server";
import { getTraderMetrics } from "@/lib/analytics/trader";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const data = await getTraderMetrics(id);
        return NextResponse.json(data);
    } catch (error) {
        console.error("API Error:", error);
        return NextResponse.json({ error: "Failed to fetch trader metrics" }, { status: 500 });
    }
}
