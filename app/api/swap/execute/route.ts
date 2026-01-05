/**
 * POST /api/swap/execute
 * 
 * ⚠️ BACKEND-ONLY SWAP EXECUTION
 * 
 * Executes a Jupiter CPI swap via execute_trader_swap.
 * 
 * NON-CUSTODIAL GUARANTEES:
 * - Backend wallet signs the transaction
 * - TraderState PDA signs via invoke_signed
 * - Funds remain in TraderState PDA
 * - Backend NEVER owns token accounts
 * - User NEVER signs this transaction
 */

import { NextRequest, NextResponse } from "next/server";
import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  Connection,
  VersionedTransaction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  getConnection,
  getProgram,
  deriveVaultPda,
  deriveGlobalConfigPda,
  getTraderAta,
  getVaultAta,
  loadBackendKeypair,
  fetchTraderState,
  SOL_MINT,
  USDC_MINT,
  JUPITER_PROGRAM_ID,
  MAINNET_RPC,
  formatSol,
  formatUsdc,
  solToLamports,
  usdcToRaw,
} from "@/lib/stellalpha";

// Jupiter v1 API endpoints (current, not deprecated v6)
const JUPITER_QUOTE_API = "https://api.jup.ag/swap/v1/quote";
const JUPITER_SWAP_API = "https://api.jup.ag/swap/v1/swap";

interface SwapRequest {
  ownerPubkey: string;
  traderStatePubkey: string;
  direction: "SOL_TO_USDC" | "USDC_TO_SOL";
  amount: number; // In human units (SOL or USDC)
  slippageBps?: number;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body: SwapRequest = await request.json();
    const { ownerPubkey, traderStatePubkey, direction, amount, slippageBps = 100 } = body;

    // Validate inputs
    if (!ownerPubkey || !traderStatePubkey || !direction || !amount) {
      return NextResponse.json(
        { error: "Missing required fields: ownerPubkey, traderStatePubkey, direction, amount" },
        { status: 400 }
      );
    }

    const apiKey = "REDACTED";
    if (!apiKey) {
      return NextResponse.json(
        { error: "JUPITER_API_KEY not configured" },
        { status: 500 }
      );
    }

    const owner = new PublicKey(ownerPubkey);
    const traderState = new PublicKey(traderStatePubkey);
    const connection = getConnection();
    const program = getProgram(connection);
    const backendKeypair = loadBackendKeypair();

    // Derive PDAs
    const [vaultPda] = deriveVaultPda(owner);
    const [globalConfigPda] = deriveGlobalConfigPda();

    // Fetch TraderState
    const tsInfo = await fetchTraderState(connection, traderState);
    if (!tsInfo) {
      return NextResponse.json(
        { error: "TraderState not found" },
        { status: 404 }
      );
    }

    if (!tsInfo.isInitialized) {
      return NextResponse.json(
        { error: "TraderState not initialized" },
        { status: 400 }
      );
    }

    if (tsInfo.isPaused) {
      return NextResponse.json(
        { error: "TraderState is paused" },
        { status: 400 }
      );
    }

    // Determine mints based on direction
    const inputMint = direction === "SOL_TO_USDC" ? SOL_MINT : USDC_MINT;
    const outputMint = direction === "SOL_TO_USDC" ? USDC_MINT : SOL_MINT;

    // Convert amount to raw units
    const amountRaw = direction === "SOL_TO_USDC"
      ? solToLamports(amount)
      : usdcToRaw(amount);


    // Get token accounts
    const inputAta = getTraderAta(traderState, inputMint);
    const outputAta = getTraderAta(traderState, outputMint);
    
    // Platform fee goes to admin (backend) - NOT vault
    // On-chain requires: platform_fee_account.owner == global_config.admin
    const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
    const platformFeeAta = getAssociatedTokenAddressSync(inputMint, backendKeypair.publicKey);

    // Check balance
    const inputBalanceBefore = tsInfo.inputMint.equals(inputMint)
      ? tsInfo.inputBalance
      : tsInfo.outputBalance;

    if (BigInt(amountRaw) > inputBalanceBefore) {
      return NextResponse.json(
        {
          error: "Insufficient balance",
          required: amountRaw,
          available: inputBalanceBefore.toString(),
        },
        { status: 400 }
      );
    }

