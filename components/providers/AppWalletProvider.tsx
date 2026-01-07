"use client";

import React, { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";

// Default styles that can be overridden by your app
import "@solana/wallet-adapter-react-ui/styles.css";

// IDENTITY-ONLY: Wallet adapter used for reading publicKey only
// No signing, no transactions - demo vault is fully database-backed

export default function AppWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Use Helius mainnet for wallet connection (identity-only)
  const endpoint = process.env.NEXT_PUBLIC_HELIUS_RPC_URL || 
    "https://mainnet.helius-rpc.com/?api-key=demo";

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
