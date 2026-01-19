import { NextRequest, NextResponse } from 'next/server';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { supabaseAdmin } from '@/lib/server-admin';
import { getSession } from '@/lib/session';

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
    
    const session = await getSession();
    
    // 1. Validate nonce exists in session
    if (!session.nonce) {
      return NextResponse.json(
        { error: 'Nonce not found. Please request a new one.' }, 
        { status: 401 }
      );
    }
    
    // 2. Verify the nonce is present in the message
    if (!message.includes(session.nonce)) {
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
    
    // 4. Consume the nonce (security best practice)
    session.nonce = undefined; // clear nonce
    
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
    
    // 6. Save session
    session.isLoggedIn = true;
    session.user = {
      id: userId,
      wallet: wallet,
    };
    await session.save();
    
    return NextResponse.json({
      success: true,
      user: session.user,
      message: 'Authenticated successfully',
    });
    
  } catch (error) {
    console.error('[Auth/Verify] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

