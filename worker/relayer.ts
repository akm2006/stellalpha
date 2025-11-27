import {
  createSolanaRpc,
  KeyPairSigner,
  createKeyPairSignerFromBytes,
  createTransactionMessage,
  setTransactionMessageLifetimeUsingBlockhash,
  setTransactionMessageFeePayer,
  appendTransactionMessageInstruction,
  getSignatureFromTransaction,
  compileTransaction,
  Rpc,
  SolanaRpcApi,
  TransactionMessage,
  Instruction,
  AccountRole,
  ReadonlyUint8Array,
  getBase64EncodedWireTransaction,
  signTransaction,
} from "@solana/kit";
import { 
  address, 
  Address, 
  getProgramDerivedAddress 
} from "@solana/addresses";
import { pipe } from "@solana/functional";
import { Redis } from "@upstash/redis";
import { createJupiterApiClient, QuoteGetRequest, QuoteResponse } from '@jup-ag/api';
import bs58 from "bs58";
import dotenv from "dotenv";

dotenv.config();

// --- Configuration ---
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || "https://api.devnet.solana.com";
const AGENT_PRIVATE_KEY_BYTES = process.env.AGENT_PRIVATE_KEY 
  ? bs58.decode(process.env.AGENT_PRIVATE_KEY) 
  : new Uint8Array([]); 