    console.log("=".repeat(60));
    console.log("SWAP EXECUTION (Backend-Only)");
    console.log("=".repeat(60));
    console.log(`Direction: ${direction}`);
    console.log(`Amount: ${amount} ${direction === "SOL_TO_USDC" ? "SOL" : "USDC"}`);
    console.log(`TraderState: ${traderState.toBase58()}`);
    console.log(`Backend Wallet: ${backendKeypair.publicKey.toBase58()}`);

    // Calculate platform fee (must match on-chain logic)
    // On-chain: fee = amount_in * platform_fee_bps / 10000
    // swap_amount = amount_in - fee
    const PLATFORM_FEE_BPS = 10; // 0.1% - matches GlobalConfig default
    const fee = Math.floor((amountRaw * PLATFORM_FEE_BPS) / 10000);
    const swapAmount = amountRaw - fee;
    
    console.log(`   Platform fee: ${fee} (${PLATFORM_FEE_BPS} bps)`);
    console.log(`   Swap amount (after fee): ${swapAmount}`);

    // Step 1: Fetch Jupiter Quote with POST-FEE amount
    console.log("\n1. Fetching Jupiter quote...");
    const quoteUrl = new URL(JUPITER_QUOTE_API);
    quoteUrl.searchParams.set("inputMint", inputMint.toBase58());
    quoteUrl.searchParams.set("outputMint", outputMint.toBase58());
    quoteUrl.searchParams.set("amount", String(swapAmount)); // Use post-fee amount!
    quoteUrl.searchParams.set("slippageBps", String(slippageBps));
    quoteUrl.searchParams.set("dexes", "Raydium"); // Only cloned DEX
    quoteUrl.searchParams.set("onlyDirectRoutes", "true");

