import { supabase } from '@/lib/supabase';

export async function upsertTrade(tradeData: any) {
  return supabase.from('trades').upsert(tradeData, { onConflict: 'signature', ignoreDuplicates: true });
}
