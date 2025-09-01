// In app/api/agent/route.ts

import { NextResponse } from 'next/server';
import { ethers } from 'ethers';
import { Redis } from '@upstash/redis';
import { Agentkit, AgentkitToolkit } from '@0xgasless/agentkit';

const redis = Redis.fromEnv();
const provider = new ethers.JsonRpcProvider(process.env.AVALANCHE_RPC_URL!);

// --- Token & DEX Configurations ---

// Wrapped AVAX (WAVAX) on Fuji Testnet
const WAVAX_ADDRESS = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";

// 1. Trader Joe V2.1 Router
const TRADER_JOE_ROUTER_ADDRESS = "0x45A62B090DF48243F12A21897e7ed91863E2c86b";
const TRADER_JOE_ABI = [
  "function swapExactIn(address logic, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, address to, uint256 deadline, bytes route) external payable"
];
const traderJoeInterface = new ethers.Interface(TRADER_JOE_ABI);

// 2. SushiSwap Router
const SUSHISWAP_ROUTER_ADDRESS = "0x1b02dA8Cb0d097eB8D57A175b88c7D8b479975b6";
const SUSHISWAP_ABI = [
    "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable",
    "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
];
const sushiswapInterface = new ethers.Interface(SUSHISWAP_ABI);


// --- Supported DEXs Array ---
const supportedDexes = [
    {
        name: 'TraderJoe',
        address: TRADER_JOE_ROUTER_ADDRESS,
        interface: traderJoeInterface,
        isV2: true
    },
    {
        name: 'SushiSwap',
        address: SUSHISWAP_ROUTER_ADDRESS,
        interface: sushiswapInterface,
        isV2: false
    }
];


// --- Redis Key for Agent State ---
const AGENT_STATUS_KEY = "agent:status:fuji";

// Global instances
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
    const agentStatus = await redis.get(AGENT_STATUS_KEY);
    if (agentStatus !== 'active') {
        console.log(`Agent status is '${agentStatus}'. Shutting down this block listener instance.`);
        provider.removeAllListeners('block');
        blockListenerActive = false;
        agentToolkit = null;
        return;
    }
    
    if (!agentToolkit || !blockListenerActive) return;

    console.log(`Scanning Fuji block #${blockNumber}...`);
    try {
        const block = await provider.getBlock(blockNumber, true);
        if (!block || !block.prefetchedTransactions) return;

        const followedWalletKeys = await redis.keys('follows:*');
        if (followedWalletKeys.length === 0) return;

        const targetWallets = new Set(followedWalletKeys.map(key => key.split(':')[1].toLowerCase()));

        for (const tx of block.prefetchedTransactions) {
            for (const dex of supportedDexes) {
                if (tx.to && tx.to.toLowerCase() === dex.address.toLowerCase() && targetWallets.has(tx.from.toLowerCase())) {
                    
                    try {
                        const parsedTx = dex.interface.parseTransaction({ data: tx.data, value: tx.value });
                        
                        let fromToken: string | null = null;
                        let toToken: string | null = null;

                        if (dex.isV2) {
                            if (parsedTx && parsedTx.name === 'swapExactIn' && parsedTx.args.tokenIn && parsedTx.args.tokenOut) {
                                fromToken = parsedTx.args.tokenIn;
                                toToken = parsedTx.args.tokenOut;
                            }
                        } else {
                            if (parsedTx && parsedTx.args.path && parsedTx.args.path.length >= 2) {
                                fromToken = parsedTx.args.path[0];
                                toToken = parsedTx.args.path[parsedTx.args.path.length - 1];
                            }
                        }

                        if (!fromToken || !toToken) continue;
                        
                        console.log(`🔥🔥🔥 Matched transaction from Star wallet: ${tx.from} on ${dex.name}!`);
                        
                        if (fromToken.toLowerCase() === '0x0000000000000000000000000000000000000000') {
                            fromToken = WAVAX_ADDRESS;
                            console.log(`ℹ️ Detected swap from native asset. Using WAVAX address for input: ${fromToken}`);
                        }
                        if (toToken.toLowerCase() === '0x0000000000000000000000000000000000000000') {
                            toToken = WAVAX_ADDRESS;
                            console.log(`ℹ️ Detected swap to native asset. Using WAVAX address for output: ${toToken}`);
                        }

                        const followers = await redis.smembers(`follows:${tx.from.toLowerCase()}`);
                        for (const userWalletAddress of followers) {
                            const tradeSize = await redis.hget(`settings:${userWalletAddress}`, 'tradeSize') as string || "0.01";

                            console.log(`🚀 Triggering autonomous copy-trade for user ${userWalletAddress} on ${dex.name}...`);
                            console.log(`   Swapping ${tradeSize} of ${fromToken} for ${toToken}...`);

                            const tools = agentToolkit.getTools();
                            const swapTool = tools.find(t => t.name === "smart_swap");

                            if (!swapTool) {
                                throw new Error("Critical Error: 'smart_swap' tool not found in AgentkitToolkit!");
                            }
                            
                            try {
    // Explicitly cast all dynamic variables to strings
    const swapParams = {
        tokenIn: String(fromToken),
        tokenOut: String(toToken),
        amount: String(tradeSize),
        approveMax: true
    };

    console.log(`[DEBUG] Invoking smart_swap with explicitly typed params:`, swapParams);
    
    const result = await swapTool.invoke(swapParams);

    console.log(`✅✅✅ Gasless copy-trade EXECUTED! Result:`, result);

  const signal = {
    id: tx.hash,
    type: 'copy-trade',
    action: `Copied trade on ${dex.name}`, // Simplified action string
    starWallet: tx.from,
    timestamp: new Date().toISOString(),
    txHash: tx.hash,
    // Add the full token data for the frontend
    fromTokenAddress: fromToken,
    toTokenAddress: toToken,
    amountSwapped: tradeSize
};

await redis.lpush(`signals:${userWalletAddress}`, JSON.stringify(signal));
console.log("📝 Signal (with full data) saved to log.");

} catch (swapError: any) {
    console.error(`❌❌❌ CRITICAL ERROR during smart_swap execution for user ${userWalletAddress}:`, swapError);
}
                        }
                    } catch (e: any) {
                        // Ignore errors from transactions that are not valid swaps
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
        await redis.set(AGENT_STATUS_KEY, 'inactive');
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        await redis.set(AGENT_STATUS_KEY, 'inactive');
        console.log("✅ Agent status set to 'inactive' in Redis. Any active listeners will now self-terminate.");

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