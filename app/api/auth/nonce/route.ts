import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// In-memory nonce store with expiration (5 minutes)
// For production, use Redis or a database table
const nonceStore = new Map<string, { nonce: string; expires: number }>();

// Clean expired nonces periodically
function cleanExpiredNonces() {
  const now = Date.now();
  for (const [key, value] of nonceStore.entries()) {
    if (value.expires < now) {
      nonceStore.delete(key);
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get('wallet');
    
    if (!wallet) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
    }
    
    // Clean expired nonces
    cleanExpiredNonces();
    
    // Generate a cryptographically secure random nonce
    const nonce = crypto.randomBytes(32).toString('hex');
    
    // Store nonce with 5-minute expiration
    const expires = Date.now() + 5 * 60 * 1000;
    nonceStore.set(wallet, { nonce, expires });
    
    return NextResponse.json({ 
      nonce,
      expiresAt: new Date(expires).toISOString()
    });
  } catch (error) {
    console.error('[Auth/Nonce] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Export for use in verify route
export function getNonceForWallet(wallet: string): { nonce: string; expires: number } | undefined {
  return nonceStore.get(wallet);
}

export function deleteNonceForWallet(wallet: string): void {
  nonceStore.delete(wallet);
}
