import { mirrorRedisTradeEvent } from '@/lib/live-pilot/redis/state';
import type { PilotTradeRow } from '@/lib/live-pilot/types';

type TraceValue = string | number | boolean | null | undefined;

export type LivePilotTraceStage =
  | 'redis_consume'
  | 'wallet_lock_acquired'
  | 'plan_built'
  | 'attempt_created'
  | 'direct_start'
  | 'direct_submitted'
  | 'jupiter_order_start'
  | 'jupiter_order_done'
  | 'jupiter_execute_start'
  | 'jupiter_execute_done'
  | 'submitted'
  | 'requeued'
  | 'confirmed'
  | 'failed'
  | 'skipped';

export function getLivePilotTraceId(
  trade: Pick<PilotTradeRow, 'wallet_alias' | 'id' | 'star_trade_signature' | 'leader_type'>,
) {
  return [
    trade.wallet_alias || 'wallet',
    trade.star_trade_signature || trade.id,
    trade.leader_type || 'unknown',
  ].join(':');
}

function getLeaderAgeMs(trade: Pick<PilotTradeRow, 'leader_block_timestamp'>) {
  if (!trade.leader_block_timestamp) return null;
  const timestamp = new Date(trade.leader_block_timestamp).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Date.now() - timestamp;
}

export function logLivePilotTrace(
  stage: LivePilotTraceStage,
  trade: Pick<PilotTradeRow,
    | 'id'
    | 'wallet_alias'
    | 'leader_type'
    | 'star_trade_signature'
    | 'leader_block_timestamp'
    | 'received_at'
    | 'intent_created_at'
  >,
  fields: Record<string, TraceValue> = {},
) {
  const payload = {
    traceId: getLivePilotTraceId(trade),
    stage,
    at: new Date().toISOString(),
    tradeId: trade.id,
    walletAlias: trade.wallet_alias,
    leaderType: trade.leader_type,
    leaderSignature: trade.star_trade_signature,
    leaderAgeMs: getLeaderAgeMs(trade),
    receivedAt: trade.received_at,
    intentCreatedAt: trade.intent_created_at,
    ...fields,
  };

  console.log('[LIVE_PILOT_TRACE]', JSON.stringify(payload));

  if (trade.id.startsWith('redis:')) {
    void mirrorRedisTradeEvent({
      source: 'live_pilot_trace',
      ...payload,
    });
  }
}
