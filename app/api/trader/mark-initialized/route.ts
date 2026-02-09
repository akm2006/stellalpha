/**
 * POST /api/trader/mark-initialized
 * 
 * Marks a TraderState as initialized (ready for trading).
 * Backend wallet signs as authority (vault.authority).
 * 
 * NOTE: Backend can call this because on-chain allows:
 *   signer == trader_state.owner || signer == vault.authority
 */

import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  getConnection,
  getProgram,
  deriveVaultPda,
  loadBackendKeypair,
  fetchTraderState,
} from "@/lib/stellalpha";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user?.wallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { traderStatePubkey } = body;

    if (!traderStatePubkey) {
      return NextResponse.json(
        { error: "Missing traderStatePubkey" },
        { status: 400 }
      );
    }

    const traderState = new PublicKey(traderStatePubkey);
    const connection = getConnection();
    const program = getProgram(connection);
    const backendKeypair = loadBackendKeypair();

    // Fetch TraderState to get the actual owner from stored data
    const tsInfo = await fetchTraderState(connection, traderState);
    if (!tsInfo) {
      return NextResponse.json(
        { error: "TraderState does not exist" },
        { status: 400 }
      );
    }

    if (tsInfo.isInitialized) {
      return NextResponse.json({
        success: true,
        traderState: traderState.toBase58(),
        message: "TraderState already initialized",
        alreadyInitialized: true,
      });
    }

    // Fetch the raw account to get the actual owner pubkey
    const rawAccount = await program.account.traderState.fetch(traderState);
    const actualOwner = rawAccount.owner;

    if (actualOwner.toBase58() !== session.user.wallet) {
      return NextResponse.json(
        { error: "Forbidden: trader state does not belong to authenticated wallet" },
        { status: 403 }
      );
    }
    
    // Derive vault PDA from the STORED owner (not passed-in ownerPubkey)
    const [vaultPda] = deriveVaultPda(actualOwner);

    // Mark as initialized
    console.log(`Marking TraderState ${traderState.toBase58()} as initialized...`);
    console.log(`  Owner: ${actualOwner.toBase58()}`);
    console.log(`  Vault: ${vaultPda.toBase58()}`);
    console.log(`  Backend (authority): ${backendKeypair.publicKey.toBase58()}`);

    const txSig = await program.methods
      .markTraderInitialized()
      .accountsStrict({
        signer: backendKeypair.publicKey, // Backend as authority
        vault: vaultPda,
        traderState: traderState,
      })
      .signers([backendKeypair])
      .rpc();

    console.log(`TraderState initialized: ${txSig}`);

    return NextResponse.json({
      success: true,
      traderState: traderState.toBase58(),
      transaction: txSig,
      message: "TraderState marked as initialized - ready for trading",
      signerRole: "Backend (vault.authority)",
    });
  } catch (error: any) {
    console.error("Mark initialized error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to mark trader initialized" },
      { status: 500 }
    );
  }
}
