import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    
    // Generate a cryptographically secure random nonce
    const nonce = crypto.randomBytes(32).toString('hex');
    
    // Store nonce in session
    session.nonce = nonce;
    await session.save();
    
    // Return nonce and expiry (although expiry is now managed by session cookie, 
    // we can still return a standard response for the frontend)
    const expires = Date.now() + 5 * 60 * 1000; // 5 minutes for client visualization
    
    return NextResponse.json({ 
      nonce,
      expiresAt: new Date(expires).toISOString()
    });
  } catch (error) {
    console.error('[Auth/Nonce] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Ensure this function is no longer exported or used elsewhere as we now use session
// export function getNonceForWallet(wallet: string): { nonce: string; expires: number } | undefined {
//   return nonceStore.get(wallet);
// }

