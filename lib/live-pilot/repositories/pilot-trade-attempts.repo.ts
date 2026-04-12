import { supabase } from '@/lib/supabase';
import type { PilotTradeAttemptRow } from '@/lib/live-pilot/types';

export async function listRecentPilotTradeAttempts(limit: number = 25) {
  const { data, error } = await supabase
    .from('pilot_trade_attempts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list recent live-pilot trade attempts: ${error.message}`);
  }

  return (data || []) as PilotTradeAttemptRow[];
}
