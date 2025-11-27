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
} from "@solana/spl-token";

// Constants
const PROGRAM_ID = new PublicKey("66JmdAQSiB4BH6feb88kK9sU3n2fNM91QxGjYd99E3A6");

async function main() {
  try {
    // 1. Setup Provider (Mimic useWallet/useConnection)
    const walletPath = path.resolve(process.env.HOME!, ".config/solana/devnet-wallet.json");
    const walletKeypair = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(fs.readFileSync(walletPath, "utf-8")))
    );
    const wallet = new anchor.Wallet(walletKeypair);
    const publicKey = wallet.publicKey;

    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const provider = new anchor.AnchorProvider(connection, wallet, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
    anchor.setProvider(provider);

    // 2. Load Program (Mimic useProgram)
    const idlPath = path.resolve(process.cwd(), "app/idl/stellalpha_vault.json");
    const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
    const program = new Program(idl, provider);

    // 3. Mimic useExecuteSwap logic EXACTLY
    
    // Mock Vault State (Mimic useVaultState)
    const vaultState = {
        owner: publicKey,
        authority: publicKey,
    };

    // 1. Fetch Quote Logic
    // For Devnet, we use the deterministic mint from mockSwap.ts to match PDAs
    const MOCK_MINT = "AKnL4NNf3DGWZJS6cPknBuEGnVsV4A4m5tgebLHaRSZ9";
    
    // On Devnet, use the mock mint.
    const inputMintStr = MOCK_MINT; 
    
    const amountIn = 100000000;
    const jupiterData = Buffer.from("stellalpha-devnet-swap");
    const memoProgramId = new PublicKey("Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo");

    // 3. Construct Transaction Logic
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_vault"), vaultState.owner.toBuffer()],
      program.programId
    );
    
    // Derive ATAs
    const inputMint = new PublicKey(inputMintStr);
    
    const vaultTokenAccount = getAssociatedTokenAddressSync(
      inputMint,
      vaultPda,
      true
    );
    
    const platformFeeAccount = getAssociatedTokenAddressSync(
      inputMint,
      vaultState.owner // Fee goes to owner/platform wallet
    );

    const ix = await program.methods
        .executeSwap(new BN(amountIn), jupiterData)
        .accountsStrict({
          vault: vaultPda,
          authority: publicKey,
          vaultTokenAccount: vaultTokenAccount,
          platformFeeAccount: platformFeeAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          jupiterProgram: memoProgramId,
        })
        .instruction();
      
    const latestBlockhash = await connection.getLatestBlockhash();
    const messageV0 = new anchor.web3.TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [ix],
    }).compileToV0Message();

    const tx = new anchor.web3.VersionedTransaction(messageV0);
      
    console.log("\n--- FRONTEND TX ---");
    console.log("Static Account Keys:");
    messageV0.staticAccountKeys.forEach((k: any, i: number) => console.log(`${i}: ${k.toBase58()}`));
    
    console.log("\nAddress Table Lookups:", JSON.stringify(messageV0.addressTableLookups, null, 2));
    
    console.log("\nCompiled Instructions:");
    messageV0.compiledInstructions.forEach((ix: any, i: number) => {
        console.log(`Instruction ${i}:`);
        console.log(`  ProgramId Index: ${ix.programIdIndex}`);
        console.log(`  Account Key Indexes: ${JSON.stringify(ix.accountKeyIndexes)}`);
        console.log(`  Data Length: ${ix.data.length}`);
        console.log(`  Data (Base64): ${Buffer.from(ix.data).toString('base64')}`);
    });
    console.log("-------------------\n");

  } catch (error: any) {
    console.error("Error:", error);
  }
}

main();
