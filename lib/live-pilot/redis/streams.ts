import { randomUUID } from 'node:crypto';
import { getLivePilotRedisClient } from './client';
import { isLivePilotRedisAvailable, livePilotRedisConfig } from './config';
import {
  LIVE_PILOT_AUDIT_STREAM,
  LIVE_PILOT_DEADLETTER_STREAM,
  LIVE_PILOT_INTENTS_STREAM,
  LIVE_PILOT_RESULTS_STREAM,
  livePilotDedupeKey,
} from './keys';
import type { PilotTradeRow } from '@/lib/live-pilot/types';

export type LivePilotRedisIntentPayload = {
  schemaVersion: '1';
  intentId: string;
  dbTradeId: string | null;
  walletAlias: string;
  walletPublicKey: string;
  triggerKind: string;
  triggerReason: string | null;
  starTrader: string | null;
  starTradeSignature: string | null;
  leaderType: string | null;
  tokenInMint: string | null;
  tokenOutMint: string | null;
  copyRatio: string | null;
  sellFraction: string | null;
  leaderBlockTimestamp: string | null;
  receivedAt: string | null;
  intentCreatedAt: string | null;
  leaderPositionBefore: string | null;
  leaderPositionAfter: string | null;
  copiedPositionBefore: string | null;
  copiedPositionAfter: string | null;
  source: 'db_mirror' | 'redis_primary' | 'recovery' | 'liquidation' | 'residual';
  createdAt: string;
};

export type LivePilotRedisStreamMessage = {
  streamId: string;
  payload: LivePilotRedisIntentPayload;
};

function stringifyNullable(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function parseNullable(value: unknown) {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text === '' ? null : text;
}

export function buildLivePilotIntentId(trade: Pick<PilotTradeRow, 'wallet_alias' | 'star_trade_signature' | 'leader_type' | 'id'>) {
  if (trade.star_trade_signature && trade.leader_type) {
    return `${trade.wallet_alias}:${trade.star_trade_signature}:${trade.leader_type}`;
  }
  return `${trade.wallet_alias}:${trade.id}`;
}

export function pilotTradeToRedisIntent(
  trade: PilotTradeRow,
  source: LivePilotRedisIntentPayload['source'] = 'db_mirror',
): LivePilotRedisIntentPayload {
  return {
    schemaVersion: '1',
    intentId: buildLivePilotIntentId(trade),
    dbTradeId: trade.id,
    walletAlias: trade.wallet_alias,
    walletPublicKey: trade.wallet_public_key,
    triggerKind: trade.trigger_kind,
    triggerReason: trade.trigger_reason,
    starTrader: trade.star_trader,
    starTradeSignature: trade.star_trade_signature,
    leaderType: trade.leader_type,
    tokenInMint: trade.token_in_mint,
    tokenOutMint: trade.token_out_mint,
    copyRatio: stringifyNullable(trade.copy_ratio) || null,
    sellFraction: stringifyNullable(trade.sell_fraction) || null,
    leaderBlockTimestamp: trade.leader_block_timestamp,
    receivedAt: trade.received_at,
    intentCreatedAt: trade.intent_created_at,
    leaderPositionBefore: stringifyNullable(trade.leader_position_before) || null,
    leaderPositionAfter: stringifyNullable(trade.leader_position_after) || null,
    copiedPositionBefore: stringifyNullable(trade.copied_position_before) || null,
    copiedPositionAfter: stringifyNullable(trade.copied_position_after) || null,
    source,
    createdAt: new Date().toISOString(),
  };
}

export function redisIntentToPilotTrade(payload: LivePilotRedisIntentPayload): PilotTradeRow {
  const now = new Date().toISOString();
  return {
    id: payload.dbTradeId || payload.intentId,
    wallet_alias: payload.walletAlias,
    wallet_public_key: payload.walletPublicKey,
    trigger_kind: payload.triggerKind === 'liquidation' ? 'liquidation' : 'copy',
    trigger_reason: payload.triggerReason,
    star_trader: payload.starTrader,
    star_trade_signature: payload.starTradeSignature,
    leader_type: payload.leaderType,
    token_in_mint: payload.tokenInMint,
    token_out_mint: payload.tokenOutMint,
    copy_ratio: payload.copyRatio === null ? null : Number(payload.copyRatio),
    leader_position_before: payload.leaderPositionBefore === null ? null : Number(payload.leaderPositionBefore),
    leader_position_after: payload.leaderPositionAfter === null ? null : Number(payload.leaderPositionAfter),
    copied_position_before: payload.copiedPositionBefore === null ? null : Number(payload.copiedPositionBefore),
    copied_position_after: payload.copiedPositionAfter === null ? null : Number(payload.copiedPositionAfter),
    sell_fraction: payload.sellFraction === null ? null : Number(payload.sellFraction),
    leader_block_timestamp: payload.leaderBlockTimestamp,
    received_at: payload.receivedAt,
    intent_created_at: payload.intentCreatedAt,
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
    deployable_sol_at_intent: null,
    sol_price_at_intent: null,
    next_retry_at: null,
    attempt_count: 1,
    winning_attempt_id: null,
    status: 'queued',
    skip_reason: null,
    error_message: null,
    created_at: payload.createdAt || now,
    updated_at: now,
  };
}

function encodePayload(payload: Record<string, unknown>) {
  const encoded: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    encoded[key] = stringifyNullable(value);
  }
  return encoded;
}

