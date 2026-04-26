import { supabase } from '@/lib/supabase';
import {
  applyObservedLeaderBuy,
  applyObservedLeaderSell,
  applySuccessfulCopiedBuy,
  applySuccessfulCopiedSell,
  createEmptyCopyPositionLifecycle,
  type CopyPositionLifecycleSnapshot,
} from '@/lib/copy-position-lifecycle';

export type CopyPositionScopeType = 'demo' | 'pilot';

export interface CopyPositionStateRow {
  scope_type: CopyPositionScopeType;
  scope_key: string;
  star_trader: string;
  mint: string;
  token_symbol: string | null;
  leader_open_amount: number;
  copied_open_amount: number;
  copied_cost_usd: number;
  avg_cost_usd: number;
  last_leader_trade_signature: string | null;
  last_leader_trade_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CopyPositionStateKey {
  scopeType: CopyPositionScopeType;
  scopeKey: string;
  starTrader: string;
  mint: string;
}

interface TransitionMetadata extends CopyPositionStateKey {
  tokenSymbol: string | null;
  tradeSignature: string | null;
  tradeTimestampIso: string | null;
}

function toRowSnapshot(row?: CopyPositionStateRow | null): CopyPositionLifecycleSnapshot {
  return row
    ? {
        leaderOpenAmount: Number(row.leader_open_amount || 0),
        copiedOpenAmount: Number(row.copied_open_amount || 0),
        copiedCostUsd: Number(row.copied_cost_usd || 0),
        avgCostUsd: Number(row.avg_cost_usd || 0),
      }
    : createEmptyCopyPositionLifecycle();
}

async function upsertCopyPositionState(
  metadata: TransitionMetadata,
  snapshot: CopyPositionLifecycleSnapshot,
) {
  const payload = {
    scope_type: metadata.scopeType,
    scope_key: metadata.scopeKey,
    star_trader: metadata.starTrader,
    mint: metadata.mint,
    token_symbol: metadata.tokenSymbol,
    leader_open_amount: snapshot.leaderOpenAmount,
    copied_open_amount: snapshot.copiedOpenAmount,
    copied_cost_usd: snapshot.copiedCostUsd,
    avg_cost_usd: snapshot.avgCostUsd,
    last_leader_trade_signature: metadata.tradeSignature,
    last_leader_trade_at: metadata.tradeTimestampIso,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('copy_position_states')
    .upsert(payload, {
      onConflict: 'scope_type,scope_key,star_trader,mint',
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to upsert copy position state for ${metadata.scopeKey}/${metadata.mint}: ${error.message}`);
  }

  return data as CopyPositionStateRow;
}

export async function getCopyPositionState(key: CopyPositionStateKey) {
  const { data, error } = await supabase
    .from('copy_position_states')
    .select('*')
    .eq('scope_type', key.scopeType)
    .eq('scope_key', key.scopeKey)
    .eq('star_trader', key.starTrader)
    .eq('mint', key.mint)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch copy position state for ${key.scopeKey}/${key.mint}: ${error.message}`);
  }

  return (data || null) as CopyPositionStateRow | null;
}

export async function recordObservedLeaderBuy(args: TransitionMetadata & { leaderBuyAmount: number }) {
  const current = await getCopyPositionState(args);
  const transition = applyObservedLeaderBuy(toRowSnapshot(current), args.leaderBuyAmount);
  const row = await upsertCopyPositionState(args, transition.next);
  return { row, ...transition };
}

export async function recordObservedLeaderSell(args: TransitionMetadata & { leaderSellAmount: number }) {
  const current = await getCopyPositionState(args);
  const transition = applyObservedLeaderSell(toRowSnapshot(current), args.leaderSellAmount);

  if (transition.leaderPositionBefore > 0) {
    await upsertCopyPositionState(args, transition.next);
  }

  return {
    row: current,
    ...transition,
  };
}

export async function recordSuccessfulCopiedBuy(args: TransitionMetadata & { copiedBuyAmount: number; copiedCostUsd: number }) {
  const current = await getCopyPositionState(args);
  const transition = applySuccessfulCopiedBuy(
    toRowSnapshot(current),
    args.copiedBuyAmount,
    args.copiedCostUsd,
  );
  const row = await upsertCopyPositionState(args, transition.next);
  return { row, ...transition };
}

export async function recordSuccessfulCopiedSell(args: TransitionMetadata & { copiedSellAmount: number }) {
  const current = await getCopyPositionState(args);
  const transition = applySuccessfulCopiedSell(
    toRowSnapshot(current),
    args.copiedSellAmount,
  );
  const row = await upsertCopyPositionState(args, transition.next);
  return { row, ...transition };
}

export async function reconcileCopiedPositionAmount(args: TransitionMetadata & { copiedOpenAmount: number }) {
  const current = toRowSnapshot(await getCopyPositionState(args));
  const copiedOpenAmount = Math.max(Number(args.copiedOpenAmount || 0), 0);
  const avgCostUsd = copiedOpenAmount > 0 ? current.avgCostUsd : 0;
  const copiedCostUsd = copiedOpenAmount > 0 ? copiedOpenAmount * current.avgCostUsd : 0;
  const row = await upsertCopyPositionState(args, {
    ...current,
    copiedOpenAmount,
    copiedCostUsd,
    avgCostUsd,
  });

  return row;
}
