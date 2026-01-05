/**
 * StellAlpha Program Integration Library
 * 
 * Shared utilities for backend API routes and frontend.
 * Provides Anchor program loading, PDA derivation, and transaction building.
 */

import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import * as fs from "fs";
import * as os from "os";

// Import types from local copy (anchor folder is gitignored)
import type { StellalphaVault } from "./types/stellalpha_vault";

// ============================================================================
// Configuration
// ============================================================================

export const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8899";
export const MAINNET_RPC = "https://api.mainnet-beta.solana.com";

export const STELLALPHA_PROGRAM_ID = new PublicKey(
  process.env.STELLALPHA_PROGRAM_ID || "64XogE2RvY7g4fDp8XxWZxFTycANjDK37n88GZizm5nx"
);

export const JUPITER_PROGRAM_ID = new PublicKey(
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"
);

// Token Mints
export const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
export const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

// ============================================================================
// Backend Wallet Loading
// ============================================================================

let cachedBackendKeypair: Keypair | null = null;

export function getBackendWalletPath(): string {
  return process.env.BACKEND_WALLET_PATH || os.homedir() + "/.config/solana/devnet-wallet.json";
}

export function loadBackendKeypair(): Keypair {
  if (cachedBackendKeypair) return cachedBackendKeypair;
  
  const walletPath = getBackendWalletPath();
  if (!fs.existsSync(walletPath)) {
    throw new Error(`Backend wallet not found at ${walletPath}`);
  }
  
  const rawKey = JSON.parse(fs.readFileSync(walletPath, "utf-8"));
  cachedBackendKeypair = Keypair.fromSecretKey(Uint8Array.from(rawKey));
  return cachedBackendKeypair;
}

export function hasBackendWallet(): boolean {
  try {
    loadBackendKeypair();
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Anchor Program Loading
// ============================================================================

let cachedIdl: any = null;

export function loadIdl(): any {
  if (cachedIdl) return cachedIdl;
  
  // Use local IDL copy (anchor folder is gitignored)
  cachedIdl = require("./types/stellalpha_vault.json");
  
  // Override address for localnet
  cachedIdl.address = STELLALPHA_PROGRAM_ID.toBase58();
  return cachedIdl;
}

// Custom wallet implementation for AnchorProvider (avoiding ESM import issues)
class NodeWallet implements anchor.Wallet {
  constructor(readonly payer: Keypair) {}

  async signTransaction<T extends anchor.web3.Transaction | anchor.web3.VersionedTransaction>(tx: T): Promise<T> {
    if ('version' in tx) {
      (tx as anchor.web3.VersionedTransaction).sign([this.payer]);
    } else {
      (tx as anchor.web3.Transaction).partialSign(this.payer);
    }
    return tx;
  }

  async signAllTransactions<T extends anchor.web3.Transaction | anchor.web3.VersionedTransaction>(txs: T[]): Promise<T[]> {
    return Promise.all(txs.map((tx) => this.signTransaction(tx)));
  }

  get publicKey(): PublicKey {
    return this.payer.publicKey;
  }
}

export function getProgram(connection: Connection): anchor.Program<StellalphaVault> {
  const keypair = loadBackendKeypair();
  const wallet = new NodeWallet(keypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    preflightCommitment: "confirmed",
  });
  
  const idl = loadIdl();
  return new anchor.Program<StellalphaVault>(idl as StellalphaVault, provider);
}

export function getConnection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

// ============================================================================
// PDA Derivation
// ============================================================================

export function deriveGlobalConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("global_config")],
    STELLALPHA_PROGRAM_ID
  );
}

export function deriveVaultPda(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("user_vault_v1"), owner.toBuffer()],
    STELLALPHA_PROGRAM_ID
  );
}

export function deriveTraderStatePda(
  owner: PublicKey,
  trader: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("trader_state"), owner.toBuffer(), trader.toBuffer()],
    STELLALPHA_PROGRAM_ID
  );
}

export function getVaultAta(vault: PublicKey, mint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, vault, true);
}

export function getTraderAta(traderState: PublicKey, mint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, traderState, true);
}

// ============================================================================
// Account Fetching
// ============================================================================

export interface VaultInfo {
  address: PublicKey;
  owner: PublicKey;
  baseMint: PublicKey;
  bump: number;
}

export interface TraderStateInfo {
  address: PublicKey;
  vault: PublicKey;
  trader: PublicKey;
  isInitialized: boolean;
  isPaused: boolean;
  currentValue: bigint;
  // Use hardcoded mints since TraderState doesn't store them
  inputMint: PublicKey;
  outputMint: PublicKey;
  inputBalance: bigint;
  outputBalance: bigint;
}

