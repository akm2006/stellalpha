import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET: Fetch user's demo vault with trader states
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');
  
  if (!wallet) {
    return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
  }
  
  try {
    // Fetch vault
    const { data: vault, error: vaultError } = await supabase
      .from('demo_vaults')
      .select('*')
      .eq('user_wallet', wallet)
      .single();
    
    if (vaultError && vaultError.code !== 'PGRST116') {
      console.error('Vault fetch error:', vaultError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    
    if (!vault) {
      return NextResponse.json({ vault: null, exists: false });
    }
    
    // Fetch trader states with their positions (each TS has own positions)
    const { data: traderStates } = await supabase
      .from('demo_trader_states')
      .select(`
        *,
        positions:demo_positions(*)
      `)
      .eq('vault_id', vault.id);
    
    // Calculate totals per trader state
    const tradersWithTotals = (traderStates || []).map(ts => {
      const positions = ts.positions || [];
      const totalValue = positions.reduce((sum: number, p: any) => sum + Number(p.cost_usd || 0), 0);
      return {
        ...ts,
        totalValue,
        positionCount: positions.length
      };
    });
    
    // Calculate total allocated across all trader states
    const totalAllocated = tradersWithTotals.reduce((sum, ts) => sum + Number(ts.allocated_usd || 0), 0);
    
    return NextResponse.json({
      vault: {
        ...vault,
        totalAllocated,
        unallocated: Number(vault.balance_usd)
      },
      traderStates: tradersWithTotals,
      exists: true
    });
  } catch (error) {
    console.error('Demo vault fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch vault' }, { status: 500 });
  }
}

// POST: Deploy new demo vault with 1K USD
export async function POST(request: NextRequest) {
  try {
    const { wallet } = await request.json();
    
    if (!wallet) {
      return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
    }
    
    // Check if vault already exists
    const { data: existing } = await supabase
      .from('demo_vaults')
      .select('id')
      .eq('user_wallet', wallet)
      .single();
    
    if (existing) {
      return NextResponse.json({ error: 'Vault already exists' }, { status: 409 });
    }
    
    // Create vault with 1K USD (all unallocated initially)
    const { data: vault, error } = await supabase
      .from('demo_vaults')
      .insert({
        user_wallet: wallet,
        balance_usd: 1000,  // Unallocated balance
        total_deposited: 1000
      })
      .select()
      .single();
    
    if (error) {
      console.error('Vault creation error:', error);
      return NextResponse.json({ error: 'Failed to create vault' }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      vault
    });
  } catch (error) {
    console.error('Demo vault deploy error:', error);
    return NextResponse.json({ error: 'Failed to deploy vault' }, { status: 500 });
  }
}

// DELETE: Delete demo vault
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');
  
  if (!wallet) {
    return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
  }
  
  try {
    const { error } = await supabase
      .from('demo_vaults')
      .delete()
      .eq('user_wallet', wallet);
    
    if (error) {
      return NextResponse.json({ error: 'Failed to delete vault' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Demo vault delete error:', error);
    return NextResponse.json({ error: 'Failed to delete vault' }, { status: 500 });
  }
}
