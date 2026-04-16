import { supabase } from '@/lib/supabase';
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

export async function createPilotTradeAttempt(attempt: CreatePilotTradeAttemptInput) {
  const { data, error } = await supabase
    .from('pilot_trade_attempts')
    .insert(attempt)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create live-pilot trade attempt: ${error.message}`);
  }

  return data as PilotTradeAttemptRow;
}

export async function updatePilotTradeAttempt(attemptId: string, patch: PilotTradeAttemptPatch) {
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
    throw new Error(`Failed to update live-pilot trade attempt ${attemptId}: ${error.message}`);
  }

  return data as PilotTradeAttemptRow;
}

export async function listRecentPilotTradeAttempts(limit: number = 25) {
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
