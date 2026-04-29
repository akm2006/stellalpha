import { supabase } from '@/lib/supabase';
import {
  buildUpdateAssignments,
  hasPostgresConnection,
  pgMaybeOne,
  pgOne,
  pgQuery,
} from '@/lib/db/postgres';
import { BUY_STALENESS_THRESHOLD_MS } from '@/lib/ingestion/copy-signal';
import { broadcastLivePilotQueueWake } from '@/lib/live-pilot/queue-wake';
import type { PilotTradeRow, PilotTradeStatus, PilotTradeTriggerKind } from '@/lib/live-pilot/types';

export interface CreatePilotTradeInput {
  wallet_alias: string;
  wallet_public_key: string;
  trigger_kind: PilotTradeTriggerKind;
  trigger_reason?: string | null;
  star_trader?: string | null;
  star_trade_signature?: string | null;
  leader_type?: string | null;
  token_in_mint?: string | null;
  token_out_mint?: string | null;
  copy_ratio?: number | null;
  leader_position_before?: number | null;
  leader_position_after?: number | null;
  copied_position_before?: number | null;
  copied_position_after?: number | null;
  sell_fraction?: number | null;
  leader_block_timestamp?: string | null;
  received_at?: string | null;
  intent_created_at?: string | null;
  deployable_sol_at_intent?: number | null;
  sol_price_at_intent?: number | null;
  next_retry_at?: string | null;
  status: PilotTradeStatus;
  skip_reason?: string | null;
  error_message?: string | null;
}

export async function createPilotTrade(trade: CreatePilotTradeInput) {
  if (hasPostgresConnection()) {
    try {
      const data = await pgOne<PilotTradeRow>(
        `
          insert into public.pilot_trades (
            wallet_alias,
            wallet_public_key,
            trigger_kind,
            trigger_reason,
            star_trader,
            star_trade_signature,
            leader_type,
            token_in_mint,
            token_out_mint,
            copy_ratio,
            leader_position_before,
            leader_position_after,
            copied_position_before,
            copied_position_after,
            sell_fraction,
            leader_block_timestamp,
            received_at,
            intent_created_at,
            deployable_sol_at_intent,
            sol_price_at_intent,
            next_retry_at,
            status,
            skip_reason,
            error_message
          )
          values (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21, $22, $23, $24
          )
          returning *
        `,
        [
          trade.wallet_alias,
          trade.wallet_public_key,
          trade.trigger_kind,
          trade.trigger_reason ?? null,
          trade.star_trader ?? null,
          trade.star_trade_signature ?? null,
          trade.leader_type ?? null,
          trade.token_in_mint ?? null,
          trade.token_out_mint ?? null,
          trade.copy_ratio ?? null,
          trade.leader_position_before ?? null,
          trade.leader_position_after ?? null,
          trade.copied_position_before ?? null,
          trade.copied_position_after ?? null,
          trade.sell_fraction ?? null,
          trade.leader_block_timestamp ?? null,
          trade.received_at ?? null,
          trade.intent_created_at ?? null,
          trade.deployable_sol_at_intent ?? null,
          trade.sol_price_at_intent ?? null,
          trade.next_retry_at ?? null,
          trade.status,
          trade.skip_reason ?? null,
          trade.error_message ?? null,
        ],
      );

      if (trade.status === 'queued') {
        void broadcastLivePilotQueueWake({
          source: 'trade_created',
          walletAlias: trade.wallet_alias,
          tradeId: data.id,
        });
      }

      return { created: true as const, duplicate: false as const, trade: data };
    } catch (error: any) {
      if (error?.code === '23505') {
        return { created: false as const, duplicate: true as const, trade: null };
      }

      throw new Error(`Failed to create live-pilot trade: ${error?.message || error}`);
    }
  }

  const { data, error } = await supabase
    .from('pilot_trades')
    .insert(trade)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      return { created: false as const, duplicate: true as const, trade: null };
    }

    throw new Error(`Failed to create live-pilot trade: ${error.message}`);
  }

  if (trade.status === 'queued') {
    void broadcastLivePilotQueueWake({
      source: 'trade_created',
      walletAlias: trade.wallet_alias,
      tradeId: data.id,
    });
  }

  return { created: true as const, duplicate: false as const, trade: data as PilotTradeRow };
}

