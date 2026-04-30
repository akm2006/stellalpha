import { supabase } from '@/lib/supabase';
import {
  buildUpdateAssignments,
  hasPostgresConnection,
  pgOne,
  pgQuery,
} from '@/lib/db/postgres';
import { isLivePilotRedisAvailable, livePilotRedisConfig } from '@/lib/live-pilot/redis/config';
import { createRedisAttemptRow, mirrorRedisTradeEvent } from '@/lib/live-pilot/redis/state';
import type { PilotTradeAttemptRow } from '@/lib/live-pilot/types';

const NON_BREAKER_ERROR_CODES = new Set([
  'below_min_trade_size',
  'insufficient_balance',
  'insufficient_deployable_sol',
  'insufficient_sol_for_fees',
  'mint_quarantined',
  'missing_input_mint',
  'missing_output_mint',
  'no_route',
  'not_followed_position',
  'price_impact_too_high',
  'stale_buy',
  'technically_too_small',
  'trapped_unquotable',
  'wallet_not_ready',
  'zero_copy_ratio',
]);

export interface CreatePilotTradeAttemptInput {
  pilot_trade_id: string;
  attempt_number: number;
  execution_mode: string;
  slippage_bps?: number | null;
  jupiter_request_id?: string | null;
  jupiter_router?: string | null;
  last_valid_block_height?: number | null;
  quoted_input_amount?: number | null;
  quoted_output_amount?: number | null;
  quoted_input_amount_raw?: string | null;
  price_impact_pct?: number | null;
  prioritization_fee_lamports?: string | null;
  signed_transaction?: string | null;
  execute_retry_count?: number;
  execute_last_attempt_at?: string | null;
  tx_signature?: string | null;
  tx_submitted_at?: string | null;
  tx_confirmed_at?: string | null;
  confirmation_slot?: number | null;
  actual_input_amount?: number | null;
  actual_output_amount?: number | null;
  status: PilotTradeAttemptRow['status'];
  error_code?: string | null;
  error_message?: string | null;
}

export type PilotTradeAttemptPatch = Partial<Omit<PilotTradeAttemptRow, 'id' | 'pilot_trade_id' | 'attempt_number' | 'created_at' | 'updated_at'>>;

function canUseRedisExecutionFallback() {
  return isLivePilotRedisAvailable() && livePilotRedisConfig.executionEnabled;
}

function redisAttemptFromCreateInput(attempt: CreatePilotTradeAttemptInput): PilotTradeAttemptRow {
  return createRedisAttemptRow({
    id: `redis-attempt:${attempt.pilot_trade_id}:${attempt.attempt_number}:${Date.now()}`,
    attempt: {
      pilot_trade_id: attempt.pilot_trade_id,
      attempt_number: attempt.attempt_number,
      execution_mode: attempt.execution_mode,
      slippage_bps: attempt.slippage_bps ?? null,
      jupiter_request_id: attempt.jupiter_request_id ?? null,
      jupiter_router: attempt.jupiter_router ?? null,
      last_valid_block_height: attempt.last_valid_block_height ?? null,
      quoted_input_amount: attempt.quoted_input_amount ?? null,
      quoted_output_amount: attempt.quoted_output_amount ?? null,
      quoted_input_amount_raw: attempt.quoted_input_amount_raw ?? null,
      price_impact_pct: attempt.price_impact_pct ?? null,
      prioritization_fee_lamports: attempt.prioritization_fee_lamports ?? null,
      signed_transaction: attempt.signed_transaction ?? null,
      execute_retry_count: attempt.execute_retry_count ?? 0,
      execute_last_attempt_at: attempt.execute_last_attempt_at ?? null,
      tx_signature: attempt.tx_signature ?? null,
      tx_submitted_at: attempt.tx_submitted_at ?? null,
      tx_confirmed_at: attempt.tx_confirmed_at ?? null,
      confirmation_slot: attempt.confirmation_slot ?? null,
      actual_input_amount: attempt.actual_input_amount ?? null,
      actual_output_amount: attempt.actual_output_amount ?? null,
      status: attempt.status,
      error_code: attempt.error_code ?? null,
      error_message: attempt.error_message ?? null,
    },
  });
}

