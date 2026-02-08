'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useAppKit, useAppKitAccount, useDisconnect, useAppKitProvider } from '@reown/appkit/react';
import type { Provider } from '@reown/appkit-adapter-solana/react';
import bs58 from 'bs58';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: {
    id: string;
    wallet: string;
  } | null;
  error: string | null;
}

interface AuthContextType extends AuthState {
  signIn: () => Promise<boolean>;
  signOut: () => void;
  openWalletModal: () => void;
  disconnectWallet: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Parameters for SIWS message
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days


// Get the app domain for SIWS message
function getAppDomain(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'https://stellalpha.com';
}

// Build SIWS-compliant message
function buildSIWSMessage(wallet: string, nonce: string): string {
  const domain = getAppDomain();
  const issuedAt = new Date().toISOString();

  return `Welcome to Stellalpha!

Click to sign in and accept the Stellalpha Terms of Service.
This request will not trigger a blockchain transaction or cost any gas fees.

Your authentication status will be valid for 7 days.

Wallet: ${wallet}
Domain: ${domain}
Nonce: ${nonce}
Timestamp: ${issuedAt}`;
}


export function AuthProvider({ children }: { children: ReactNode }) {
  // AppKit hooks
  const { open } = useAppKit();
  const { address, isConnected, status } = useAppKitAccount();
  const { disconnect } = useDisconnect();
  const { walletProvider } = useAppKitProvider<Provider>('solana');

  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    error: null,
  });

  // Handle wallet disconnection
  useEffect(() => {
    if (status === 'disconnected' && state.isAuthenticated) {
      signOut();
    }
  }, [status, state.isAuthenticated]);

  // Load persisted auth state on mount and validate
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/user');
        if (res.ok) {
          const data = await res.json();
          if (data.isLoggedIn) {
            setState({
              isAuthenticated: true,
              isLoading: false,
              user: data.user,
              error: null,
            });
            return;
          }
        }
      } catch (err) {
        console.error('Failed to check session:', err);
      }

      setState(prev => ({
        ...prev,
        isAuthenticated: false,
        user: null,
        isLoading: false
      }));
    }

    checkSession();
  }, [address]); // Check session when wallet changes or on mount

  const signIn = useCallback(async (): Promise<boolean> => {
    if (!address || !walletProvider) {
      setState(prev => ({ ...prev, error: 'Wallet not connected or does not support signing' }));
      return false;
    }

    const wallet = address;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // 1. Request nonce from server (stores in session)
      const nonceRes = await fetch(`/api/auth/nonce?wallet=${wallet}`);
      if (!nonceRes.ok) {
        throw new Error('Failed to get nonce');
      }
      const { nonce } = await nonceRes.json();

      // 2. Build SIWS message
      const message = buildSIWSMessage(wallet, nonce);

      // 3. Sign message with wallet (via AppKit provider)
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = await walletProvider.signMessage(messageBytes);
      const signature = bs58.encode(signatureBytes);

      // 4. Verify with server (creates session)
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, signature, message }),
      });

      if (!verifyRes.ok) {
        const errorData = await verifyRes.json();
        throw new Error(errorData.error || 'Verification failed');
      }

      const { user } = await verifyRes.json();

      // State is updated from response
      setState({
        isAuthenticated: true,
        isLoading: false,
        user,
        error: null,
      });

      return true;

    } catch (error: any) {
      console.error('[Auth] Sign in error:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Sign in failed',
      }));
      return false;
    }
  }, [address, walletProvider]);

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout failed', e);
    }

    setState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      error: null,
    });
    disconnect();
  }, [disconnect]);

  const openWalletModal = useCallback(() => {
    open();
  }, [open]);

  const disconnectWallet = useCallback(() => {
    signOut();
  }, [signOut]);

  return (
    <AuthContext.Provider value={{ ...state, signIn, signOut, openWalletModal, disconnectWallet }}>
      {children}
    </AuthContext.Provider>
  );
}


export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
