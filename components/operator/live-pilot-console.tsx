'use client';

import type { ReactNode } from 'react';
import { useEffect, useState, useTransition } from 'react';
import { AuthRequired } from '@/components/auth-required';
import { InfoTooltip } from '@/components/cyber/tooltip';
import { useAuth } from '@/contexts/auth-context';
import { formatCopyBuyModelConfigSummary, formatCopyBuyModelLabel } from '@/lib/copy-models/format';
import type {
  LivePilotLatencyMetric,
  LivePilotStatusResponse,
  LivePilotWalletStatus,
  PilotControlAction,
  PilotTradeRow,
  PilotTradeStatus,
  PilotWalletConfigSummary,
} from '@/lib/live-pilot/types';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  CirclePause,
  ExternalLink,
  KeyRound,
  ListFilter,
  PlayCircle,
  Radio,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Skull,
  Timer,
  Wallet,
  Zap,
} from 'lucide-react';

const SOLSCAN_ICON_SRC = 'https://solscan.io/favicon.ico';
const TRADE_FILTERS: Array<PilotTradeStatus | 'all'> = ['all', 'queued', 'building', 'submitted', 'confirmed', 'failed', 'skipped'];

function truncate(value: string | null | undefined, left = 4, right = 4) {
  if (!value) return '-';
  if (value.length <= left + right + 3) return value;
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

function formatRelativeTime(value: string | null | undefined) {
  if (!value) return '-';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '-';

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
}

function formatLatency(metric: LivePilotLatencyMetric) {
  if (metric.avgMs === null) return '-';
  return metric.avgMs < 1000 ? `${metric.avgMs}ms` : `${(metric.avgMs / 1000).toFixed(2)}s`;
}

function formatLatencyDetail(metric: LivePilotLatencyMetric) {
  if (metric.avgMs === null) return 'No samples';
  const latest = metric.latestMs === null
    ? '-'
    : metric.latestMs < 1000
      ? `${metric.latestMs}ms`
      : `${(metric.latestMs / 1000).toFixed(2)}s`;
  return `${metric.samples} sample${metric.samples === 1 ? '' : 's'} · latest ${latest}`;
}

function formatEstimatedSol(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${value.toFixed(value >= 0.1 ? 3 : 5)} SOL`;
}

function formatLiveBuyModel(config: PilotWalletConfigSummary) {
  return `${formatCopyBuyModelLabel(config.buyModelKey)} · ${formatCopyBuyModelConfigSummary(
    config.buyModelKey,
    config.buyModelConfig,
  )}`;
}

function formatLiveProfile(profileKey: PilotWalletConfigSummary['profileKey']) {
  if (profileKey === 'micro_longevity_7d') return 'Micro longevity 7d';
  return null;
}

function tradePair(trade: PilotTradeRow) {
  return `${truncate(trade.token_in_mint, 4, 4)} -> ${truncate(trade.token_out_mint, 4, 4)}`;
}

function getSolscanTxUrl(signature: string) {
  return `https://solscan.io/tx/${signature}`;
}

function getGmgnWalletUrl(address: string) {
  return `https://gmgn.ai/sol/address/${address}`;
}

function toneClasses(tone: 'neutral' | 'good' | 'warn' | 'danger' | 'data') {
  const tones = {
    neutral: 'border-white/12 bg-white/[0.04] text-white/65',
    good: 'border-[#00FF85]/35 bg-[#00FF85]/8 text-[#00FF85]',
    warn: 'border-amber-300/35 bg-amber-400/10 text-amber-200',
    danger: 'border-red-400/35 bg-red-500/10 text-red-200',
    data: 'border-[#00E5D4]/30 bg-[#00E5D4]/8 text-[#00E5D4]',
  };
  return tones[tone];
}

function statusTone(status: PilotTradeStatus): 'neutral' | 'good' | 'warn' | 'danger' | 'data' {
  if (status === 'confirmed') return 'good';
  if (status === 'submitted' || status === 'building') return 'data';
  if (status === 'failed') return 'danger';
  if (status === 'skipped') return 'warn';
  return 'neutral';
}

function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'danger' | 'data' }) {
  return (
    <span className={`cyber-command inline-flex items-center gap-1.5 border px-2 py-1 text-[10px] font-semibold ${toneClasses(tone)}`}>
      {children}
    </span>
  );
}

