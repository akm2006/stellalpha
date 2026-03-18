import { supabase } from '@/lib/supabase';

export async function queueTrade(tradeData: any) {
  return supabase.from('demo_trades').upsert(tradeData, { 
    onConflict: 'trader_state_id,star_trade_signature', 
    ignoreDuplicates: true 
  });
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
    .select('*');
}

export async function updateDemoTrade(tradeId: string, updateData: any) {
  return supabase
    .from('demo_trades')
    .update(updateData)
    .eq('id', tradeId);
}
