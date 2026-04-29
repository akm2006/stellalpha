import { supabase } from '@/lib/supabase';
import { hasPostgresConnection, pgMaybeOne, pgOne, pgQuery } from '@/lib/db/postgres';
import type { PilotRuntimeStateRow, PilotWalletConfigSummary } from '@/lib/live-pilot/types';

const LOCK_STALE_AFTER_MS = 90_000;

export async function ensurePilotRuntimeState(wallets: Pick<PilotWalletConfigSummary, 'alias' | 'starTrader' | 'mode'>[]) {
  if (wallets.length === 0) {
    return;
  }

  if (hasPostgresConnection()) {
    await pgQuery(
      `
        insert into public.pilot_runtime_state (
          wallet_alias,
          star_trader,
          mode
        )
        select *
        from jsonb_to_recordset($1::jsonb) as rows(
          wallet_alias text,
          star_trader text,
          mode text
        )
        on conflict (wallet_alias) do nothing
      `,
      [
        JSON.stringify(
          wallets.map((wallet) => ({
            wallet_alias: wallet.alias,
            star_trader: wallet.starTrader || null,
            mode: wallet.mode,
          })),
        ),
      ],
    );
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

  if (hasPostgresConnection()) {
    return pgQuery<PilotRuntimeStateRow>(
      `
        select *
        from public.pilot_runtime_state
        where wallet_alias = any($1::text[])
        order by wallet_alias asc
      `,
      [walletAliases],
    );
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

export async function getPilotRuntimeState(walletAlias: string) {
  if (hasPostgresConnection()) {
    return pgMaybeOne<PilotRuntimeStateRow>(
      `
        select *
        from public.pilot_runtime_state
        where wallet_alias = $1
      `,
      [walletAlias],
    );
  }

  const { data, error } = await supabase
    .from('pilot_runtime_state')
    .select('*')
    .eq('wallet_alias', walletAlias)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch live-pilot runtime state for ${walletAlias}: ${error.message}`);
  }

  return (data || null) as PilotRuntimeStateRow | null;
}

export async function updatePilotRuntimeState(walletAlias: string, patch: Partial<Omit<PilotRuntimeStateRow, 'wallet_alias' | 'updated_at'>>) {
  if (hasPostgresConnection()) {
    return pgOne<PilotRuntimeStateRow>(
      `
        update public.pilot_runtime_state
        set star_trader = coalesce($2, star_trader),
            mode = coalesce($3, mode),
            lock_owner = case when $4::boolean then $5 else lock_owner end,
            last_seen_star_trade_signature = coalesce($6, last_seen_star_trade_signature),
            last_submitted_tx_signature = coalesce($7, last_submitted_tx_signature),
            last_confirmed_tx_signature = coalesce($8, last_confirmed_tx_signature),
            last_error = case when $9::boolean then $10 else last_error end,
            last_reconcile_at = coalesce($11::timestamptz, last_reconcile_at),
            updated_at = now()
        where wallet_alias = $1
        returning *
      `,
      [
        walletAlias,
        patch.star_trader ?? null,
        patch.mode ?? null,
        Object.prototype.hasOwnProperty.call(patch, 'lock_owner'),
        patch.lock_owner ?? null,
        patch.last_seen_star_trade_signature ?? null,
        patch.last_submitted_tx_signature ?? null,
        patch.last_confirmed_tx_signature ?? null,
        Object.prototype.hasOwnProperty.call(patch, 'last_error'),
        patch.last_error ?? null,
        patch.last_reconcile_at ?? null,
      ],
    );
  }

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

export async function tryAcquirePilotRuntimeLock(walletAlias: string, lockOwner: string) {
  const staleBeforeIso = new Date(Date.now() - LOCK_STALE_AFTER_MS).toISOString();
  const patch = {
    lock_owner: lockOwner,
    updated_at: new Date().toISOString(),
  };

  if (hasPostgresConnection()) {
    return pgMaybeOne<PilotRuntimeStateRow>(
      `
        update public.pilot_runtime_state
        set lock_owner = $2,
            updated_at = now()
        where wallet_alias = $1
          and (
            lock_owner is null
            or updated_at < $3::timestamptz
          )
        returning *
      `,
      [walletAlias, lockOwner, staleBeforeIso],
    );
  }

  const unlockedAttempt = await supabase
    .from('pilot_runtime_state')
    .update(patch)
    .eq('wallet_alias', walletAlias)
    .is('lock_owner', null)
    .select('*')
    .maybeSingle();

  if (unlockedAttempt.error) {
    throw new Error(`Failed to acquire live-pilot runtime lock for ${walletAlias}: ${unlockedAttempt.error.message}`);
  }

  if (unlockedAttempt.data) {
    return unlockedAttempt.data as PilotRuntimeStateRow;
  }

  const staleAttempt = await supabase
    .from('pilot_runtime_state')
    .update(patch)
    .eq('wallet_alias', walletAlias)
    .lt('updated_at', staleBeforeIso)
    .select('*')
    .maybeSingle();

  if (staleAttempt.error) {
    throw new Error(`Failed to acquire stale live-pilot runtime lock for ${walletAlias}: ${staleAttempt.error.message}`);
  }

  return (staleAttempt.data || null) as PilotRuntimeStateRow | null;
}

export async function releasePilotRuntimeLock(walletAlias: string, lockOwner: string) {
  if (hasPostgresConnection()) {
    return pgMaybeOne<PilotRuntimeStateRow>(
      `
        update public.pilot_runtime_state
        set lock_owner = null,
            updated_at = now()
        where wallet_alias = $1
          and lock_owner = $2
        returning *
      `,
      [walletAlias, lockOwner],
    );
  }

  const { data, error } = await supabase
    .from('pilot_runtime_state')
    .update({
      lock_owner: null,
      updated_at: new Date().toISOString(),
    })
    .eq('wallet_alias', walletAlias)
    .eq('lock_owner', lockOwner)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to release live-pilot runtime lock for ${walletAlias}: ${error.message}`);
  }

  return (data || null) as PilotRuntimeStateRow | null;
}

export async function clearPilotRuntimeLocks(walletAliases: string[]) {
  if (walletAliases.length === 0) {
    return;
  }

  if (hasPostgresConnection()) {
    await pgQuery(
      `
        update public.pilot_runtime_state
        set lock_owner = null,
            updated_at = now()
        where wallet_alias = any($1::text[])
      `,
      [walletAliases],
    );
    return;
  }

  const { error } = await supabase
    .from('pilot_runtime_state')
    .update({
      lock_owner: null,
      updated_at: new Date().toISOString(),
    })
    .in('wallet_alias', walletAliases);

  if (error) {
    throw new Error(`Failed to clear live-pilot runtime locks: ${error.message}`);
  }
}
