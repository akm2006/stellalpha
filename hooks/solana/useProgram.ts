"use client";

import { useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "@/app/idl/stellalpha_vault.json";

const PROGRAM_ID = new PublicKey("66JmdAQSiB4BH6feb88kK9sU3n2fNM91QxGjYd99E3A6");

export function useProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const provider = useMemo(() => {
    if (!wallet) return null;
    return new AnchorProvider(connection, wallet as any, {
      preflightCommitment: "confirmed",
    });
  }, [connection, wallet]);

  const program = useMemo(() => {
    if (!provider) return null;
    return new Program(idl as Idl, provider);
  }, [provider]);

  return { program, provider, programId: PROGRAM_ID };
}
