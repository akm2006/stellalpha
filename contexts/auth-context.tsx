'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
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

interface StoredSession {
  user: { id: string; wallet: string };
  expiresAt: number;  // Unix timestamp
  createdAt: number;
}

interface AuthContextType extends AuthState {
  signIn: () => Promise<boolean>;
  signOut: () => void;
  openWalletModal: () => void;
  disconnectWallet: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'stellalpha_auth';
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
  
  return `StellAlpha wants you to sign in with your Solana account:
${wallet}

Sign this message to prove you own this wallet and log in.

URI: ${domain}
Version: 1
Chain ID: mainnet
Nonce: ${nonce}
Issued At: ${issuedAt}`;
}

// Check if session is valid (not expired and wallet matches)
function isSessionValid(session: StoredSession | null, currentWallet: string | null): boolean {
  if (!session || !currentWallet) return false;
  if (session.user.wallet !== currentWallet) return false;
  if (Date.now() > session.expiresAt) return false;
  return true;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    error: null,
  });
  
  // Load persisted auth state on mount and validate
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const session: StoredSession = JSON.parse(stored);
        const currentWallet = publicKey?.toBase58() || null;
        
        if (isSessionValid(session, currentWallet)) {
          setState({
            isAuthenticated: true,
            isLoading: false,
            user: session.user,
            error: null,
          });
          return;
        } else {
          // Session expired or wallet mismatch - clear it
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    setState(prev => ({ ...prev, isLoading: false }));
  }, [publicKey]);
  
  // Clear auth when wallet disconnects
  useEffect(() => {
    if (!connected) {
      setState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: null,
      });
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [connected]);
  
  const signIn = useCallback(async (): Promise<boolean> => {
    if (!publicKey || !signMessage) {
      setState(prev => ({ ...prev, error: 'Wallet not connected or does not support signing' }));
      return false;
    }
    
    const wallet = publicKey.toBase58();
    
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      // 1. Request nonce from server
      const nonceRes = await fetch(`/api/auth/nonce?wallet=${wallet}`);
      if (!nonceRes.ok) {
        throw new Error('Failed to get nonce');
      }
      const { nonce } = await nonceRes.json();
      
      // 2. Build SIWS message
      const message = buildSIWSMessage(wallet, nonce);
      
      // 3. Sign message with wallet
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(messageBytes);
      const signature = bs58.encode(signatureBytes);
      
      // 4. Verify with server
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
      
      // 5. Persist auth state with expiry
      const session: StoredSession = {
        user,
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_DURATION_MS,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      
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
  }, [publicKey, signMessage]);
  
  const signOut = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      error: null,
    });
    disconnect();
  }, [disconnect]);
  
  const openWalletModal = useCallback(() => {
    setVisible(true);
  }, [setVisible]);
  
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