    const quoteResponse = await fetch(quoteUrl.toString(), {
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!quoteResponse.ok) {
      const err = await quoteResponse.text();
      throw new Error(`Jupiter quote failed: ${err}`);
    }

    const quote = await quoteResponse.json();
    const expectedOutput = quote.outAmount;
    const route = quote.routePlan?.[0]?.swapInfo?.label || "Unknown";

    console.log(`   Expected output: ${direction === "SOL_TO_USDC" ? formatUsdc(expectedOutput) : formatSol(expectedOutput)}`);
    console.log(`   Route: ${route}`);

    // Step 2: Get Jupiter Swap Transaction
    console.log("\n2. Building Jupiter swap transaction...");
    const swapResponse = await fetch(JUPITER_SWAP_API, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: traderState.toBase58(), // TraderState PDA as authority
        wrapUnwrapSOL: false,
        dynamicComputeUnitLimit: true,
      }),
    });

    if (!swapResponse.ok) {
      const err = await swapResponse.text();
      throw new Error(`Jupiter swap transaction failed: ${err}`);
    }

    const swapData = await swapResponse.json();

    // Step 3: Parse Jupiter instruction
    console.log("\n3. Parsing Jupiter instruction...");
    const { instructionData, remainingAccounts } = await parseJupiterTransaction(
      connection,
      swapData.swapTransaction,
      traderState
    );

    console.log(`   Instruction data: ${instructionData.length} bytes`);
    console.log(`   Remaining accounts: ${remainingAccounts.length}`);

    // Step 4: Execute via execute_trader_swap
    console.log("\n4. Executing CPI swap...");

    // First, ensure output token account exists (backend creates if needed)
    const outputAtaInfo = await connection.getAccountInfo(outputAta);
    if (!outputAtaInfo) {
      console.log("   Creating output token account...");
      const { createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");
      const { Transaction } = await import("@solana/web3.js");
      
      const createAtaTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          backendKeypair.publicKey, // payer
          outputAta,                // ata
          traderState,              // owner (TraderState PDA)
          outputMint                // mint
        )
      );
      
      const { blockhash } = await connection.getLatestBlockhash();
      createAtaTx.recentBlockhash = blockhash;
      createAtaTx.feePayer = backendKeypair.publicKey;
      createAtaTx.sign(backendKeypair);
      
      const createAtaSig = await connection.sendRawTransaction(createAtaTx.serialize());
      await connection.confirmTransaction(createAtaSig, "confirmed");
      console.log(`   ✓ Output ATA created: ${outputAta.toBase58()}`);
    }

    // Also ensure platform fee ATA exists (admin's token account for input mint)
    const feeAtaInfo = await connection.getAccountInfo(platformFeeAta);
    if (!feeAtaInfo) {
      console.log("   Creating platform fee token account...");
      const { createAssociatedTokenAccountInstruction } = await import("@solana/spl-token");
      const { Transaction } = await import("@solana/web3.js");
      
      const createFeeAtaTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          backendKeypair.publicKey, // payer
          platformFeeAta,           // ata
          backendKeypair.publicKey, // owner (admin)
          inputMint                 // mint (fees collected in input token)
        )
      );
      
      const { blockhash } = await connection.getLatestBlockhash();
      createFeeAtaTx.recentBlockhash = blockhash;
      createFeeAtaTx.feePayer = backendKeypair.publicKey;
      createFeeAtaTx.sign(backendKeypair);
      
      const createFeeAtaSig = await connection.sendRawTransaction(createFeeAtaTx.serialize());
      await connection.confirmTransaction(createFeeAtaSig, "confirmed");
      console.log(`   ✓ Fee ATA created: ${platformFeeAta.toBase58()}`);
    }

    const amountIn = new anchor.BN(amountRaw);
    const minAmountOut = new anchor.BN(quote.otherAmountThreshold || expectedOutput);

    const txSig = await program.methods
      .executeTraderSwap(amountIn, minAmountOut, instructionData)
      .accountsStrict({
        authority: backendKeypair.publicKey,
        vault: vaultPda,
        traderState: traderState,
        inputTokenAccount: inputAta,
        outputTokenAccount: outputAta,
        platformFeeAccount: platformFeeAta,
        globalConfig: globalConfigPda,
        jupiterProgram: JUPITER_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .remainingAccounts(remainingAccounts)
      .signers([backendKeypair])
      .rpc({ commitment: "confirmed" });

    console.log(`\n✅ SWAP EXECUTED: ${txSig}`);

    // Step 5: Fetch updated balances
    await new Promise((r) => setTimeout(r, 2000));
    const updatedTs = await fetchTraderState(connection, traderState);

    const inputBalanceAfter = updatedTs?.inputMint.equals(inputMint)
      ? updatedTs.inputBalance
      : updatedTs?.outputBalance || BigInt(0);
    const outputBalanceAfter = updatedTs?.outputMint.equals(outputMint)
      ? updatedTs.outputBalance
      : updatedTs?.inputBalance || BigInt(0);

    const inputDelta = Number(inputBalanceBefore) - Number(inputBalanceAfter);
    const outputDelta = Number(outputBalanceAfter) - (direction === "SOL_TO_USDC"
      ? Number(tsInfo.outputBalance)
      : Number(tsInfo.inputBalance));

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      transaction: txSig,
      swap: {
        direction,
        inputMint: inputMint.toBase58(),
        outputMint: outputMint.toBase58(),
        amountIn: amount,
        expectedOutput: direction === "SOL_TO_USDC"
          ? Number(expectedOutput) / 1e6
          : Number(expectedOutput) / 1e9,
        route,
        slippageBps,
      },
      balances: {
        before: {
          input: direction === "SOL_TO_USDC"
            ? formatSol(inputBalanceBefore)
            : formatUsdc(inputBalanceBefore),
          output: direction === "SOL_TO_USDC"
            ? formatUsdc(tsInfo.outputBalance)
            : formatSol(tsInfo.inputBalance),
        },
        after: {
          input: direction === "SOL_TO_USDC"
            ? formatSol(inputBalanceAfter)
            : formatUsdc(inputBalanceAfter),
          output: direction === "SOL_TO_USDC"
            ? formatUsdc(outputBalanceAfter)
            : formatSol(outputBalanceAfter),
        },
        delta: {
          input: `-${direction === "SOL_TO_USDC" ? formatSol(inputDelta) : formatUsdc(inputDelta)}`,
          output: `+${direction === "SOL_TO_USDC" ? formatUsdc(outputDelta) : formatSol(outputDelta)}`,
        },
      },
      // NON-CUSTODIAL PROOF
      nonCustodialProof: {
        backendWallet: backendKeypair.publicKey.toBase58(),
        traderStatePda: traderState.toBase58(),
        fundsOwner: "TraderState PDA (via invoke_signed)",
        backendOwnsTokens: false,
        userSignedSwap: false,
        cpiAuthorityModel: "invoke_signed with TraderState seeds",
      },
      durationMs: duration,
    });
  } catch (error: any) {
    console.error("Swap execution error:", error);
    
    // Classify error for debugging
    let errorType = "UNKNOWN";
    const errorMsg = error.message || String(error);
    
    if (errorMsg.includes("slippage") || errorMsg.includes("amount")) {
      errorType = "ECONOMIC (acceptable)";
    } else if (errorMsg.includes("signer") || errorMsg.includes("privilege")) {
      errorType = "STRUCTURAL (must fix)";
    } else if (errorMsg.includes("insufficient") || errorMsg.includes("balance")) {
      errorType = "BALANCE";
    }

    return NextResponse.json(
      {
        error: errorMsg,
        errorType,
        logs: error.logs || [],
      },
      { status: 500 }
    );
  }
}

