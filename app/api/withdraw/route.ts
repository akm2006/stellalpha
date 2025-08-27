// In app/api/withdraw/route.ts

import { NextResponse } from 'next/server';
import { Agentkit } from '@0xgasless/agentkit';
import { ethers } from 'ethers';

let agent: Agentkit | null = null;

const getAgent = async (): Promise<Agentkit> => {
  if (agent) return agent;

  console.log("Initializing 0xGasless Agentkit for Withdrawal...");
  const privateKeyString = `0x${process.env.AGENT_PRIVATE_KEY}` as `0x${string}`;
  if (!privateKeyString) {
    throw new Error("AGENT_PRIVATE_KEY is not set in the environment variables.");
  }

  agent = await Agentkit.configureWithWallet({
    apiKey: process.env.OXGASLESS_API_KEY!,
    privateKey: privateKeyString,
    chainID: 43114,
    rpcUrl: process.env.AVALANCHE_RPC_URL!,
  });

  console.log("✅ Agentkit for Withdrawal Initialized successfully.");
  return agent;
};

export async function POST(request: Request) {
  try {
    const { userSmartAccount, destinationAddress } = await request.json();

    if (!userSmartAccount || !destinationAddress) {
      return NextResponse.json({ error: 'Missing userSmartAccount or destinationAddress' }, { status: 400 });
    }

    const agentInstance = await getAgent();
    
    // To withdraw all, we first need to get the balance.
    const provider = new ethers.JsonRpcProvider(process.env.AVALANCHE_RPC_URL!);
    const balanceWei = await provider.getBalance(userSmartAccount);

    // CORRECTED: Use BigInt(0) instead of 0n for older JS targets
    if (balanceWei === BigInt(0)) {
        return NextResponse.json({ error: 'No AVAX balance to withdraw.' }, { status: 400 });
    }

    console.log(`Withdrawing ${ethers.formatEther(balanceWei)} AVAX from ${userSmartAccount} to ${destinationAddress}`);

    // The agent's SmartTransfer expects the amount to be a BigInt or a string representation of it.
    const taskId = await (agentInstance as any).SmartTransfer({
        smartAccountAddress: userSmartAccount,
        tokenAddress: 'eth', // 'eth' is used for the native token (AVAX on Avalanche)
        amount: balanceWei.toString(), // Pass the balance as a string to be safe
        destination: destinationAddress,
        paymasterUrl: `https://paymaster.0xgasless.com/v1/43114/rpc/${process.env.OXGASLESS_API_KEY!}`,
    });

    return NextResponse.json({ success: true, message: 'Withdrawal initiated successfully!', taskId });

  } catch (error) {
    console.error("Error in /api/withdraw:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
