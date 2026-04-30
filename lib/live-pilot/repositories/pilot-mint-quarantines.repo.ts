import { supabase } from '@/lib/supabase';
import { hasPostgresConnection, pgMaybeOne, pgOne, pgQuery } from '@/lib/db/postgres';
import { isLivePilotRedisAvailable, livePilotRedisConfig } from '@/lib/live-pilot/redis/config';
import {
  clearRedisMintQuarantine,
  getRedisMintQuarantine,
  setRedisMintQuarantine,
} from '@/lib/live-pilot/redis/state';
import type { PilotMintQuarantineRow } from '@/lib/live-pilot/types';

function canUseRedisExecutionFallback() {
  return isLivePilotRedisAvailable() && livePilotRedisConfig.executionEnabled;
}

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
  const redisQuarantine = await getRedisMintQuarantine(mint).catch(() => null);
  if (redisQuarantine) {
    return redisQuarantine;
  }

  if (hasPostgresConnection()) {
    try {
      return await pgMaybeOne<PilotMintQuarantineRow>(
      `
        select *
        from public.pilot_mint_quarantines
        where mint = $1
        limit 1
      `,
      [mint],
      );
    } catch (error) {
      if (canUseRedisExecutionFallback()) return null;
      throw error;
    }
  }

  const { data, error } = await supabase
    .from('pilot_mint_quarantines')
    .select('*')
    .eq('mint', mint)
    .maybeSingle();

  if (error) {
    if (canUseRedisExecutionFallback()) return null;
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

  const existing = await getPilotMintQuarantine(mint).catch(() => null);
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
    try {
      const row = await pgOne<PilotMintQuarantineRow>(
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
      await setRedisMintQuarantine(row).catch(() => undefined);
      return row;
    } catch (error) {
      if (!canUseRedisExecutionFallback()) throw error;
      const row = {
        ...payload,
        created_at: existing?.created_at || now,
      } as PilotMintQuarantineRow;
      await setRedisMintQuarantine(row);
      return row;
    }
  }

  const query = existing
    ? supabase.from('pilot_mint_quarantines').update(payload).eq('mint', mint)
    : supabase.from('pilot_mint_quarantines').insert(payload);

  const { data, error } = await query.select('*').single();

  if (error) {
    if (canUseRedisExecutionFallback()) {
      const row = {
        ...payload,
        created_at: existing?.created_at || now,
      } as PilotMintQuarantineRow;
      await setRedisMintQuarantine(row);
      return row;
    }
    throw new Error(`Failed to quarantine mint ${mint}: ${error.message}`);
  }

  await setRedisMintQuarantine(data as PilotMintQuarantineRow).catch(() => undefined);
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
    try {
      const row = await pgOne<PilotMintQuarantineRow>(
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
      await clearRedisMintQuarantine(mint).catch(() => undefined);
      return row;
    } catch (error) {
      if (!canUseRedisExecutionFallback()) throw error;
      await clearRedisMintQuarantine(mint);
      return {
        mint,
        status: 'cleared',
        reason: 'cleared',
        first_wallet_alias: null,
        first_star_trader: null,
        first_pilot_trade_id: null,
        first_detected_at: now,
        last_detected_at: now,
        cleared_at: now,
        cleared_by_wallet: clearedByWallet,
        note,
        created_at: now,
        updated_at: now,
      };
    }
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
    if (canUseRedisExecutionFallback()) {
      await clearRedisMintQuarantine(mint);
      return {
        mint,
        status: 'cleared',
        reason: 'cleared',
        first_wallet_alias: null,
        first_star_trader: null,
        first_pilot_trade_id: null,
        first_detected_at: now,
        last_detected_at: now,
        cleared_at: now,
        cleared_by_wallet: clearedByWallet,
        note,
        created_at: now,
        updated_at: now,
      };
    }
    throw new Error(`Failed to clear pilot mint quarantine for ${mint}: ${error.message}`);
  }

  await clearRedisMintQuarantine(mint).catch(() => undefined);
  return data as PilotMintQuarantineRow;
}
