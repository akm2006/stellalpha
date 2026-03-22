import { supabase } from '@/lib/supabase';

export async function getCachedNonTradeSignatures(wallet: string, signatures: string[], nowIso: string) {
  if (signatures.length === 0) {
    return new Set<string>();
  }

  const { data, error } = await supabase
    .from('non_trade_signatures')
    .select('signature')
    .eq('wallet', wallet)
    .gt('expires_at', nowIso)
    .in('signature', signatures);

  if (error) {
    throw new Error(`Failed to fetch cached non-trade signatures: ${error.message}`);
  }

  return new Set((data || []).map((row) => row.signature));
}

export async function cacheNonTradeSignatures(
  wallet: string,
  signatures: string[],
  expiresAtIso: string
) {
  if (signatures.length === 0) {
    return;
  }

  const rows = signatures.map((signature) => ({
    signature,
    wallet,
    expires_at: expiresAtIso,
  }));

  const { error } = await supabase
    .from('non_trade_signatures')
    .upsert(rows, { onConflict: 'signature,wallet' });

  if (error) {
    throw new Error(`Failed to cache non-trade signatures: ${error.message}`);
  }
}
