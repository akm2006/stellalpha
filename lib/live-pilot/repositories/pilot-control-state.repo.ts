import { supabase } from '@/lib/supabase';
import { hasPostgresConnection, pgOne, pgQuery } from '@/lib/db/postgres';
import type { PilotControlScopeType, PilotControlStateRow } from '@/lib/live-pilot/types';

function defaultRow(scopeType: PilotControlScopeType, scopeKey: string): PilotControlStateRow {
  return {
    scope_type: scopeType,
    scope_key: scopeKey,
    is_paused: true,
    kill_switch_active: false,
    liquidation_requested: false,
    updated_by_wallet: null,
    updated_at: new Date(0).toISOString(),
  };
}

export async function ensurePilotControlState(walletAliases: string[]) {
  const rows = [
    {
      scope_type: 'global',
      scope_key: 'global',
      is_paused: true,
      kill_switch_active: false,
      liquidation_requested: false,
      updated_by_wallet: null,
    },
    ...walletAliases.map((walletAlias) => ({
      scope_type: 'wallet' as const,
      scope_key: walletAlias,
      is_paused: true,
      kill_switch_active: false,
      liquidation_requested: false,
      updated_by_wallet: null,
    })),
  ];

  if (hasPostgresConnection()) {
    await pgQuery(
      `
        insert into public.pilot_control_state (
          scope_type,
          scope_key,
          is_paused,
          kill_switch_active,
          liquidation_requested,
          updated_by_wallet
        )
        select *
        from jsonb_to_recordset($1::jsonb) as rows(
          scope_type text,
          scope_key text,
          is_paused boolean,
          kill_switch_active boolean,
          liquidation_requested boolean,
          updated_by_wallet text
        )
        on conflict (scope_type, scope_key) do nothing
      `,
      [JSON.stringify(rows)],
    );
    return;
  }

  const { error } = await supabase
    .from('pilot_control_state')
    .upsert(rows, { onConflict: 'scope_type,scope_key', ignoreDuplicates: true });

  if (error) {
    throw new Error(`Failed to ensure live-pilot control state: ${error.message}`);
  }
}

export async function listPilotControlStates() {
  if (hasPostgresConnection()) {
    return pgQuery<PilotControlStateRow>(`
      select *
      from public.pilot_control_state
      order by scope_type asc, scope_key asc
    `);
  }

  const { data, error } = await supabase
    .from('pilot_control_state')
    .select('*')
    .order('scope_type', { ascending: true })
    .order('scope_key', { ascending: true });

  if (error) {
    throw new Error(`Failed to list live-pilot control state: ${error.message}`);
  }

  return (data || []) as PilotControlStateRow[];
}

export async function updatePilotControlState(
  scopeType: PilotControlScopeType,
  scopeKey: string,
  patch: Partial<Omit<PilotControlStateRow, 'scope_type' | 'scope_key' | 'updated_at'>>,
) {
  if (hasPostgresConnection()) {
    const hasUpdatedByWallet = Object.prototype.hasOwnProperty.call(patch, 'updated_by_wallet');

    return pgOne<PilotControlStateRow>(
      `
        update public.pilot_control_state
        set is_paused = coalesce($3, is_paused),
            kill_switch_active = coalesce($4, kill_switch_active),
            liquidation_requested = coalesce($5, liquidation_requested),
            updated_by_wallet = case when $6::boolean then $7 else updated_by_wallet end,
            updated_at = now()
        where scope_type = $1
          and scope_key = $2
        returning *
      `,
      [
        scopeType,
        scopeKey,
        patch.is_paused ?? null,
        patch.kill_switch_active ?? null,
        patch.liquidation_requested ?? null,
        hasUpdatedByWallet,
        patch.updated_by_wallet ?? null,
      ],
    );
  }

  const { data, error } = await supabase
    .from('pilot_control_state')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('scope_type', scopeType)
    .eq('scope_key', scopeKey)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to update live-pilot control state: ${error.message}`);
  }

  return data as PilotControlStateRow;
}

export function buildPilotControlSnapshot(rows: PilotControlStateRow[], walletAliases: string[]) {
  const global = rows.find((row) => row.scope_type === 'global' && row.scope_key === 'global') || defaultRow('global', 'global');
  const wallets = walletAliases.map((walletAlias) =>
    rows.find((row) => row.scope_type === 'wallet' && row.scope_key === walletAlias) || defaultRow('wallet', walletAlias)
  );

  return { global, wallets };
}
