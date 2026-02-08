"use client";

import React from "react";
import { createAppKit } from "@reown/appkit/react";
import { solanaAdapter, projectId, networks, metadata } from "@/lib/appkit-config";

// Create the AppKit modal (must be called at module scope, not in a component)
createAppKit({
  adapters: [solanaAdapter],
  projectId: projectId!,
  networks,
  metadata,
  themeMode: "dark",
  features: {
    analytics: true,
    email: true,
    socials: ['google', 'x', 'discord', 'github', 'apple', 'facebook', 'farcaster'],
    emailShowWallets: true,
  },
  allWallets: 'SHOW',
  themeVariables: {
    "--apkt-accent": "#10B981",
    "--apkt-font-family": "Space Grotesk, Inter, sans-serif",
    "--apkt-border-radius-master": "1px",
    "--apkt-z-index": 100,
    "--apkt-color-mix": "#0A0A0A", // Use surface color instead of pure black for better contrast?
    "--apkt-color-mix-strength": 20, // Reduced strength to ensure elements remain visible
  },
});

export default function AppWalletProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
