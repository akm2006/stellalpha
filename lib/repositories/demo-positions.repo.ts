import { supabase } from '@/lib/supabase';

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
