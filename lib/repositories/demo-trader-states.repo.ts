import { supabase } from '@/lib/supabase';

export async function getActiveFollowers(starTrader: string) {
  return supabase
    .from('demo_trader_states')
    .select('id, copy_model_key, copy_model_config, starting_capital_usd')
    .eq('star_trader', starTrader)
    .eq('is_initialized', true)
    .eq('is_paused', false);
}

export async function getTraderStateWithPositions(traderStateId: string) {
  return supabase
    .from('demo_trader_states')
    .select(`*, positions:demo_positions(*)`)
    .eq('id', traderStateId)
    .single();
}

export async function updateTraderStateRealizedPnl(traderStateId: string, newRealizedPnlUsd: number) {
  return supabase
    .from('demo_trader_states')
    .update({ realized_pnl_usd: newRealizedPnlUsd })
    .eq('id', traderStateId);
}