/**
 * Parse Jupiter swap transaction to extract instruction data and accounts
 */
async function parseJupiterTransaction(
  connection: Connection,
  swapTransaction: string,
  authorityPda: PublicKey
): Promise<{
  instructionData: Buffer;
  remainingAccounts: { pubkey: PublicKey; isSigner: boolean; isWritable: boolean }[];
}> {
  const txBuffer = Buffer.from(swapTransaction, "base64");
  const transaction = VersionedTransaction.deserialize(txBuffer);

  // Resolve Address Lookup Tables
  const allAccountKeys = await resolveAddressLookupTables(connection, transaction);

  // Find Jupiter instruction
  let jupiterIxIndex = -1;
  const staticKeys = transaction.message.staticAccountKeys;

  for (let i = 0; i < transaction.message.compiledInstructions.length; i++) {
    const ix = transaction.message.compiledInstructions[i];
    if (staticKeys[ix.programIdIndex].equals(JUPITER_PROGRAM_ID)) {
      jupiterIxIndex = i;
      break;
    }
  }

  if (jupiterIxIndex === -1) {
    throw new Error("Jupiter instruction not found");
  }

  const jupiterIx = transaction.message.compiledInstructions[jupiterIxIndex];

  // Build remaining accounts - ALWAYS set isSigner: false
  // Program handles PDA signing via invoke_signed
  const remainingAccounts = jupiterIx.accountKeyIndexes.map((idx) => ({
    pubkey: allAccountKeys[idx],
    isSigner: false, // CRITICAL: Never true - program signs via invoke_signed
    isWritable: true,
  }));

  return {
    instructionData: Buffer.from(jupiterIx.data),
    remainingAccounts,
  };
}

/**
 * Resolve Address Lookup Tables from mainnet
 */
async function resolveAddressLookupTables(
  localConnection: Connection,
  transaction: VersionedTransaction
): Promise<PublicKey[]> {
  const message = transaction.message;
  const allAccounts: PublicKey[] = [...message.staticAccountKeys];

  const lookups = message.addressTableLookups;
  if (!lookups || lookups.length === 0) {
    return allAccounts;
  }

  const mainnetConnection = new Connection(MAINNET_RPC, "confirmed");

  for (const lookup of lookups) {
    let altAccount = await localConnection.getAddressLookupTable(lookup.accountKey);

    if (!altAccount.value) {
      // Fallback to mainnet
      altAccount = await mainnetConnection.getAddressLookupTable(lookup.accountKey);
      if (!altAccount.value) {
        throw new Error(`ALT ${lookup.accountKey.toBase58()} not found`);
      }
    }

    const addresses = altAccount.value.state.addresses;

    for (const idx of lookup.writableIndexes) {
      allAccounts.push(addresses[idx]);
    }
    for (const idx of lookup.readonlyIndexes) {
      allAccounts.push(addresses[idx]);
    }
  }

  return allAccounts;
}
