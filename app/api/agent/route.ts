// In app/api/agent/route.ts

import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { Redis } from '@upstash/redis';
import { Agentkit, AgentkitToolkit } from '@0xgasless/agentkit';

const redis = Redis.fromEnv();
const provider = new ethers.JsonRpcProvider(process.env.AVALANCHE_RPC_URL!);

// --- DEX Configurations ---

// 1. Trader Joe
const TRADER_JOE_ROUTER_ADDRESS = "0x60aE616a2155Ee3d9A68541Ba4544862310933d4";
const TRADER_JOE_ABI = [
  "function swapExactAVAXForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable",
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
];
const traderJoeInterface = new ethers.Interface(TRADER_JOE_ABI);

// 2. SushiSwap
const SUSHISWAP_ROUTER_ADDRESS = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b479975b6";
const SUSHISWAP_ABI = [
    // Note: The function is named swapExactETHForTokens but works for AVAX on Avalanche
    "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable",
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
];
const sushiswapInterface = new ethers.Interface(SUSHISWAP_ABI);


// --- Supported DEXs Array ---
// To add more DEXs, add their configuration here.
const supportedDexes = [
    {
        name: 'TraderJoe',
        address: TRADER_JOE_ROUTER_ADDRESS,
        interface: traderJoeInterface,
    },
    {
        name: 'SushiSwap',
        address: SUSHISWAP_ROUTER_ADDRESS,
        interface: sushiswapInterface
    }
    //Example - { name: 'Pangolin', address: PANGOLIN_ROUTER_ADDRESS, interface: pangolinInterface },
];


// --- Redis Key for Agent State ---
const AGENT_STATUS_KEY = "agent:status:fuji";

// Global instances to manage our single agent
let agentToolkit: AgentkitToolkit | null = null;
let blockListenerActive = false;

async function initializeAgent(userPrivateKey: `0x${string}`) {
    console.log("--- Initializing Agentkit in EOA mode for Fuji Testnet ---");

    const apiKey = process.env.OXGASLESS_API_KEY;
    const rpcUrl = process.env.AVALANCHE_RPC_URL;

    if (!apiKey) throw new Error("AGENT ERROR: OXGASLESS_API_KEY is not set!");
    if (!rpcUrl) throw new Error("AGENT ERROR: AVALANCHE_RPC_URL is not set!");

    console.log("✅ Environment variables loaded for Fuji.");

    process.env["USE_EOA"] = "true";
    process.env["PRIVATE_KEY"] = userPrivateKey;
    process.env["RPC_URL"] = rpcUrl;
    process.env["CHAIN_ID"] = process.env.CHAIN_ID;
    process.env["0xGASLESS_API_KEY"] = apiKey;

    console.log("✅ EOA environment variables set for AgentKit tools.");

    const agentkit = await Agentkit.configureWithWallet({
        privateKey: userPrivateKey,
        rpcUrl: rpcUrl,
        apiKey: apiKey,
        chainID: Number(process.env.CHAIN_ID!),
    });

    agentToolkit = new AgentkitToolkit(agentkit);

    const userWallet = new ethers.Wallet(userPrivateKey);
    console.log("✅ Agentkit initialized successfully for EOA:", userWallet.address);
}

