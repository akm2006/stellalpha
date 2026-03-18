import { supabase } from '@/lib/supabase';

export async function getPosition(wallet: string, tokenMint: string) {
  return supabase
    .from('positions')
    .select('*')
    .eq('wallet', wallet)
    .eq('token_mint', tokenMint)
    .single();
}

export async function upsertPosition(
  wallet: string, 
  tokenMint: string, 
  size: number, 
  costUsd: number, 
  avgCost: number
) {
  return supabase.from('positions').upsert({
    wallet,
    token_mint: tokenMint,
    size,
    cost_usd: costUsd,
    avg_cost: avgCost,
    updated_at: new Date().toISOString()
  }, { onConflict: 'wallet,token_mint' });
}
