import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    session.destroy();
    
    return NextResponse.json({
      success: true,
      isLoggedIn: false,
    });
  } catch (error) {
    console.error("[Auth/Logout] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
