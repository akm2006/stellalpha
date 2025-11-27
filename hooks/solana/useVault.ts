"use client";

import { useMemo } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, VersionedTransaction, TransactionMessage, TransactionInstruction, AddressLookupTableAccount, ComputeBudgetProgram, RpcResponseAndContext, SimulatedTransactionResponse } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProgram } from "./useProgram";
import { address, getProgramDerivedAddress } from "@solana/addresses";
import { toast } from "sonner";
import { useNetwork } from "@/store/network";

// Helper to convert Address string to PublicKey
const toPubkey = (addr: string) => new PublicKey(addr);

// Helper for Devnet Mint
const getDevnetMint = async (walletPubkey: PublicKey) => {
  return await PublicKey.createWithSeed(
    walletPubkey,
    "stellalpha-mint",
    TOKEN_PROGRAM_ID
  );
};

export function useVaultPda(owner?: PublicKey | null) {
  const { programId } = useProgram();
  
  return useMemo(() => {
    if (!owner || !programId) return null;
    
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_vault"), owner.toBuffer()],
      programId
    );
    return pda;
  }, [owner, programId]);
}

export function useVaultState() {
  const { publicKey } = useWallet();
  const { program } = useProgram();
  const vaultPda = useVaultPda(publicKey);

  return useQuery({
    queryKey: ["vault", vaultPda?.toString()],
    queryFn: async () => {
      if (!program || !vaultPda) return null;
      try {
        return await (program as any).account.userVault.fetch(vaultPda);
      } catch (e) {
        return null; // Account doesn't exist
      }
    },
    enabled: !!program && !!vaultPda,
  });
}

export function useInitializeVault() {
  const { program } = useProgram();
  const { publicKey } = useWallet();
  const vaultPda = useVaultPda(publicKey);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (authority: string) => {
      if (!program || !publicKey || !vaultPda) throw new Error("Not connected");
      
      const tx = await program.methods
        .initializeVault(new PublicKey(authority))
        .accountsStrict({
          vault: vaultPda,
          owner: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      return tx;
    },
    onSuccess: () => {
      toast.success("Vault initialized!");
      queryClient.invalidateQueries({ queryKey: ["vault"] });
    },
    onError: (error) => {
      toast.error("Failed to initialize vault: " + error.message);
    },
  });
}

export function useTogglePause() {
  const { program } = useProgram();
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const vaultPda = useVaultPda(publicKey);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!program || !publicKey || !vaultPda) throw new Error("Not connected");
      
      console.log("togglePause → accounts:", { vaultPda: vaultPda.toBase58(), authority: publicKey.toBase58() });

      const tx = await program.methods
        .togglePause()
        .accountsStrict({
          vault: vaultPda,
          authority: publicKey,
        })
        .transaction();
      
      const sig = await sendTransaction(tx, connection);
      console.log("togglePause signature:", sig);
      return sig;
    },
    onSuccess: () => {
      toast.success("Vault pause state toggled!");
      queryClient.invalidateQueries({ queryKey: ["vault"] });
    },
    onError: (error) => {
      toast.error("Failed to toggle pause: " + error.message);
    },
  });
}

import { 
  createInitializeMintInstruction, 
  createAssociatedTokenAccountInstruction, 
  createMintToInstruction, 
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync, 
  MINT_SIZE, 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID 
} from "@solana/spl-token";
import { Keypair } from "@solana/web3.js";

// --- Jupiter Hooks ---

// --- Jupiter Types & Helpers ---
// NOTE: Always check latest Jupiter API docs: https://station.jup.ag/docs

interface JupiterQuoteRoute {
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
  marketInfos: any[];
}

interface JupiterQuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: any;
  priceImpactPct: string;
  routePlan: JupiterQuoteRoute[];
  contextSlot?: number;
  timeTaken?: number;
}

type JupiterInstructionAccount = {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
};

type JupiterInstruction = {
  programId: string;
  accounts: JupiterInstructionAccount[];
  data: string; // base64 data
};

type JupiterSwapInstructionsResponse = {
  addressLookupTableAddresses: string[];
  cleanupInstruction?: JupiterInstruction | null;
  computeBudgetInstructions: JupiterInstruction[];
  setupInstructions: JupiterInstruction[];
  otherInstructions?: JupiterInstruction[] | null;
  swapInstruction: JupiterInstruction;
};

