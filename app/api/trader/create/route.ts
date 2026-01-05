/**
 * POST /api/trader/create
 * 
 * Returns an UNSIGNED transaction for TraderState creation.
 * User must sign this transaction client-side.
 * 
 * NON-CUSTODIAL: User signs (as vault owner), funds go to TraderState PDA.
 */

import { NextRequest, NextResponse } from "next/server";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  getConnection,
  getProgram,
  deriveVaultPda,
  deriveTraderStatePda,
  getVaultAta,
  getTraderAta,
  loadBackendKeypair,
  SOL_MINT,
  solToLamports,
} from "@/lib/stellalpha";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ownerPubkey, allocationSol } = body;

    if (!ownerPubkey || allocationSol === undefined) {
      return NextResponse.json(
        { error: "Missing ownerPubkey or allocationSol" },
        { status: 400 }
      );
    }

    const owner = new PublicKey(ownerPubkey);
    const connection = getConnection();
    const program = getProgram(connection);

    // Generate a new trader keypair (identifier only, not signer)
    const traderKeypair = Keypair.generate();

    // Derive PDAs from owner's pubkey (since owner will sign)
    const [vaultPda] = deriveVaultPda(owner);
    const [traderStatePda] = deriveTraderStatePda(owner, traderKeypair.publicKey);

    // Check vault exists
    const vaultInfo = await connection.getAccountInfo(vaultPda);
    if (!vaultInfo) {
      return NextResponse.json(
        { error: "Vault does not exist. Create vault first." },
        { status: 400 }
      );
    }

    // Get token accounts
    const vaultSolAta = getVaultAta(vaultPda, SOL_MINT);
    const traderSolAta = getTraderAta(traderStatePda, SOL_MINT);

    // Check vault has sufficient balance
    let vaultBalance;
    try {
      vaultBalance = await connection.getTokenAccountBalance(vaultSolAta);
    } catch {
      return NextResponse.json(
        { error: "Vault has no SOL ATA. Fund the vault first." },
        { status: 400 }
      );
    }
    
    const allocationLamports = solToLamports(allocationSol);

    if (BigInt(vaultBalance.value.amount) < BigInt(allocationLamports)) {
      return NextResponse.json(
        { 
          error: "Insufficient vault balance",
          required: allocationLamports,
          available: vaultBalance.value.amount,
        },
        { status: 400 }
      );
    }

    console.log(`Building TraderState tx for owner ${owner.toBase58()}...`);
    console.log(`  Trader: ${traderKeypair.publicKey.toBase58()}`);
    console.log(`  TraderState PDA: ${traderStatePda.toBase58()}`);
    console.log(`  Allocation: ${allocationSol} SOL`);

    // Build instruction (owner will sign)
    const ix = await program.methods
      .createTraderState(new anchor.BN(allocationLamports))
      .accountsStrict({
        owner: owner, // User is owner and payer
        trader: traderKeypair.publicKey,
        vault: vaultPda,
        traderState: traderStatePda,
        vaultTokenAccount: vaultSolAta,
        traderTokenAccount: traderSolAta,
        mint: SOL_MINT,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
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

    return NextResponse.json({
      success: true,
      traderState: traderStatePda.toBase58(),
      trader: traderKeypair.publicKey.toBase58(),
      vault: vaultPda.toBase58(),
      allocation: {
        sol: allocationSol,
        lamports: allocationLamports,
      },
      transaction: serializedTx,
      requiresUserSignature: true,
      message: "Transaction built. User must sign.",
      // NON-CUSTODIAL PROOF
      custodyProof: {
        fundsOwner: "TraderState PDA",
        traderStatePda: traderStatePda.toBase58(),
        userRole: "Signs as vault owner",
      },
    });
  } catch (error: any) {
    console.error("TraderState creation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to build trader state transaction" },
      { status: 500 }
    );
  }
}
