import { supabase } from '@/lib/supabase';

export const PARSED_TX_BATCH_SIZE = 100;
export const PARSED_TX_REQUEST_INTERVAL_MS = 1250;
export const PARSED_TX_VISIBILITY_TIMEOUT_SECONDS = 60;
export const PARSED_TX_HISTORICAL_CUTOFF_MS = 72 * 60 * 60 * 1000;
export const PARSED_TX_NON_TRADE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type ParsedTxSource = 'websocket' | 'startup_reconcile' | 'cron_reconcile';

export interface ParsedTxQueueMessage {
  signature: string;
  wallet: string;
  source: ParsedTxSource;
  discoveredAt: string;
  notBefore?: string | null;
  blockTime?: number | null;
}

export interface ParsedTxQueueRecord {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: ParsedTxQueueMessage;
  headers: Record<string, unknown> | null;
}

function ensureMessageShape(message: ParsedTxQueueMessage) {
  return {
    signature: message.signature,
    wallet: message.wallet,
    source: message.source,
    discoveredAt: message.discoveredAt,
    notBefore: message.notBefore ?? null,
    blockTime: message.blockTime ?? null,
  };
}

export async function enqueueParsedTxMessages(messages: ParsedTxQueueMessage[]) {
  if (messages.length === 0) {
    return [];
  }

  const { data, error } = await supabase.rpc('parsed_tx_queue_send_batch', {
    p_messages: messages.map(ensureMessageShape),
  });

  if (error) {
    throw new Error(`Failed to enqueue parsed tx messages: ${error.message}`);
  }

  return Array.isArray(data)
    ? data.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];
}

export async function readParsedTxMessages(
  quantity: number = PARSED_TX_BATCH_SIZE,
  visibilityTimeoutSeconds: number = PARSED_TX_VISIBILITY_TIMEOUT_SECONDS
) {
  const { data, error } = await supabase.rpc('parsed_tx_queue_read', {
    p_qty: quantity,
    p_vt: visibilityTimeoutSeconds,
  });

  if (error) {
    throw new Error(`Failed to read parsed tx queue: ${error.message}`);
  }

  return (Array.isArray(data) ? data : []) as ParsedTxQueueRecord[];
}

export async function archiveParsedTxMessages(messageIds: number[]) {
  if (messageIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase.rpc('parsed_tx_queue_archive', {
    p_msg_ids: messageIds,
  });

  if (error) {
    throw new Error(`Failed to archive parsed tx queue messages: ${error.message}`);
  }

  return Array.isArray(data)
    ? data.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];
}
