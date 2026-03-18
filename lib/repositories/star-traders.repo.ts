import { supabase } from '@/lib/supabase';

export async function getStarTradersByAddresses(addresses: string[]) {
  return supabase
    .from('star_traders')
    .select('address')
    .in('address', addresses);
}
