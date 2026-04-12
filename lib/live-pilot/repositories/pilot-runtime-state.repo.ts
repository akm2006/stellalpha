import { supabase } from '@/lib/supabase';
import type { PilotRuntimeStateRow, PilotWalletConfigSummary } from '@/lib/live-pilot/types';

export async function ensurePilotRuntimeState(wallets: Pick<PilotWalletConfigSummary, 'alias' | 'starTrader' | 'mode'>[]) {
  if (wallets.length === 0) {
    return;
  }

  const { error } = await supabase
    .from('pilot_runtime_state')
    .upsert(
      wallets.map((wallet) => ({
        wallet_alias: wallet.alias,
        star_trader: wallet.starTrader || null,
        mode: wallet.mode,
      })),
      { onConflict: 'wallet_alias', ignoreDuplicates: true }
    );

  if (error) {
    throw new Error(`Failed to ensure live-pilot runtime state: ${error.message}`);
  }
}

export async function listPilotRuntimeStates(walletAliases: string[]) {
  if (walletAliases.length === 0) {
    return [] as PilotRuntimeStateRow[];
  }

  const { data, error } = await supabase
    .from('pilot_runtime_state')
    .select('*')
    .in('wallet_alias', walletAliases)
    .order('wallet_alias', { ascending: true });

  if (error) {
    throw new Error(`Failed to list live-pilot runtime state: ${error.message}`);
  }

  return (data || []) as PilotRuntimeStateRow[];
}

export async function updatePilotRuntimeState(walletAlias: string, patch: Partial<Omit<PilotRuntimeStateRow, 'wallet_alias' | 'updated_at'>>) {
  const { data, error } = await supabase
    .from('pilot_runtime_state')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('wallet_alias', walletAlias)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to update live-pilot runtime state: ${error.message}`);
  }

  return data as PilotRuntimeStateRow;
}
