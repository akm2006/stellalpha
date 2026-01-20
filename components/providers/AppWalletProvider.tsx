"use client";

import React, { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";

// Default styles that can be overridden by your app
import "@solana/wallet-adapter-react-ui/styles.css";

// IDENTITY-ONLY: Wallet adapter used for reading publicKey only
// No signing, no transactions - demo vault is fully database-backed

export default function AppWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // 1. Force Mainnet
  const network = WalletAdapterNetwork.Mainnet;

  // 2. Use Helius mainnet RPC
  const endpoint = process.env.NEXT_PUBLIC_HELIUS_RPC_URL || 
    "https://mainnet.helius-rpc.com/?api-key=demo";

  // 3. Wallet Standard: Leave array empty to auto-detect all installed wallets 
  // that support the Solana Wallet Standard (Phantom, Solflare, Backpack, etc.)
  const wallets = useMemo(
    () => [],
    [network]
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