const handleNewBlock = async (blockNumber: number) => {
    // --- Redis "Kill Switch" Check ---
    const agentStatus = await redis.get(AGENT_STATUS_KEY);
    if (agentStatus !== 'active') {
        console.log(`Agent status is '${agentStatus}'. Shutting down this block listener instance.`);
        provider.removeAllListeners('block');
        blockListenerActive = false;
        agentToolkit = null;
        return;
    }
    
    // In-memory check for safety
    if (!agentToolkit || !blockListenerActive) return;

    console.log(`Scanning Fuji block #${blockNumber}...`);
    try {
        const block = await provider.getBlock(blockNumber, true);
        if (!block || !block.prefetchedTransactions) return;

        const followedWalletKeys = await redis.keys('follows:*');
        if (followedWalletKeys.length === 0) return;

        const targetWallets = new Set(followedWalletKeys.map(key => key.split(':')[1].toLowerCase()));

        for (const tx of block.prefetchedTransactions) {
            // Iterate over each supported DEX
            for (const dex of supportedDexes) {
                if (tx.to && tx.to.toLowerCase() === dex.address.toLowerCase() && targetWallets.has(tx.from.toLowerCase())) {
                    console.log(`🔥🔥🔥 Matched transaction from Star wallet: ${tx.from} on ${dex.name}!`);

                    try {
                        const parsedTx = dex.interface.parseTransaction({ data: tx.data, value: tx.value });
                        
                        // Check if the transaction is a swap and has a path
                        if (!parsedTx || !parsedTx.args.path) continue;

                        const followers = await redis.smembers(`follows:${tx.from.toLowerCase()}`);
                        for (const userWalletAddress of followers) {
                            const tradeSize = await redis.hget(`settings:${userWalletAddress}`, 'tradeSize') as string || "0.01";
                            const fromToken = parsedTx.args.path[0];
                            const toToken = parsedTx.args.path[parsedTx.args.path.length - 1];

                            console.log(`🚀 Triggering autonomous copy-trade for user ${userWalletAddress} on ${dex.name}...`);

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
                                action: `Copied trade on ${dex.name}: Swapped ${tradeSize} of token ${fromToken.slice(0,6)} for ${toToken.slice(0,6)}`,
                                starWallet: tx.from,
                                timestamp: new Date().toISOString(),
                                txHash: tx.hash
                            };
                            await redis.lpush(`signals:${userWalletAddress}`, JSON.stringify(signal));
                            console.log("📝 Signal saved to log.");
                        }
                    } catch (e: any) {
                        // This might be a non-swap transaction to the router, so we can ignore the error
                        // console.error(`Could not parse transaction for ${dex.name}:`, e.message);
                    }
                }
            }
        }
    } catch (error: any) {
        console.error(`❌ Error processing block #${blockNumber}:`, error.message);
    }
};

export async function POST(request: Request) {
    try {
        const { userPrivateKey, starWallet, userWallet } = await request.json();

        if (!userPrivateKey || !starWallet || !userWallet) {
            return NextResponse.json({ success: false, error: 'Missing parameters' }, { status: 400 });
        }
        
        // Set the agent status to active in Redis
        await redis.set(AGENT_STATUS_KEY, 'active');
        console.log(`✅ Agent status set to 'active' in Redis.`);

        await initializeAgent(userPrivateKey);

        await redis.sadd(`follows:${starWallet.toLowerCase()}`, userWallet.toLowerCase());
        console.log(`User ${userWallet.toLowerCase()} is now following ${starWallet.toLowerCase()}`);

        if (!blockListenerActive) {
            provider.on('block', handleNewBlock);
            blockListenerActive = true;
            console.log("✅ Block listener started on Fuji Testnet!");
        }

        return NextResponse.json({ success: true, message: "Agent activated successfully on Fuji!" });
    } catch (error: any) {
        console.error("Error activating agent:", error);
        // In case of an error during activation, set status to inactive
        await redis.set(AGENT_STATUS_KEY, 'inactive');
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        // Set the agent status to inactive in Redis
        await redis.set(AGENT_STATUS_KEY, 'inactive');
        console.log("✅ Agent status set to 'inactive' in Redis. Any active listeners will now self-terminate.");

        // Still attempt to remove listeners on the current instance as a good practice
        if (blockListenerActive) {
            provider.removeAllListeners('block');
            blockListenerActive = false;
            agentToolkit = null;
            console.log("✅ Cleaned up current serverless instance.");
        }
        return NextResponse.json({ success: true, message: "Agent deactivation signal sent successfully." });
    } catch (error: any) {
        console.error("Error deactivating agent:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}