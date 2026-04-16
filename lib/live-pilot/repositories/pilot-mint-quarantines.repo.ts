import { supabase } from '@/lib/supabase';
import type { PilotMintQuarantineRow } from '@/lib/live-pilot/types';

export async function listActivePilotMintQuarantines() {
  const { data, error } = await supabase
    .from('pilot_mint_quarantines')
    .select('*')
    .eq('status', 'active')
    .order('last_detected_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list pilot mint quarantines: ${error.message}`);
  }

  return (data || []) as PilotMintQuarantineRow[];
}

export async function getPilotMintQuarantine(mint: string) {
  const { data, error } = await supabase
    .from('pilot_mint_quarantines')
    .select('*')
    .eq('mint', mint)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch pilot mint quarantine for ${mint}: ${error.message}`);
  }

  return (data || null) as PilotMintQuarantineRow | null;
}

export async function isPilotMintQuarantined(mint: string) {
  const quarantine = await getPilotMintQuarantine(mint);
  return quarantine?.status === 'active';
}

export async function quarantinePilotMint(args: {
  mint: string;
  reason: string;
  firstWalletAlias?: string | null;
  firstStarTrader?: string | null;
  firstPilotTradeId?: string | null;
  note?: string | null;
}) {
  const {
    mint,
    reason,
    firstWalletAlias = null,
    firstStarTrader = null,
    firstPilotTradeId = null,
    note = null,
  } = args;
  const now = new Date().toISOString();

  const existing = await getPilotMintQuarantine(mint);
  const payload = {
    mint,
    status: 'active',
    reason,
    first_wallet_alias: existing?.first_wallet_alias || firstWalletAlias,
    first_star_trader: existing?.first_star_trader || firstStarTrader,
    first_pilot_trade_id: existing?.first_pilot_trade_id || firstPilotTradeId,
    first_detected_at: existing?.first_detected_at || now,
    last_detected_at: now,
    cleared_at: null,
    cleared_by_wallet: null,
    note,
    updated_at: now,
  };

  const query = existing
    ? supabase.from('pilot_mint_quarantines').update(payload).eq('mint', mint)
    : supabase.from('pilot_mint_quarantines').insert(payload);

  const { data, error } = await query.select('*').single();

  if (error) {
    throw new Error(`Failed to quarantine mint ${mint}: ${error.message}`);
  }

  return data as PilotMintQuarantineRow;
}

export async function clearPilotMintQuarantine(args: {
  mint: string;
  clearedByWallet: string;
  note?: string | null;
}) {
  const { mint, clearedByWallet, note = null } = args;
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('pilot_mint_quarantines')
    .update({
      status: 'cleared',
      cleared_at: now,
      cleared_by_wallet: clearedByWallet,
      note,
      updated_at: now,
    })
    .eq('mint', mint)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to clear pilot mint quarantine for ${mint}: ${error.message}`);
  }

  return data as PilotMintQuarantineRow;
}
