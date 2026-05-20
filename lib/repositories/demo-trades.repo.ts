import { supabase } from '@/lib/supabase';

export async function queueTrade(tradeData: any) {
  return supabase.from('demo_trades').upsert(tradeData, { 
    onConflict: 'trader_state_id,star_trade_signature', 
    ignoreDuplicates: true 
  });
}

export async function getDemoTradeByStateSignature(traderStateId: string, signature: string) {
  return supabase
    .from('demo_trades')
    .select('id, status, error_message')
    .eq('trader_state_id', traderStateId)
    .eq('star_trade_signature', signature)
    .maybeSingle();
}

export async function getOldestQueuedTrade(traderStateId: string) {
  return supabase
    .from('demo_trades')
    .select('id')
    .eq('trader_state_id', traderStateId)
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1);
}

export async function claimQueuedTrade(tradeId: string, processorId: string) {
  return supabase
    .from('demo_trades')
    .update({
      status: 'processing',
      processor_id: processorId
    })
    .eq('id', tradeId)
    .eq('status', 'queued')
    .select(`
      id,
      trader_state_id,
      created_at,
      raw_data,
      buy_model_key,
      buy_model_config,
      buy_sizing_context,
      leader_usd_value,
      leader_buy_ratio,
      leader_before_balance,
      copy_ratio,
      copied_position_before
    `);
}

export async function updateDemoTrade(tradeId: string, updateData: any) {
  return supabase
    .from('demo_trades')
    .update(updateData)
    .eq('id', tradeId);
}

export async function deleteQueuedTradesBySignature(signature: string) {
  return supabase
    .from('demo_trades')
    .delete()
    .eq('star_trade_signature', signature)
    .eq('status', 'queued');
}

export async function getProcessingTrades(traderStateId: string) {
  return supabase
    .from('demo_trades')
    .select('id, processor_id, token_in_amount, token_out_amount, copied_position_after, realized_pnl')
    .eq('trader_state_id', traderStateId)
    .eq('status', 'processing');
}

export async function requeueProcessingTrade(tradeId: string) {
  return supabase
    .from('demo_trades')
    .update({
      status: 'queued',
      processor_id: null,
    })
    .eq('id', tradeId)
    .eq('status', 'processing');
}

export async function getQueuedTradeCount(traderStateId: string) {
  return supabase
    .from('demo_trades')
    .select('id', { count: 'planned', head: true })
    .eq('trader_state_id', traderStateId)
    .eq('status', 'queued');
}
