// In app/api/portfolio/route.ts

import { NextResponse } from "next/server";
import { ethers } from "ethers";

// Standard ERC-20 ABI for the 'balanceOf' function and metadata
const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

// Expanded list of popular and common tokens on the Avalanche C-Chain.
// You can easily add or remove tokens from this list.
const KNOWN_AVAX_TOKENS: { [symbol: string]: string } = {
  "WAVAX": "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", // Wrapped AVAX
  "USDC": "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", // USD Coin
  "USDT": "0x9702230A8Ea53601f5E225511177AF20BB36413C", // Tether USD (Bridged)
  "WETH.e": "0x49D5c2BdFfac6CE2BFdB667074f2B3182Bf58310", // Wrapped Ether (Bridged)
  "WBTC.e": "0x50b7545627a5162F82A992c33b87aDc8bA5B3298", // Wrapped Bitcoin (Bridged)
  "DAI.e": "0xd586E7F844cEa2F87f5015266582702126738038",  // Dai Stablecoin (Bridged)
  "LINK.e": "0x5947BB275c521040051D82396192181b413227A3", // Chainlink (Bridged)
  "JOE": "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fCf",      // Trader Joe
  "PNG": "0x60781C2586D68229fde475645567Ec8ab81e1297",      // Pangolin
  "QI": "0x8729438EB15e2C8B5765N5B2b8e64fe54213d29e",        // BENQI - Corrected Address
};

// This function handles POST requests to fetch the user's portfolio balance.
export async function POST(request: Request) {
  try {
    const { userSmartAccount } = await request.json();

    if (!userSmartAccount) {
      return NextResponse.json({ error: "Missing userSmartAccount" }, { status: 400 });
    }

    // Create a provider to connect to the Avalanche network
    const provider = new ethers.JsonRpcProvider(process.env.AVALANCHE_RPC_URL!);

    const balances: { token: string; amount: string }[] = [];

    // 1. Get native AVAX balance
    console.log(`Fetching native AVAX balance for ${userSmartAccount}`);
    const nativeBalanceWei = await provider.getBalance(userSmartAccount);
    const nativeBalance = ethers.formatEther(nativeBalanceWei);

    // Only add if the balance is greater than a very small threshold
    if (parseFloat(nativeBalance) > 0.00001) {
      balances.push({ token: "AVAX", amount: parseFloat(nativeBalance).toFixed(4) });
    }

    // 2. Get balances for all known ERC-20 tokens
    console.log(`Fetching ERC-20 token balances for ${userSmartAccount}...`);
    for (const symbol in KNOWN_AVAX_TOKENS) {
      const tokenAddress = KNOWN_AVAX_TOKENS[symbol];
      const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, provider);

      try {
        const [balanceWei, decimals] = await Promise.all([
          tokenContract.balanceOf(userSmartAccount),
          tokenContract.decimals(),
        ]);
        
        if (balanceWei > 0) {
          const balance = ethers.formatUnits(balanceWei, decimals);
          // Only add if the balance is meaningful
          if (parseFloat(balance) > 0.00001) {
            balances.push({ token: symbol, amount: parseFloat(balance).toFixed(4) });
          }
        }
      } catch (tokenError) {
        // This is a non-critical warning, so the API continues running.
        console.warn(`Could not fetch balance for ${symbol} (${tokenAddress}).`);
      }
    }
    
    console.log("Successfully fetched all balances:", balances);
    return NextResponse.json({ success: true, balances });

  } catch (error) {
    console.error("Error in /api/portfolio:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
