import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.user?.wallet) {
    return NextResponse.json({ followedTraders: [] });
  }

  const { searchParams } = new URL(request.url);
  const requestedWallet = searchParams.get('wallet');
  const wallet = session.user.wallet;

  if (requestedWallet && requestedWallet !== wallet) {
    return NextResponse.json({ error: 'Forbidden: wallet does not match authenticated user' }, { status: 403 });
  }

  const { data: vault, error: vaultError } = await supabase
    .from('demo_vaults')
    .select('id')
    .eq('user_wallet', wallet)
    .maybeSingle();

  if (vaultError) {
    console.error('Demo vault following vault fetch error:', vaultError);
    return NextResponse.json({ error: 'Failed to fetch following state' }, { status: 500 });
  }

  if (!vault?.id) {
    return NextResponse.json({ followedTraders: [] });
  }

  const { data: states, error: statesError } = await supabase
    .from('demo_trader_states')
    .select('star_trader')
    .eq('vault_id', vault.id);

  if (statesError) {
    console.error('Demo vault following states fetch error:', statesError);
    return NextResponse.json({ error: 'Failed to fetch following state' }, { status: 500 });
  }

  const followedTraders = [...new Set((states || []).map((state) => state.star_trader).filter(Boolean))];
  return NextResponse.json({ followedTraders });
}