export async function listRecentPilotTrades(limit: number = 25) {
  if (hasPostgresConnection()) {
    return pgQuery<PilotTradeRow>(
      `
        select *
        from public.pilot_trades
        order by created_at desc
        limit $1
      `,
      [limit],
    );
  }

  const { data, error } = await supabase
    .from('pilot_trades')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list recent live-pilot trades: ${error.message}`);
  }

  return (data || []) as PilotTradeRow[];
}

export type PilotTradePatch = Partial<Omit<PilotTradeRow, 'id' | 'wallet_alias' | 'wallet_public_key' | 'trigger_kind' | 'created_at' | 'updated_at'>>;

export async function listQueuedPilotTrades(
  limit: number = 25,
  filters: {
    triggerKind?: PilotTradeTriggerKind;
    triggerReason?: string;
  } = {},
) {
  if (hasPostgresConnection()) {
    const values: unknown[] = [limit];
    const conditions = [
      "status = 'queued'",
      '(next_retry_at is null or next_retry_at <= now())',
    ];

    if (filters.triggerKind) {
      values.push(filters.triggerKind);
      conditions.push(`trigger_kind = $${values.length}`);
    }

    if (filters.triggerReason) {
      values.push(filters.triggerReason);
      conditions.push(`trigger_reason = $${values.length}`);
    }

    return pgQuery<PilotTradeRow>(
      `
        select *
        from public.pilot_trades
        where ${conditions.join(' and ')}
        order by created_at asc
        limit $1
      `,
      values,
    );
  }

  const nowIso = new Date().toISOString();
  let query = supabase
    .from('pilot_trades')
    .select('*')
    .eq('status', 'queued')
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`);

  if (filters.triggerKind) {
    query = query.eq('trigger_kind', filters.triggerKind);
  }

  if (filters.triggerReason) {
    query = query.eq('trigger_reason', filters.triggerReason);
  }

  const { data, error } = await query
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list queued live-pilot trades: ${error.message}`);
  }

  return (data || []) as PilotTradeRow[];
}

export async function listFreshQueuedCopyBuyTrades(limit: number = 25, nowMs: number = Date.now()) {
  const cutoffIso = new Date(nowMs - BUY_STALENESS_THRESHOLD_MS).toISOString();

  if (hasPostgresConnection()) {
    return pgQuery<PilotTradeRow>(
      `
        select *
        from public.pilot_trades
        where status = 'queued'
          and trigger_kind = 'copy'
          and trigger_reason = 'leader_trade'
          and leader_type = 'buy'
          and leader_block_timestamp is not null
          and leader_block_timestamp >= $2::timestamptz
          and (next_retry_at is null or next_retry_at <= now())
        order by leader_block_timestamp desc, created_at desc
        limit $1
      `,
      [limit, cutoffIso],
    );
  }

  const nowIso = new Date(nowMs).toISOString();
  const { data, error } = await supabase
    .from('pilot_trades')
    .select('*')
    .eq('status', 'queued')
    .eq('trigger_kind', 'copy')
    .eq('trigger_reason', 'leader_trade')
    .eq('leader_type', 'buy')
    .gte('leader_block_timestamp', cutoffIso)
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order('leader_block_timestamp', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list fresh queued live-pilot buys: ${error.message}`);
  }

  return (data || []) as PilotTradeRow[];
}

