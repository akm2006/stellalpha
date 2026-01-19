import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (session.isLoggedIn && session.user) {
      return NextResponse.json({
        isLoggedIn: true,
        user: session.user,
      });
    } else {
      return NextResponse.json({
        isLoggedIn: false,
        user: null,
      });
    }
  } catch (error) {
    console.error("[Auth/User] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
