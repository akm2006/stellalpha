"use client";

import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import { useAppKitConnection } from "@reown/appkit-adapter-solana/react";
import type { Provider } from "@reown/appkit-adapter-solana/react";
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { useMemo } from "react";
import { PublicKey } from "@solana/web3.js";
import type { StellalphaVault } from "@/lib/types/stellalpha_vault";
import idl from "@/lib/types/stellalpha_vault.json";

/**
 * Custom hook for Stellalpha Anchor program interactions using AppKit.
 * Provides connection, wallet provider, and Anchor program instance.
 */
export function useStellAlpha() {
  const { address, isConnected } = useAppKitAccount();
  const { connection } = useAppKitConnection();
  const { walletProvider } = useAppKitProvider<Provider>("solana");

  // Create a wallet adapter-compatible object for Anchor
  const anchorWallet = useMemo(() => {
    if (!address || !walletProvider || !isConnected) return null;
    
    const publicKey = new PublicKey(address);
    
    return {
      publicKey,
      signTransaction: async <T extends import("@solana/web3.js").Transaction | import("@solana/web3.js").VersionedTransaction>(tx: T): Promise<T> => {
        // AppKit provider handles both legacy and versioned transactions
        const signed = await walletProvider.signTransaction(tx);
        return signed as T;
      },
      signAllTransactions: async <T extends import("@solana/web3.js").Transaction | import("@solana/web3.js").VersionedTransaction>(txs: T[]): Promise<T[]> => {
        const signed = await walletProvider.signAllTransactions(txs);
        return signed as T[];
      },
    };
  }, [address, walletProvider, isConnected]);

  const provider = useMemo(() => {
    if (!anchorWallet || !connection) return null;
    return new AnchorProvider(connection, anchorWallet, {
      preflightCommitment: "processed",
    });
  }, [connection, anchorWallet]);

  const program = useMemo(() => {
    if (!provider) return null;
    // Cast idl to Idl type and the result to our typed Program
    return new Program(
      idl as Idl,
      provider
    ) as unknown as Program<StellalphaVault>;
  }, [provider]);

  return {
    program,
    provider,
    connection,
    publicKey: anchorWallet?.publicKey || null,
  };
}