export async function listQueuedCopySellTrades(limit: number = 25) {
  if (hasPostgresConnection()) {
    return pgQuery<PilotTradeRow>(
      `
        select *
        from public.pilot_trades
        where status = 'queued'
          and trigger_kind = 'copy'
          and trigger_reason = 'leader_trade'
          and leader_type = 'sell'
          and (next_retry_at is null or next_retry_at <= now())
        order by created_at asc
        limit $1
      `,
      [limit],
    );
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('pilot_trades')
    .select('*')
    .eq('status', 'queued')
    .eq('trigger_kind', 'copy')
    .eq('trigger_reason', 'leader_trade')
    .eq('leader_type', 'sell')
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list queued live-pilot sells: ${error.message}`);
  }

  return (data || []) as PilotTradeRow[];
}

export async function skipExpiredQueuedCopyBuyTrades(limit: number = 500, nowMs: number = Date.now()) {
  const cutoffIso = new Date(nowMs - BUY_STALENESS_THRESHOLD_MS).toISOString();
  const message = `Buy expired in worker queue before claim; hard cutoff is ${BUY_STALENESS_THRESHOLD_MS / 1000}s`;

  if (hasPostgresConnection()) {
    return pgQuery<PilotTradeRow>(
      `
        with expired as (
          select id
          from public.pilot_trades
          where status = 'queued'
            and trigger_kind = 'copy'
            and trigger_reason = 'leader_trade'
            and leader_type = 'buy'
            and leader_block_timestamp is not null
            and leader_block_timestamp < $2::timestamptz
          order by leader_block_timestamp asc, created_at asc
          limit $1
        )
        update public.pilot_trades trades
        set status = 'skipped',
            skip_reason = 'stale_buy',
            error_message = $3,
            next_retry_at = null,
            updated_at = now()
        from expired
        where trades.id = expired.id
        returning trades.*
      `,
      [limit, cutoffIso, message],
    );
  }

  const { data: expiredRows, error: selectError } = await supabase
    .from('pilot_trades')
    .select('id')
    .eq('status', 'queued')
    .eq('trigger_kind', 'copy')
    .eq('trigger_reason', 'leader_trade')
    .eq('leader_type', 'buy')
    .lt('leader_block_timestamp', cutoffIso)
    .order('leader_block_timestamp', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (selectError) {
    throw new Error(`Failed to select expired queued live-pilot buys: ${selectError.message}`);
  }

  const ids = (expiredRows || []).map((row: any) => row.id).filter(Boolean);
  if (ids.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('pilot_trades')
    .update({
      status: 'skipped',
      skip_reason: 'stale_buy',
      error_message: message,
      next_retry_at: null,
      updated_at: new Date(nowMs).toISOString(),
    })
    .in('id', ids)
    .eq('status', 'queued')
    .select('*');

  if (error) {
    throw new Error(`Failed to skip expired queued live-pilot buys: ${error.message}`);
  }

  return (data || []) as PilotTradeRow[];
}

export async function getPilotTradeById(tradeId: string) {
  if (hasPostgresConnection()) {
    return pgMaybeOne<PilotTradeRow>(
      `
        select *
        from public.pilot_trades
        where id = $1
      `,
      [tradeId],
    );
  }

  const { data, error } = await supabase
    .from('pilot_trades')
    .select('*')
    .eq('id', tradeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch live-pilot trade ${tradeId}: ${error.message}`);
  }

  return (data || null) as PilotTradeRow | null;
}

export async function getCopyPilotTradeByWalletSignature(walletAlias: string, signature: string) {
  if (hasPostgresConnection()) {
    return pgMaybeOne<PilotTradeRow>(
      `
        select *
        from public.pilot_trades
        where wallet_alias = $1
          and trigger_kind = 'copy'
          and star_trade_signature = $2
        limit 1
      `,
      [walletAlias, signature],
    );
  }

  const { data, error } = await supabase
    .from('pilot_trades')
    .select('*')
    .eq('wallet_alias', walletAlias)
    .eq('trigger_kind', 'copy')
    .eq('star_trade_signature', signature)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch live-pilot copy trade for ${walletAlias}/${signature}: ${error.message}`);
  }

  return (data || null) as PilotTradeRow | null;
}

export async function claimQueuedPilotTrade(tradeId: string, nextAttemptCount: number) {
  if (hasPostgresConnection()) {
    return pgMaybeOne<PilotTradeRow>(
      `
        update public.pilot_trades
        set status = 'building',
            attempt_count = $2,
            next_retry_at = null,
            skip_reason = null,
            error_message = null,
            winning_attempt_id = null,
            quote_received_at = null,
            tx_built_at = null,
            tx_submitted_at = null,
            tx_signature = null,
            tx_confirmed_at = null,
            confirmation_slot = null,
            quoted_input_amount = null,
            quoted_output_amount = null,
            quoted_input_amount_raw = null,
            actual_input_amount = null,
            actual_output_amount = null,
            price_impact_pct = null,
            updated_at = now()
        where id = $1
          and status = 'queued'
        returning *
      `,
      [tradeId, nextAttemptCount],
    );
  }

  const { data, error } = await supabase
    .from('pilot_trades')
    .update({
      status: 'building',
      attempt_count: nextAttemptCount,
      next_retry_at: null,
      skip_reason: null,
      error_message: null,
      winning_attempt_id: null,
      quote_received_at: null,
      tx_built_at: null,
      tx_submitted_at: null,
      tx_signature: null,
      tx_confirmed_at: null,
      confirmation_slot: null,
      quoted_input_amount: null,
      quoted_output_amount: null,
      quoted_input_amount_raw: null,
      actual_input_amount: null,
      actual_output_amount: null,
      price_impact_pct: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tradeId)
    .eq('status', 'queued')
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to claim queued live-pilot trade ${tradeId}: ${error.message}`);
  }

  return (data || null) as PilotTradeRow | null;
}