export async function fetchVault(
  connection: Connection,
  vaultAddress: PublicKey
): Promise<VaultInfo | null> {
  const program = getProgram(connection);
  try {
    const account = await program.account.userVault.fetch(vaultAddress);
    return {
      address: vaultAddress,
      owner: account.owner,
      baseMint: account.baseMint,
      bump: account.bump,
    };
  } catch {
    return null;
  }
}

export async function fetchTraderState(
  connection: Connection,
  traderStateAddress: PublicKey
): Promise<TraderStateInfo | null> {
  const program = getProgram(connection);
  try {
    const account = await program.account.traderState.fetch(traderStateAddress);
    
    // TraderState uses SOL as input and USDC as output (hardcoded for now)
    const inputMint = SOL_MINT;
    const outputMint = USDC_MINT;
    
    // Get token balances
    const inputAta = getTraderAta(traderStateAddress, inputMint);
    const outputAta = getTraderAta(traderStateAddress, outputMint);
    
    let inputBalance = BigInt(0);
    let outputBalance = BigInt(0);
    
    try {
      const inputInfo = await connection.getTokenAccountBalance(inputAta);
      inputBalance = BigInt(inputInfo.value.amount);
    } catch {}
    
    try {
      const outputInfo = await connection.getTokenAccountBalance(outputAta);
      outputBalance = BigInt(outputInfo.value.amount);
    } catch {}
    
    return {
      address: traderStateAddress,
      vault: account.vault,
      trader: account.trader,
      isInitialized: account.isInitialized,
      isPaused: account.isPaused,
      currentValue: BigInt(account.currentValue.toString()),
      inputMint,
      outputMint,
      inputBalance,
      outputBalance,
    };
  } catch {
    return null;
  }
}

export async function listAllVaults(connection: Connection): Promise<VaultInfo[]> {
  const program = getProgram(connection);
  const accounts = await program.account.userVault.all();
  
  return accounts.map((acc) => ({
    address: acc.publicKey,
    owner: acc.account.owner,
    baseMint: acc.account.baseMint,
    bump: acc.account.bump,
  }));
}

export async function listTradersByVault(
  connection: Connection,
  vaultAddress: PublicKey
): Promise<TraderStateInfo[]> {
  const program = getProgram(connection);
  
  // TraderState layout: discriminator(8) + owner(32) + trader(32) + vault(32)
  // vault starts at offset 8 + 32 + 32 = 72
  const VAULT_OFFSET = 8 + 32 + 32;
  
  const accounts = await program.account.traderState.all([
    {
      memcmp: {
        offset: VAULT_OFFSET,
        bytes: vaultAddress.toBase58(),
      },
    },
  ]);
  
  // Use hardcoded mints
  const inputMint = SOL_MINT;
  const outputMint = USDC_MINT;
  
  const results: TraderStateInfo[] = [];
  
  for (const acc of accounts) {
    const inputAta = getTraderAta(acc.publicKey, inputMint);
    const outputAta = getTraderAta(acc.publicKey, outputMint);
    
    let inputBalance = BigInt(0);
    let outputBalance = BigInt(0);
    
    try {
      const inputInfo = await connection.getTokenAccountBalance(inputAta);
      inputBalance = BigInt(inputInfo.value.amount);
    } catch {}
    
    try {
      const outputInfo = await connection.getTokenAccountBalance(outputAta);
      outputBalance = BigInt(outputInfo.value.amount);
    } catch {}
    
    results.push({
      address: acc.publicKey,
      vault: acc.account.vault,
      trader: acc.account.trader,
      isInitialized: acc.account.isInitialized,
      isPaused: acc.account.isPaused,
      currentValue: BigInt(acc.account.currentValue.toString()),
      inputMint,
      outputMint,
      inputBalance,
      outputBalance,
    });
  }
  
  return results;
}

// ============================================================================
// Token Helpers
// ============================================================================

export async function getTokenBalance(
  connection: Connection,
  tokenAccount: PublicKey
): Promise<bigint> {
  try {
    const info = await connection.getTokenAccountBalance(tokenAccount);
    return BigInt(info.value.amount);
  } catch {
    return BigInt(0);
  }
}

export async function getSolBalance(
  connection: Connection,
  address: PublicKey
): Promise<number> {
  return connection.getBalance(address);
}

// ============================================================================
// Constants for Frontend
// ============================================================================

export const DECIMALS = {
  SOL: 9,
  USDC: 6,
};

export function formatSol(lamports: bigint | number): string {
  return (Number(lamports) / LAMPORTS_PER_SOL).toFixed(4);
}

export function formatUsdc(rawAmount: bigint | number): string {
  return (Number(rawAmount) / 1e6).toFixed(2);
}

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

export function usdcToRaw(usdc: number): number {
  return Math.floor(usdc * 1e6);
}
