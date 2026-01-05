/**
 * GET /api/vault/list
 * 
 * Lists all vaults in the system.
 * Read-only, no signatures required.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getConnection,
  listAllVaults,
  getVaultAta,
  getTokenBalance,
  SOL_MINT,
  USDC_MINT,
  formatSol,
  formatUsdc,
} from "@/lib/stellalpha";

export async function GET(request: NextRequest) {
  try {
    const connection = getConnection();
    const vaults = await listAllVaults(connection);

    // Enrich with token balances
    const enrichedVaults = await Promise.all(
      vaults.map(async (vault) => {
        const solAta = getVaultAta(vault.address, SOL_MINT);
        const usdcAta = getVaultAta(vault.address, USDC_MINT);

        const solBalance = await getTokenBalance(connection, solAta);
        const usdcBalance = await getTokenBalance(connection, usdcAta);

        return {
          address: vault.address.toBase58(),
          owner: vault.owner.toBase58(),
          baseMint: vault.baseMint.toBase58(),
          balances: {
            sol: {
              raw: solBalance.toString(),
              formatted: formatSol(solBalance),
            },
            usdc: {
              raw: usdcBalance.toString(),
              formatted: formatUsdc(usdcBalance),
            },
          },
        };
      })
    );

    return NextResponse.json({
      success: true,
      count: enrichedVaults.length,
      vaults: enrichedVaults,
    });
  } catch (error: any) {
    console.error("Vault list error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to list vaults" },
      { status: 500 }
    );
  }
}
