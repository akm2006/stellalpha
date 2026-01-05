/**
 * POST /api/vault/create
 * 
 * Returns an UNSIGNED transaction for vault creation.
 * User must sign this transaction client-side.
 * 
 * NON-CUSTODIAL: User signs, user owns vault.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import {
  getConnection,
  getProgram,
  deriveVaultPda,
  deriveGlobalConfigPda,
  loadBackendKeypair,
  SOL_MINT,
} from "@/lib/stellalpha";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ownerPubkey } = body;

    if (!ownerPubkey) {
      return NextResponse.json(
        { error: "Missing ownerPubkey" },
        { status: 400 }
      );
    }

    const owner = new PublicKey(ownerPubkey);
    const connection = getConnection();
    const program = getProgram(connection);
    const backendKeypair = loadBackendKeypair();

    // Derive PDAs from user's pubkey (since user will sign)
    const [vaultPda] = deriveVaultPda(owner);
    const [globalConfigPda] = deriveGlobalConfigPda();

    // Check if vault already exists
    const vaultInfo = await connection.getAccountInfo(vaultPda);
    if (vaultInfo) {
      return NextResponse.json({
        success: true,
        vault: vaultPda.toBase58(),
        message: "Vault already exists",
        alreadyExists: true,
      });
    }

    // Ensure GlobalConfig exists (backend can do this)
    const globalConfigInfo = await connection.getAccountInfo(globalConfigPda);
    if (!globalConfigInfo) {
      console.log("Initializing GlobalConfig...");
      await program.methods
        .initializeGlobalConfig()
        .accountsStrict({
          globalConfig: globalConfigPda,
          admin: backendKeypair.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([backendKeypair])
        .rpc();
    }

    // Build vault creation instruction (user will sign)
    // IMPORTANT: Set authority = backend so backend can execute swaps
    const ix = await program.methods
      .initializeVault(backendKeypair.publicKey, SOL_MINT) // authority = backend
      .accountsStrict({
        vault: vaultPda,
        owner: owner, // User is the owner/payer
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    // Build transaction
    const { blockhash } = await connection.getLatestBlockhash();
    const tx = new Transaction({
      feePayer: owner,
      recentBlockhash: blockhash,
    });
    tx.add(ix);

    // Serialize for client signing
    const serializedTx = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }).toString("base64");

    console.log(`Vault tx built for owner ${owner.toBase58()}`);

    return NextResponse.json({
      success: true,
      vault: vaultPda.toBase58(),
      transaction: serializedTx,
      requiresUserSignature: true,
      message: "Transaction built. User must sign.",
    });
  } catch (error: any) {
    console.error("Vault creation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to build vault transaction" },
      { status: 500 }
    );
  }
}
