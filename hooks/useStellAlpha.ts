"use client";

import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { useMemo } from "react";
import type { StellalphaVault } from "@/lib/types/stellalpha_vault";
import idl from "@/lib/types/stellalpha_vault.json";

export function useStellAlpha() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  const provider = useMemo(() => {
    if (!wallet) return null;
    return new AnchorProvider(connection, wallet, {
      preflightCommitment: "processed",
    });
  }, [connection, wallet]);

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
    publicKey: wallet?.publicKey,
  };
}
