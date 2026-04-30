import { supabase } from '@/lib/supabase';
import { hasPostgresConnection, pgMaybeOne, pgOne, pgQuery } from '@/lib/db/postgres';
import {
  applyObservedLeaderBuy,
  applyObservedLeaderSell,
  applySuccessfulCopiedBuy,
  applySuccessfulCopiedSell,
  createEmptyCopyPositionLifecycle,
  type CopyPositionLifecycleSnapshot,
} from '@/lib/copy-position-lifecycle';
import { isLivePilotRedisAvailable, livePilotRedisConfig } from '@/lib/live-pilot/redis/config';
import {
  getRedisCopyState,
  recordRedisObservedLeaderBuy,
  recordRedisObservedLeaderSell,
  recordRedisSuccessfulCopiedBuy,
  recordRedisSuccessfulCopiedSell,
} from '@/lib/live-pilot/redis/state';

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
  const now = new Date().toISOString();
  const payload: Record<string, string | number | null> = {
    scope_type: metadata.scopeType,
    scope_key: metadata.scopeKey,
    star_trader: metadata.starTrader,
    mint: metadata.mint,
    token_symbol: metadata.tokenSymbol,
    leader_open_amount: snapshot.leaderOpenAmount,
    copied_open_amount: snapshot.copiedOpenAmount,
    copied_cost_usd: snapshot.copiedCostUsd,
    avg_cost_usd: snapshot.avgCostUsd,
    updated_at: now,
  };

  if (metadata.tradeSignature) {
    payload.last_leader_trade_signature = metadata.tradeSignature;
  }

  if (metadata.tradeTimestampIso) {
    payload.last_leader_trade_at = metadata.tradeTimestampIso;
  }

  if (hasPostgresConnection()) {
    return pgOne<CopyPositionStateRow>(
      `
        insert into public.copy_position_states (
          scope_type,
          scope_key,
          star_trader,
          mint,
          token_symbol,
          leader_open_amount,
          copied_open_amount,
          copied_cost_usd,
          avg_cost_usd,
          last_leader_trade_signature,
          last_leader_trade_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $12::timestamptz)
        on conflict (scope_type, scope_key, star_trader, mint) do update
        set token_symbol = coalesce(excluded.token_symbol, public.copy_position_states.token_symbol),
            leader_open_amount = excluded.leader_open_amount,
            copied_open_amount = excluded.copied_open_amount,
            copied_cost_usd = excluded.copied_cost_usd,
            avg_cost_usd = excluded.avg_cost_usd,
            last_leader_trade_signature = coalesce(excluded.last_leader_trade_signature, public.copy_position_states.last_leader_trade_signature),
            last_leader_trade_at = coalesce(excluded.last_leader_trade_at, public.copy_position_states.last_leader_trade_at),
            updated_at = excluded.updated_at
        returning *
      `,
      [
        metadata.scopeType,
        metadata.scopeKey,
        metadata.starTrader,
        metadata.mint,
        metadata.tokenSymbol,
        snapshot.leaderOpenAmount,
        snapshot.copiedOpenAmount,
        snapshot.copiedCostUsd,
        snapshot.avgCostUsd,
        metadata.tradeSignature,
        metadata.tradeTimestampIso,
        now,
      ],
    );
  }

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

function canUseRedisPilotFallback(key?: Partial<CopyPositionStateKey>) {
  return (
    isLivePilotRedisAvailable()
    && livePilotRedisConfig.executionEnabled
    && (!key || key.scopeType === 'pilot')
  );
}

function redisStateToRow(
  key: CopyPositionStateKey,
  state: Awaited<ReturnType<typeof getRedisCopyState>>,
): CopyPositionStateRow | null {
  if (!state) return null;
  const now = state.updatedAt || new Date().toISOString();
  return {
    scope_type: key.scopeType,
    scope_key: key.scopeKey,
    star_trader: key.starTrader,
    mint: key.mint,
    token_symbol: state.tokenSymbol,
    leader_open_amount: state.leaderOpenAmount,
    copied_open_amount: state.copiedOpenAmount,
    copied_cost_usd: state.copiedCostUsd,
    avg_cost_usd: state.avgCostUsd,
    last_leader_trade_signature: state.lastLeaderTradeSignature,
    last_leader_trade_at: state.lastLeaderTradeAt,
    created_at: now,
    updated_at: now,
  };
}

