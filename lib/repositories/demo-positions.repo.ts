import { supabase } from '@/lib/supabase';

/**
 * Returns the follower's current demo position for a given token.
 * Used by the BUY staleness policy: if size > 0, the follower already entered
 * this position and a stale BUY should still be allowed to maintain consistency.
 */
export async function getFollowerPosition(traderStateId: string, tokenMint: string) {
  const { data, error } = await supabase
    .from('demo_positions')
    .select('size, cost_usd')
    .eq('trader_state_id', traderStateId)
    .eq('token_mint', tokenMint)
    .maybeSingle();

  return { data, error };
}

export async function updateDemoPosition(traderStateId: string, tokenMint: string, updateData: any) {
  return supabase.from('demo_positions').update({
    ...updateData,
    updated_at: new Date().toISOString()
  }).eq('trader_state_id', traderStateId).eq('token_mint', tokenMint);
}

export async function insertDemoPosition(traderStateId: string, tokenMint: string, tokenSymbol: string, size: number, costUsd: number, avgCost: number) {
  return supabase.from('demo_positions').insert({
    trader_state_id: traderStateId,
    token_mint: tokenMint,
    token_symbol: tokenSymbol,
    size,
    cost_usd: costUsd,
    avg_cost: avgCost
  });
}
