import { supabase } from '@/lib/supabase';
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

export async function listQueuedPilotTrades(limit: number = 25) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('pilot_trades')
    .select('*')
    .eq('status', 'queued')
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list queued live-pilot trades: ${error.message}`);
  }

  return (data || []) as PilotTradeRow[];
}

export async function getPilotTradeById(tradeId: string) {
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
