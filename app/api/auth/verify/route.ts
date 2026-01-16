import { NextRequest, NextResponse } from 'next/server';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { supabaseAdmin } from '@/lib/server-admin';
import { getNonceForWallet, deleteNonceForWallet } from '../nonce/route';

// Generate a deterministic UUID from wallet address for Supabase user ID
function walletToUUID(wallet: string): string {
  // Use a simple hash-based approach to create a valid UUID v5-like format
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(`stellalpha:${wallet}`).digest('hex');
  // Format as UUID: 8-4-4-4-12
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { wallet, signature, message } = body;
    
    if (!wallet || !signature || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: wallet, signature, message' }, 
        { status: 400 }
      );
    }
    
    // 1. Validate nonce exists and hasn't expired
    const storedNonce = getNonceForWallet(wallet);
    if (!storedNonce) {
      return NextResponse.json(
        { error: 'Nonce not found or expired. Please request a new one.' }, 
        { status: 401 }
      );
    }
    
    if (Date.now() > storedNonce.expires) {
      deleteNonceForWallet(wallet);
      return NextResponse.json(
        { error: 'Nonce expired. Please request a new one.' }, 
        { status: 401 }
      );
    }
    
    // 2. Verify the nonce is present in the message
    if (!message.includes(storedNonce.nonce)) {
      return NextResponse.json(
        { error: 'Invalid nonce in message' }, 
        { status: 401 }
      );
    }
    
    // 3. Verify the signature using Ed25519
    try {
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = bs58.decode(signature);
      const publicKeyBytes = bs58.decode(wallet);
      
      const isValid = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        publicKeyBytes
      );
      
      if (!isValid) {
        return NextResponse.json(
          { error: 'Invalid signature' }, 
          { status: 401 }
        );
      }
    } catch (verifyError) {
      console.error('[Auth/Verify] Signature verification error:', verifyError);
      return NextResponse.json(
        { error: 'Signature verification failed' }, 
        { status: 401 }
      );
    }
    
    // 4. Consume the nonce (one-time use)
    deleteNonceForWallet(wallet);
    
    // 5. Create or get user in Supabase
    const userId = walletToUUID(wallet);
    
    // Check if user exists
    const { data: existingUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (!existingUser.user) {
      // Create new user
      const { error: createError } = await supabaseAdmin.auth.admin.createUser({
        id: userId,
        email: `${wallet.slice(0, 8)}@stellalpha.wallet`, // Placeholder email
        email_confirm: true,
        user_metadata: {
          wallet_address: wallet,
          auth_method: 'siws',
        },
      });
      
      if (createError) {
        console.error('[Auth/Verify] User creation error:', createError);
        return NextResponse.json(
          { error: 'Failed to create user' }, 
          { status: 500 }
        );
      }
    } else {
      // Update user metadata if needed
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          wallet_address: wallet,
          auth_method: 'siws',
          last_login: new Date().toISOString(),
        },
      });
    }
    
    // 6. Generate session tokens
    // Note: Supabase Admin API doesn't directly create sessions, 
    // so we'll use a custom JWT approach or magic link workaround
    // For now, we return a signed token that the client can use
    
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: `${wallet.slice(0, 8)}@stellalpha.wallet`,
    });
    
    if (sessionError) {
      console.error('[Auth/Verify] Session generation error:', sessionError);
      // Fallback: Return success with wallet info (client will handle state)
      return NextResponse.json({
        success: true,
        user: {
          id: userId,
          wallet: wallet,
        },
        message: 'Authenticated successfully',
      });
    }
    
    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        wallet: wallet,
      },
      // If magic link was generated, include the hashed token
      token: sessionData?.properties?.hashed_token,
      message: 'Authenticated successfully',
    });
    
  } catch (error) {
    console.error('[Auth/Verify] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
