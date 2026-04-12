import { supabase } from '@/lib/supabase';
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
  leader_block_timestamp?: string | null;
  received_at?: string | null;
  intent_created_at?: string | null;
  deployable_sol_at_intent?: number | null;
  sol_price_at_intent?: number | null;
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
