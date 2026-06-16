import { hasPostgresConnection, pgMaybeOne } from '@/lib/db/postgres';
import { supabase } from '@/lib/supabase';

const TERMINAL_STATUSES = ['confirmed', 'failed', 'skipped'];
const DEFAULT_RETENTION_DAYS = 14;
const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 2_000;

export interface LivePilotRetentionOptions {
  retentionDays?: number;
  batchSize?: number;
  dryRun?: boolean;
}

export interface LivePilotRetentionResult {
  dryRun: boolean;
  retentionDays: number;
  cutoffIso: string;
  batchSize: number;
  candidateRows: number;
  deletedTrades: number;
  unlinkedWinningAttempts: number;
  unlinkedQuarantines: number;
  mode: 'postgres' | 'supabase';
}

function positiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOptions(options: LivePilotRetentionOptions = {}) {
  const retentionDays = positiveNumber(options.retentionDays, DEFAULT_RETENTION_DAYS);
  const batchSize = Math.min(
    Math.floor(positiveNumber(options.batchSize, DEFAULT_BATCH_SIZE)),
    MAX_BATCH_SIZE,
  );
  return {
    retentionDays,
    batchSize,
    dryRun: Boolean(options.dryRun),
    cutoffIso: new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString(),
  };
}

async function cleanupWithPostgres(
  options: ReturnType<typeof normalizeOptions>,
): Promise<LivePilotRetentionResult> {
  if (options.dryRun) {
    const row = await pgMaybeOne<{ candidate_rows: number }>(
      `
        select count(*)::int as candidate_rows
        from (
          select id
          from public.pilot_trades
          where status = any($1::text[])
            and updated_at < $2::timestamptz
          order by updated_at asc
          limit $3
        ) target
      `,
      [TERMINAL_STATUSES, options.cutoffIso, options.batchSize],
    );
    return {
      dryRun: true,
      retentionDays: options.retentionDays,
      cutoffIso: options.cutoffIso,
      batchSize: options.batchSize,
      candidateRows: Number(row?.candidate_rows || 0),
      deletedTrades: 0,
      unlinkedWinningAttempts: 0,
      unlinkedQuarantines: 0,
      mode: 'postgres',
    };
  }

  const row = await pgMaybeOne<{
    candidate_rows: number;
    deleted_trades: number;
    unlinked_winning_attempts: number;
    unlinked_quarantines: number;
  }>(
    `
      with target as (
        select id
        from public.pilot_trades
        where status = any($1::text[])
          and updated_at < $2::timestamptz
        order by updated_at asc
        limit $3
      ),
      unlinked_trades as (
        update public.pilot_trades trades
        set winning_attempt_id = null,
            updated_at = now()
        where trades.id in (select id from target)
          and trades.winning_attempt_id is not null
        returning trades.id
      ),
      unlinked_quarantines as (
        update public.pilot_mint_quarantines quarantines
        set first_pilot_trade_id = null,
            updated_at = now()
        where quarantines.first_pilot_trade_id in (select id from target)
        returning quarantines.mint
      ),
      deleted as (
        delete from public.pilot_trades trades
        where trades.id in (select id from target)
        returning trades.id
      )
      select
        (select count(*)::int from target) as candidate_rows,
        (select count(*)::int from deleted) as deleted_trades,
        (select count(*)::int from unlinked_trades) as unlinked_winning_attempts,
        (select count(*)::int from unlinked_quarantines) as unlinked_quarantines
    `,
    [TERMINAL_STATUSES, options.cutoffIso, options.batchSize],
  );

  return {
    dryRun: false,
    retentionDays: options.retentionDays,
    cutoffIso: options.cutoffIso,
    batchSize: options.batchSize,
    candidateRows: Number(row?.candidate_rows || 0),
    deletedTrades: Number(row?.deleted_trades || 0),
    unlinkedWinningAttempts: Number(row?.unlinked_winning_attempts || 0),
    unlinkedQuarantines: Number(row?.unlinked_quarantines || 0),
    mode: 'postgres',
  };
}

async function cleanupWithSupabase(
  options: ReturnType<typeof normalizeOptions>,
): Promise<LivePilotRetentionResult> {
  const { data: candidates, error } = await supabase
    .from('pilot_trades')
    .select('id')
    .in('status', TERMINAL_STATUSES)
    .lt('updated_at', options.cutoffIso)
    .order('updated_at', { ascending: true })
    .limit(options.batchSize);

  if (error) {
    throw new Error(`Failed to select live-pilot retention candidates: ${error.message}`);
  }

  const ids = (candidates || []).map((row) => row.id).filter(Boolean);
  if (options.dryRun || ids.length === 0) {
    return {
      dryRun: options.dryRun,
      retentionDays: options.retentionDays,
      cutoffIso: options.cutoffIso,
      batchSize: options.batchSize,
      candidateRows: ids.length,
      deletedTrades: 0,
      unlinkedWinningAttempts: 0,
      unlinkedQuarantines: 0,
      mode: 'supabase',
    };
  }

  const { count: unlinkedWinningAttempts, error: unlinkTradesError } = await supabase
    .from('pilot_trades')
    .update({ winning_attempt_id: null, updated_at: new Date().toISOString() }, { count: 'exact' })
    .in('id', ids)
    .not('winning_attempt_id', 'is', null);
  if (unlinkTradesError) {
    throw new Error(`Failed to unlink winning live-pilot attempts: ${unlinkTradesError.message}`);
  }

  const { count: unlinkedQuarantines, error: unlinkQuarantinesError } = await supabase
    .from('pilot_mint_quarantines')
    .update({ first_pilot_trade_id: null, updated_at: new Date().toISOString() }, { count: 'exact' })
    .in('first_pilot_trade_id', ids);
  if (unlinkQuarantinesError) {
    throw new Error(`Failed to unlink live-pilot quarantine references: ${unlinkQuarantinesError.message}`);
  }

  const { count: deletedTrades, error: deleteError } = await supabase
    .from('pilot_trades')
    .delete({ count: 'exact' })
    .in('id', ids);
  if (deleteError) {
    throw new Error(`Failed to delete old terminal live-pilot rows: ${deleteError.message}`);
  }

  return {
    dryRun: false,
    retentionDays: options.retentionDays,
    cutoffIso: options.cutoffIso,
    batchSize: options.batchSize,
    candidateRows: ids.length,
    deletedTrades: deletedTrades || 0,
    unlinkedWinningAttempts: unlinkedWinningAttempts || 0,
    unlinkedQuarantines: unlinkedQuarantines || 0,
    mode: 'supabase',
  };
}

export async function cleanupLivePilotHistoryBatch(options?: LivePilotRetentionOptions) {
  const normalized = normalizeOptions(options);
  return hasPostgresConnection()
    ? cleanupWithPostgres(normalized)
    : cleanupWithSupabase(normalized);
}