function decodeIntent(streamId: string, message: Record<string, unknown>): LivePilotRedisStreamMessage {
  return {
    streamId,
    payload: {
      schemaVersion: '1',
      intentId: String(message.intentId || ''),
      dbTradeId: parseNullable(message.dbTradeId),
      walletAlias: String(message.walletAlias || ''),
      walletPublicKey: String(message.walletPublicKey || ''),
      triggerKind: String(message.triggerKind || ''),
      triggerReason: parseNullable(message.triggerReason),
      starTrader: parseNullable(message.starTrader),
      starTradeSignature: parseNullable(message.starTradeSignature),
      leaderType: parseNullable(message.leaderType),
      tokenInMint: parseNullable(message.tokenInMint),
      tokenOutMint: parseNullable(message.tokenOutMint),
      copyRatio: parseNullable(message.copyRatio),
      sellFraction: parseNullable(message.sellFraction),
      leaderBlockTimestamp: parseNullable(message.leaderBlockTimestamp),
      receivedAt: parseNullable(message.receivedAt),
      intentCreatedAt: parseNullable(message.intentCreatedAt),
      leaderPositionBefore: parseNullable(message.leaderPositionBefore),
      leaderPositionAfter: parseNullable(message.leaderPositionAfter),
      copiedPositionBefore: parseNullable(message.copiedPositionBefore),
      copiedPositionAfter: parseNullable(message.copiedPositionAfter),
      source: (message.source || 'db_mirror') as LivePilotRedisIntentPayload['source'],
      createdAt: String(message.createdAt || new Date().toISOString()),
    },
  };
}

export async function ensureLivePilotRedisStreams() {
  if (!isLivePilotRedisAvailable()) return false;
  const client = await getLivePilotRedisClient();

  for (const stream of [LIVE_PILOT_INTENTS_STREAM, LIVE_PILOT_RESULTS_STREAM, LIVE_PILOT_AUDIT_STREAM]) {
    try {
      await client.xGroupCreate(stream, livePilotRedisConfig.consumerGroup, '0', { MKSTREAM: true });
    } catch (error: any) {
      if (!String(error?.message || error).includes('BUSYGROUP')) {
        throw error;
      }
    }
  }

  return true;
}

