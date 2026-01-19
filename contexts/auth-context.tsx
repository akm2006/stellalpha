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
  
  return `StellAlpha wants you to sign in with your Solana account:
${wallet}

Sign this message to prove you own this wallet and log in.

URI: ${domain}
Version: 1
Chain ID: mainnet
Nonce: ${nonce}
Issued At: ${issuedAt}`;
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
  }, [publicKey]); // Check session when wallet changes or on mount
  
  // Note: We don't automatically sign out when wallet disconnects anymore, 
  // because the session is HTTP-only cookie based. However, for UX consistency,
  // if the wallet *explicitly* disconnects, we might want to clear the session.
  // But strictly speaking, session could persist without wallet if we wanted.
  // For now, let's keep the behavior: disconnect wallet -> sign out.
  useEffect(() => {
    if (!connected && !state.isLoading && state.isAuthenticated) {
       // Only if we were authenticated and now not connected
       // We might choose to NOT auto-logout to allow "reconnect to continue session"
       // But user request says "frequent logout" is bad. 
       // Actually, keeping the session even if wallet disconnects is better for persistence.
       // So we will NOT auto-logout here. The session is valid until it expires.
       // BUT, the `UnifiedAuthButton` relies on `connected` state from wallet adapter.
       // So if wallet disconnects, they can't sign transactions, but are they "Logged In"?
       // Ideally: "Logged In" but "Wallet Not Connected".
       // For simplicity in this app: If wallet disconnects, we just let them be "Logged In" 
       // but they will be prompted to connect wallet if they try to do something.
       // However, `isSessionValid` logic previously enforced wallet match.
       // Let's relax that: Session is valid if cookie is valid.
    }
  }, [connected, state.isAuthenticated, state.isLoading]);
  
  const signIn = useCallback(async (): Promise<boolean> => {
    if (!publicKey || !signMessage) {
      setState(prev => ({ ...prev, error: 'Wallet not connected or does not support signing' }));
      return false;
    }
    
    const wallet = publicKey.toBase58();
    
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
      
      // 3. Sign message with wallet
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(messageBytes);
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
  }, [publicKey, signMessage]);
  
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
