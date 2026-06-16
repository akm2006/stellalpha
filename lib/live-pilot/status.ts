import { toLivePilotConfigSummary } from '@/lib/live-pilot/config';
import type { LivePilotPublicConfig } from '@/lib/live-pilot/config';
import type {
  LivePilotDeadInventoryItem,
  LivePilotDecisionAuditEvent,
  LivePilotDecisionAuditSummary,
  LivePilotLatencyMetric,
  LivePilotLatencySummary,
  LivePilotStatusResponse,
  PilotTradeRow,
} from '@/lib/live-pilot/types';
import { createLivePilotConnection } from '@/lib/live-pilot/executor';
import { getWalletLiquidationStatus } from '@/lib/live-pilot/liquidation';
import { listActivePilotMintQuarantines } from '@/lib/live-pilot/repositories/pilot-mint-quarantines.repo';
import {
  buildPilotControlSnapshot,
  ensurePilotControlState,
  listPilotControlStates,
} from '@/lib/live-pilot/repositories/pilot-control-state.repo';
import {
  ensurePilotRuntimeState,
  listPilotRuntimeStates,
} from '@/lib/live-pilot/repositories/pilot-runtime-state.repo';
import { listRecentPilotTrades } from '@/lib/live-pilot/repositories/pilot-trades.repo';
import { isLivePilotRedisAvailable } from '@/lib/live-pilot/redis/config';
import { readLivePilotRedisAuditTail } from '@/lib/live-pilot/redis/streams';
import { getTokenSymbol } from '@/lib/services/token-service';

