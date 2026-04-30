import {
  applyObservedLeaderBuy,
  applyObservedLeaderSell,
  applySuccessfulCopiedBuy,
  applySuccessfulCopiedSell,
  createEmptyCopyPositionLifecycle,
  type CopyPositionLifecycleSnapshot,
} from '@/lib/copy-position-lifecycle';
import type { PilotMintQuarantineRow, PilotTradeAttemptRow, PilotTradeRow } from '@/lib/live-pilot/types';
import { getLivePilotRedisClient } from './client';
import { isLivePilotRedisAvailable } from './config';
import {
  livePilotCopyStateKey,
  livePilotQuarantineKey,
  livePilotSubmittedKey,
} from './keys';
import { publishLivePilotRedisResult } from './streams';

export type RedisCopyState = CopyPositionLifecycleSnapshot & {
  tokenSymbol: string | null;
  lastLeaderTradeSignature: string | null;
  lastLeaderTradeAt: string | null;
  updatedAt: string;
};

function numberOrZero(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function copyStateKey(args: {
  walletAlias: string;
  starTrader: string;
  mint: string;
}) {
  return livePilotCopyStateKey(args);
}

function emptyRedisCopyState(): RedisCopyState {
  return {
    ...createEmptyCopyPositionLifecycle(),
    tokenSymbol: null,
    lastLeaderTradeSignature: null,
    lastLeaderTradeAt: null,
    updatedAt: new Date().toISOString(),
  };
}

function normalizeCopyState(raw: string | null): RedisCopyState {
  if (!raw) return emptyRedisCopyState();
  try {
    const parsed = JSON.parse(raw) as Partial<RedisCopyState>;
    return {
      leaderOpenAmount: numberOrZero(parsed.leaderOpenAmount),
      copiedOpenAmount: numberOrZero(parsed.copiedOpenAmount),
      copiedCostUsd: numberOrZero(parsed.copiedCostUsd),
      avgCostUsd: numberOrZero(parsed.avgCostUsd),
      tokenSymbol: parsed.tokenSymbol || null,
      lastLeaderTradeSignature: parsed.lastLeaderTradeSignature || null,
      lastLeaderTradeAt: parsed.lastLeaderTradeAt || null,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return emptyRedisCopyState();
  }
}

export async function getRedisCopyState(args: {
  walletAlias: string;
  starTrader: string;
  mint: string;
}) {
  if (!isLivePilotRedisAvailable()) return null;
  const client = await getLivePilotRedisClient();
  return normalizeCopyState(await client.get(copyStateKey(args)));
}

async function setRedisCopyState(args: {
  walletAlias: string;
  starTrader: string;
  mint: string;
  state: RedisCopyState;
}) {
  const client = await getLivePilotRedisClient();
  await client.set(copyStateKey(args), JSON.stringify(args.state));
}

export async function recordRedisObservedLeaderBuy(args: {
  walletAlias: string;
  starTrader: string;
  mint: string;
  tokenSymbol: string | null;
  tradeSignature: string | null;
  tradeTimestampIso: string | null;
  leaderBuyAmount: number;
}) {
  if (!isLivePilotRedisAvailable()) return null;
  const current = await getRedisCopyState(args) || emptyRedisCopyState();
  const transition = applyObservedLeaderBuy(current, args.leaderBuyAmount);
  const next: RedisCopyState = {
    ...current,
    ...transition.next,
    tokenSymbol: args.tokenSymbol || current.tokenSymbol,
    lastLeaderTradeSignature: args.tradeSignature || current.lastLeaderTradeSignature,
    lastLeaderTradeAt: args.tradeTimestampIso || current.lastLeaderTradeAt,
    updatedAt: new Date().toISOString(),
  };
  await setRedisCopyState({ ...args, state: next });
  return { row: next, ...transition };
}

export async function recordRedisObservedLeaderSell(args: {
  walletAlias: string;
  starTrader: string;
  mint: string;
  tokenSymbol: string | null;
  tradeSignature: string | null;
  tradeTimestampIso: string | null;
  leaderSellAmount: number;
}) {
  if (!isLivePilotRedisAvailable()) return null;
  const current = await getRedisCopyState(args) || emptyRedisCopyState();
  const transition = applyObservedLeaderSell(current, args.leaderSellAmount);
  if (transition.leaderPositionBefore > 0) {
    const next: RedisCopyState = {
      ...current,
      ...transition.next,
      tokenSymbol: args.tokenSymbol || current.tokenSymbol,
      lastLeaderTradeSignature: args.tradeSignature || current.lastLeaderTradeSignature,
      lastLeaderTradeAt: args.tradeTimestampIso || current.lastLeaderTradeAt,
      updatedAt: new Date().toISOString(),
    };
    await setRedisCopyState({ ...args, state: next });
  }
  return { row: current, ...transition };
}

export async function recordRedisSuccessfulCopiedBuy(args: {
  walletAlias: string;
  starTrader: string;
  mint: string;
  tokenSymbol: string | null;
  tradeSignature: string | null;
  tradeTimestampIso: string | null;
  copiedBuyAmount: number;
  copiedCostUsd: number;
}) {
  if (!isLivePilotRedisAvailable()) return null;
  const current = await getRedisCopyState(args) || emptyRedisCopyState();
  const transition = applySuccessfulCopiedBuy(current, args.copiedBuyAmount, args.copiedCostUsd);
  const next: RedisCopyState = {
    ...current,
    ...transition.next,
    tokenSymbol: args.tokenSymbol || current.tokenSymbol,
    lastLeaderTradeSignature: args.tradeSignature || current.lastLeaderTradeSignature,
    lastLeaderTradeAt: args.tradeTimestampIso || current.lastLeaderTradeAt,
    updatedAt: new Date().toISOString(),
  };
  await setRedisCopyState({ ...args, state: next });
  return { row: next, ...transition };
}

export async function recordRedisSuccessfulCopiedSell(args: {
  walletAlias: string;
  starTrader: string;
  mint: string;
  tokenSymbol: string | null;
  tradeSignature: string | null;
  tradeTimestampIso: string | null;
  copiedSellAmount: number;
}) {
  if (!isLivePilotRedisAvailable()) return null;
  const current = await getRedisCopyState(args) || emptyRedisCopyState();
  const transition = applySuccessfulCopiedSell(current, args.copiedSellAmount);
  const next: RedisCopyState = {
    ...current,
    ...transition.next,
    tokenSymbol: args.tokenSymbol || current.tokenSymbol,
    lastLeaderTradeSignature: args.tradeSignature || current.lastLeaderTradeSignature,
    lastLeaderTradeAt: args.tradeTimestampIso || current.lastLeaderTradeAt,
    updatedAt: new Date().toISOString(),
  };
  await setRedisCopyState({ ...args, state: next });
  return { row: next, ...transition };
}

export async function getRedisMintQuarantine(mint: string) {
  if (!isLivePilotRedisAvailable()) return null;
  const client = await getLivePilotRedisClient();
  const raw = await client.get(livePilotQuarantineKey(mint));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PilotMintQuarantineRow;
  } catch {
    return null;
  }
}

export async function setRedisMintQuarantine(row: PilotMintQuarantineRow) {
  if (!isLivePilotRedisAvailable()) return;
  const client = await getLivePilotRedisClient();
  await client.set(livePilotQuarantineKey(row.mint), JSON.stringify(row));
}

export async function clearRedisMintQuarantine(mint: string) {
  if (!isLivePilotRedisAvailable()) return;
  const client = await getLivePilotRedisClient();
  await client.del(livePilotQuarantineKey(mint));
}

export function createRedisAttemptRow(input: {
  id: string;
  attempt: Omit<PilotTradeAttemptRow, 'id' | 'created_at' | 'updated_at'>;
}): PilotTradeAttemptRow {
  const now = new Date().toISOString();
  return {
    id: input.id,
    created_at: now,
    updated_at: now,
    ...input.attempt,
  };
}

export async function setRedisSubmittedTrade(args: {
  trade: PilotTradeRow;
  patch: Partial<PilotTradeRow>;
}) {
  if (!isLivePilotRedisAvailable()) return;
  const client = await getLivePilotRedisClient();
  await client.set(
    livePilotSubmittedKey(args.trade.wallet_alias, args.trade.id),
    JSON.stringify({
      trade: args.trade,
      patch: args.patch,
      updatedAt: new Date().toISOString(),
    }),
  );
}

export async function mirrorRedisTradeEvent(payload: Record<string, unknown>) {
  await publishLivePilotRedisResult(payload).catch(() => undefined);
}