export async function getCopyPositionState(key: CopyPositionStateKey) {
  if (canUseRedisPilotFallback(key)) {
    const redisState = await getRedisCopyState({
      walletAlias: key.scopeKey,
      starTrader: key.starTrader,
      mint: key.mint,
    }).catch(() => null);
    if (redisState) {
      return redisStateToRow(key, redisState);
    }
  }

  if (hasPostgresConnection()) {
    try {
      return await pgMaybeOne<CopyPositionStateRow>(
      `
        select *
        from public.copy_position_states
        where scope_type = $1
          and scope_key = $2
          and star_trader = $3
          and mint = $4
        limit 1
      `,
      [key.scopeType, key.scopeKey, key.starTrader, key.mint],
      );
    } catch (error) {
      if (canUseRedisPilotFallback(key)) return null;
      throw error;
    }
  }

  const { data, error } = await supabase
    .from('copy_position_states')
    .select('*')
    .eq('scope_type', key.scopeType)
    .eq('scope_key', key.scopeKey)
    .eq('star_trader', key.starTrader)
    .eq('mint', key.mint)
    .maybeSingle();

  if (error) {
    if (canUseRedisPilotFallback(key)) return null;
    throw new Error(`Failed to fetch copy position state for ${key.scopeKey}/${key.mint}: ${error.message}`);
  }

  return (data || null) as CopyPositionStateRow | null;
}

