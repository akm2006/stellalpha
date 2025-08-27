// In app/api/agent/route.ts

import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { Agentkit } from '@0xgasless/agentkit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const provider = new ethers.JsonRpcProvider(process.env.AVALANCHE_RPC_URL!);

// --- CONFIGURATION ---
const TRADER_JOE_ROUTER_ADDRESS = "0x60aE616a2155Ee3d9A68541Ba4544862310933d4";
const TRADER_JOE_ABI = [
  "function swapExactAVAXForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable",
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
];
const traderJoeInterface = new ethers.Interface(TRADER_JOE_ABI);
const ERC20_ABI_SIMPLE = ["function symbol() view returns (string)"];
const STABLECOIN_ADDRESSES = [
  "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e", // USDC
  "0x9702230a8ea53601f5e225511177af20bb36413c", // USDT.e
  "0xd586e7f844cea2f87f5015266582702126738038", // DAI.e
].map(addr => addr.toLowerCase());


let agent: Agentkit | null = null;
let isListenerSetup = false;

const getAgent = async (): Promise<Agentkit> => {
  if (agent) return agent;
  console.log("Initializing 0xGasless Agentkit...");
  const privateKeyString = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
  if (!privateKeyString) {
    throw new Error("AGENT_PRIVATE_KEY is not set in the environment variables.");
  }

  agent = await Agentkit.configureWithWallet({
    apiKey: process.env.OXGASLESS_API_KEY!,
    privateKey: privateKeyString,
    chainID: 43114,
    rpcUrl: process.env.AVALANCHE_RPC_URL!,
  });
  console.log("✅ Agentkit Initialized successfully.");
  return agent;
};

const handleNewBlock = async (blockNumber: number) => {
  console.log(`✅ New block detected: #${blockNumber}`);
  try {
    const block = await provider.getBlock(blockNumber, true);
    if (!block) return;

    const followedWalletKeys = await redis.keys('follows:*');
    if (followedWalletKeys.length === 0) return;
    
    const targetWallets = new Set(followedWalletKeys.map(key => key.split(':')[1].toLowerCase()));

    for (const tx of block.prefetchedTransactions) {
      if (tx.to && tx.to.toLowerCase() === TRADER_JOE_ROUTER_ADDRESS && targetWallets.has(tx.from.toLowerCase())) {
        console.log(`🔥🔥🔥 Matched transaction from ${tx.from} to Trader Joe! Hash: ${tx.hash}`);
        
        try {
          const parsedTx = traderJoeInterface.parseTransaction({ data: tx.data, value: tx.value });
          if (!parsedTx || !["swapExactTokensForTokens", "swapExactAVAXForTokens"].includes(parsedTx.name)) continue;

          console.log(`   - DECODED ACTION: ${parsedTx.name}`);
          const path = parsedTx.args.path;
          const tokenInAddress = path[0];
          const tokenOutAddress = path[path.length - 1];

          // --- Create and Save Signal Log ---
          let actionText = "Swapped tokens";
          try {
            const tokenOutContract = new ethers.Contract(tokenOutAddress, ERC20_ABI_SIMPLE, provider);
            const tokenOutSymbol = await tokenOutContract.symbol();
            let tokenInSymbol = "AVAX";
            if (parsedTx.name === "swapExactTokensForTokens") {
                const tokenInContract = new ethers.Contract(tokenInAddress, ERC20_ABI_SIMPLE, provider);
                tokenInSymbol = await tokenInContract.symbol();
            }
            actionText = `Swapped $${tokenInSymbol} for $${tokenOutSymbol}`;
          } catch (e) { console.warn("Could not fully enrich signal log."); }
          
          const signal = {
            id: tx.hash,
            type: STABLECOIN_ADDRESSES.includes(tokenOutAddress.toLowerCase()) ? 'sell' : 'buy',
            action: actionText,
            wallet: tx.from,
            timestamp: new Date().toISOString(),
            txHash: tx.hash
          };
          
          await redis.lpush('signal:log', JSON.stringify(signal));
          await redis.ltrim('signal:log', 0, 49);
          console.log(`   - 📝 Signal saved to log: ${actionText}`);

          // --- Execute and RECORD Copy Trade ---
          const followers = await redis.smembers(`follows:${tx.from}`);
          if (followers.length > 0) {
            const signingAgent = await getAgent();
            
            for (const userSmartAccountAddress of followers) {
              const userTradeSize = await redis.hget(`settings:${userSmartAccountAddress}`, 'tradeSize') as string | null;
              const amountToSwap = ethers.parseEther(userTradeSize ?? "0.01");

              console.log(`   - 🚀 Preparing copy-trade for user: ${userSmartAccountAddress} with size ${ethers.formatEther(amountToSwap)} AVAX`);
              
              // NEW: Record the trade details before executing
              const tradeRecord = {
                id: tx.hash,
                user: userSmartAccountAddress,
                star: tx.from,
                type: STABLECOIN_ADDRESSES.includes(tokenOutAddress.toLowerCase()) ? 'sell' : 'buy',
                amountInAVAX: ethers.formatEther(amountToSwap), // Record the value of the trade
                tokenIn: tokenInAddress,
                tokenOut: tokenOutAddress,
                timestamp: new Date().toISOString(),
                status: 'pending'
              };

              // Save the trade record to a list for that specific user
              await redis.lpush(`trades:${userSmartAccountAddress}`, JSON.stringify(tradeRecord));


              (signingAgent as any).SmartSwap({
                smartAccountAddress: userSmartAccountAddress,
                tokenIn: tokenInAddress,
                tokenOut: tokenOutAddress,
                amountIn: amountToSwap,
                paymasterUrl: `https://paymaster.0xgasless.com/v1/43114/rpc/${process.env.OXGASLESS_API_KEY!}`,
              }).then((taskId: string) => {
                 console.log(`   - ✅ UserOperation sent for ${userSmartAccountAddress}! Task ID: ${taskId}`);
              }).catch((e: any) => {
                 console.error(`   - ❌ Failed to send UserOp for ${userSmartAccountAddress}:`, e);
              });
            }
          }
        } catch (decodeError) { /* Ignore */ }
      }
    }
  } catch (error) {
    console.error(`Error processing block #${blockNumber}:`, error);
  }
};

const setupBlockListener = () => {
  if (!isListenerSetup) {
    console.log("Setting up Avalanche blockchain listener...");
    provider.on('block', handleNewBlock);
    isListenerSetup = true;
    console.log(`✅ Agent is now listening...`);
  }
};

export async function GET(request: Request) {
  setupBlockListener();
  getAgent().catch(console.error);
  return NextResponse.json({ message: "Stellalpha Agent is now fully operational and listener is active." });
}