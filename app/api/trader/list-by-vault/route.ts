/**
 * GET /api/trader/list-by-vault
 * 
 * Lists all TraderStates for a vault.
 * Read-only, no signatures required.
 */

import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  getConnection,
  listTradersByVault,
  formatSol,
  formatUsdc,
  SOL_MINT,
  USDC_MINT,
} from "@/lib/stellalpha";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const vaultPubkey = searchParams.get("vault");

    if (!vaultPubkey) {
      return NextResponse.json(
        { error: "Missing vault query parameter" },
        { status: 400 }
      );
    }

    const vault = new PublicKey(vaultPubkey);
    const connection = getConnection();
    const traders = await listTradersByVault(connection, vault);

    const enrichedTraders = traders.map((ts) => ({
      address: ts.address.toBase58(),
      vault: ts.vault.toBase58(),
      trader: ts.trader.toBase58(),
      isInitialized: ts.isInitialized,
      isPaused: ts.isPaused,
      currentValue: ts.currentValue.toString(),
      inputMint: ts.inputMint.toBase58(),
      outputMint: ts.outputMint.toBase58(),
      balances: {
        input: {
          raw: ts.inputBalance.toString(),
          formatted: ts.inputMint.equals(SOL_MINT)
            ? formatSol(ts.inputBalance)
            : formatUsdc(ts.inputBalance),
          symbol: ts.inputMint.equals(SOL_MINT) ? "SOL" : "USDC",
        },
        output: {
          raw: ts.outputBalance.toString(),
          formatted: ts.outputMint.equals(SOL_MINT)
            ? formatSol(ts.outputBalance)
            : formatUsdc(ts.outputBalance),
          symbol: ts.outputMint.equals(SOL_MINT) ? "SOL" : "USDC",
        },
      },
    }));

    return NextResponse.json({
      success: true,
      vault: vault.toBase58(),
      count: enrichedTraders.length,
      traders: enrichedTraders,
    });
  } catch (error: any) {
    console.error("Trader list error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list traders" },
      { status: 500 }
    );
  }
}
