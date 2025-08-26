// In app/api/agent/route.ts

import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { Agentkit } from '@0xgasless/agentkit';
import { Redis } from '@upstash/redis';
const redis = Redis.fromEnv();
// This provider is for reading public data from the blockchain
const provider = new ethers.JsonRpcProvider(process.env.AVALANCHE_RPC_URL!);

// --- TRADER JOE CONFIGURATION ---
const TRADER_JOE_ROUTER_ADDRESS = "0x60aE616a2155Ee3d9A68541Ba4544862310933d4";
const TRADER_JOE_ABI = [
  "function swapExactAVAXForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable",
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
];
const traderJoeInterface = new ethers.Interface(TRADER_JOE_ABI);


let agent: Agentkit | null = null;
let isListenerSetup = false;

// This async function initializes our signing agent using the correct method
const getAgent = async (): Promise<Agentkit> => {
  if (agent) return agent;

  console.log("Initializing 0xGasless Agentkit...");
  
  const privateKeyString = `0x${process.env.AGENT_PRIVATE_KEY}` as `0x${string}`;
  if (!privateKeyString) {
    throw new Error("AGENT_PRIVATE_KEY is not set in the environment variables.");
  }

  agent = await Agentkit.configureWithWallet({
    apiKey: process.env.OXGASLESS_API_KEY!,
    privateKey: privateKeyString, // 1. Pass the private key STRING directly
    chainID: 43114, // Avalanche main net Chain ID
    rpcUrl: process.env.AVALANCHE_RPC_URL!,
  });
  console.log("✅ Agentkit Initialized successfully.");
  return agent;
};


const handleNewBlock = async (blockNumber: number) => {
  console.log(`✅ New block detected: #${blockNumber}`);

  try {
    const block = await provider.getBlock(blockNumber);
    const followedWalletKeys = await redis.keys('follows:*');
    if (followedWalletKeys.length === 0) {
  // Exit early if no one is following anything
  return;
}
    
  const targetWallets = followedWalletKeys.map(key => key.split(':')[1]);
    if (block && block.transactions) {
      for (const txHash of block.transactions) {
        const tx = await provider.getTransaction(txHash);
        
        if (tx && targetWallets.includes(tx.from) && tx.to === TRADER_JOE_ROUTER_ADDRESS) {
          console.log(`🔥🔥🔥 Matched transaction from ${tx.from} to Trader Joe! Hash: ${tx.hash}`);

          try {
            const parsedTx = traderJoeInterface.parseTransaction({ data: tx.data, value: tx.value });
            
            if (parsedTx && (parsedTx.name === "swapExactTokensForTokens" || parsedTx.name === "swapExactAVAXForTokens")) {
              console.log(`   - DECODED ACTION: ${parsedTx.name}`);
              const path = parsedTx.args.path;
              const tokenIn = path[0];
              const tokenOut = path[path.length - 1];
              console.log(`   - SWAP PATH: ${tokenIn} -> ${tokenOut}`);
              
              // Find out which of our users are following this specific wallet
              const followers = await redis.smembers(`follows:${tx.from}`);
              console.log(`   - This wallet is followed by ${followers.length} user(s).`);

              if (followers.length > 0) {
                const signingAgent = await getAgent();
                const amountToSwap = ethers.parseEther("0.01");

                for (const userSmartAccountAddress of followers) {
                  console.log(`   - Preparing copy-trade for user: ${userSmartAccountAddress}`);

                  const taskId = await (signingAgent as any).SmartSwap({
                    smartAccountAddress: userSmartAccountAddress,
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    amountIn: amountToSwap,
                    paymasterUrl: "https://paymaster.0xgasless.com/v1/43114/rpc/4ffdeefc-3423-461c-9691-bfb2bac1a64f",
                  });
                  
                  console.log(`   - ✅ Successfully sent UserOperation for ${userSmartAccountAddress}! Task ID: ${taskId}`);
                }
              }
            }
          } catch (decodeError) { /* Ignore non-swap transactions */ }
        }
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
  const message = "Stellalpha Agent is now fully operational.";
  return NextResponse.json({ message });
}