'use client';

import type { ReactNode } from 'react';
import { useEffect, useState, useTransition } from 'react';
import { AuthRequired } from '@/components/auth-required';
import { useAuth } from '@/contexts/auth-context';
import { COLORS } from '@/lib/theme';
import type {
  LivePilotStatusResponse,
  LivePilotLatencyMetric,
  PilotControlAction,
  PilotTradeRow,
  PilotWalletConfigSummary,
} from '@/lib/live-pilot/types';
import {
  Activity,
  AlertTriangle,
  CirclePause,
  ExternalLink,
  KeyRound,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  Skull,
  Wallet,
} from 'lucide-react';

function truncate(value: string | null | undefined, left = 4, right = 4) {
  if (!value) return '—';
  if (value.length <= left + right + 3) return value;
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

function formatRelativeTime(value: string | null | undefined) {
  if (!value) return '—';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '—';

  const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
}

function statusChip(label: string, tone: 'neutral' | 'good' | 'warn' | 'danger') {
  const palette = {
    neutral: { background: 'rgba(163,163,163,0.10)', border: 'rgba(163,163,163,0.20)', color: '#D4D4D4' },
    good: { background: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.25)', color: '#34D399' },
    warn: { background: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', color: '#FBBF24' },
    danger: { background: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.25)', color: '#F87171' },
  } as const;

  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em]"
      style={palette[tone]}
    >
      {label}
    </span>
  );
}

function walletReadinessChip(config: PilotWalletConfigSummary) {
  if (!config.isComplete) return statusChip('Config Incomplete', 'warn');
  if (!config.isEnabled) return statusChip('Disabled', 'neutral');
  return statusChip('Ready', 'good');
}

function tradePair(trade: PilotTradeRow) {
  const input = trade.token_in_mint ? truncate(trade.token_in_mint, 4, 4) : '—';
  const output = trade.token_out_mint ? truncate(trade.token_out_mint, 4, 4) : '—';
  return `${input} → ${output}`;
}

function formatLatency(metric: LivePilotLatencyMetric) {
  if (metric.avgMs === null) {
    return '—';
  }

  if (metric.avgMs < 1000) {
    return `${metric.avgMs}ms`;
  }

  return `${(metric.avgMs / 1000).toFixed(2)}s`;
}

function formatLatencyDetail(metric: LivePilotLatencyMetric) {
  if (metric.avgMs === null) {
    return 'No samples yet';
  }

  const latest = metric.latestMs === null
    ? '—'
    : metric.latestMs < 1000
      ? `${metric.latestMs}ms`
      : `${(metric.latestMs / 1000).toFixed(2)}s`;

  return `${metric.samples} sample${metric.samples === 1 ? '' : 's'} · latest ${latest}`;
}

function formatEstimatedSol(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  return `${value.toFixed(value >= 0.1 ? 3 : 5)} SOL`;
}

function getSolscanTxUrl(signature: string) {
  return `https://solscan.io/tx/${signature}`;
}

function getGmgnWalletUrl(address: string) {
  return `https://gmgn.ai/sol/address/${address}`;
}

function externalLink(href: string, label: string, compact = false) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 transition hover:opacity-80"
      style={{ color: compact ? '#93C5FD' : '#60A5FA' }}
    >
      <span>{label}</span>
      <ExternalLink size={compact ? 12 : 13} />
    </a>
  );
}

function txLink(signature: string | null | undefined, left = 5, right = 5) {
  if (!signature) {
    return '—';
  }

  return externalLink(getSolscanTxUrl(signature), truncate(signature, left, right), true);
}

function statCard(title: string, value: string, detail: string, icon: ReactNode) {
  return (
    <div
      className="rounded-3xl border p-5"
      style={{ backgroundColor: COLORS.surface, borderColor: 'rgba(255,255,255,0.08)' }}
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.16em]" style={{ color: COLORS.data }}>
          {title}
        </span>
        {icon}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      <p className="mt-2 text-sm leading-6" style={{ color: COLORS.data }}>
        {detail}
      </p>
    </div>
  );
}

