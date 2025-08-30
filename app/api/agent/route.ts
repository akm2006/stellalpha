// In app/api/agent/route.ts

import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { Redis } from '@upstash/redis';
import { Agentkit, AgentkitToolkit } from '@0xgasless/agentkit';

const redis = Redis.fromEnv();
// We will use the Fuji RPC URL from our environment variables
const provider = new ethers.JsonRpcProvider(process.env.AVALANCHE_RPC_URL!);

// --- Fuji Testnet Configuration ---
const FUJI_CHAIN_ID = 43113;
// This is the common Trader Joe V2 Router address on the Fuji Testnet
const TRADER_JOE_ROUTER_ADDRESS = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506";
// We need the ABI to understand the swap transactions
const TRADER_JOE_ABI = [
  "function swapExactAVAXForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable",
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
];
const traderJoeInterface = new ethers.Interface(TRADER_JOE_ABI);

// Global instances to manage our single agent
let agentToolkit: AgentkitToolkit | null = null;
let blockListenerActive = false;

// This function initializes the agent with a user's private key
async function initializeAgent(userPrivateKey: `0x${string}`) {
    console.log("--- Initializing Agentkit in EOA mode for Fuji Testnet ---");

    const apiKey = process.env.OXGASLESS_API_KEY;
    const rpcUrl = process.env.AVALANCHE_RPC_URL;

    if (!apiKey) throw new Error("AGENT ERROR: OXGASLESS_API_KEY is not set!");
    if (!rpcUrl) throw new Error("AGENT ERROR: AVALANCHE_RPC_URL is not set!");
    
    console.log("✅ Environment variables loaded for Fuji.");

    // Set the environment variables that the internal AgentKit tools need to function correctly
    process.env["USE_EOA"] = "true";
    process.env["PRIVATE_KEY"] = userPrivateKey;
    process.env["RPC_URL"] = rpcUrl;
    process.env["CHAIN_ID"] = String(FUJI_CHAIN_ID);
    process.env["0xGASLESS_API_KEY"] = apiKey;
    
    console.log("✅ EOA environment variables set for AgentKit tools.");

    const agentkit = await Agentkit.configureWithWallet({
        privateKey: userPrivateKey,
        rpcUrl: rpcUrl,
        apiKey: apiKey,
        chainID: FUJI_CHAIN_ID,
    });

    agentToolkit = new AgentkitToolkit(agentkit);
    
    const userWallet = new ethers.Wallet(userPrivateKey);
    console.log("✅ Agentkit initialized successfully for EOA:", userWallet.address);
}

// This function runs for every new block on the Fuji testnet
const handleNewBlock = async (blockNumber: number) => {
    if (!agentToolkit) return; // Do nothing if the agent isn't active

    console.log(`Scanning Fuji block #${blockNumber}...`);
    try {
        const block = await provider.getBlock(blockNumber, true);
        if (!block || !block.prefetchedTransactions) return;

        const followedWalletKeys = await redis.keys('follows:*');
        if (followedWalletKeys.length === 0) return;
        
        const targetWallets = new Set(followedWalletKeys.map(key => key.split(':')[1].toLowerCase()));

        for (const tx of block.prefetchedTransactions) {
            // Check if a followed wallet sent a transaction to the Trader Joe Router
            if (tx.to && tx.to.toLowerCase() === TRADER_JOE_ROUTER_ADDRESS.toLowerCase() && targetWallets.has(tx.from.toLowerCase())) {
                console.log(`🔥🔥🔥 Matched transaction from Star wallet: ${tx.from}!`);
                
                try {
                    const parsedTx = traderJoeInterface.parseTransaction({ data: tx.data, value: tx.value });
                    if (!parsedTx || !parsedTx.args.path) continue; // Ensure it's a swap with a path

                    const followers = await redis.smembers(`follows:${tx.from.toLowerCase()}`);
                    for (const userWalletAddress of followers) {
                        const tradeSize = await redis.hget(`settings:${userWalletAddress}`, 'tradeSize') as string || "0.01";
                        const fromToken = parsedTx.args.path[0];
                        const toToken = parsedTx.args.path[parsedTx.args.path.length - 1];
                        
                        console.log(`🚀 Triggering autonomous copy-trade for user ${userWalletAddress}...`);
                        
                        const tools = agentToolkit.getTools();
                        const swapTool = tools.find(t => t.name === "smart_swap");

                        if (!swapTool) {
                            throw new Error("Critical Error: 'smart_swap' tool not found in AgentkitToolkit!");
                        }

                        console.log(`✅ Found 'smart_swap' tool. Executing a swap of ${tradeSize} of ${fromToken} for ${toToken}...`);
                        
                        const result = await swapTool.invoke({
                            fromAssetAddress: fromToken,
                            toAssetAddress: toToken,
                            amount: tradeSize,
                        });

                        console.log(`✅✅✅ Gasless copy-trade EXECUTED! Result:`, result);
                        
                        const signal = { 
                            id: tx.hash,
                            type: 'copy-trade',
                            action: `Copied trade: Swapped ${tradeSize} of token ${fromToken.slice(0,6)} for ${toToken.slice(0,6)}`,
                            star: tx.from,
                            timestamp: new Date().toISOString(),
                        };
                        await redis.lpush(`signals:${userWalletAddress}`, JSON.stringify(signal));
                        console.log("📝 Signal saved to log.");
                    }
                } catch (e: any) { 
                    console.error("❌ Error during autonomous trade execution:", e.message); 
                }
            }
        }
    } catch (error: any) { 
        console.error(`❌ Error processing block #${blockNumber}:`, error.message); 
    }
};

// This is the API endpoint the frontend will call to activate the agent
export async function POST(request: Request) {
    try {
        const { userPrivateKey, starWallet, userWallet } = await request.json();

        if (!userPrivateKey || !starWallet || !userWallet) {
            return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });
        }

        // Initialize the agent with the user's provided private key
        await initializeAgent(userPrivateKey);
        
        // Save the follow relationship in the database
        await redis.sadd(`follows:${starWallet.toLowerCase()}`, userWallet.toLowerCase());
        console.log(`User ${userWallet.toLowerCase()} is now following ${starWallet.toLowerCase()}`);

        // Start the block listener only if it's not already running
        if (!blockListenerActive) {
            provider.on('block', handleNewBlock);
            blockListenerActive = true;
            console.log("✅ Block listener started on Fuji Testnet!");
        }

        return NextResponse.json({ success: true, message: "Agent activated successfully on Fuji!" });
    } catch (error: any) {
        console.error("Error activating agent:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}