export async function publishLivePilotRedisIntent(payload: LivePilotRedisIntentPayload) {
  if (!isLivePilotRedisAvailable()) {
    return { published: false as const, reason: 'redis_disabled' };
  }

  const client = await getLivePilotRedisClient();

  if (payload.starTradeSignature && payload.leaderType) {
    const dedupe = await client.set(
      livePilotDedupeKey({
        walletAlias: payload.walletAlias,
        starTradeSignature: payload.starTradeSignature,
        leaderType: payload.leaderType,
      }),
      payload.intentId,
      { NX: true, EX: livePilotRedisConfig.dedupeTtlSeconds },
    );

    if (dedupe !== 'OK') {
      return { published: false as const, reason: 'duplicate' };
    }
  }

  const streamId = await client.xAdd(
    LIVE_PILOT_INTENTS_STREAM,
    '*',
    encodePayload(payload),
    {
      TRIM: {
        strategy: 'MAXLEN',
        strategyModifier: '~',
        threshold: livePilotRedisConfig.streamMaxLen,
      },
    },
  );

  return { published: true as const, streamId };
}

export async function readLivePilotRedisIntents(consumerName: string) {
  if (!isLivePilotRedisAvailable()) return [] as LivePilotRedisStreamMessage[];
  const client = await getLivePilotRedisClient();
  const response = await client.xReadGroup(
    livePilotRedisConfig.consumerGroup,
    consumerName,
    [{ key: LIVE_PILOT_INTENTS_STREAM, id: '>' }],
    {
      COUNT: livePilotRedisConfig.readCount,
      BLOCK: livePilotRedisConfig.readBlockMs,
    },
  );

  const messages = response?.[0]?.messages || [];
  return messages.map((message) => decodeIntent(message.id, message.message));
}

export async function claimStaleLivePilotRedisIntents(consumerName: string) {
  if (!isLivePilotRedisAvailable()) return [] as LivePilotRedisStreamMessage[];
  const client = await getLivePilotRedisClient();
  const response = await client.xAutoClaim(
    LIVE_PILOT_INTENTS_STREAM,
    livePilotRedisConfig.consumerGroup,
    consumerName,
    livePilotRedisConfig.pendingIdleMs,
    '0-0',
    {
      COUNT: livePilotRedisConfig.readCount,
    },
  );

  const messages = response?.messages || [];
  return messages
    .filter((message): message is NonNullable<typeof message> => Boolean(message))
    .map((message) => decodeIntent(message.id, message.message));
}

export async function ackLivePilotRedisIntent(streamId: string) {
  if (!isLivePilotRedisAvailable()) return;
  const client = await getLivePilotRedisClient();
  await client.xAck(LIVE_PILOT_INTENTS_STREAM, livePilotRedisConfig.consumerGroup, streamId);
}

export async function publishLivePilotRedisResult(payload: Record<string, unknown>) {
  if (!isLivePilotRedisAvailable()) return;
  const client = await getLivePilotRedisClient();
  await client.xAdd(LIVE_PILOT_RESULTS_STREAM, '*', encodePayload({
    eventId: randomUUID(),
    createdAt: new Date().toISOString(),
    ...payload,
  }), {
    TRIM: {
      strategy: 'MAXLEN',
      strategyModifier: '~',
      threshold: livePilotRedisConfig.streamMaxLen,
    },
  });
}

export async function publishLivePilotRedisAudit(payload: Record<string, unknown>) {
  if (!isLivePilotRedisAvailable()) return;
  const client = await getLivePilotRedisClient();
  await client.xAdd(LIVE_PILOT_AUDIT_STREAM, '*', encodePayload({
    eventId: randomUUID(),
    createdAt: new Date().toISOString(),
    ...payload,
  }), {
    TRIM: {
      strategy: 'MAXLEN',
      strategyModifier: '~',
      threshold: livePilotRedisConfig.streamMaxLen,
    },
  });
}

export async function deadletterLivePilotRedisIntent(
  message: LivePilotRedisStreamMessage,
  reason: string,
  error?: unknown,
) {
  if (!isLivePilotRedisAvailable()) return;
  const client = await getLivePilotRedisClient();
  await client.xAdd(LIVE_PILOT_DEADLETTER_STREAM, '*', encodePayload({
    ...message.payload,
    originalStreamId: message.streamId,
    deadletterReason: reason,
    errorMessage: error instanceof Error ? error.message : error ? String(error) : '',
    deadletteredAt: new Date().toISOString(),
  }));
  await ackLivePilotRedisIntent(message.streamId);
}