function SolscanLink({ signature }: { signature: string | null | undefined }) {
  if (!signature) return <span className="text-white/30">-</span>;
  return (
    <a
      href={getSolscanTxUrl(signature)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-[#00E5D4] transition hover:text-[#00FF85]"
      title={signature}
    >
      <img src={SOLSCAN_ICON_SRC} alt="" className="h-3.5 w-3.5 rounded-full" />
      <span>{truncate(signature, 5, 5)}</span>
    </a>
  );
}

function ExternalWalletLink({ address, label = 'GMGN' }: { address: string; label?: string }) {
  return (
    <a
      href={getGmgnWalletUrl(address)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[#00E5D4] transition hover:text-[#00FF85]"
    >
      {label}
      <ExternalLink size={11} />
    </a>
  );
}

function ActionButton({
  children,
  tone = 'neutral',
  disabled,
  onClick,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'danger';
  disabled?: boolean;
  onClick: () => void;
}) {
  const toneClass =
    tone === 'good'
      ? 'border-[#00FF85]/40 bg-[#00FF85]/10 text-[#00FF85] hover:bg-[#00FF85]/15'
      : tone === 'warn'
        ? 'border-amber-300/35 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15'
        : tone === 'danger'
          ? 'border-red-400/40 bg-red-500/10 text-red-200 hover:bg-red-500/15'
          : 'border-white/12 bg-white/[0.03] text-white/75 hover:bg-white/[0.07]';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`cyber-command inline-flex items-center justify-center gap-2 border px-3 py-2 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
    >
      {children}
    </button>
  );
}

function KpiCard({
  label,
  value,
  helper,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  helper: ReactNode;
  icon: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'danger' | 'data';
}) {
  const valueClass =
    tone === 'good'
      ? 'text-[#00FF85]'
      : tone === 'warn'
        ? 'text-amber-200'
        : tone === 'danger'
          ? 'text-red-200'
          : tone === 'data'
            ? 'text-[#00E5D4]'
            : 'text-white';

  return (
    <div className="cyber-kpi cyber-panel-soft border border-white/10 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="cyber-command text-[10px] text-white/45">{label}</span>
        <span className={valueClass}>{icon}</span>
      </div>
      <div className={`font-mono text-xl font-semibold tabular-nums ${valueClass}`}>{value}</div>
      <div className="mt-2 text-xs leading-relaxed text-white/45">{helper}</div>
    </div>
  );
}

function getWalletTone(wallet: LivePilotWalletStatus) {
  if (!wallet.config.isComplete || wallet.control.kill_switch_active || wallet.control.liquidation_requested) return 'danger';
  if (!wallet.config.isEnabled || wallet.control.is_paused) return 'warn';
  return 'good';
}

function getWalletStateLabel(wallet: LivePilotWalletStatus) {
  if (!wallet.config.isComplete) return 'Incomplete';
  if (!wallet.config.isEnabled) return 'Disabled';
  if (wallet.control.kill_switch_active) return wallet.control.updated_by_wallet === 'system:exit-protection' ? 'Exit only' : 'Kill switch';
  if (wallet.control.liquidation_requested) return 'Liquidation';
  if (wallet.control.is_paused) return 'Paused';
  return 'Active';
}

function WalletCommandCard({
  wallet,
  isPending,
  runAction,
}: {
  wallet: LivePilotWalletStatus;
  isPending: boolean;
  runAction: (action: PilotControlAction, walletAlias?: string) => void;
}) {
  const tone = getWalletTone(wallet);
  const profileLabel = formatLiveProfile(wallet.config.profileKey);

  return (
    <article className={`cyber-panel-soft border p-4 ${tone === 'danger' ? 'border-red-400/25 bg-red-500/[0.04]' : tone === 'warn' ? 'border-amber-300/25 bg-amber-400/[0.04]' : 'border-[#00FF85]/18 bg-[#00FF85]/[0.025]'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-mono text-lg font-semibold text-white">{wallet.config.alias}</h3>
            <StatusPill tone={tone}>{getWalletStateLabel(wallet)}</StatusPill>
            {wallet.config.hasSecret ? <StatusPill tone="good">Signer set</StatusPill> : <StatusPill tone="danger">No signer</StatusPill>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/45">
            <span>{truncate(wallet.config.publicKey, 6, 6)}</span>
            <ExternalWalletLink address={wallet.config.publicKey} />
            <span className="text-white/20">/</span>
            <span>Leader {truncate(wallet.config.starTrader, 6, 6)}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ActionButton
            tone={wallet.control.is_paused ? 'good' : 'warn'}
            disabled={isPending}
            onClick={() => runAction(wallet.control.is_paused ? 'wallet_resume' : 'wallet_pause', wallet.config.alias)}
          >
            {wallet.control.is_paused ? <PlayCircle size={14} /> : <CirclePause size={14} />}
            {wallet.control.is_paused ? 'Resume' : 'Pause'}
          </ActionButton>
          <ActionButton
            tone="danger"
            disabled={isPending}
            onClick={() => runAction('wallet_liquidate', wallet.config.alias)}
          >
            <Skull size={14} />
            Liquidate
          </ActionButton>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="cyber-panel-soft border border-white/8 px-3 py-3">
          <div className="cyber-command mb-1 text-[9px] text-white/35">Sizing</div>
          <div className="text-sm text-white/80">{formatLiveBuyModel(wallet.config)}</div>
          {profileLabel ? (
            <div className="mt-1 text-[11px] text-[#00E5D4]">Profile: {profileLabel}</div>
          ) : null}
        </div>
        <div className="cyber-panel-soft border border-white/8 px-3 py-3">
          <div className="cyber-command mb-1 text-[9px] text-white/35">Protection</div>
          <div className="text-sm text-white/80">
            Reserve {(wallet.config.feeReservePct * 100).toFixed(1)}% / {wallet.config.minFeeReserveSol.toFixed(2)} SOL
          </div>
        </div>
        <div className="cyber-panel-soft border border-white/8 px-3 py-3">
          <div className="cyber-command mb-1 text-[9px] text-white/35">Last Reconcile</div>
          <div className="text-sm text-white/80">{formatRelativeTime(wallet.runtime?.last_reconcile_at)}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-xs leading-relaxed text-white/45 md:grid-cols-3">
        <div>Seen: <SolscanLink signature={wallet.runtime?.last_seen_star_trade_signature} /></div>
        <div>Submitted: <SolscanLink signature={wallet.runtime?.last_submitted_tx_signature} /></div>
        <div>Confirmed: <SolscanLink signature={wallet.runtime?.last_confirmed_tx_signature} /></div>
      </div>

      {wallet.config.missingFields.length > 0 ? (
        <div className="mt-3 border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
          Missing: {wallet.config.missingFields.join(', ')}
        </div>
      ) : null}

      {wallet.runtime?.last_error ? (
        <div className="mt-3 border border-red-400/20 bg-red-500/8 px-3 py-2 text-xs leading-relaxed text-red-100">
          {wallet.runtime.last_error}
        </div>
      ) : null}
    </article>
  );
}

function LatencyPipeline({ status }: { status: LivePilotStatusResponse }) {
  const stages = [
    ['Leader -> receive', status.latency.leaderToReceive, <Radio key="radio" size={14} />],
    ['Receive -> intent', status.latency.receiveToIntent, <Zap key="zap" size={14} />],
    ['Intent -> quote', status.latency.intentToQuote, <Timer key="timer" size={14} />],
    ['Quote -> submit', status.latency.quoteToSubmit, <Activity key="activity" size={14} />],
    ['Submit -> confirm', status.latency.submitToConfirm, <ShieldCheck key="shield" size={14} />],
  ] as const;

  return (
    <section className="cyber-panel border border-white/10 p-4 sm:p-5">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="cyber-command text-[10px] text-[#00E5D4]">Execution Pipeline</div>
          <h2 className="mt-2 text-xl font-semibold text-white">Detection-to-submission timing</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/50">
            Recent submitted or confirmed live-pilot rows. This separates detection, intent creation, quote/build, submission, and confirmation instead of hiding drift inside one number.
          </p>
        </div>
        <StatusPill tone="data">{status.latency.recentWindowCount} samples</StatusPill>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-5">
        {stages.map(([label, metric, icon]) => (
          <div key={label} className="cyber-panel-soft border border-white/10 p-3">
            <div className="mb-3 flex items-center justify-between text-[#00E5D4]">
              <span className="cyber-command text-[9px] text-white/40">{label}</span>
              {icon}
            </div>
            <div className="font-mono text-lg font-semibold text-white tabular-nums">{formatLatency(metric)}</div>
            <div className="mt-1 text-[11px] text-white/38">{formatLatencyDetail(metric)}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="cyber-panel-soft border border-white/10 p-3">
          <div className="cyber-command mb-1 text-[9px] text-white/35">Leader to Submit</div>
          <div className="font-mono text-lg text-[#00FF85]">{formatLatency(status.latency.leaderToSubmit)}</div>
          <div className="mt-1 text-[11px] text-white/38">{formatLatencyDetail(status.latency.leaderToSubmit)}</div>
        </div>
        <div className="cyber-panel-soft border border-white/10 p-3">
          <div className="cyber-command mb-1 text-[9px] text-white/35">Leader to Confirm</div>
          <div className="font-mono text-lg text-amber-200">{formatLatency(status.latency.leaderToConfirm)}</div>
          <div className="mt-1 text-[11px] text-white/38">{formatLatencyDetail(status.latency.leaderToConfirm)}</div>
        </div>
      </div>
    </section>
  );
}

function CollapsiblePanel({
  title,
  count,
  description,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  description: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="cyber-panel border border-white/10 p-4 sm:p-5">
      <button type="button" onClick={onToggle} className="flex w-full items-start justify-between gap-4 text-left">
        <span>
          <span className="cyber-command text-[10px] text-[#00E5D4]">Risk Drawer</span>
          <span className="mt-2 block text-lg font-semibold text-white">{title}</span>
          <span className="mt-1 block text-sm leading-relaxed text-white/48">{description}</span>
        </span>
        <span className="flex items-center gap-2">
          <StatusPill tone={count > 0 ? 'warn' : 'neutral'}>{count}</StatusPill>
          <ChevronDown size={16} className={`text-white/45 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

function RecentTradesFeed({ status }: { status: LivePilotStatusResponse }) {
  const [statusFilter, setStatusFilter] = useState<PilotTradeStatus | 'all'>('all');
  const [walletFilter, setWalletFilter] = useState('all');
  const [query, setQuery] = useState('');

  const normalizedQuery = query.trim().toLowerCase();
  const filteredTrades = status.recentTrades.filter((trade) => {
    if (statusFilter !== 'all' && trade.status !== statusFilter) return false;
    if (walletFilter !== 'all' && trade.wallet_alias !== walletFilter) return false;
    if (!normalizedQuery) return true;
    return [
      trade.id,
      trade.wallet_alias,
      trade.star_trader,
      trade.star_trade_signature,
      trade.tx_signature,
      trade.token_in_mint,
      trade.token_out_mint,
      trade.skip_reason,
      trade.error_message,
      trade.trigger_reason,
    ].some((value) => value?.toLowerCase().includes(normalizedQuery));
  });

  return (
    <section className="cyber-panel border border-white/10">
      <div className="border-b border-white/10 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="cyber-command text-[10px] text-[#00E5D4]">Recent Pilot Trades</div>
            <h2 className="mt-2 text-xl font-semibold text-white">Execution feed</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/50">
              Queued, skipped, submitted, failed, and confirmed live-pilot intents. Filters keep the table usable when old failure noise exists.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="cyber-panel-soft flex items-center gap-2 border border-white/10 px-3 py-2">
              <Search size={14} className="text-white/35" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search mint, tx, reason"
                className="w-48 bg-transparent text-sm text-white outline-none placeholder:text-white/28"
              />
            </label>
            <label className="cyber-panel-soft flex items-center gap-2 border border-white/10 px-3 py-2">
              <ListFilter size={14} className="text-white/35" />
              <select
                value={walletFilter}
                onChange={(event) => setWalletFilter(event.target.value)}
                className="bg-black text-sm text-white outline-none"
              >
                <option value="all">All wallets</option>
                {status.walletStatuses.map((wallet) => (
                  <option key={wallet.config.alias} value={wallet.config.alias}>{wallet.config.alias}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {TRADE_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`cyber-command border px-3 py-1.5 text-[10px] transition ${
                statusFilter === filter
                  ? 'border-[#00FF85]/45 bg-[#00FF85]/10 text-[#00FF85]'
                  : 'border-white/10 bg-white/[0.03] text-white/45 hover:text-white/75'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {filteredTrades.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-white/45">
          No pilot trades match the current filters.
        </div>
      ) : (
        <>
          <div className="hidden max-h-[560px] overflow-auto md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-black/95 text-white/45 backdrop-blur">
                <tr className="cyber-table-header border-b border-white/10">
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Wallet</th>
                  <th className="px-4 py-3 font-medium">Trade</th>
                  <th className="px-4 py-3 font-medium">Route Pair</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 font-medium">Tx</th>
                  <th className="px-4 py-3 font-medium">Age</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map((trade) => (
                  <tr key={trade.id} className="cyber-row border-b border-white/[0.06] align-top">
                    <td className="px-4 py-3"><StatusPill tone={statusTone(trade.status)}>{trade.status}</StatusPill></td>
                    <td className="px-4 py-3 font-mono text-white/80">{trade.wallet_alias}</td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-white/80">{trade.leader_type || '-'}</div>
                      <div className="mt-1 text-xs text-white/35">{truncate(trade.star_trader, 6, 6)}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-white/60">{tradePair(trade)}</td>
                    <td className="max-w-[320px] px-4 py-3 text-xs leading-relaxed text-white/55">
                      <span className="line-clamp-3">{trade.skip_reason || trade.error_message || trade.trigger_reason || '-'}</span>
                    </td>
                    <td className="px-4 py-3 text-xs"><SolscanLink signature={trade.tx_signature} /></td>
                    <td className="px-4 py-3 text-xs text-white/45">{formatRelativeTime(trade.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 p-4 md:hidden">
            {filteredTrades.map((trade) => (
              <article key={trade.id} className="cyber-panel-soft border border-white/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <StatusPill tone={statusTone(trade.status)}>{trade.status}</StatusPill>
                    <div className="mt-2 font-mono text-sm text-white">{trade.wallet_alias} · {trade.leader_type || '-'}</div>
                    <div className="mt-1 font-mono text-xs text-white/45">{tradePair(trade)}</div>
                  </div>
                  <div className="text-xs text-white/35">{formatRelativeTime(trade.created_at)}</div>
                </div>
                <div className="mt-3 text-xs leading-relaxed text-white/55">
                  {trade.skip_reason || trade.error_message || trade.trigger_reason || '-'}
                </div>
                <div className="mt-3 text-xs"><SolscanLink signature={trade.tx_signature} /></div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function LivePilotConsole() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [status, setStatus] = useState<LivePilotStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showQuarantinedMints, setShowQuarantinedMints] = useState(false);
  const [showDeadInventory, setShowDeadInventory] = useState(false);
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
          ? 'Resume the live pilot globally? Wallet-level pause and liquidation flags still decide each wallet.'
          : action === 'wallet_liquidate'
            ? `Request liquidation for ${walletAlias}? This pauses that wallet and sets liquidation_requested = true.`
            : action === 'mint_quarantine_clear'
              ? `Clear quarantine for ${extras?.mint}? Future buys of this mint will be allowed again.`
              : null;

    if (confirmMessage && !window.confirm(confirmMessage)) return;

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
    if (authLoading) return;

    if (!isAuthenticated) {
      setLoading(false);
      setStatus(null);
      setError(null);
      return;
    }

    void loadStatus();
  }, [authLoading, isAuthenticated]);

  const automationTone = status?.summary.killSwitchActive
    ? 'danger'
    : status?.summary.globalPaused
      ? 'warn'
      : 'good';
  const automationLabel = status?.summary.killSwitchActive
    ? 'Kill switch'
    : status?.summary.globalPaused
      ? 'Paused'
      : 'Armed';

  return (
    <AuthRequired
      title="Operator Access Required"
      description="Sign in with an allowlisted operator wallet to access the live-pilot control plane."
    >
      <div className="cyber-vault-shell min-h-screen pt-20 text-white">
        <main className="cyber-vault-content px-4 pb-10 md:px-6">
          <section className="cyber-panel mb-4 overflow-hidden border border-white/10 p-4 sm:p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-4xl">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <StatusPill tone={automationTone}>{automationLabel}</StatusPill>
                  {status?.controlPlaneOnly ? <StatusPill>Control plane only</StatusPill> : <StatusPill tone="good">Execution wired</StatusPill>}
                  <StatusPill tone="data">Operator</StatusPill>
                </div>
                <div className="cyber-command text-[10px] text-[#00E5D4]">Live Pilot Command</div>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Execution control and readiness</h1>
                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/55 md:text-base">
                  Manage pause state, wallet readiness, risk quarantine, latency drift, and recent pilot intents before funding or resuming real swaps.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[430px]">
                <ActionButton tone="neutral" disabled={loading || isPending} onClick={loadStatus}>
                  <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                  Refresh
                </ActionButton>
                <ActionButton tone="warn" disabled={!status || isPending} onClick={() => runAction('global_pause')}>
                  <CirclePause size={15} />
                  Global Pause
                </ActionButton>
                <ActionButton tone="good" disabled={!status || isPending} onClick={() => runAction('global_resume')}>
                  <PlayCircle size={15} />
                  Global Resume
                </ActionButton>
                <ActionButton tone="danger" disabled={!status || isPending} onClick={() => runAction('kill_switch_activate')}>
                  <Skull size={15} />
                  Kill Switch
                </ActionButton>
              </div>
            </div>
          </section>

          {error ? (
            <div className="cyber-panel mb-4 border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="cyber-panel flex min-h-[340px] items-center justify-center border border-white/10">
              <div className="flex items-center gap-3 text-sm text-white/50">
                <RefreshCw size={16} className="animate-spin text-[#00FF85]" />
                Loading live-pilot status
              </div>
            </div>
          ) : null}

          {!loading && !status ? (
            <div className="cyber-panel border border-amber-300/30 bg-amber-400/10 p-6">
              <div className="flex items-start gap-3">
                <ShieldAlert size={20} className="mt-0.5 text-amber-200" />
                <div>
                  <h2 className="text-lg font-semibold">
                    {error && /allowlist|Authentication required/i.test(error) ? 'Operator access blocked' : 'Status unavailable'}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-amber-100/80">
                    {error && /allowlist|Authentication required/i.test(error)
                      ? `The signed-in wallet ${truncate(user?.wallet)} is not in PILOT_OPERATOR_WALLETS, or operator auth is not configured.`
                      : 'The live-pilot status route could not build a snapshot. Verify pilot tables, env, Redis, and RPC availability.'}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {status ? (
            <div className="space-y-4">
              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  label="Automation"
                  value={automationLabel}
                  helper={`Global row updated ${formatRelativeTime(status.control.global.updated_at)} by ${truncate(status.control.global.updated_by_wallet)}.`}
                  icon={<Activity size={16} />}
                  tone={automationTone}
                />
                <KpiCard
                  label="Wallet Readiness"
                  value={`${status.summary.healthyWalletCount}/${status.summary.configuredWalletCount}`}
                  helper="Complete, enabled wallet configs. Signer enforcement happens in the worker."
                  icon={<KeyRound size={16} />}
                  tone={status.summary.healthyWalletCount === status.summary.configuredWalletCount ? 'good' : 'warn'}
                />
                <KpiCard
                  label="Recent Intents"
                  value={status.summary.recentTradeCount}
                  helper="Recent parent intent rows returned by the operator feed."
                  icon={<Zap size={16} />}
                  tone="data"
                />
                <KpiCard
                  label="Risk Flags"
                  value={status.quarantinedMints.length + status.walletDeadInventory.length}
                  helper={`${status.quarantinedMints.length} quarantined mints / ${status.walletDeadInventory.length} dead holdings.`}
                  icon={<AlertTriangle size={16} />}
                  tone={status.quarantinedMints.length + status.walletDeadInventory.length > 0 ? 'warn' : 'good'}
                />
              </section>

              <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="cyber-panel border border-white/10 p-4 sm:p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <div className="cyber-command text-[10px] text-[#00E5D4]">Wallet Matrix</div>
                      <h2 className="mt-2 text-xl font-semibold">Pilot wallet command cards</h2>
                    </div>
                    <InfoTooltip>
                      Each wallet can be paused/resumed independently. Global resume does not override unresolved wallet-level liquidation protection.
                    </InfoTooltip>
                  </div>
                  <div className="grid gap-3">
                    {status.walletStatuses.map((wallet) => (
                      <WalletCommandCard
                        key={wallet.config.alias}
                        wallet={wallet}
                        isPending={isPending}
                        runAction={runAction}
                      />
                    ))}
                  </div>
                </div>

                <div className="cyber-panel border border-white/10 p-4 sm:p-5">
                  <div className="cyber-command text-[10px] text-[#00E5D4]">Control State</div>
                  <h2 className="mt-2 text-xl font-semibold">Safety switches</h2>
                  <div className="mt-4 space-y-3">
                    <div className="cyber-panel-soft border border-white/10 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-white/55">Global pause</span>
                        <StatusPill tone={status.control.global.is_paused ? 'warn' : 'good'}>
                          {status.control.global.is_paused ? 'On' : 'Off'}
                        </StatusPill>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-sm text-white/55">Kill switch</span>
                        <StatusPill tone={status.control.global.kill_switch_active ? 'danger' : 'neutral'}>
                          {status.control.global.kill_switch_active ? 'Active' : 'Idle'}
                        </StatusPill>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-sm text-white/55">Global liquidation</span>
                        <StatusPill tone={status.control.global.liquidation_requested ? 'danger' : 'neutral'}>
                          {status.control.global.liquidation_requested ? 'Requested' : 'Clear'}
                        </StatusPill>
                      </div>
                    </div>
                    <div className="cyber-panel-soft border border-white/10 p-4 text-sm leading-relaxed text-white/50">
                      <div className="mb-2 flex items-center gap-2 font-medium text-white/80">
                        <Wallet size={15} className="text-[#00FF85]" />
                        Operator wallet
                      </div>
                      <div className="font-mono text-[#00E5D4]">{truncate(status.operatorWallet, 8, 8)}</div>
                      <div className="mt-2">{status.config.operatorWallets.length} allowlisted operator wallet{status.config.operatorWallets.length === 1 ? '' : 's'}.</div>
                    </div>
                  </div>
                </div>
              </section>

              <LatencyPipeline status={status} />

              {status.config.errors.length > 0 ? (
                <section className="cyber-panel border border-amber-300/30 bg-amber-400/10 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className="mt-0.5 text-amber-200" />
                    <div>
                      <div className="cyber-command text-[10px] text-amber-200">Config Warnings</div>
                      <div className="mt-3 space-y-2 text-sm leading-relaxed text-amber-100/85">
                        {status.config.errors.map((entry) => <p key={entry}>{entry}</p>)}
                      </div>
                    </div>
                  </div>
                </section>
              ) : null}

              <section className="grid gap-4 xl:grid-cols-2">
                <CollapsiblePanel
                  title="Trapped / quarantined mints"
                  count={status.quarantinedMints.length}
                  description="Mints blocked from future buys after sell/liquidation retries identify them as unquotable or trapped."
                  open={showQuarantinedMints}
                  onToggle={() => setShowQuarantinedMints((value) => !value)}
                >
                  {status.quarantinedMints.length === 0 ? (
                    <div className="cyber-panel-soft border border-dashed border-white/12 px-4 py-8 text-center text-sm text-white/45">
                      No quarantined mints.
                    </div>
                  ) : (
                    <div className="max-h-[360px] overflow-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="sticky top-0 bg-black/95 text-white/45">
                          <tr className="cyber-table-header border-b border-white/10">
                            <th className="px-3 py-3 font-medium">Mint</th>
                            <th className="px-3 py-3 font-medium">Wallet</th>
                            <th className="px-3 py-3 font-medium">Reason</th>
                            <th className="px-3 py-3 font-medium">Seen</th>
                            <th className="px-3 py-3 font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {status.quarantinedMints.map((entry) => (
                            <tr key={entry.mint} className="cyber-row border-b border-white/[0.06]">
                              <td className="px-3 py-3 font-mono text-xs text-white/75">{truncate(entry.mint, 6, 6)}</td>
                              <td className="px-3 py-3 text-white/55">{entry.first_wallet_alias || '-'}</td>
                              <td className="px-3 py-3 text-white/55">{entry.reason}</td>
                              <td className="px-3 py-3 text-white/45">{formatRelativeTime(entry.last_detected_at)}</td>
                              <td className="px-3 py-3">
                                <ActionButton
                                  disabled={isPending}
                                  onClick={() => runAction('mint_quarantine_clear', undefined, { mint: entry.mint })}
                                >
                                  Clear
                                </ActionButton>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CollapsiblePanel>

                <CollapsiblePanel
                  title="Active dead inventory"
                  count={status.walletDeadInventory.length}
                  description="Quarantined holdings left in pilot wallets. They should stay visible but not block access to the execution feed."
                  open={showDeadInventory}
                  onToggle={() => setShowDeadInventory((value) => !value)}
                >
                  {status.walletDeadInventory.length === 0 ? (
                    <div className="cyber-panel-soft border border-dashed border-white/12 px-4 py-8 text-center text-sm text-white/45">
                      No quarantined wallet inventory.
                    </div>
                  ) : (
                    <div className="max-h-[360px] overflow-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="sticky top-0 bg-black/95 text-white/45">
                          <tr className="cyber-table-header border-b border-white/10">
                            <th className="px-3 py-3 font-medium">Wallet</th>
                            <th className="px-3 py-3 font-medium">Mint</th>
                            <th className="px-3 py-3 font-medium">Amount</th>
                            <th className="px-3 py-3 font-medium">Est. SOL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {status.walletDeadInventory.map((entry) => (
                            <tr key={`${entry.walletAlias}:${entry.mint}`} className="cyber-row border-b border-white/[0.06]">
                              <td className="px-3 py-3">{entry.walletAlias}</td>
                              <td className="px-3 py-3">
                                <div className="text-white/75">{entry.symbol}</div>
                                <div className="font-mono text-xs text-white/35">{truncate(entry.mint, 6, 6)}</div>
                              </td>
                              <td className="px-3 py-3 font-mono text-white/65">{entry.uiAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                              <td className="px-3 py-3 font-mono text-white/65">{formatEstimatedSol(entry.estimatedSolValue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CollapsiblePanel>
              </section>

              <RecentTradesFeed status={status} />
            </div>
          ) : null}
        </main>
      </div>
    </AuthRequired>
  );
}
