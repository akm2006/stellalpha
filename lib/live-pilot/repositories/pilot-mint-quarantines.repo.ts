import { supabase } from '@/lib/supabase';
import { hasPostgresConnection, pgMaybeOne, pgOne, pgQuery } from '@/lib/db/postgres';
import type { PilotMintQuarantineRow } from '@/lib/live-pilot/types';

export async function listActivePilotMintQuarantines() {
  if (hasPostgresConnection()) {
    return pgQuery<PilotMintQuarantineRow>(`
      select *
      from public.pilot_mint_quarantines
      where status = 'active'
      order by last_detected_at desc
    `);
  }

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
  if (hasPostgresConnection()) {
    return pgMaybeOne<PilotMintQuarantineRow>(
      `
        select *
        from public.pilot_mint_quarantines
        where mint = $1
        limit 1
      `,
      [mint],
    );
  }

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

  if (hasPostgresConnection()) {
    return pgOne<PilotMintQuarantineRow>(
      `
        insert into public.pilot_mint_quarantines (
          mint,
          status,
          reason,
          first_wallet_alias,
          first_star_trader,
          first_pilot_trade_id,
          first_detected_at,
          last_detected_at,
          cleared_at,
          cleared_by_wallet,
          note,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9::timestamptz, $10, $11, $12::timestamptz)
        on conflict (mint) do update
        set status = excluded.status,
            reason = excluded.reason,
            first_wallet_alias = coalesce(public.pilot_mint_quarantines.first_wallet_alias, excluded.first_wallet_alias),
            first_star_trader = coalesce(public.pilot_mint_quarantines.first_star_trader, excluded.first_star_trader),
            first_pilot_trade_id = coalesce(public.pilot_mint_quarantines.first_pilot_trade_id, excluded.first_pilot_trade_id),
            first_detected_at = coalesce(public.pilot_mint_quarantines.first_detected_at, excluded.first_detected_at),
            last_detected_at = excluded.last_detected_at,
            cleared_at = null,
            cleared_by_wallet = null,
            note = excluded.note,
            updated_at = excluded.updated_at
        returning *
      `,
      [
        payload.mint,
        payload.status,
        payload.reason,
        payload.first_wallet_alias,
        payload.first_star_trader,
        payload.first_pilot_trade_id,
        payload.first_detected_at,
        payload.last_detected_at,
        payload.cleared_at,
        payload.cleared_by_wallet,
        payload.note,
        payload.updated_at,
      ],
    );
  }

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

  if (hasPostgresConnection()) {
    return pgOne<PilotMintQuarantineRow>(
      `
        update public.pilot_mint_quarantines
        set status = 'cleared',
            cleared_at = $2::timestamptz,
            cleared_by_wallet = $3,
            note = $4,
            updated_at = $2::timestamptz
        where mint = $1
        returning *
      `,
      [mint, now, clearedByWallet, note],
    );
  }

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