const PROGRAM_ID = address("4CsLHTcWU9tWEC1WscpSJpULx6neGzTNKdS92AwdnNY2"); 
const JUPITER_PROGRAM_ID = address("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
const PLATFORM_FEE_WALLET = address("11111111111111111111111111111111"); 

// --- Interfaces ---
interface Signal {
  id: string;
  type: "copy-trade";
  action: string;
  starWallet: string;
  timestamp: string;
  txHash: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  amountIn: string;
  minAmountOut: string;
}

// --- State ---
const redis = Redis.fromEnv();
const rpc = createSolanaRpc(RPC_ENDPOINT);
const jupiterQuoteApi = createJupiterApiClient();

// --- Helpers ---

async function getAgentSigner(): Promise<KeyPairSigner> {
  if (AGENT_PRIVATE_KEY_BYTES.length === 0) {
    throw new Error("AGENT_PRIVATE_KEY not set in .env");
  }
  return await createKeyPairSignerFromBytes(AGENT_PRIVATE_KEY_BYTES);
}

async function deriveVaultPda(owner: Address): Promise<readonly [Address, number]> {
  // seeds = [b"user_vault", owner]
  const seeds = [
    new TextEncoder().encode("user_vault"),
    getAddressEncoder().encode(owner),
  ];
  return await getProgramDerivedAddress({ programAddress: PROGRAM_ID, seeds });
}

// Helper to encode address to bytes for seeds (v2 specific)
function getAddressEncoder() {
    return {
        encode: (addr: Address) => {
            // Address in v2 is a string. We need bytes.
            // Use bs58 decode? Or v2 has a helper?
            // v2 `getAddressEncoder` exists in `@solana/addresses`?
            // For now, bs58 decode is safe for standard addresses.
            return bs58.decode(addr);
        }
    };
}

const EXECUTE_SWAP_DISCRIMINATOR = new Uint8Array([167, 133, 224, 196, 243, 23, 155, 173]); // Placeholder

function buildExecuteSwapIx(
  vault: Address,
  authority: Address,
  vaultTokenAccount: Address, // We need to derive this too? Or passed in signal?
  platformFeeAccount: Address,
  jupiterProgram: Address,
  tokenProgram: Address,
  amountIn: bigint,
  jupiterData: Uint8Array,
  remainingAccounts: any[] 
): Instruction {
  
  const dataSize = 8 + 8 + 4 + jupiterData.length;
  const data = new Uint8Array(dataSize);
  
  data.set(EXECUTE_SWAP_DISCRIMINATOR, 0);
  const amountView = new DataView(data.buffer);
  amountView.setBigUint64(8, amountIn, true);
  amountView.setUint32(16, jupiterData.length, true);
  data.set(jupiterData, 20);
  
  const accounts = [
    { address: vault, role: AccountRole.WRITABLE },
    { address: authority, role: AccountRole.READONLY_SIGNER },
    { address: vaultTokenAccount, role: AccountRole.WRITABLE },
    { address: platformFeeAccount, role: AccountRole.WRITABLE },
    { address: tokenProgram, role: AccountRole.READONLY },
    { address: jupiterProgram, role: AccountRole.READONLY },
    ...remainingAccounts.map(acc => ({
      address: address(acc.pubkey),
      role: acc.isWritable ? AccountRole.WRITABLE : AccountRole.READONLY,
    }))
  ];

  return {
    programAddress: PROGRAM_ID,
    accounts,
    data,
  };
}

async function main() {
  console.log("🚀 Starting Stellalpha Relayer...");
  const agent = await getAgentSigner();
  console.log(`🤖 Agent Wallet: ${agent.address}`);

  while (true) {
    try {
      const signalKeys = await redis.keys("signals:*");
      
      for (const key of signalKeys) {
        const signalData = await redis.rpop(key);
        if (!signalData) continue;
        
        const signal: Signal = typeof signalData === 'string' ? JSON.parse(signalData) : signalData;
        console.log(`📥 Processing signal: ${signal.id}`);
        
        const userWalletStr = key.split(":")[1];
        const userWallet = address(userWalletStr);
        const [vaultPda] = await deriveVaultPda(userWallet);
        
        // TODO: Fetch Vault State & Check Pause (Skipped for brevity in this step)
        
        // Fetch Quote
        const quote = await jupiterQuoteApi.quoteGet({
          inputMint: signal.fromTokenAddress,
          outputMint: signal.toTokenAddress,
          amount: Number(signal.amountIn),
          slippageBps: 50, 
        });
        
        if (!quote) continue;
        
        // Get Swap Instructions (Better for CPI)
        const instructions = await jupiterQuoteApi.swapInstructionsPost({
          swapRequest: {
            quoteResponse: quote,
            userPublicKey: vaultPda, // Vault is the user!
            wrapAndUnwrapSol: true,
          }
        });
        
        if (!instructions || !instructions.swapInstruction) {
            console.error("❌ Failed to get swap instructions");
            continue;
        }

        const swapIx = instructions.swapInstruction;
        // Decode base64 data
        const jupiterData = Buffer.from(swapIx.data, 'base64');
        
        // Build Transaction
        // We need vault token account.
        // For now, assume it's the ATA of the vault for the input mint.
        // We can derive it.
        // const vaultTokenAccount = await getAssociatedTokenAddress(...)
        // Placeholder:
        const vaultTokenAccount = address("11111111111111111111111111111111"); 
        
        const executeSwapIx = buildExecuteSwapIx(
            vaultPda,
            agent.address,
            vaultTokenAccount,
            PLATFORM_FEE_WALLET,
            JUPITER_PROGRAM_ID,
            address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), // Token Program
            BigInt(signal.amountIn),
            new Uint8Array(jupiterData),
            swapIx.accounts
        );

        const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

        const message = pipe(
            createTransactionMessage({ version: 0 }),
            m => setTransactionMessageFeePayer(agent.address, m),
            m => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
            m => appendTransactionMessageInstruction(executeSwapIx, m)
        );
        
        const compiledTx = compileTransaction(message);
        const signedTx = await signTransaction([agent.keyPair], compiledTx);
        const signature = getSignatureFromTransaction(signedTx); // We need this back

        // Send
        // const encodedTx = getBase64EncodedWireTransaction(signedTx);
        // await rpc.sendTransaction(encodedTx, { encoding: 'base64' }).send();

        console.log(`✅ Transaction Signed: ${signature} (Simulation)`);
      }

      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.error("Error in relayer loop:", e);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

main();
