'use client';

import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { solana } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit/networks";

// Project ID from environment
export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;

if (!projectId) {
  throw new Error('NEXT_PUBLIC_REOWN_PROJECT_ID is not defined in environment variables');
}

// Metadata for the app
export const metadata = {
  name: "Stellalpha",
  description: "Autonomous Gasless Copy-Trading Agent",
  url: typeof window !== 'undefined' ? window.location.origin : "https://stellalpha.xyz",
  icons: ["/logo.svg"],
};

// Networks to support (cast as tuple type for AppKit)
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = [solana];

// Create the Solana adapter
export const solanaAdapter = new SolanaAdapter();