function toMs(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function buildLatencyMetric(samples: number[]): LivePilotLatencyMetric {
  if (samples.length === 0) {
    return {
      avgMs: null,
      latestMs: null,
      samples: 0,
    };
  }

  const sum = samples.reduce((acc, value) => acc + value, 0);
  return {
    avgMs: Math.round(sum / samples.length),
    latestMs: Math.round(samples[0]),
    samples: samples.length,
  };
}

function collectLatencySamples(trades: PilotTradeRow[], startField: keyof PilotTradeRow, endField: keyof PilotTradeRow) {
  return trades
    .map((trade) => {
      const start = toMs(trade[startField] as string | null | undefined);
      const end = toMs(trade[endField] as string | null | undefined);
      if (start === null || end === null || end < start) {
        return null;
      }

      return end - start;
    })
    .filter((value): value is number => value !== null);
}

export function summarizeLivePilotLatency(trades: PilotTradeRow[]): LivePilotLatencySummary {
  const latencyWindow = trades
    .filter((trade) => trade.status === 'confirmed' || trade.status === 'submitted')
    .slice(0, 10);

  return {
    recentWindowCount: latencyWindow.length,
    leaderToReceive: buildLatencyMetric(collectLatencySamples(latencyWindow, 'leader_block_timestamp', 'received_at')),
    receiveToIntent: buildLatencyMetric(collectLatencySamples(latencyWindow, 'received_at', 'intent_created_at')),
    intentToQuote: buildLatencyMetric(collectLatencySamples(latencyWindow, 'intent_created_at', 'quote_received_at')),
    quoteToSubmit: buildLatencyMetric(collectLatencySamples(latencyWindow, 'quote_received_at', 'tx_submitted_at')),
    submitToConfirm: buildLatencyMetric(collectLatencySamples(latencyWindow, 'tx_submitted_at', 'tx_confirmed_at')),
    leaderToSubmit: buildLatencyMetric(collectLatencySamples(latencyWindow, 'leader_block_timestamp', 'tx_submitted_at')),
    leaderToConfirm: buildLatencyMetric(collectLatencySamples(latencyWindow, 'leader_block_timestamp', 'tx_confirmed_at')),
  };
}

function incrementCounter(target: Record<string, number>, key: string | null | undefined) {
  const normalized = key?.trim() || 'unknown';
  target[normalized] = (target[normalized] || 0) + 1;
}

function normalizeDecisionAuditEvent(payload: Record<string, string>): LivePilotDecisionAuditEvent | null {
  if (payload.eventType !== 'pilot_decision') {
    return null;
  }

  return {
    createdAt: payload.createdAt || null,
    decisionKind: payload.decisionKind || 'unknown',
    source: payload.source || 'unknown',
    intentSource: payload.intentSource || 'unknown',
    walletAlias: payload.walletAlias || 'unknown',
    leaderType: payload.leaderType || null,
    starTradeSignature: payload.starTradeSignature || null,
    tokenInMint: payload.tokenInMint || null,
    tokenOutMint: payload.tokenOutMint || null,
    reason: payload.reason || payload.skipReason || null,
    outcome: payload.outcome || null,
    signature: payload.signature || null,
  };
}

async function summarizeLivePilotDecisionAudit(): Promise<LivePilotDecisionAuditSummary> {
  const unavailable: LivePilotDecisionAuditSummary = {
    available: false,
    sampleSize: 0,
    latestAt: null,
    byDecisionKind: {},
    byReason: {},
    byIntentSource: {},
    recent: [],
  };

  if (!isLivePilotRedisAvailable()) {
    return unavailable;
  }

  try {
    const rows = await readLivePilotRedisAuditTail(300);
    const events = rows
      .map((row) => normalizeDecisionAuditEvent(row.payload))
      .filter((event): event is LivePilotDecisionAuditEvent => Boolean(event));

    const byDecisionKind: Record<string, number> = {};
    const byReason: Record<string, number> = {};
    const byIntentSource: Record<string, number> = {};

    for (const event of events) {
      incrementCounter(byDecisionKind, event.decisionKind);
      incrementCounter(byReason, event.reason || event.outcome || event.source);
      incrementCounter(byIntentSource, event.intentSource);
    }

    return {
      available: true,
      sampleSize: events.length,
      latestAt: events[0]?.createdAt || null,
      byDecisionKind,
      byReason,
      byIntentSource,
      recent: events.slice(0, 12),
    };
  } catch {
    return unavailable;
  }
}

export async function getLivePilotStatus(
  operatorWallet: string,
  config: LivePilotPublicConfig,
): Promise<LivePilotStatusResponse> {
  const walletAliases = config.wallets.map((wallet) => wallet.alias);

  await ensurePilotControlState(walletAliases);
  await ensurePilotRuntimeState(config.wallets);

  const [controlRows, runtimeRows, recentTrades, quarantinedMints, decisionAudit] = await Promise.all([
    listPilotControlStates(),
    listPilotRuntimeStates(walletAliases),
    listRecentPilotTrades(15),
    listActivePilotMintQuarantines(),
    summarizeLivePilotDecisionAudit(),
  ]);
  const connection = createLivePilotConnection();
  const walletLiquidationStatuses = await Promise.all(
    config.wallets.map(async (wallet) => ({
      wallet,
      status: await getWalletLiquidationStatus({
        walletAlias: wallet.alias,
        walletPublicKey: wallet.publicKey,
        starTrader: wallet.starTrader,
        connection,
      }),
    })),
  );
  const walletDeadInventory: LivePilotDeadInventoryItem[] = walletLiquidationStatuses.flatMap(({ wallet, status }) =>
    status.deadInventoryHoldings.map((holding) => {
      const quarantine = quarantinedMints.find((entry) => entry.mint === holding.mint);
      return {
        walletAlias: wallet.alias,
        walletPublicKey: wallet.publicKey,
        mint: holding.mint,
        symbol: getTokenSymbol(holding.mint),
        uiAmount: holding.uiAmount,
        estimatedSolValue: holding.estimatedSolValue,
        quarantineReason: quarantine?.reason || null,
      };
    }),
  );

  const control = buildPilotControlSnapshot(controlRows, walletAliases);
  const walletStatuses = config.wallets.map((wallet) => {
    return {
      config: wallet,
      control: control.wallets.find((row) => row.scope_key === wallet.alias)!,
      runtime: runtimeRows.find((row) => row.wallet_alias === wallet.alias) || null,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    operatorWallet,
    controlPlaneOnly: false,
    config: toLivePilotConfigSummary(config),
    summary: {
      globalPaused: control.global.is_paused,
      killSwitchActive: control.global.kill_switch_active,
      configuredWalletCount: config.wallets.length,
      healthyWalletCount: config.wallets.filter((wallet) => wallet.isComplete && wallet.isEnabled).length,
      recentTradeCount: recentTrades.length,
    },
    control,
    latency: summarizeLivePilotLatency(recentTrades),
    runtime: runtimeRows,
    walletStatuses,
    quarantinedMints,
    walletDeadInventory,
    decisionAudit,
    recentTrades,
  };
}