export async function createPilotTradeAttempt(attempt: CreatePilotTradeAttemptInput) {
  if (hasPostgresConnection()) {
    try {
      return await pgOne<PilotTradeAttemptRow>(
      `
        insert into public.pilot_trade_attempts (
          pilot_trade_id,
          attempt_number,
          execution_mode,
          slippage_bps,
          jupiter_request_id,
          jupiter_router,
          last_valid_block_height,
          quoted_input_amount,
          quoted_output_amount,
          quoted_input_amount_raw,
          price_impact_pct,
          prioritization_fee_lamports,
          signed_transaction,
          execute_retry_count,
          execute_last_attempt_at,
          tx_signature,
          tx_submitted_at,
          tx_confirmed_at,
          confirmation_slot,
          actual_input_amount,
          actual_output_amount,
          status,
          error_code,
          error_message
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, coalesce($14, 0), $15, $16,
          $17, $18, $19, $20, $21, $22, $23, $24
        )
        returning *
      `,
      [
        attempt.pilot_trade_id,
        attempt.attempt_number,
        attempt.execution_mode,
        attempt.slippage_bps ?? null,
        attempt.jupiter_request_id ?? null,
        attempt.jupiter_router ?? null,
        attempt.last_valid_block_height ?? null,
        attempt.quoted_input_amount ?? null,
        attempt.quoted_output_amount ?? null,
        attempt.quoted_input_amount_raw ?? null,
        attempt.price_impact_pct ?? null,
        attempt.prioritization_fee_lamports ?? null,
        attempt.signed_transaction ?? null,
        attempt.execute_retry_count ?? 0,
        attempt.execute_last_attempt_at ?? null,
        attempt.tx_signature ?? null,
        attempt.tx_submitted_at ?? null,
        attempt.tx_confirmed_at ?? null,
        attempt.confirmation_slot ?? null,
        attempt.actual_input_amount ?? null,
        attempt.actual_output_amount ?? null,
        attempt.status,
        attempt.error_code ?? null,
        attempt.error_message ?? null,
      ],
      );
    } catch (error) {
      if (!canUseRedisExecutionFallback()) throw error;
      const row = redisAttemptFromCreateInput(attempt);
      await mirrorRedisTradeEvent({
        source: 'redis_attempt_created_after_db_failure',
        pilotTradeId: attempt.pilot_trade_id,
        attemptId: row.id,
        attemptNumber: attempt.attempt_number,
        status: attempt.status,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return row;
    }
  }

  const { data, error } = await supabase
    .from('pilot_trade_attempts')
    .insert(attempt)
    .select('*')
    .single();

  if (error) {
    if (canUseRedisExecutionFallback()) {
      const row = redisAttemptFromCreateInput(attempt);
      await mirrorRedisTradeEvent({
        source: 'redis_attempt_created_after_db_failure',
        pilotTradeId: attempt.pilot_trade_id,
        attemptId: row.id,
        attemptNumber: attempt.attempt_number,
        status: attempt.status,
        errorMessage: error.message,
      });
      return row;
    }
    throw new Error(`Failed to create live-pilot trade attempt: ${error.message}`);
  }

  return data as PilotTradeAttemptRow;
}

export async function updatePilotTradeAttempt(attemptId: string, patch: PilotTradeAttemptPatch) {
  if (attemptId.startsWith('redis-attempt:')) {
    const parts = attemptId.split(':');
    const row = createRedisAttemptRow({
      id: attemptId,
      attempt: {
        pilot_trade_id: parts[1] || 'redis-unknown',
        attempt_number: Number(parts[2] || 1),
        execution_mode: String(patch.execution_mode || 'managed_order_execute'),
        slippage_bps: patch.slippage_bps ?? null,
        jupiter_request_id: patch.jupiter_request_id ?? null,
        jupiter_router: patch.jupiter_router ?? null,
        last_valid_block_height: patch.last_valid_block_height ?? null,
        quoted_input_amount: patch.quoted_input_amount ?? null,
        quoted_output_amount: patch.quoted_output_amount ?? null,
        quoted_input_amount_raw: patch.quoted_input_amount_raw ?? null,
        price_impact_pct: patch.price_impact_pct ?? null,
        prioritization_fee_lamports: patch.prioritization_fee_lamports ?? null,
        signed_transaction: patch.signed_transaction ?? null,
        execute_retry_count: patch.execute_retry_count ?? 0,
        execute_last_attempt_at: patch.execute_last_attempt_at ?? null,
        tx_signature: patch.tx_signature ?? null,
        tx_submitted_at: patch.tx_submitted_at ?? null,
        tx_confirmed_at: patch.tx_confirmed_at ?? null,
        confirmation_slot: patch.confirmation_slot ?? null,
        actual_input_amount: patch.actual_input_amount ?? null,
        actual_output_amount: patch.actual_output_amount ?? null,
        status: patch.status ?? 'building',
        error_code: patch.error_code ?? null,
        error_message: patch.error_message ?? null,
      },
    });
    await mirrorRedisTradeEvent({
      source: 'redis_attempt_updated',
      attemptId,
      pilotTradeId: row.pilot_trade_id,
      status: row.status,
      txSignature: row.tx_signature,
      txSubmittedAt: row.tx_submitted_at,
      txConfirmedAt: row.tx_confirmed_at,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      patch: JSON.stringify(patch),
    });
    return row;
  }

  if (hasPostgresConnection()) {
    try {
      const { assignments, values } = buildUpdateAssignments(patch);
      return await pgOne<PilotTradeAttemptRow>(
      `
        update public.pilot_trade_attempts
        set ${[...assignments, 'updated_at = now()'].join(', ')}
        where id = $1
        returning *
      `,
      [attemptId, ...values],
      );
    } catch (error) {
      if (!canUseRedisExecutionFallback()) throw error;
      await mirrorRedisTradeEvent({
        source: 'redis_attempt_update_after_db_failure',
        attemptId,
        patch: JSON.stringify(patch),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return createRedisAttemptRow({
        id: attemptId,
        attempt: {
          pilot_trade_id: 'redis-unknown',
          attempt_number: 1,
          execution_mode: String(patch.execution_mode || 'managed_order_execute'),
          slippage_bps: patch.slippage_bps ?? null,
          jupiter_request_id: patch.jupiter_request_id ?? null,
          jupiter_router: patch.jupiter_router ?? null,
          last_valid_block_height: patch.last_valid_block_height ?? null,
          quoted_input_amount: patch.quoted_input_amount ?? null,
          quoted_output_amount: patch.quoted_output_amount ?? null,
          quoted_input_amount_raw: patch.quoted_input_amount_raw ?? null,
          price_impact_pct: patch.price_impact_pct ?? null,
          prioritization_fee_lamports: patch.prioritization_fee_lamports ?? null,
          signed_transaction: patch.signed_transaction ?? null,
          execute_retry_count: patch.execute_retry_count ?? 0,
          execute_last_attempt_at: patch.execute_last_attempt_at ?? null,
          tx_signature: patch.tx_signature ?? null,
          tx_submitted_at: patch.tx_submitted_at ?? null,
          tx_confirmed_at: patch.tx_confirmed_at ?? null,
          confirmation_slot: patch.confirmation_slot ?? null,
          actual_input_amount: patch.actual_input_amount ?? null,
          actual_output_amount: patch.actual_output_amount ?? null,
          status: patch.status ?? 'building',
          error_code: patch.error_code ?? null,
          error_message: patch.error_message ?? null,
        },
      });
    }
  }

  const { data, error } = await supabase
    .from('pilot_trade_attempts')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', attemptId)
    .select('*')
    .single();

  if (error) {
    if (canUseRedisExecutionFallback()) {
      await mirrorRedisTradeEvent({
        source: 'redis_attempt_update_after_db_failure',
        attemptId,
        patch: JSON.stringify(patch),
        errorMessage: error.message,
      });
      return createRedisAttemptRow({
        id: attemptId,
        attempt: {
          pilot_trade_id: 'redis-unknown',
          attempt_number: 1,
          execution_mode: String(patch.execution_mode || 'managed_order_execute'),
          slippage_bps: patch.slippage_bps ?? null,
          jupiter_request_id: patch.jupiter_request_id ?? null,
          jupiter_router: patch.jupiter_router ?? null,
          last_valid_block_height: patch.last_valid_block_height ?? null,
          quoted_input_amount: patch.quoted_input_amount ?? null,
          quoted_output_amount: patch.quoted_output_amount ?? null,
          quoted_input_amount_raw: patch.quoted_input_amount_raw ?? null,
          price_impact_pct: patch.price_impact_pct ?? null,
          prioritization_fee_lamports: patch.prioritization_fee_lamports ?? null,
          signed_transaction: patch.signed_transaction ?? null,
          execute_retry_count: patch.execute_retry_count ?? 0,
          execute_last_attempt_at: patch.execute_last_attempt_at ?? null,
          tx_signature: patch.tx_signature ?? null,
          tx_submitted_at: patch.tx_submitted_at ?? null,
          tx_confirmed_at: patch.tx_confirmed_at ?? null,
          confirmation_slot: patch.confirmation_slot ?? null,
          actual_input_amount: patch.actual_input_amount ?? null,
          actual_output_amount: patch.actual_output_amount ?? null,
          status: patch.status ?? 'building',
          error_code: patch.error_code ?? null,
          error_message: patch.error_message ?? null,
        },
      });
    }
    throw new Error(`Failed to update live-pilot trade attempt ${attemptId}: ${error.message}`);
  }

  return data as PilotTradeAttemptRow;
}

export async function listRecentPilotTradeAttempts(limit: number = 25) {
  if (hasPostgresConnection()) {
    return pgQuery<PilotTradeAttemptRow>(
      `
        select *
        from public.pilot_trade_attempts
        order by created_at desc
        limit $1
      `,
      [limit],
    );
  }

  const { data, error } = await supabase
    .from('pilot_trade_attempts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list recent live-pilot trade attempts: ${error.message}`);
  }

  return (data || []) as PilotTradeAttemptRow[];
}

export async function listSubmittedPilotTradeAttempts(limit: number = 50) {
  if (hasPostgresConnection()) {
    return pgQuery<PilotTradeAttemptRow>(
      `
        select *
        from public.pilot_trade_attempts
        where status = 'submitted'
        order by updated_at asc
        limit $1
      `,
      [limit],
    );
  }

  const { data, error } = await supabase
    .from('pilot_trade_attempts')
    .select('*')
    .eq('status', 'submitted')
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list submitted live-pilot trade attempts: ${error.message}`);
  }

  return (data || []) as PilotTradeAttemptRow[];
}

export async function countRecentFailedPilotTradeAttempts(
  walletAlias: string,
  sinceIso: string,
  options?: {
    leaderType?: string;
  },
) {
  if (hasPostgresConnection()) {
    const rows = await pgQuery<{ count: number }>(
      `
        select count(*)::int as count
        from public.pilot_trade_attempts attempts
        join public.pilot_trades trades
          on trades.id = attempts.pilot_trade_id
        where trades.wallet_alias = $1
          and attempts.status = 'failed'
          and attempts.created_at >= $2::timestamptz
          and ($3::text is null or trades.leader_type = $3)
          and not (coalesce(attempts.error_code, '') = any($4::text[]))
      `,
      [walletAlias, sinceIso, options?.leaderType ?? null, Array.from(NON_BREAKER_ERROR_CODES)],
    );
    return rows[0]?.count || 0;
  }

  const { data: trades, error: tradesError } = await supabase
    .from('pilot_trades')
    .select('id, leader_type')
    .eq('wallet_alias', walletAlias);

  if (tradesError) {
    throw new Error(`Failed to fetch live-pilot trades for breaker check: ${tradesError.message}`);
  }

  const tradeIds = (trades || [])
    .filter((row: any) => !options?.leaderType || row.leader_type === options.leaderType)
    .map((row: any) => row.id);
  if (tradeIds.length === 0) {
    return 0;
  }

  const { data, error } = await supabase
    .from('pilot_trade_attempts')
    .select('error_code')
    .eq('status', 'failed')
    .gte('created_at', sinceIso)
    .in('pilot_trade_id', tradeIds);

  if (error) {
    throw new Error(`Failed to count recent live-pilot failed attempts: ${error.message}`);
  }

  return (data || []).filter((row) => !NON_BREAKER_ERROR_CODES.has(row.error_code || '')).length;
}
