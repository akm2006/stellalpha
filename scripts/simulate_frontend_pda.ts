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
    const WSOL_MINT = "So11111111111111111111111111111111111111112";
    
    // On Devnet, use the mock mint.
    const inputMintStr = MOCK_MINT; // connection.rpcEndpoint.includes("devnet") ? MOCK_MINT : WSOL_MINT;
    
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

    console.log("\n--- PDA Debug Logs (Frontend Simulation) ---");
    console.log("Program ID:", program.programId.toBase58());
    console.log("Wallet Pubkey:", publicKey.toBase58());
    console.log("Mint:", inputMint.toBase58());
    
    console.log("\n[Vault PDA]");
    console.log("Seeds:", ["user_vault", vaultState.owner.toBase58()]);
    console.log("Derived:", vaultPda.toBase58());
    
    console.log("\n[Vault Token Account]");
    console.log("Mint:", inputMint.toBase58());
    console.log("Owner:", vaultPda.toBase58());
    console.log("Derived:", vaultTokenAccount.toBase58());
    
    console.log("\n[Platform Fee Account]");
    console.log("Mint:", inputMint.toBase58());
    console.log("Owner:", vaultState.owner.toBase58());
    console.log("Derived:", platformFeeAccount.toBase58());
    console.log("-------------------------------\n");

  } catch (error: any) {
    console.error("Error:", error);
  }
}

main();
