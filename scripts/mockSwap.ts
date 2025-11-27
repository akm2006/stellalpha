import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const anchor = require("@coral-xyz/anchor");
const { Program, BN } = anchor;
import { PublicKey, Keypair, Connection, SystemProgram } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import { 
    getAssociatedTokenAddressSync, 
    TOKEN_PROGRAM_ID, 
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createInitializeMintInstruction,
    createAssociatedTokenAccountInstruction,
    createMintToInstruction
} from "@solana/spl-token";

// Constants
const PROGRAM_ID = new PublicKey("66JmdAQSiB4BH6feb88kK9sU3n2fNM91QxGjYd99E3A6");
const JUPITER_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const PLATFORM_FEE_WALLET = new PublicKey("11111111111111111111111111111111");

async function main() {
  try {
    // 1. Setup Provider
    const walletPath = path.resolve(process.env.HOME!, ".config/solana/devnet-wallet.json");
    const walletKeypair = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
    );
    const wallet = new anchor.Wallet(walletKeypair);
    
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    anchor.setProvider(provider);

    console.log("Wallet:", wallet.publicKey.toBase58());

    // 2. Load Program
    const idlPath = path.resolve(process.cwd(), "app/idl/stellalpha_vault.json");
    const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
    const program = new Program(idl, provider);

    // 3. Derive Vault PDA
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_vault"), wallet.publicKey.toBuffer()],
      PROGRAM_ID
    );
    console.log("Vault PDA:", vaultPda.toBase58());

    // Check if vault exists
    const vaultAccount = await connection.getAccountInfo(vaultPda);
    if (!vaultAccount) {
        console.log("Vault not initialized. Initializing...");
        await program.methods
            .initializeVault(wallet.publicKey)
            .accountsStrict({
                vault: vaultPda,
                owner: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
        console.log("Vault initialized!");
    } else {
        console.log("Vault already initialized.");
    }

    // 4. Create Mint and ATAs
    console.log("Creating Mint and ATAs...");
    // 4. Create Mint and ATAs
    console.log("Creating Mint and ATAs...");
    
    // Use createWithSeed to generate a deterministic mint unique to the wallet
    // This replaces the previous static/hash-based mints
    const MINT_SEED = "stellalpha-mint";
    const mint = await PublicKey.createWithSeed(
        wallet.publicKey,
        MINT_SEED,
        TOKEN_PROGRAM_ID
    );
    console.log("Deterministic Mint (Seed):", mint.toBase58());
    
    const lamportsForMint = await connection.getMinimumBalanceForRentExemption(82); // MINT_SIZE

    const vaultTokenAccount = getAssociatedTokenAddressSync(
        mint,
        vaultPda,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
    
    const platformFeeAccount = getAssociatedTokenAddressSync(
        mint,
        wallet.publicKey,
        false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );

    console.log("\n--- PDA Debug Logs (Script) ---");
    console.log("Program ID:", PROGRAM_ID.toBase58());
    console.log("Wallet Pubkey:", wallet.publicKey.toBase58());
    console.log("Mint:", mint.toBase58());
    
    console.log("\n[Vault PDA]");
    console.log("Seeds:", ["user_vault", wallet.publicKey.toBase58()]);
    console.log("Derived:", vaultPda.toBase58());
    
    console.log("\n[Vault Token Account]");
    console.log("Mint:", mint.toBase58());
    console.log("Owner:", vaultPda.toBase58());
    console.log("Derived:", vaultTokenAccount.toBase58());
    
    console.log("\n[Platform Fee Account]");
    console.log("Mint:", mint.toBase58());
    console.log("Owner:", wallet.publicKey.toBase58());
    console.log("Derived:", platformFeeAccount.toBase58());
    console.log("-------------------------------\n");

    console.log("TOKEN_PROGRAM_ID:", TOKEN_PROGRAM_ID.toBase58());

    const tx1 = new anchor.web3.Transaction();
    const tx2 = new anchor.web3.Transaction();
    
    // Check if Mint exists
    const mintInfo = await connection.getAccountInfo(mint);
    let mintCreated = false;
    if (!mintInfo) {
        console.log("Mint does not exist. Creating...");
        // Create Mint using createAccountWithSeed
        tx1.add(
            SystemProgram.createAccountWithSeed({
                fromPubkey: wallet.publicKey,
                newAccountPubkey: mint,
                basePubkey: wallet.publicKey,
                seed: MINT_SEED,
                space: 82,
                lamports: lamportsForMint,
                programId: TOKEN_PROGRAM_ID,
            }),
            createInitializeMintInstruction(mint, 9, wallet.publicKey, wallet.publicKey, TOKEN_PROGRAM_ID)
        );
        mintCreated = true;
    } else {
        console.log("Mint already exists.");
        console.log("Mint Owner:", mintInfo.owner.toBase58());
    }

    if (mintCreated) {
        console.log("Sending Mint Creation Transaction...");
        // Only wallet needs to sign for createAccountWithSeed (as base and payer)
        await provider.sendAndConfirm(tx1, [walletKeypair]);
        console.log("Mint Created.");
    }

    // Create Vault ATA if needed
    const vaultAtaInfo = await connection.getAccountInfo(vaultTokenAccount);
    if (!vaultAtaInfo) {
        console.log("Creating Vault ATA...");
        tx2.add(
            createAssociatedTokenAccountInstruction(
                wallet.publicKey,
                vaultTokenAccount,
                vaultPda,
                mint,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            )
        );
    } else {
        console.log("Vault ATA already exists.");
    }

    // Create Fee ATA if needed
    const feeAtaInfo = await connection.getAccountInfo(platformFeeAccount);
    if (!feeAtaInfo) {
        console.log("Creating Fee ATA...");
        tx2.add(
            createAssociatedTokenAccountInstruction(
                wallet.publicKey,
                platformFeeAccount,
                wallet.publicKey,
                mint,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            )
        );
    } else {
        console.log("Fee ATA already exists.");
    }

    // Mint to Vault
    tx2.add(
        createMintToInstruction(
            mint,
            vaultTokenAccount,
            wallet.publicKey,
            1000000,
            [],
            TOKEN_PROGRAM_ID
        )
    );

    console.log("Sending ATA/MintTo Transaction...");
    await provider.sendAndConfirm(tx2, [walletKeypair]);
    console.log("Setup complete.");

    // 5. Execute Swap
    console.log("Executing Swap...");

    // Mock Jupiter Data (Devnet)
    const memoProgramId = new PublicKey("Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo");
    const jupiterData = Buffer.from("stellalpha-devnet-swap");

    // Use 0.1 SOL (100,000,000 lamports) to match frontend default
    const amountIn = new BN(100000000);
    const ix = await program.methods
      .executeSwap(amountIn, jupiterData)
      .accountsStrict({
        vault: vaultPda,
        authority: wallet.publicKey,
        vaultTokenAccount: vaultTokenAccount,
        platformFeeAccount: platformFeeAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
        jupiterProgram: memoProgramId,
      })
      // Memo program doesn't strictly need accounts, but we can pass one if we want to test remainingAccounts
      // .remainingAccounts([...]) 
      .instruction();
    
    const latestBlockhash = await connection.getLatestBlockhash();
    const messageV0 = new anchor.web3.TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [ix],
    }).compileToV0Message();

    const tx = new anchor.web3.VersionedTransaction(messageV0);
    
    // Sign with wallet keypair
    tx.sign([walletKeypair]);

    console.log("Sending Transaction...");
    const signature = await connection.sendTransaction(tx);
    console.log("Success! Signature:", signature);

  } catch (error: any) {
    console.error("Error executing swap:", error);
    if (error.logs) {
      console.log("Logs:", error.logs);
    }
  }
}

main();
