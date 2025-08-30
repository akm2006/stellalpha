// In app/api/portfolio/route.ts
import { NextResponse } from 'next/server';
import { ethers } from 'ethers';

// Placeholder for real-time price fetching. In a real-world scenario,
// you would fetch this from a price oracle or an API like CoinGecko.
const MOCK_AVAX_PRICE_USD = 30.50; // Example: 1 AVAX = $30.50

export async function POST(request: Request) {
  try {
    const { userSmartAccount: userWallet } = await request.json();

    if (!userWallet) {
      return NextResponse.json({ success: false, error: 'userWallet is required' }, { status: 400 });
    }
    
    const provider = new ethers.JsonRpcProvider(process.env.AVALANCHE_RPC_URL!);
    const balanceWei = await provider.getBalance(userWallet);
    const balanceAvax = parseFloat(ethers.formatEther(balanceWei)).toFixed(4);

    // Calculate the USD value based on the mock price
    const valueUsd = (parseFloat(balanceAvax) * MOCK_AVAX_PRICE_USD).toFixed(2);

    // The API now returns the token, its amount, and its converted value
    const balances = [{ 
      token: 'AVAX', 
      amount: balanceAvax, 
      value: `$${valueUsd}` 
    }];

    return NextResponse.json({ success: true, balances });
  } catch (error) {
    console.error("Error in /api/portfolio:", error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}