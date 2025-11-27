import Client, {
  CommitmentLevel,
  SubscribeRequest,
} from "@triton-one/yellowstone-grpc";
import { createSolanaRpc } from "@solana/kit";
import { address } from "@solana/addresses";
import { Redis } from "@upstash/redis";
import dotenv from "dotenv";
import bs58 from "bs58";

dotenv.config();

// --- Configuration ---
const GRPC_ENDPOINT = process.env.GRPC_ENDPOINT || "http://127.0.0.1:10000";
const GRPC_TOKEN = process.env.GRPC_TOKEN;
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || "https://api.devnet.solana.com";
const JUPITER_PROGRAM_ID = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

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

async function main() {
  console.log("🚀 Starting Stellalpha Watcher Agent...");

  // 1. Connect to Yellowstone gRPC
  const client = new Client(GRPC_ENDPOINT, GRPC_TOKEN, undefined);
  
  // 2. Get Star Traders from Redis
  // In a real app, we'd refresh this periodically or listen for updates
  const starTraders = await redis.smembers("star_traders");
  const starTraderAddresses = starTraders.length > 0 ? starTraders : []; 
  
  console.log(`👀 Monitoring ${starTraderAddresses.length} Star Traders.`);

  // 3. Subscribe to Transactions
  const stream = await client.subscribe();
  
  const request: SubscribeRequest = {
    accounts: {},
    slots: {},
    transactions: {
      jupiterSwaps: {
        vote: false,
        failed: false,
        signature: undefined,
        accountInclude: [JUPITER_PROGRAM_ID], // Filter by Jupiter Program
        accountExclude: [],
        accountRequired: [], // We'll filter by Star Traders in the loop for dynamic updates
      },
    },
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
    commitment: CommitmentLevel.CONFIRMED,
    accountsDataSlice: [],
    ping: undefined,
  };

  stream.write(request);

  console.log("✅ Subscription active. Waiting for signals...");

  for await (const data of stream) {
    if (data.transaction && data.transaction.transaction) {
      const tx = data.transaction.transaction;
      const signature = bs58.encode(tx.signature);
      
      // Basic filtering: Check if signer is a Star Trader
      // The first account is usually the fee payer/signer
      const accountKeys = tx.transaction?.message.accountKeys.map((k: Buffer) => bs58.encode(k)) || [];
      const signer = accountKeys[0];

      if (starTraderAddresses.includes(signer)) {
        console.log(`✨ Detected transaction from Star Trader: ${signer} (${signature})`);
        
        // Check if it's a Jupiter Swap
        // We already filtered by accountInclude JUPITER_PROGRAM_ID, but let's be sure
        if (accountKeys.includes(JUPITER_PROGRAM_ID)) {
          console.log(`🪐 It is a Jupiter Swap! Parsing details...`);
          
          // TODO: Deep parsing of instruction data to extract input/output mints and amounts.
          // For now, we'll infer or use placeholders as we don't have the IDL loaded here easily.
          // In a production version, we would use the Jupiter IDL or parse token balance changes.
          
          // Placeholder signal construction
          const signal: Signal = {
            id: signature,
            type: "copy-trade",
            action: "Swap on Jupiter",
            starWallet: signer,
            timestamp: new Date().toISOString(),
            txHash: signature,
            fromTokenAddress: "So11111111111111111111111111111111111111112", // SOL (Placeholder)
            toTokenAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC (Placeholder)
            amountIn: "1000000000", // 1 SOL
            minAmountOut: "0", // Slippage check handles this later
          };

          // Push to Redis for all followers
          const followers = await redis.smembers(`follows:${signer}`);
          for (const follower of followers) {
             // CHECK PAUSE STATE HERE?
             // Ideally we check pause state before pushing, or Relayer checks it.
             // Relayer check is safer as it's closer to execution.
             // But we can check here to save Redis ops.
             // Let's assume Relayer checks it for now to keep Watcher fast.
             
             await redis.lpush(`signals:${follower}`, JSON.stringify(signal));
             console.log(`📨 Signal pushed for follower: ${follower}`);
          }
        }
      }
    }
  }
}

main().catch((err) => {
  console.error("❌ Fatal Agent Error:", err);
  process.exit(1);
});