export async function listActiveLiquidationTrades(walletAlias: string) {
  if (hasPostgresConnection()) {
    return pgQuery<PilotTradeRow>(
      `
        select *
        from public.pilot_trades
        where wallet_alias = $1
          and trigger_kind = 'liquidation'
          and status = any($2::text[])
        order by created_at desc
      `,
      [walletAlias, ['queued', 'building', 'submitted']],
    );
  }

  const { data, error } = await supabase
    .from('pilot_trades')
    .select('*')
    .eq('wallet_alias', walletAlias)
    .eq('trigger_kind', 'liquidation')
    .in('status', ['queued', 'building', 'submitted'])
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list active live-pilot liquidation trades: ${error.message}`);
  }

  return (data || []) as PilotTradeRow[];
}

export async function listRecentCopyExitTradesForWallet(walletAlias: string, sinceIso: string) {
  if (hasPostgresConnection()) {
    return pgQuery<PilotTradeRow>(
      `
        select *
        from public.pilot_trades
        where wallet_alias = $1
          and trigger_kind = 'copy'
          and leader_type = 'sell'
          and created_at >= $2::timestamptz
        order by created_at desc
      `,
      [walletAlias, sinceIso],
    );
  }

  const { data, error } = await supabase
    .from('pilot_trades')
    .select('*')
    .eq('wallet_alias', walletAlias)
    .eq('trigger_kind', 'copy')
    .eq('leader_type', 'sell')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list recent copy exit trades for ${walletAlias}: ${error.message}`);
  }

  return (data || []) as PilotTradeRow[];
}

export async function updatePilotTrade(tradeId: string, patch: PilotTradePatch) {
  if (hasPostgresConnection()) {
    const { assignments, values } = buildUpdateAssignments(patch);
    return pgOne<PilotTradeRow>(
      `
        update public.pilot_trades
        set ${[...assignments, 'updated_at = now()'].join(', ')}
        where id = $1
        returning *
      `,
      [tradeId, ...values],
    );
  }

  const { data, error } = await supabase
    .from('pilot_trades')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tradeId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to update live-pilot trade ${tradeId}: ${error.message}`);
  }

  return data as PilotTradeRow;
}

export async function updatePilotTradeIfStatus(
  tradeId: string,
  expectedStatus: PilotTradeStatus,
  patch: PilotTradePatch,
) {
  if (hasPostgresConnection()) {
    const { assignments, values } = buildUpdateAssignments(patch, 3);
    return pgMaybeOne<PilotTradeRow>(
      `
        update public.pilot_trades
        set ${[...assignments, 'updated_at = now()'].join(', ')}
        where id = $1
          and status = $2
        returning *
      `,
      [tradeId, expectedStatus, ...values],
    );
  }

  const { data, error } = await supabase
    .from('pilot_trades')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tradeId)
    .eq('status', expectedStatus)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update live-pilot trade ${tradeId}: ${error.message}`);
  }

  return (data || null) as PilotTradeRow | null;
}
