// In app/api/portfolio/route.ts
import { NextResponse } from 'next/server';
import { ethers } from 'ethers';

// This API now fetches the EOA's portfolio
export async function POST(request: Request) {
  try {
    const { userSmartAccount: userWallet } = await request.json(); // Rename for clarity

    if (!userWallet) {
      return NextResponse.json({ success: false, error: 'userWallet is required' }, { status: 400 });
    }
    
    const provider = new ethers.JsonRpcProvider(process.env.AVALANCHE_RPC_URL!);
    const balanceWei = await provider.getBalance(userWallet);
    const balanceAvax = parseFloat(ethers.formatEther(balanceWei)).toFixed(4);

    // For now, we only return the native AVAX balance for the EOA.
    // Fetching all ERC20 balances is more complex and can be added later.
    const balances = [{ token: 'AVAX', amount: balanceAvax }];

    return NextResponse.json({ success: true, balances });
  } catch (error) {
    console.error("Error in /api/portfolio:", error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}