export async function listLeaderClosedCopiedOpenPilotStates(args: {
  scopeKey: string;
  starTrader: string;
}) {
  if (hasPostgresConnection()) {
    return pgQuery<CopyPositionStateRow>(
      `
        select *
        from public.copy_position_states
        where scope_type = 'pilot'
          and scope_key = $1
          and star_trader = $2
          and leader_open_amount <= 0.000000001
          and copied_open_amount > 0.000000001
        order by updated_at desc
      `,
      [args.scopeKey, args.starTrader],
    );
  }

  const { data, error } = await supabase
    .from('copy_position_states')
    .select('*')
    .eq('scope_type', 'pilot')
    .eq('scope_key', args.scopeKey)
    .eq('star_trader', args.starTrader)
    .lte('leader_open_amount', 0.000000001)
    .gt('copied_open_amount', 0.000000001)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list residual copy positions for ${args.scopeKey}: ${error.message}`);
  }

  return (data || []) as CopyPositionStateRow[];
}

export async function recordObservedLeaderBuy(args: TransitionMetadata & { leaderBuyAmount: number }) {
  try {
    const current = await getCopyPositionState(args);
    const transition = applyObservedLeaderBuy(toRowSnapshot(current), args.leaderBuyAmount);
    const row = await upsertCopyPositionState(args, transition.next);
    if (args.scopeType === 'pilot') {
      await recordRedisObservedLeaderBuy({
        walletAlias: args.scopeKey,
        starTrader: args.starTrader,
        mint: args.mint,
        tokenSymbol: args.tokenSymbol,
        tradeSignature: args.tradeSignature,
        tradeTimestampIso: args.tradeTimestampIso,
        leaderBuyAmount: args.leaderBuyAmount,
      }).catch(() => undefined);
    }
    return { row, ...transition };
  } catch (error) {
    if (!canUseRedisPilotFallback(args)) throw error;
    const redisResult = await recordRedisObservedLeaderBuy({
      walletAlias: args.scopeKey,
      starTrader: args.starTrader,
      mint: args.mint,
      tokenSymbol: args.tokenSymbol,
      tradeSignature: args.tradeSignature,
      tradeTimestampIso: args.tradeTimestampIso,
      leaderBuyAmount: args.leaderBuyAmount,
    });
    const { row: _redisRow, ...transition } = redisResult!;
    return { ...transition, row: redisStateToRow(args, redisResult?.row || null) };
  }
}

export async function recordObservedLeaderSell(args: TransitionMetadata & { leaderSellAmount: number }) {
  try {
    const current = await getCopyPositionState(args);
    const transition = applyObservedLeaderSell(toRowSnapshot(current), args.leaderSellAmount);

    if (transition.leaderPositionBefore > 0) {
      await upsertCopyPositionState(args, transition.next);
    }

    if (args.scopeType === 'pilot') {
      await recordRedisObservedLeaderSell({
        walletAlias: args.scopeKey,
        starTrader: args.starTrader,
        mint: args.mint,
        tokenSymbol: args.tokenSymbol,
        tradeSignature: args.tradeSignature,
        tradeTimestampIso: args.tradeTimestampIso,
        leaderSellAmount: args.leaderSellAmount,
      }).catch(() => undefined);
    }

    return {
      row: current,
      ...transition,
    };
  } catch (error) {
    if (!canUseRedisPilotFallback(args)) throw error;
    const redisResult = await recordRedisObservedLeaderSell({
      walletAlias: args.scopeKey,
      starTrader: args.starTrader,
      mint: args.mint,
      tokenSymbol: args.tokenSymbol,
      tradeSignature: args.tradeSignature,
      tradeTimestampIso: args.tradeTimestampIso,
      leaderSellAmount: args.leaderSellAmount,
    });
    const { row: _redisRow, ...transition } = redisResult!;
    return { ...transition, row: redisStateToRow(args, redisResult?.row || null) };
  }
}

export async function recordSuccessfulCopiedBuy(args: TransitionMetadata & { copiedBuyAmount: number; copiedCostUsd: number }) {
  try {
    const current = await getCopyPositionState(args);
    const transition = applySuccessfulCopiedBuy(
      toRowSnapshot(current),
      args.copiedBuyAmount,
      args.copiedCostUsd,
    );
    const row = await upsertCopyPositionState(args, transition.next);
    if (args.scopeType === 'pilot') {
      await recordRedisSuccessfulCopiedBuy({
        walletAlias: args.scopeKey,
        starTrader: args.starTrader,
        mint: args.mint,
        tokenSymbol: args.tokenSymbol,
        tradeSignature: args.tradeSignature,
        tradeTimestampIso: args.tradeTimestampIso,
        copiedBuyAmount: args.copiedBuyAmount,
        copiedCostUsd: args.copiedCostUsd,
      }).catch(() => undefined);
    }
    return { row, ...transition };
  } catch (error) {
    if (!canUseRedisPilotFallback(args)) throw error;
    const redisResult = await recordRedisSuccessfulCopiedBuy({
      walletAlias: args.scopeKey,
      starTrader: args.starTrader,
      mint: args.mint,
      tokenSymbol: args.tokenSymbol,
      tradeSignature: args.tradeSignature,
      tradeTimestampIso: args.tradeTimestampIso,
      copiedBuyAmount: args.copiedBuyAmount,
      copiedCostUsd: args.copiedCostUsd,
    });
    const { row: _redisRow, ...transition } = redisResult!;
    return { ...transition, row: redisStateToRow(args, redisResult?.row || null) };
  }
}

export async function recordSuccessfulCopiedSell(args: TransitionMetadata & { copiedSellAmount: number }) {
  try {
    const current = await getCopyPositionState(args);
    const transition = applySuccessfulCopiedSell(
      toRowSnapshot(current),
      args.copiedSellAmount,
    );
    const row = await upsertCopyPositionState(args, transition.next);
    if (args.scopeType === 'pilot') {
      await recordRedisSuccessfulCopiedSell({
        walletAlias: args.scopeKey,
        starTrader: args.starTrader,
        mint: args.mint,
        tokenSymbol: args.tokenSymbol,
        tradeSignature: args.tradeSignature,
        tradeTimestampIso: args.tradeTimestampIso,
        copiedSellAmount: args.copiedSellAmount,
      }).catch(() => undefined);
    }
    return { row, ...transition };
  } catch (error) {
    if (!canUseRedisPilotFallback(args)) throw error;
    const redisResult = await recordRedisSuccessfulCopiedSell({
      walletAlias: args.scopeKey,
      starTrader: args.starTrader,
      mint: args.mint,
      tokenSymbol: args.tokenSymbol,
      tradeSignature: args.tradeSignature,
      tradeTimestampIso: args.tradeTimestampIso,
      copiedSellAmount: args.copiedSellAmount,
    });
    const { row: _redisRow, ...transition } = redisResult!;
    return { ...transition, row: redisStateToRow(args, redisResult?.row || null) };
  }
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