const MAINNET_WSOL = "So11111111111111111111111111111111111111112";
const MAINNET_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

async function fetchJupiterQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
}): Promise<JupiterQuoteResponse> {
  const queryParams = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: params.amount,
    slippageBps: params.slippageBps.toString(),
    onlyDirectRoutes: "false",
  });

  const response = await fetch(`/api/jup/quote?${queryParams.toString()}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jupiter Quote API Error: ${errorText}`);
  }
  return await response.json();
}

async function fetchJupiterSwapInstructions(params: {
  quoteResponse: JupiterQuoteResponse;
  userPublicKey: string;
}): Promise<JupiterSwapInstructionsResponse> {
  const response = await fetch("/api/jup/swap", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      quoteResponse: params.quoteResponse,
      userPublicKey: params.userPublicKey,
      wrapAndUnwrapSol: true,
      computeUnitPriceMicroLamports: 1,
      dynamicComputeUnitLimit: true,
      asLegacyTransaction: false,
      allowUserAccountCreation: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jupiter Swap Instructions API Error: ${errorText}`);
  }
  return await response.json();
}

// --- Optimization Helpers ---

function deserializeJupIx(ix: JupiterInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map(acc => ({
      pubkey: new PublicKey(acc.pubkey),
      isSigner: acc.isSigner,
      isWritable: acc.isWritable
    })),
    data: Buffer.from(ix.data, "base64"),
  });
}

function buildComputeBudgetIxs(): TransactionInstruction[] {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 500 }),
  ];
}

// --- Simulation & Error Helpers ---

function parseJupiterErrorLogs(logs: string[] | null): string {
  if (!logs) return "Unknown simulation error";
  const logStr = logs.join(" ");

  if (logStr.includes("Slippage tolerance exceeded")) return "Slippage tolerance exceeded. Try increasing slippage.";
  if (logStr.includes("Token account missing")) return "Token account missing. Ensure you have the correct wallet setup.";
  if (logStr.includes("Insufficient liquidity")) return "Insufficient liquidity for this trade.";
  if (logStr.includes("ConstraintSeeds")) return "PDA derivation failed (ConstraintSeeds).";
  if (logStr.includes("AccountBorrowFailed")) return "Account borrow failed. Network may be congested.";
  if (logStr.includes("Compute budget exceeded")) return "Compute budget exceeded. Retrying with higher priority...";
  if (logStr.includes("priority fee required")) return "Priority fee required. Network is congested.";
  if (logStr.includes("Instruction requires a signer")) return "Transaction missing a required signer.";
  if (logStr.includes("Program failed to complete")) return "Program failed to complete. Check simulation logs.";

  return "Transaction simulation failed. Check logs for details.";
}

async function simulateTransactionV0(
  connection: any, 
  tx: VersionedTransaction
): Promise<{ ok: boolean; err: string | null; logs: string[] }> {
  try {
    const { value } = await connection.simulateTransaction(tx, { 
      replaceRecentBlockhash: true, 
      commitment: "processed" 
    });
    
    if (value.err) {
      return { ok: false, err: JSON.stringify(value.err), logs: value.logs || [] };
    }
    return { ok: true, err: null, logs: value.logs || [] };
  } catch (e: any) {
    return { ok: false, err: e.message, logs: [] };
  }
}

async function sendRawTxWithRetry(
  connection: any,
  rawTx: Uint8Array,
  maxRetries = 3
): Promise<string> {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await connection.sendRawTransaction(rawTx, { skipPreflight: false, maxRetries: 0 });
    } catch (e: any) {
      lastError = e;
      const msg = e.message || "";
      
      // Retryable errors
      if (
        msg.includes("Blockhash not found") ||
        msg.includes("Node is behind") ||
        msg.includes("Transaction was not confirmed") ||
        msg.includes("PriorityFeeTooLow") ||
        msg.includes("429")
      ) {
        console.warn(`Send attempt ${i + 1} failed, retrying... (${msg})`);
        await new Promise((resolve) => setTimeout(resolve, 200 * Math.pow(2, i))); // Exponential backoff
        continue;
      }
      
      // Non-retryable
      throw e;
    }
  }
  throw lastError;
}

// --- Mainnet Testing Hooks ---

export function useCheckJupiterRoute() {
  const { network } = useNetwork();

  return useMutation({
    mutationFn: async () => {
      if (network !== "mainnet") {
        throw new Error("Switch to Mainnet to check Jupiter routes.");
      }

      console.log("[JUP-MAINNET] Checking route for 1 SOL -> USDC...");
      const inputMint = MAINNET_WSOL;
      const outputMint = MAINNET_USDC;
      const amount = (1_000_000_000).toString(); // 1 SOL

      const quote = await fetchJupiterQuote({
        inputMint,
        outputMint,
        amount,
        slippageBps: 50, // 0.5%
      });

      console.log("[JUP-MAINNET] Quote received:", quote);
      console.log(`[JUP-MAINNET] Out Amount: ${quote.outAmount}`);
      console.log(`[JUP-MAINNET] Price Impact: ${quote.priceImpactPct}%`);
      
      return quote;
    },
    onSuccess: (data) => {
      toast.success(`Route Found! Out: ${parseInt(data.outAmount) / 1e6} USDC`);
    },
    onError: (error: any) => {
      console.error("Route check failed:", error);
      toast.error(error.message);
    }
  });
}

export function useSimulateMainnetSwap() {
  const { program } = useProgram();
  const { data: vaultState } = useVaultState();
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const { network } = useNetwork();

  return useMutation({
    mutationFn: async () => {
      if (network !== "mainnet") {
        throw new Error("Switch to Mainnet to simulate swaps.");
      }
      if (!program || !publicKey || !vaultState) {
        throw new Error("Wallet not connected or vault not found");
      }

      console.log("[JUP-MAINNET] Starting Simulation (No Sign/Send)...");
      
      // Hardcoded Swap: WSOL -> USDC (1 SOL)
      const amountIn = 1_000_000_000;
      const inputMint = new PublicKey(MAINNET_WSOL);
      const outputMint = MAINNET_USDC;

      let instructions: TransactionInstruction[] = [];

      // --- Step B: Fetch Quote & Instructions ---
      console.log("[JUP-MAINNET] Fetching Quote...");
      const quote = await fetchJupiterQuote({
          inputMint: inputMint.toBase58(),
          outputMint: outputMint,
          amount: amountIn.toString(),
          slippageBps: 100,
      });

      console.log("[JUP-MAINNET] Fetching Swap Instructions...");
      const jupResponse = await fetchJupiterSwapInstructions({
          quoteResponse: quote,
          userPublicKey: publicKey.toBase58(),
      });

      if (!jupResponse.swapInstruction) {
          throw new Error("Invalid Jupiter Lite API response: Missing swapInstruction");
      }

      // --- Step C: Deserialize Instructions ---
      const computeIxs = (jupResponse.computeBudgetInstructions || []).map(deserializeJupIx);
      const setupIxs = (jupResponse.setupInstructions || []).map(deserializeJupIx);
      const swapIx = deserializeJupIx(jupResponse.swapInstruction);
      const cleanupIxs = jupResponse.cleanupInstruction ? [deserializeJupIx(jupResponse.cleanupInstruction)] : [];

      // --- Step D: Assembly (SIMULATION FLOW - Direct Execution) ---
      // For simulation, we want to test if the swap ITSELF works, so we execute it directly.
      // We do NOT use the Anchor CPI here because we want to isolate Jupiter errors.
      // We also do NOT create ATAs manually; we rely on simulation state.
      
      instructions = [
          ...computeIxs,
          ...setupIxs,
          swapIx, // Direct Jupiter Swap Instruction
          ...cleanupIxs
      ];

      // --- Build Transaction ---
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhash,
        instructions: instructions,
      }).compileToV0Message();

      const tx = new VersionedTransaction(messageV0);

      // --- Simulate ---
      console.log("[JUP-MAINNET] Simulating...");
      // Using helper that already implements replaceRecentBlockhash: true
      const sim = await simulateTransactionV0(connection, tx);
      
      console.log("[JUP-MAINNET] Simulation Result:", sim);
      if (!sim.ok) {
        throw new Error(`Simulation Failed: ${parseJupiterErrorLogs(sim.logs)}`);
      }
      return sim;
    },
    onSuccess: (data) => {
      toast.success("Simulation Successful! Check console logs.");
    },
    onError: (error: any) => {
      console.error("Simulation Error:", error);
      toast.error(error.message);
    }
  });
}

// --- Execute Swap Hook ---

export function useExecuteSwap() {
  const { program } = useProgram();
  const { data: vaultState, refetch: refetchVault } = useVaultState();
  const { publicKey, sendTransaction, signTransaction } = useWallet();
  const { connection } = useConnection();
  const queryClient = useQueryClient();
  const { network } = useNetwork();

  return useMutation({
    mutationFn: async ({ amountIn }: { amountIn: number }) => {
      // 1. Basic Checks
      if (!program || !publicKey || !vaultState) {
        throw new Error("Wallet not connected or vault not found");
      }

      if (!vaultState.authority.equals(publicKey)) {
        throw new Error("You are not the vault authority.");
      }

      if (!signTransaction) {
        throw new Error("Wallet does not support transaction signing!");
      }

      console.log(`Starting Swap Execution on ${network.toUpperCase()}...`);
      const isDevnet = network === "devnet";

      let instructions: TransactionInstruction[] = [];

      if (isDevnet) {
        // --- DEVNET FLOW (Mock) ---
        console.log("[DEVNET-MOCK] Using Mock Swap Flow");
        
        // Use deterministic Devnet mint
        const mint = await getDevnetMint(publicKey);
        const inputMint = mint;
        
        // Mock Instructions (Memo Program)
        const memoProgramId = new PublicKey("Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo");
        const mockSwapData = Buffer.from("stellalpha-devnet-swap");
        
        // Derive ATAs
        const [vaultPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("user_vault"), vaultState.owner.toBuffer()],
            program.programId
        );
        
        const vaultTokenAccount = getAssociatedTokenAddressSync(
            inputMint,
            vaultPda,
            true,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        
        const platformFeeAccount = getAssociatedTokenAddressSync(
            inputMint,
            vaultState.owner,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );

        // Construct Anchor Instruction
        const anchorIx = await program.methods
            .executeSwap(new BN(amountIn), mockSwapData)
            .accountsStrict({
                vault: vaultPda,
                authority: publicKey,
                vaultTokenAccount: vaultTokenAccount,
                platformFeeAccount: platformFeeAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
                jupiterProgram: memoProgramId,
            })
            .remainingAccounts([]) // No remaining accounts for Memo
            .instruction();
            
        instructions.push(anchorIx);

      } else {
        // --- MAINNET FLOW (Real Jupiter) ---
        console.log("[JUP-MAINNET] Using Real Jupiter Flow");

        // Hardcoded Swap: WSOL -> USDC
        const inputMint = new PublicKey(MAINNET_WSOL);
        const outputMint = MAINNET_USDC;

        // --- Step A: Prepare User Accounts & Wrap SOL ---
        const prepareUserAccountsAndWrapSol = async () => {
             console.log("[JUP-MAINNET] Checking user balances & wrapping...");
             const solBalance = await connection.getBalance(publicKey);
             const wsolAta = getAssociatedTokenAddressSync(inputMint, publicKey);
             const wsolAccountInfo = await connection.getAccountInfo(wsolAta);
             const wsolBalance = wsolAccountInfo ? new BN(wsolAccountInfo.data.slice(64, 72), "le").toNumber() : 0;
             
             const ixs: TransactionInstruction[] = [];

             if (wsolBalance < amountIn) {
                const needed = amountIn - wsolBalance;
                if (solBalance >= needed) {
                    console.log(`[JUP-MAINNET] Wrapping ${needed / 1e9} SOL to WSOL...`);
                    
                    if (!wsolAccountInfo) {
                        ixs.push(
                            createAssociatedTokenAccountIdempotentInstruction(
                                publicKey, wsolAta, publicKey, inputMint
                            )
                        );
                    }
                    ixs.push(
                        SystemProgram.transfer({
                            fromPubkey: publicKey,
                            toPubkey: wsolAta,
                            lamports: needed,
                        })
                    );
                    ixs.push(createSyncNativeInstruction(wsolAta));
                } else {
                    throw new Error("Insufficient SOL/WSOL balance for swap.");
                }
             }

             // Output ATA Check
             const outputAta = getAssociatedTokenAddressSync(new PublicKey(outputMint), publicKey);
             const outputAccountInfo = await connection.getAccountInfo(outputAta);
             if (!outputAccountInfo) {
                 console.log("[JUP-MAINNET] Creating output ATA...");
                 ixs.push(
                    createAssociatedTokenAccountIdempotentInstruction(
                        publicKey, outputAta, publicKey, new PublicKey(outputMint)
                    )
                 );
             }
             return ixs;
        };

        const wrapIxs = await prepareUserAccountsAndWrapSol();
        instructions.push(...wrapIxs);

        // --- Step B: Fetch Quote & Instructions ---
        console.log("[JUP-MAINNET] Fetching Quote...");
        const quote = await fetchJupiterQuote({
            inputMint: inputMint.toBase58(),
            outputMint: outputMint,
            amount: amountIn.toString(),
            slippageBps: 100,
        });

        console.log("[JUP-MAINNET] Fetching Swap Instructions...");
        const jupResponse = await fetchJupiterSwapInstructions({
            quoteResponse: quote,
            userPublicKey: publicKey.toBase58(),
        });

        if (!jupResponse.swapInstruction) {
            throw new Error("Invalid Jupiter Lite API response: Missing swapInstruction");
        }

        // --- Step C: Deserialize Instructions ---
        const computeIxs = (jupResponse.computeBudgetInstructions || []).map(deserializeJupIx);
        const setupIxs = (jupResponse.setupInstructions || []).map(deserializeJupIx);
        const swapIx = deserializeJupIx(jupResponse.swapInstruction);
        const cleanupIxs = jupResponse.cleanupInstruction ? [deserializeJupIx(jupResponse.cleanupInstruction)] : [];

        // --- Step D: Build Anchor CPI ---
        console.log("[JUP-MAINNET] Constructing Anchor CPI...");
        const [vaultPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("user_vault"), vaultState.owner.toBuffer()],
            program.programId
        );

        const vaultTokenAccount = getAssociatedTokenAddressSync(
            inputMint,
            vaultPda,
            true,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );

        const platformFeeAccount = getAssociatedTokenAddressSync(
            inputMint,
            vaultState.owner,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        
        const anchorIx = await program.methods
            .executeSwap(new BN(amountIn), swapIx.data)
            .accountsStrict({
                vault: vaultPda,
                authority: publicKey,
                vaultTokenAccount: vaultTokenAccount,
                platformFeeAccount: platformFeeAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
                jupiterProgram: swapIx.programId,
            })
            .remainingAccounts(swapIx.keys)
            .instruction();

        // --- Step E: Assembly (EXECUTION FLOW - CPI) ---
        // Order: [Compute Budget] -> [Wrap/ATA] -> [Jupiter Setup] -> [Anchor CPI] -> [Jupiter Cleanup]
        // NOTE: swapIx is NOT included as a top-level instruction here.
        instructions = [
            ...buildComputeBudgetIxs(),
            ...computeIxs,
            ...instructions, // Contains Wrap/ATA from Step A
            ...setupIxs,
            anchorIx,
            ...cleanupIxs
        ];
      }

      // --- COMMON: Build & Send Transaction ---
      console.log("Building Transaction...");
      const latestBlockhash = await connection.getLatestBlockhash();
      
      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: instructions,
      }).compileToV0Message();

      const tx = new VersionedTransaction(messageV0);
      
      if (tx.serialize().length > 1232) {
          throw new Error("Transaction exceeds Solana max packet size (1232 bytes).");
      }

      if (!isDevnet) {
          console.log("[JUP-MAINNET] Simulating transaction...");
          const sim = await simulateTransactionV0(connection, tx);
          if (!sim.ok) {
              console.error("[JUP-MAINNET] Simulation Logs:", sim.logs);
              throw new Error(`[JUP-MAINNET] Simulation failed: ${parseJupiterErrorLogs(sim.logs)} | Logs: ${sim.logs.slice(0, 3).join(" | ")}`);
          }
          console.log("[JUP-MAINNET] Simulation succeeded.");
      }
      
      console.log("Requesting Phantom signature...");
      const signedTx = await signTransaction(tx);

      console.log("Sending raw transaction with retry...");
      const signature = await sendRawTxWithRetry(connection, signedTx.serialize());

      console.log("Transaction Sent:", signature);
      
      await connection.confirmTransaction(signature, "confirmed");
      return signature;
    },
    onSuccess: () => {
      toast.success("Swap executed successfully!");
      refetchVault();
      queryClient.invalidateQueries({ queryKey: ["vault"] });
    },
    onError: (error: any) => {
      console.error("Swap failed:", error);
      let msg = error.message;
      if (msg.includes("Route not found")) {
          msg = "Jupiter could not find a route for this swap.";
      } else if (msg.includes("Slippage tolerance exceeded")) {
          msg = "Slippage tolerance exceeded. Try increasing slippage.";
      } else if (msg.includes("Insufficient funds")) {
          msg = "Insufficient funds for this trade.";
      }
      toast.error("Failed to execute swap: " + msg);
    },
  });
}

export function useDeposit() {
  const { program } = useProgram();
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ amount, isSol, mint }: { amount: number, isSol: boolean, mint?: string }) => {
      if (!program || !publicKey) throw new Error("Not connected");
      
      const lamports = Math.floor(amount * 1_000_000_000);
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("user_vault"), publicKey.toBuffer()],
        program.programId
      );

      console.log("Sending deposit...");
      console.log("lamports:", lamports);
      console.log("vaultPda:", vaultPda.toBase58());

      if (isSol) {
        try {
          // @ts-ignore - Anchor types might not be perfectly inferred
          const tx = await program.methods
            .depositSol(new BN(lamports))
            .accountsStrict({
              vault: vaultPda,
              owner: publicKey,
              systemProgram: SystemProgram.programId,
            })
            .rpc();
          console.log("Deposit tx:", tx);
          return tx;
        } catch (e) {
          console.error("Deposit error:", e);
          throw e;
        }
      } else {
        if (!mint) throw new Error("Mint required for token deposit");
        throw new Error("Token deposit not yet implemented in UI");
      }
    },
    onSuccess: () => {
      toast.success("Deposit successful!");
      queryClient.invalidateQueries({ queryKey: ["vault"] });
    },
    onError: (error) => {
      toast.error("Deposit failed: " + error.message);
    },
  });
}

export function useWithdraw() {
  const { program } = useProgram();
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ amount, isSol, mint }: { amount: number, isSol: boolean, mint?: string }) => {
      if (!program || !publicKey) throw new Error("Not connected");
      
      const lamports = Math.floor(amount * 1_000_000_000);
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("user_vault"), publicKey.toBuffer()],
        program.programId
      );

      console.log("Sending withdrawal...");
      console.log("lamports:", lamports);
      console.log("vaultPda:", vaultPda.toBase58());

      if (isSol) {
        try {
          // @ts-ignore
          const tx = await program.methods
            .withdrawSol(new BN(lamports))
            .accountsStrict({
              vault: vaultPda,
              owner: publicKey,
              systemProgram: SystemProgram.programId,
            })
            .rpc();
          console.log("Withdraw tx:", tx);
          return tx;
        } catch (e) {
          console.error("Withdraw error:", e);
          throw e;
        }
      } else {
         if (!mint) throw new Error("Mint required for token withdraw");
         throw new Error("Token withdraw not yet implemented in UI");
      }
    },
    onSuccess: () => {
      toast.success("Withdrawal successful!");
      queryClient.invalidateQueries({ queryKey: ["vault"] });
    },
    onError: (error) => {
      toast.error("Withdrawal failed: " + error.message);
    },
  });
}

export function useDevnetSetupVaultAccounts() {
  const { program } = useProgram();
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { data: vaultState } = useVaultState();

  return useMutation({
    mutationFn: async () => {
      if (!program || !publicKey || !vaultState) throw new Error("Not connected or vault not found");
      if (!signTransaction) throw new Error("Wallet does not support signing");

      const isDevnet = connection.rpcEndpoint.includes("devnet");
      if (!isDevnet) {
        throw new Error("This function is for Devnet only");
      }

      const MOCK_MINT = await getDevnetMint(publicKey);

      // Derive Vault PDA
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("user_vault"), vaultState.owner.toBuffer()],
        program.programId
      );

      // Derive ATAs
      const vaultTokenAccount = getAssociatedTokenAddressSync(
        MOCK_MINT,
        vaultPda,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const platformFeeAccount = getAssociatedTokenAddressSync(
        MOCK_MINT,
        vaultState.owner,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      console.log("Setting up Devnet Vault Accounts...");
      console.log("Mint:", MOCK_MINT.toBase58());
      console.log("Vault ATA:", vaultTokenAccount.toBase58());
      console.log("Fee ATA:", platformFeeAccount.toBase58());

      const ixes = [];

      // 1. Create Mint if needed
      const mintInfo = await connection.getAccountInfo(MOCK_MINT);
      if (!mintInfo) {
          console.log("Mint does not exist. Creating...");
          const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
          ixes.push(
              SystemProgram.createAccountWithSeed({
                  fromPubkey: publicKey,
                  newAccountPubkey: MOCK_MINT,
                  basePubkey: publicKey,
                  seed: "stellalpha-mint",
                  space: MINT_SIZE,
                  lamports,
                  programId: TOKEN_PROGRAM_ID,
              })
          );
          ixes.push(
              createInitializeMintInstruction(MOCK_MINT, 9, publicKey, publicKey, TOKEN_PROGRAM_ID)
          );
      }

      // 2. Create ATAs
      ixes.push(
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          vaultTokenAccount,
          vaultPda,
          MOCK_MINT,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );

      ixes.push(
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,
          platformFeeAccount,
          vaultState.owner,
          MOCK_MINT,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );

      const latestBlockhash = await connection.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: ixes,
      }).compileToV0Message();

      const tx = new VersionedTransaction(messageV0);

      console.log("Requesting Phantom signature for setup...");
      const signedTx = await signTransaction(tx);

      console.log("Sending setup transaction...");
      const signature = await connection.sendRawTransaction(
        signedTx.serialize(),
        { skipPreflight: false }
      );

      console.log("Setup Transaction Sent:", signature);
      await connection.confirmTransaction(signature, "confirmed");
      return signature;
    },
    onSuccess: () => {
      toast.success("Devnet Vault Accounts Initialized!");
    },
    onError: (error: any) => {
      console.error("Setup failed:", error);
      toast.error("Failed to setup vault accounts: " + error.message);
    },
  });
}

export function useDevnetMintTestTokens() {
  const { program } = useProgram();
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { data: vaultState } = useVaultState();

  return useMutation({
    mutationFn: async () => {
      if (!program || !publicKey || !vaultState) throw new Error("Not connected or vault not found");
      if (!signTransaction) throw new Error("Wallet does not support signing");

      const isDevnet = connection.rpcEndpoint.includes("devnet");
      if (!isDevnet) {
        throw new Error("This function is for Devnet only");
      }

      const MOCK_MINT = await getDevnetMint(publicKey);

      // Derive Vault PDA
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("user_vault"), vaultState.owner.toBuffer()],
        program.programId
      );

      // Derive Vault ATA
      const vaultTokenAccount = getAssociatedTokenAddressSync(
        MOCK_MINT,
        vaultPda,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

      console.log("Minting Test Tokens...");
      console.log("Mint:", MOCK_MINT.toBase58());
      console.log("Vault ATA:", vaultTokenAccount.toBase58());

      // Mint 1 billion tokens (decimals=6, so 1000 units) - wait, mockSwap used 6 decimals?
      // mockSwap.ts: createInitializeMintInstruction(mint, 6, ...)
      // We want 1 billion units (raw amount) to be safe.
      const amount = 1_000_000_000; 

      const ix = createMintToInstruction(
        MOCK_MINT,
        vaultTokenAccount,
        publicKey,
        amount,
        [],
        TOKEN_PROGRAM_ID
      );

      const latestBlockhash = await connection.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [ix],
      }).compileToV0Message();

      const tx = new VersionedTransaction(messageV0);

      console.log("Requesting Phantom signature for minting...");
      const signedTx = await signTransaction(tx);

      console.log("Sending mint transaction...");
      const signature = await connection.sendRawTransaction(
        signedTx.serialize(),
        { skipPreflight: false }
      );

      console.log("Mint Transaction Sent:", signature);
      await connection.confirmTransaction(signature, "confirmed");
      return signature;
    },
    onSuccess: () => {
      toast.success("Test Tokens Minted Successfully!");
    },
    onError: (error: any) => {
      console.error("Minting failed:", error);
      toast.error("Failed to mint tokens: " + error.message);
    },
  });
}
