'use client';

import { ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAuth } from '@/contexts/auth-context';
import { COLORS } from '@/lib/theme';
import { Wallet, LogIn, Loader2, ShieldAlert } from 'lucide-react';

interface AuthRequiredProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

/**
 * Wrapper component for protected pages.
 * Shows appropriate messaging based on auth state:
 * - No wallet connected → "Connect Wallet" message
 * - Connected but not signed in → "Sign In" message with button
 * - Authenticated → Render children
 */
export function AuthRequired({ 
  children, 
  title = "Authentication Required",
  description = "You need to sign in to access this page."
}: AuthRequiredProps) {
  const { connected } = useWallet();
  const { isAuthenticated, isLoading, signIn, openWalletModal } = useAuth();

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="animate-spin" style={{ color: COLORS.brand }} />
          <span className="text-sm" style={{ color: COLORS.data }}>
            Checking authentication...
          </span>
        </div>
      </div>
    );
  }

  // Not connected
  if (!connected) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div 
          className="max-w-md w-full mx-4 border p-8 text-center"
          style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}
        >
          <div 
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: `${COLORS.brand}15` }}
          >
            <Wallet size={28} style={{ color: COLORS.brand }} />
          </div>
          
          <h2 className="text-xl font-semibold mb-2">Connect Your Wallet</h2>
          <p className="text-sm mb-6" style={{ color: COLORS.data }}>
            Please connect your Solana wallet to continue. Your wallet is used to verify your identity securely.
          </p>
          
          <button
            onClick={openWalletModal}
            className="px-6 py-3 font-medium rounded-lg transition-opacity hover:opacity-90 flex items-center gap-2 mx-auto"
            style={{ backgroundColor: COLORS.brand, color: '#000' }}
          >
            <Wallet size={18} />
            Connect Wallet
          </button>
          
          <p className="text-xs mt-6" style={{ color: COLORS.data, opacity: 0.6 }}>
            Supported: Phantom, Solflare, Backpack & more
          </p>
        </div>
      </div>
    );
  }

  // Connected but not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div 
          className="max-w-md w-full mx-4 border p-8 text-center"
          style={{ backgroundColor: COLORS.surface, borderColor: COLORS.structure }}
        >
          <div 
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: `${COLORS.brand}15` }}
          >
            <ShieldAlert size={28} style={{ color: COLORS.brand }} />
          </div>
          
          <h2 className="text-xl font-semibold mb-2">{title}</h2>
          <p className="text-sm mb-6" style={{ color: COLORS.data }}>
            {description}
          </p>
          
          <button
            onClick={signIn}
            disabled={isLoading}
            className="px-6 py-3 font-medium rounded-lg transition-opacity hover:opacity-90 disabled:opacity-50 flex items-center gap-2 mx-auto"
            style={{ backgroundColor: COLORS.brand, color: '#000' }}
          >
            {isLoading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <LogIn size={18} />
            )}
            Sign In with Wallet
          </button>
          
          <p className="text-xs mt-6" style={{ color: COLORS.data, opacity: 0.6 }}>
            You&apos;ll be asked to sign a message to verify wallet ownership
          </p>
        </div>
      </div>
    );
  }

  // Authenticated - render children
  return <>{children}</>;
}