export function LivePilotConsole() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [status, setStatus] = useState<LivePilotStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function loadStatus() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/live-pilot/status', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setStatus(null);
        setError(payload.error || 'Failed to load live-pilot status');
        return;
      }

      setStatus(payload as LivePilotStatusResponse);
    } catch (fetchError: any) {
      setStatus(null);
      setError(fetchError?.message || 'Failed to load live-pilot status');
    } finally {
      setLoading(false);
    }
  }

  function runAction(action: PilotControlAction, walletAlias?: string, extras?: { mint?: string; note?: string }) {
    const confirmMessage =
      action === 'kill_switch_activate'
        ? 'Activate the live-pilot kill switch? This pauses global automation and marks every configured wallet for liquidation.'
        : action === 'global_resume'
          ? 'Resume the live pilot globally? Wallet-level pauses and liquidation flags stay untouched.'
          : action === 'wallet_liquidate'
            ? `Request liquidation for ${walletAlias}? This pauses that wallet and sets liquidation_requested = true.`
            : action === 'mint_quarantine_clear'
              ? `Clear the quarantine for ${extras?.mint}? This will allow future buys of that mint again.`
            : null;

    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch('/api/live-pilot/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, walletAlias, ...extras }),
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          setError(payload.error || 'Failed to update live-pilot control state');
          return;
        }

        setStatus(payload.status as LivePilotStatusResponse);
        setError(null);
      } catch (actionError: any) {
        setError(actionError?.message || 'Failed to update live-pilot control state');
      }
    });
  }

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!isAuthenticated) {
      setLoading(false);
      setStatus(null);
      setError(null);
      return;
    }

    loadStatus();
  }, [authLoading, isAuthenticated]);

  return (
    <AuthRequired
      title="Operator Access Required"
      description="Sign in with an allowlisted operator wallet to access the live-pilot control plane."
    >
      <div className="min-h-screen px-4 py-8 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <div
            className="overflow-hidden rounded-3xl border"
            style={{
              background:
                'radial-gradient(circle at top left, rgba(16,185,129,0.14), transparent 40%), radial-gradient(circle at top right, rgba(245,158,11,0.12), transparent 32%), #050505',
              borderColor: 'rgba(255,255,255,0.10)',
            }}
          >
            <div className="flex flex-col gap-5 p-6 md:flex-row md:items-end md:justify-between md:p-8">
              <div className="max-w-3xl">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {status?.summary.killSwitchActive
                    ? statusChip('Kill Switch Active', 'danger')
                    : status?.summary.globalPaused
                      ? statusChip('Globally Paused', 'warn')
                      : statusChip('Intent Feed Armed', 'good')}
                  {(status?.controlPlaneOnly ?? true)
                    ? statusChip('Control Plane Only', 'neutral')
                    : statusChip('Intent Feed Wired', 'good')}
                </div>
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Live Pilot Control</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 md:text-base" style={{ color: COLORS.data }}>
                  {(status?.controlPlaneOnly ?? true)
                    ? 'This page is currently serving a control-only snapshot. Treat automation as unavailable until the full live-pilot status feed returns and execution state is visible here.'
                    : 'This page manages operator auth, pause state, wallet mapping visibility, latency telemetry, quarantined mints, dead inventory, and the recent live-intent feed. The dedicated signer and execution worker are live, so unpausing can submit real swaps.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={loadStatus}
                  disabled={loading || isPending}
                  className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ borderColor: 'rgba(255,255,255,0.14)' }}
                >
                  <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => runAction('global_pause')}
                  disabled={!status || isPending}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ backgroundColor: '#FBBF24' }}
                >
                  <CirclePause size={16} />
                  Global Pause
                </button>
                <button
                  type="button"
                  onClick={() => runAction('global_resume')}
                  disabled={!status || isPending}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ backgroundColor: '#34D399' }}
                >
                  <PlayCircle size={16} />
                  Global Resume
                </button>
                <button
                  type="button"
                  onClick={() => runAction('kill_switch_activate')}
                  disabled={!status || isPending}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ backgroundColor: '#991B1B' }}
                >
                  <Skull size={16} />
                  Kill Switch
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <div
              className="rounded-2xl border px-4 py-3 text-sm"
              style={{ backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.20)', color: '#FCA5A5' }}
            >
              {error}
            </div>
          ) : null}

          {loading ? (
            <div
              className="flex min-h-[320px] items-center justify-center rounded-3xl border"
              style={{ backgroundColor: COLORS.surface, borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <div className="flex items-center gap-3 text-sm" style={{ color: COLORS.data }}>
                <RefreshCw size={16} className="animate-spin" />
                Loading live-pilot status…
              </div>
            </div>
          ) : null}

          {!loading && !status ? (
            <div
              className="rounded-3xl border p-8"
              style={{ backgroundColor: COLORS.surface, borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <div className="flex items-start gap-3">
                <ShieldAlert size={20} className="mt-0.5 text-amber-400" />
                <div>
                  <h2 className="text-lg font-semibold">
                    {error && /allowlist|Authentication required/i.test(error) ? 'Operator access blocked' : 'Status unavailable'}
                  </h2>
                  <p className="mt-2 text-sm leading-6" style={{ color: COLORS.data }}>
                    {error && /allowlist|Authentication required/i.test(error)
                      ? (
                        <>
                          The signed-in wallet {truncate(user?.wallet)} is not in <code>PILOT_OPERATOR_WALLETS</code>, or the allowlist has
                          not been configured yet.
                        </>
                      )
                      : 'The live-pilot status route could not build a snapshot. Apply the migration and verify the pilot tables exist.'}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {status ? (
            <>
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {statCard(
                  'Automation',
                  status.summary.killSwitchActive ? 'Kill switch' : status.summary.globalPaused ? 'Paused' : 'Armed',
                  `Global row updated ${formatRelativeTime(status.control.global.updated_at)} by ${truncate(status.control.global.updated_by_wallet)}.`,
                  <Activity size={16} style={{ color: COLORS.brand }} />
                )}
                {statCard(
                  'Operator',
                  truncate(status.operatorWallet, 6, 6),
                  `Allowlist contains ${status.config.operatorWallets.length} wallet${status.config.operatorWallets.length === 1 ? '' : 's'}.`,
                  <Wallet size={16} style={{ color: '#60A5FA' }} />
                )}
                {statCard(
                  'Wallet Readiness',
                  `${status.summary.healthyWalletCount}/${status.summary.configuredWalletCount}`,
                  'Healthy means config is complete. Signer availability is enforced by the live worker, not inspected from the web app.',
                  <KeyRound size={16} style={{ color: '#FBBF24' }} />
                )}
                {statCard(
                  'Recent Intents',
                  String(status.summary.recentTradeCount),
                  status.controlPlaneOnly
                    ? 'The parent table is ready so orchestrator intent creation can plug in without inventing a second operator read model.'
                    : 'Leader trades now fan out into pilot intent rows after the core claim path commits, with demo-parity sizing and the buy-side technical floor temporarily disabled.',
                  <AlertTriangle size={16} style={{ color: '#F87171' }} />
                )}
              </section>

              <section
                className="rounded-3xl border p-5"
                style={{ backgroundColor: COLORS.surface, borderColor: 'rgba(255,255,255,0.08)' }}
              >
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-semibold">Latency Snapshot</h2>
                  <p className="text-sm" style={{ color: COLORS.data }}>
                    Recent confirmed/submitted pilot trades, averaged over the latest {status.latency.recentWindowCount} execution rows.
                  </p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {statCard('Leader → Receive', formatLatency(status.latency.leaderToReceive), formatLatencyDetail(status.latency.leaderToReceive), <Activity size={16} style={{ color: '#60A5FA' }} />)}
                  {statCard('Receive → Intent', formatLatency(status.latency.receiveToIntent), formatLatencyDetail(status.latency.receiveToIntent), <Activity size={16} style={{ color: '#93C5FD' }} />)}
                  {statCard('Intent → Quote', formatLatency(status.latency.intentToQuote), formatLatencyDetail(status.latency.intentToQuote), <Activity size={16} style={{ color: '#FBBF24' }} />)}
                  {statCard('Quote → Submit', formatLatency(status.latency.quoteToSubmit), formatLatencyDetail(status.latency.quoteToSubmit), <Activity size={16} style={{ color: '#F87171' }} />)}
                  {statCard('Submit → Confirm', formatLatency(status.latency.submitToConfirm), formatLatencyDetail(status.latency.submitToConfirm), <Activity size={16} style={{ color: '#34D399' }} />)}
                  {statCard('Leader → Submit', formatLatency(status.latency.leaderToSubmit), formatLatencyDetail(status.latency.leaderToSubmit), <Activity size={16} style={{ color: COLORS.brand }} />)}
                  {statCard('Leader → Confirm', formatLatency(status.latency.leaderToConfirm), formatLatencyDetail(status.latency.leaderToConfirm), <Activity size={16} style={{ color: '#C084FC' }} />)}
                </div>
              </section>

              {status.config.errors.length > 0 ? (
                <section
                  className="rounded-3xl border p-5"
                  style={{ backgroundColor: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.20)' }}
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className="mt-0.5 text-amber-400" />
                    <div>
                      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-300">Config Warnings</h2>
                      <div className="mt-3 flex flex-col gap-2 text-sm leading-6" style={{ color: '#FDE68A' }}>
                        {status.config.errors.map((entry) => (
                          <p key={entry}>{entry}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              <section className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
                <div
                  className="rounded-3xl border p-5"
                  style={{ backgroundColor: COLORS.surface, borderColor: 'rgba(255,255,255,0.08)' }}
                >
                  <h2 className="text-lg font-semibold">Wallet Control Matrix</h2>
                  <p className="mt-1 text-sm" style={{ color: COLORS.data }}>
                    Overview, diagnosis, and action stay side-by-side so we can supervise two live pilot wallets, spot trapped inventory, and control execution safely.
                  </p>

                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead style={{ color: COLORS.data }}>
                        <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                          <th className="px-3 py-3 font-medium">Wallet</th>
                          <th className="px-3 py-3 font-medium">Mapped Trader</th>
                          <th className="px-3 py-3 font-medium">Config</th>
                          <th className="px-3 py-3 font-medium">Runtime</th>
                          <th className="px-3 py-3 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {status.walletStatuses.map((walletStatus) => (
                          <tr key={walletStatus.config.alias} className="border-b align-top" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                            <td className="px-3 py-4">
                              <div className="font-medium">{walletStatus.config.alias}</div>
                              <div className="mt-1 flex items-center gap-2 text-xs" style={{ color: COLORS.data }}>
                                <span>{truncate(walletStatus.config.publicKey, 6, 6)}</span>
                                {externalLink(getGmgnWalletUrl(walletStatus.config.publicKey), 'GMGN', true)}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {walletReadinessChip(walletStatus.config)}
                                {walletStatus.control.kill_switch_active
                                  ? statusChip(
                                      walletStatus.control.updated_by_wallet === 'system:exit-protection' ? 'Exit Only' : 'Kill Switch',
                                      'danger',
                                    )
                                  : null}
                                {walletStatus.control.is_paused ? statusChip('Paused', 'warn') : statusChip('Active', 'good')}
                                {walletStatus.control.liquidation_requested ? statusChip('Liquidation Requested', 'danger') : null}
                              </div>
                            </td>
                            <td className="px-3 py-4">
                              <div className="font-medium">{truncate(walletStatus.config.starTrader, 6, 6)}</div>
                              <div className="mt-2 text-xs leading-5" style={{ color: COLORS.data }}>
                                <div>Mode: {walletStatus.config.mode}</div>
                                <div>Cash: {walletStatus.config.cashMode.toUpperCase()}</div>
                                <div>Signer: Managed by worker</div>
                              </div>
                            </td>
                            <td className="px-3 py-4">
                              <div className="space-y-1 text-xs leading-5" style={{ color: COLORS.data }}>
                                <div>Fee reserve: {(walletStatus.config.feeReservePct * 100).toFixed(1)}%</div>
                                <div>Min reserve: {walletStatus.config.minFeeReserveSol.toFixed(2)} SOL</div>
                                <div>Sizing: Demo parity ratio</div>
                                <div>Live floor: disabled</div>
                                <div>
                                  Impact cap: {walletStatus.config.buyMaxPriceImpactPct > 0
                                    ? `${(walletStatus.config.buyMaxPriceImpactPct * 100).toFixed(1)}%`
                                    : 'disabled'}
                                </div>
                              </div>
                              {!walletStatus.config.isComplete && walletStatus.config.missingFields.length > 0 ? (
                                <div className="mt-3 text-xs leading-5 text-amber-300">
                                  Missing: {walletStatus.config.missingFields.join(', ')}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-4">
                              <div className="space-y-2 text-xs leading-5" style={{ color: COLORS.data }}>
                                <div>Last star trade: {txLink(walletStatus.runtime?.last_seen_star_trade_signature)}</div>
                                <div>Last submit: {txLink(walletStatus.runtime?.last_submitted_tx_signature)}</div>
                                <div>Last confirm: {txLink(walletStatus.runtime?.last_confirmed_tx_signature)}</div>
                                <div>Reconcile: {formatRelativeTime(walletStatus.runtime?.last_reconcile_at)}</div>
                                <div>Error: {walletStatus.runtime?.last_error || '—'}</div>
                                {walletStatus.control.updated_by_wallet === 'system:exit-protection' ? (
                                  <div className="text-amber-300">Exit protection is active until the wallet is flat.</div>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-4">
                              <div className="flex flex-col gap-2">
                                <button
                                  type="button"
                                  onClick={() => runAction(walletStatus.control.is_paused ? 'wallet_resume' : 'wallet_pause', walletStatus.config.alias)}
                                  disabled={isPending}
                                  className="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition hover:bg-white/5 disabled:opacity-50"
                                  style={{ borderColor: 'rgba(255,255,255,0.12)' }}
                                >
                                  {walletStatus.control.is_paused ? <PlayCircle size={14} /> : <CirclePause size={14} />}
                                  {walletStatus.control.is_paused ? 'Resume Wallet' : 'Pause Wallet'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => runAction('wallet_liquidate', walletStatus.config.alias)}
                                  disabled={isPending}
                                  className="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium text-red-200 transition hover:bg-red-500/10 disabled:opacity-50"
                                  style={{ borderColor: 'rgba(239,68,68,0.20)' }}
                                >
                                  <Skull size={14} />
                                  Request Liquidation
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div
                  className="rounded-3xl border p-5"
                  style={{ backgroundColor: COLORS.surface, borderColor: 'rgba(255,255,255,0.08)' }}
                >
                  <h2 className="text-lg font-semibold">Control State</h2>
                  <div className="mt-4 space-y-4 text-sm">
                    <div className="rounded-2xl border p-4" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                      <div className="flex items-center justify-between">
                        <span style={{ color: COLORS.data }}>Global pause</span>
                        {status.control.global.is_paused ? statusChip('On', 'warn') : statusChip('Off', 'good')}
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span style={{ color: COLORS.data }}>Kill switch</span>
                        {status.control.global.kill_switch_active ? statusChip('Armed', 'danger') : statusChip('Idle', 'neutral')}
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span style={{ color: COLORS.data }}>Liquidation requested</span>
                        {status.control.global.liquidation_requested ? statusChip('Pending', 'danger') : statusChip('No', 'neutral')}
                      </div>
                    </div>

                    <div className="rounded-2xl border p-4" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <ShieldAlert size={16} className="text-emerald-400" />
                        Why this slice matters
                      </div>
                      <p className="mt-3 text-sm leading-6" style={{ color: COLORS.data }}>
                        {status.controlPlaneOnly
                          ? 'We now have durable pause state, runtime placeholders, and an operator-only control page before any live signer or intent producer is introduced. That keeps the next execution PR additive instead of invasive.'
                          : 'We now have a durable operator control plane, a live execution worker, and real pilot intent rows sourced from the canonical leader claim path. Quarantined mints and dead inventory stay visible here so a hopeless rug does not stall the rest of the pilot.'}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <div
                  className="rounded-3xl border p-5"
                  style={{ backgroundColor: COLORS.surface, borderColor: 'rgba(255,255,255,0.08)' }}
                >
                  <h2 className="text-lg font-semibold">Trapped / Quarantined Mints</h2>
                  <p className="mt-1 text-sm" style={{ color: COLORS.data }}>
                    Once a sell or liquidation exhausts the chunk ladder with only no-route failures, the mint is quarantined globally and future buys are skipped until an operator clears it.
                  </p>

                  {status.quarantinedMints.length === 0 ? (
                    <div
                      className="mt-4 rounded-2xl border border-dashed px-4 py-8 text-center text-sm"
                      style={{ borderColor: 'rgba(255,255,255,0.12)', color: COLORS.data }}
                    >
                      No quarantined mints right now.
                    </div>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead style={{ color: COLORS.data }}>
                          <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                            <th className="px-3 py-3 font-medium">Mint</th>
                            <th className="px-3 py-3 font-medium">First Wallet</th>
                            <th className="px-3 py-3 font-medium">Trader</th>
                            <th className="px-3 py-3 font-medium">Reason</th>
                            <th className="px-3 py-3 font-medium">Detected</th>
                            <th className="px-3 py-3 font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {status.quarantinedMints.map((entry) => (
                            <tr key={entry.mint} className="border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                              <td className="px-3 py-4">
                                <div className="font-medium">{truncate(entry.mint, 6, 6)}</div>
                              </td>
                              <td className="px-3 py-4">{entry.first_wallet_alias || '—'}</td>
                              <td className="px-3 py-4">{entry.first_star_trader ? truncate(entry.first_star_trader, 6, 6) : '—'}</td>
                              <td className="px-3 py-4">{entry.reason}</td>
                              <td className="px-3 py-4">{formatRelativeTime(entry.last_detected_at)}</td>
                              <td className="px-3 py-4">
                                <button
                                  type="button"
                                  onClick={() => runAction('mint_quarantine_clear', undefined, { mint: entry.mint })}
                                  disabled={isPending}
                                  className="inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition hover:bg-white/5 disabled:opacity-50"
                                  style={{ borderColor: 'rgba(255,255,255,0.12)' }}
                                >
                                  Clear Quarantine
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div
                  className="rounded-3xl border p-5"
                  style={{ backgroundColor: COLORS.surface, borderColor: 'rgba(255,255,255,0.08)' }}
                >
                  <h2 className="text-lg font-semibold">Active Dead Inventory</h2>
                  <p className="mt-1 text-sm" style={{ color: COLORS.data }}>
                    Quarantined holdings that stay in the wallet as dead inventory. They are not treated as active liquidation work and should not block the rest of the pilot.
                  </p>

                  {status.walletDeadInventory.length === 0 ? (
                    <div
                      className="mt-4 rounded-2xl border border-dashed px-4 py-8 text-center text-sm"
                      style={{ borderColor: 'rgba(255,255,255,0.12)', color: COLORS.data }}
                    >
                      No quarantined wallet inventory detected.
                    </div>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead style={{ color: COLORS.data }}>
                          <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                            <th className="px-3 py-3 font-medium">Wallet</th>
                            <th className="px-3 py-3 font-medium">Mint</th>
                            <th className="px-3 py-3 font-medium">Amount</th>
                            <th className="px-3 py-3 font-medium">Est. SOL</th>
                            <th className="px-3 py-3 font-medium">State</th>
                          </tr>
                        </thead>
                        <tbody>
                          {status.walletDeadInventory.map((entry) => (
                            <tr key={`${entry.walletAlias}:${entry.mint}`} className="border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                              <td className="px-3 py-4">{entry.walletAlias}</td>
                              <td className="px-3 py-4">
                                <div className="font-medium">{entry.symbol}</div>
                                <div className="mt-1 text-xs" style={{ color: COLORS.data }}>
                                  {truncate(entry.mint, 6, 6)}
                                </div>
                              </td>
                              <td className="px-3 py-4">{entry.uiAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                              <td className="px-3 py-4">{formatEstimatedSol(entry.estimatedSolValue)}</td>
                              <td className="px-3 py-4">{entry.quarantineReason || 'quarantined'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </section>

              <section
                className="rounded-3xl border p-5"
                style={{ backgroundColor: COLORS.surface, borderColor: 'rgba(255,255,255,0.08)' }}
              >
                <h2 className="text-lg font-semibold">Recent Pilot Trades</h2>
                <p className="mt-1 text-sm" style={{ color: COLORS.data }}>
                  {status.controlPlaneOnly
                    ? 'This table is intentionally light right now. It becomes the operator’s recent-intent feed once orchestrator wiring lands.'
                    : 'This is the operator-facing parent intent feed. It shows queued, skipped, submitted, and confirmed pilot rows while the live execution worker is active. Demo-parity live buys use ratio sizing with the technical floor temporarily disabled.'}
                </p>

                {status.recentTrades.length === 0 ? (
                  <div
                    className="mt-4 rounded-2xl border border-dashed px-4 py-10 text-center text-sm"
                    style={{ borderColor: 'rgba(255,255,255,0.12)', color: COLORS.data }}
                  >
                    {status.controlPlaneOnly
                      ? 'No live-pilot trades yet. The parent summary table is ready, but intent production is still paused behind the next PR.'
                      : 'No live-pilot trades yet. Intent production is wired, but no mapped leader trade has created a pilot row since this slice was enabled.'}
                  </div>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead style={{ color: COLORS.data }}>
                        <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                          <th className="px-3 py-3 font-medium">Status</th>
                          <th className="px-3 py-3 font-medium">Wallet</th>
                          <th className="px-3 py-3 font-medium">Trader</th>
                          <th className="px-3 py-3 font-medium">Pair</th>
                          <th className="px-3 py-3 font-medium">Reason</th>
                          <th className="px-3 py-3 font-medium">Tx</th>
                          <th className="px-3 py-3 font-medium">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {status.recentTrades.map((trade) => (
                          <tr key={trade.id} className="border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                            <td className="px-3 py-4">
                              {trade.status === 'confirmed'
                                ? statusChip('Confirmed', 'good')
                                : trade.status === 'failed'
                                  ? statusChip('Failed', 'danger')
                                  : trade.status === 'skipped'
                                    ? statusChip('Skipped', 'warn')
                                    : statusChip(trade.status, 'neutral')}
                            </td>
                            <td className="px-3 py-4">{trade.wallet_alias}</td>
                            <td className="px-3 py-4">{truncate(trade.star_trader, 6, 6)}</td>
                            <td className="px-3 py-4">{tradePair(trade)}</td>
                            <td className="px-3 py-4">{trade.skip_reason || trade.error_message || trade.trigger_reason || '—'}</td>
                            <td className="px-3 py-4">{txLink(trade.tx_signature)}</td>
                            <td className="px-3 py-4">{formatRelativeTime(trade.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </AuthRequired>
  );
}
