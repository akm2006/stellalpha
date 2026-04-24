'use client';

import { useEffect, useMemo, useState } from 'react';
import { AuthRequired } from '@/components/auth-required';
import { InfoTooltip } from '@/components/cyber/tooltip';
import { MetricTile } from '@/components/cyber/metric-tile';
import { TraderAvatar } from '@/components/cyber/trader-avatar';
import { CopyModelBadge } from '@/components/trading/copy-model-badge';
import {
  COPY_BUY_MODEL_DEFINITIONS,
  getCopyBuyModelDefinition,
  getDefaultCopyBuyModelConfig,
  parseCopyBuyModelSelection,
} from '@/lib/copy-models/catalog';
import type { CopyBuyModelConfig, CopyBuyModelKey } from '@/lib/copy-models/types';
import type { ManagedStarTrader, WebhookOnlyAddress } from '@/lib/star-trader-management/types';
import { useAuth } from '@/contexts/auth-context';
import {
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Link2,
  Trash2,
  Pencil,
  X,
} from 'lucide-react';

type StatusFilter = 'all' | 'drift' | 'not_set';

interface OperatorStarTraderResponse {
  operatorWallet: string;
  traders: ManagedStarTrader[];
  webhookOnlyAddresses: WebhookOnlyAddress[];
  supportsExtendedFields: boolean;
  webhookConfigured: boolean;
  webhookError: string | null;
}

interface FormState {
  wallet: string;
  name: string;
  imageUrl: string;
  recommendedCopyModelKey: CopyBuyModelKey | '';
  recommendedCopyModelConfig: CopyBuyModelConfig;
  recommendedCopyModelReason: string;
  operatorNotes: string;
}

function truncate(value: string, left = 6, right = 4) {
  if (value.length <= left + right + 3) return value;
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

function formatRelativeTime(value: string | null) {
  if (!value) return '—';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '—';
  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
}

function emptyFormState(): FormState {
  return {
    wallet: '',
    name: '',
    imageUrl: '',
    recommendedCopyModelKey: '',
    recommendedCopyModelConfig: getDefaultCopyBuyModelConfig('hybrid_envelope_leader_ratio'),
    recommendedCopyModelReason: '',
    operatorNotes: '',
  };
}

function formStateFromTrader(trader: ManagedStarTrader): FormState {
  return {
    wallet: trader.wallet,
    name: trader.rawName || '',
    imageUrl: trader.rawImageUrl || '',
    recommendedCopyModelKey: trader.recommendation?.modelKey || '',
    recommendedCopyModelConfig:
      trader.recommendation?.config || getDefaultCopyBuyModelConfig('hybrid_envelope_leader_ratio'),
    recommendedCopyModelReason: trader.recommendation?.reason || '',
    operatorNotes: trader.operatorNotes || '',
  };
}

function getSyncTone(syncStatus: ManagedStarTrader['syncStatus'] | WebhookOnlyAddress['syncStatus']) {
  switch (syncStatus) {
    case 'in_sync':
      return 'border-emerald-400/45 bg-emerald-400/10 text-emerald-300';
    case 'db_only':
    case 'webhook_only':
      return 'border-amber-400/45 bg-amber-400/10 text-amber-300';
    case 'webhook_error':
      return 'border-red-400/45 bg-red-500/10 text-red-200';
    case 'webhook_unconfigured':
      return 'border-cyan-300/40 bg-cyan-300/10 text-cyan-200';
  }
}

function getSyncLabel(syncStatus: ManagedStarTrader['syncStatus'] | WebhookOnlyAddress['syncStatus']) {
  switch (syncStatus) {
    case 'in_sync':
      return 'In Sync';
    case 'db_only':
      return 'DB Only';
    case 'webhook_only':
      return 'Webhook Only';
    case 'webhook_error':
      return 'Webhook Error';
    case 'webhook_unconfigured':
      return 'Webhook Off';
  }
}

function RecommendationCell({ trader }: { trader: ManagedStarTrader }) {
  if (!trader.recommendation) {
    return <span className="inline-flex border border-white/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Not Set</span>;
  }

  return (
    <CopyModelBadge
      modelKey={trader.recommendation.modelKey}
      config={trader.recommendation.config}
      summary={trader.recommendation.summary}
    />
  );
}

export function StarTraderManagementConsole() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<OperatorStarTraderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTrader, setEditingTrader] = useState<ManagedStarTrader | null>(null);
  const [formState, setFormState] = useState<FormState>(emptyFormState);
  const [saving, setSaving] = useState(false);
  const [syncingWebhook, setSyncingWebhook] = useState(false);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/operator/star-traders', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setData(null);
        setError(payload.error || 'Failed to load star-trader management state');
        return;
      }

      setData(payload as OperatorStarTraderResponse);
    } catch (fetchError: any) {
      setData(null);
      setError(fetchError?.message || 'Failed to load star-trader management state');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setLoading(false);
      setData(null);
      return;
    }
    void loadData();
  }, [authLoading, isAuthenticated]);

  const filteredTraders = useMemo(() => {
    const rows = data?.traders || [];
    const normalizedQuery = query.trim().toLowerCase();

    return rows.filter((trader) => {
      const matchesQuery = !normalizedQuery
        || trader.name.toLowerCase().includes(normalizedQuery)
        || trader.wallet.toLowerCase().includes(normalizedQuery);

      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'drift'
            ? trader.syncStatus === 'db_only' || trader.syncStatus === 'webhook_error'
            : trader.recommendation === null;

      return matchesQuery && matchesStatus;
    });
  }, [data?.traders, query, statusFilter]);

  const summary = useMemo(() => {
    const traders = data?.traders || [];
    return {
      total: traders.length,
      recommendationMissing: traders.filter((trader) => trader.recommendation === null).length,
      drift: traders.filter((trader) => trader.syncStatus === 'db_only' || trader.syncStatus === 'webhook_error').length,
      webhookOnly: data?.webhookOnlyAddresses.length || 0,
    };
  }, [data]);

  function openCreateModal() {
    setEditingTrader(null);
    setFormState(emptyFormState());
    setIsModalOpen(true);
  }

  function openCreateModalForWallet(wallet: string) {
    setEditingTrader(null);
    setFormState({
      ...emptyFormState(),
      wallet,
    });
    setIsModalOpen(true);
  }

  function openEditModal(trader: ManagedStarTrader) {
    setEditingTrader(trader);
    setFormState(formStateFromTrader(trader));
    setIsModalOpen(true);
  }

  function closeModal() {
    if (!saving) setIsModalOpen(false);
  }

  function updateModelKey(rawValue: string) {
    if (!rawValue) {
      setFormState((current) => ({
        ...current,
        recommendedCopyModelKey: '',
        recommendedCopyModelConfig: getDefaultCopyBuyModelConfig('hybrid_envelope_leader_ratio'),
      }));
      return;
    }

    const modelKey = rawValue as CopyBuyModelKey;
    setFormState((current) => ({
      ...current,
      recommendedCopyModelKey: modelKey,
      recommendedCopyModelConfig: getDefaultCopyBuyModelConfig(modelKey),
    }));
  }

  function updateModelField(fieldKey: string, rawValue: string) {
    if (!formState.recommendedCopyModelKey) return;
    const numeric = Number(rawValue);
    setFormState((current) => {
      const nextRawConfig = {
        ...(current.recommendedCopyModelConfig as Record<string, unknown>),
        [fieldKey]: Number.isFinite(numeric) ? numeric : rawValue,
      };
      const normalizedSelection = parseCopyBuyModelSelection(
        current.recommendedCopyModelKey as CopyBuyModelKey,
        nextRawConfig,
      );

      return {
        ...current,
        recommendedCopyModelConfig: normalizedSelection.config,
      };
    });
  }

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      wallet: formState.wallet,
      name: formState.name,
      imageUrl: formState.imageUrl || null,
      recommendedCopyModelKey: formState.recommendedCopyModelKey || null,
      recommendedCopyModelConfig: formState.recommendedCopyModelKey ? formState.recommendedCopyModelConfig : null,
      recommendedCopyModelReason: formState.recommendedCopyModelKey ? formState.recommendedCopyModelReason : null,
      operatorNotes: formState.operatorNotes,
    };

    try {
      const response = await fetch(
        editingTrader ? `/api/operator/star-traders/${editingTrader.wallet}` : '/api/operator/star-traders',
        {
          method: editingTrader ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(result.error || 'Failed to save star trader');
        return;
      }

      await loadData();
      setIsModalOpen(false);
    } catch (requestError: any) {
      setError(requestError?.message || 'Failed to save star trader');
    } finally {
      setSaving(false);
    }
  }

  async function deleteTrader(trader: ManagedStarTrader) {
    if (!window.confirm(`Remove ${trader.name}? This deletes the database row and removes the wallet from webhook tracking.`)) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/operator/star-traders/${trader.wallet}`, {
        method: 'DELETE',
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(result.error || 'Failed to remove star trader');
        return;
      }

      await loadData();
    } catch (requestError: any) {
      setError(requestError?.message || 'Failed to remove star trader');
    } finally {
      setSaving(false);
    }
  }

  async function syncTrackedWalletsToWebhook() {
    setSyncingWebhook(true);
    setError(null);
    try {
      const response = await fetch('/api/operator/star-traders/sync', {
        method: 'POST',
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(result.error || 'Failed to sync tracked wallets to webhook');
        return;
      }

      await loadData();
    } catch (requestError: any) {
      setError(requestError?.message || 'Failed to sync tracked wallets to webhook');
    } finally {
      setSyncingWebhook(false);
    }
  }

  async function removeWebhookOrphan(wallet: string) {
    if (!window.confirm(`Remove ${wallet} from the webhook watched-address list?`)) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/operator/star-traders/orphans/${wallet}`, {
        method: 'DELETE',
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(result.error || 'Failed to remove webhook-only wallet');
        return;
      }

      await loadData();
    } catch (requestError: any) {
      setError(requestError?.message || 'Failed to remove webhook-only wallet');
    } finally {
      setSaving(false);
    }
  }

  const modelDefinition = formState.recommendedCopyModelKey
    ? getCopyBuyModelDefinition(formState.recommendedCopyModelKey)
    : null;
  const normalizedPreview = formState.recommendedCopyModelKey
    ? parseCopyBuyModelSelection(formState.recommendedCopyModelKey, formState.recommendedCopyModelConfig)
    : null;

  return (
    <AuthRequired
      title="Operator Access Required"
      description="Sign in with an allowlisted operator wallet to manage tracked star traders."
    >
      <div className="min-h-screen px-4 py-8 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4">
          <section className="cyber-panel overflow-hidden border p-5 md:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-4xl">
                <div className="cyber-command mb-3 text-[10px] text-white/55">Operator Console</div>
                <h1 className="font-mono text-2xl font-semibold uppercase tracking-[0.12em] text-white md:text-3xl">
                  Star Trader Management
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                  Add, edit, and remove tracked star traders from one operator-only surface. Recommendations are now stored on the trader row itself, while user-facing pages fall back to the default hybrid model when no recommendation is set.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void loadData()}
                  disabled={loading || saving || syncingWebhook}
                  className="cyber-control inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white"
                >
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => void syncTrackedWalletsToWebhook()}
                  disabled={loading || saving || syncingWebhook}
                  className="cyber-control inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white"
                >
                  {syncingWebhook ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />}
                  Sync Webhook
                </button>
                <button
                  type="button"
                  onClick={openCreateModal}
                  disabled={saving || syncingWebhook}
                  className="cyber-action-primary inline-flex items-center gap-2 border border-emerald-400/50 bg-emerald-400/15 px-4 py-2 text-sm font-semibold text-emerald-200"
                >
                  <Plus size={16} />
                  Add Star Trader
                </button>
              </div>
            </div>
          </section>

          {error ? (
            <div className="cyber-panel border border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {data?.supportsExtendedFields === false ? (
            <div className="cyber-panel border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              The new star-trader management columns are not applied yet. Run the star-trader management schema SQL before using create or edit.
            </div>
          ) : null}

          {data && (!data.webhookConfigured || data.webhookError) ? (
            <div className="cyber-panel border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
              {!data.webhookConfigured
                ? 'HELIUS_STAR_TRADERS_WEBHOOK_ID is not configured. The operator page cannot keep webhook tracking in sync yet.'
                : `Webhook status check failed: ${data.webhookError}`}
            </div>
          ) : null}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricTile label="Tracked Rows" value={summary.total} helper="Total star-trader rows in the database." />
            <MetricTile label="Recommendation Not Set" value={summary.recommendationMissing} helper="User pages will default these traders to the hybrid envelope recommendation." tone={summary.recommendationMissing > 0 ? 'warning' : 'neutral'} />
            <MetricTile label="Sync Drift" value={summary.drift} helper="Rows present in the database but not confirmed in the webhook state." tone={summary.drift > 0 ? 'warning' : 'neutral'} />
            <MetricTile label="Webhook Orphans" value={summary.webhookOnly} helper="Wallets still present in Helius without a matching database row." tone={summary.webhookOnly > 0 ? 'warning' : 'neutral'} />
          </section>

          <section className="cyber-panel border p-4 md:p-5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-1 flex-col gap-3 md:flex-row">
                <label className="cyber-control flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-sm text-white/60">
                  <Search size={15} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search name or wallet"
                    className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/25"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {([
                    ['all', 'All'],
                    ['drift', 'Drift'],
                    ['not_set', 'Not Set'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setStatusFilter(value)}
                      className={`cyber-control px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] ${
                        statusFilter === value
                          ? 'border-emerald-400/60 bg-emerald-400/12 text-emerald-200'
                          : 'text-white/70'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-xs uppercase tracking-[0.14em] text-white/45">
                Showing {filteredTraders.length} of {summary.total}
              </div>
            </div>
          </section>

          {loading ? (
            <div className="cyber-panel flex min-h-[260px] items-center justify-center border">
              <div className="flex items-center gap-3 text-sm text-white/55">
                <Loader2 size={18} className="animate-spin" />
                Loading operator star-trader state…
              </div>
            </div>
          ) : null}

          {!loading && data ? (
            <>
              <section className="cyber-panel hidden overflow-hidden border md:block">
                <div className="grid grid-cols-[minmax(260px,1.2fr)_140px_220px_minmax(240px,1fr)_120px_240px] gap-3 border-b border-white/[0.08] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
                  <div>Trader</div>
                  <div>Sync</div>
                  <div>Suggested Copy Style</div>
                  <div>Reason</div>
                  <div>Updated</div>
                  <div>Actions</div>
                </div>

                {filteredTraders.length === 0 ? (
                  <div className="px-5 py-12 text-center text-sm text-white/45">No star traders match the current filters.</div>
                ) : (
                  filteredTraders.map((trader) => (
                    <div
                      key={trader.wallet}
                      className="cyber-row grid grid-cols-[minmax(260px,1.2fr)_140px_220px_minmax(240px,1fr)_120px_240px] gap-3 border-b border-white/[0.06] px-5 py-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <TraderAvatar address={trader.wallet} image={trader.image} className="h-10 w-10" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white">{trader.name}</div>
                          <div className="mt-1 font-mono text-xs text-white/45">{truncate(trader.wallet, 8, 6)}</div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <span className={`inline-flex items-center border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${getSyncTone(trader.syncStatus)}`}>
                          {getSyncLabel(trader.syncStatus)}
                        </span>
                        <p className="text-xs leading-5 text-white/45">{trader.syncMessage}</p>
                      </div>

                      <div className="flex items-start">
                        <RecommendationCell trader={trader} />
                      </div>

                      <div className="text-sm leading-6 text-white/65">
                        {trader.recommendation?.reason || 'Not set'}
                      </div>

                      <div className="text-sm text-white/55">{formatRelativeTime(trader.updatedAt || trader.createdAt)}</div>

                      <div className="flex flex-wrap items-start gap-2">
                        {(trader.syncStatus === 'db_only' || trader.syncStatus === 'webhook_error') ? (
                          <button
                            type="button"
                            onClick={() => void syncTrackedWalletsToWebhook()}
                            disabled={saving || syncingWebhook}
                            className="cyber-control inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-40"
                          >
                            {syncingWebhook ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                            Sync All
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openEditModal(trader)}
                          className="cyber-control inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-white"
                        >
                          <Pencil size={14} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteTrader(trader)}
                          disabled={saving}
                          className="cyber-control inline-flex items-center gap-2 border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 disabled:opacity-40"
                        >
                          <Trash2 size={14} />
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </section>

              <section className="grid gap-3 md:hidden">
                {filteredTraders.length === 0 ? (
                  <div className="cyber-panel border px-4 py-10 text-center text-sm text-white/45">No star traders match the current filters.</div>
                ) : (
                  filteredTraders.map((trader) => (
                    <article key={trader.wallet} className="cyber-panel-soft border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <TraderAvatar address={trader.wallet} image={trader.image} className="h-10 w-10" />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">{trader.name}</div>
                            <div className="mt-1 font-mono text-xs text-white/45">{truncate(trader.wallet, 8, 6)}</div>
                          </div>
                        </div>
                        <span className={`inline-flex items-center border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${getSyncTone(trader.syncStatus)}`}>
                          {getSyncLabel(trader.syncStatus)}
                        </span>
                      </div>

                      <div className="mt-3">
                        <RecommendationCell trader={trader} />
                      </div>

                      <p className="mt-3 text-sm leading-6 text-white/65">
                        {trader.recommendation?.reason || 'Recommendation not set'}
                      </p>

                      <div className="mt-3 text-xs text-white/45">
                        Updated {formatRelativeTime(trader.updatedAt || trader.createdAt)}
                      </div>

                      <div className="mt-4 flex gap-2">
                        {(trader.syncStatus === 'db_only' || trader.syncStatus === 'webhook_error') ? (
                          <button
                            type="button"
                            onClick={() => void syncTrackedWalletsToWebhook()}
                            disabled={saving || syncingWebhook}
                            className="cyber-control flex-1 px-3 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-40"
                          >
                            Sync All
                          </button>
                        ) : null}
                        <button type="button" onClick={() => openEditModal(trader)} className="cyber-control flex-1 px-3 py-2 text-xs font-semibold text-white">
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteTrader(trader)}
                          disabled={saving}
                          className="cyber-control flex-1 border-red-400/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </section>

              <section className="cyber-panel border p-4 md:p-5">
                <div className="mb-3 flex items-center gap-2">
                  <ShieldAlert size={16} className="text-amber-300" />
                  <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-white">Webhook Orphans</h2>
                  <InfoTooltip>
                    These wallets still exist in the Helius watched-address list, but the app has no matching row in <code>star_traders</code>.
                  </InfoTooltip>
                </div>

                {data.webhookOnlyAddresses.length === 0 ? (
                  <div className="cyber-panel-soft border border-dashed border-white/12 px-4 py-8 text-center text-sm text-white/45">
                    No webhook-only wallets right now.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {data.webhookOnlyAddresses.map((entry) => (
                      <div key={entry.wallet} className={`inline-flex items-center gap-2 border px-3 py-1.5 font-mono text-xs ${getSyncTone(entry.syncStatus)}`}>
                        <span>{truncate(entry.wallet, 8, 6)}</span>
                        <button
                          type="button"
                          onClick={() => openCreateModalForWallet(entry.wallet)}
                          disabled={saving || syncingWebhook}
                          className="border border-current/35 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] disabled:opacity-40"
                        >
                          Create Row
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeWebhookOrphan(entry.wallet)}
                          disabled={saving || syncingWebhook}
                          className="border border-current/35 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 px-4 py-6">
          <div className="cyber-panel flex max-h-[min(92vh,900px)] w-full max-w-3xl flex-col overflow-hidden border bg-[#050505]">
            <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-5 py-5">
              <div>
                <div className="cyber-command mb-2 text-[10px] text-white/50">
                  {editingTrader ? 'Edit Tracked Trader' : 'Create Tracked Trader'}
                </div>
                <h2 className="text-xl font-semibold text-white">
                  {editingTrader ? editingTrader.name : 'Add Star Trader'}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="cyber-control inline-flex h-9 w-9 items-center justify-center text-white/70"
              >
                <X size={16} />
              </button>
            </div>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void submitForm(event)}>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <section className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">Wallet</span>
                  <input
                    value={formState.wallet}
                    onChange={(event) => setFormState((current) => ({ ...current, wallet: event.target.value }))}
                    disabled={Boolean(editingTrader)}
                    className="cyber-control px-3 py-3 text-sm text-white disabled:opacity-50"
                    placeholder="Star trader wallet"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">Display Name</span>
                  <input
                    value={formState.name}
                    onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                    className="cyber-control px-3 py-3 text-sm text-white"
                    placeholder="Trader display name"
                  />
                </label>

                <label className="md:col-span-2 flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">Profile Image URL</span>
                  <input
                    value={formState.imageUrl}
                    onChange={(event) => setFormState((current) => ({ ...current, imageUrl: event.target.value }))}
                    className="cyber-control px-3 py-3 text-sm text-white"
                    placeholder="https://..."
                  />
                </label>
              </section>

              <section className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">Suggested Copy Style</span>
                  <select
                    value={formState.recommendedCopyModelKey}
                    onChange={(event) => updateModelKey(event.target.value)}
                    className="cyber-control px-3 py-3 text-sm text-white"
                  >
                    <option value="" className="bg-[#050505] text-white">Not set</option>
                    {COPY_BUY_MODEL_DEFINITIONS.map((definition) => (
                      <option key={definition.key} value={definition.key} className="bg-[#050505] text-white">
                        {definition.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs leading-5 text-white/45">
                    {modelDefinition?.shortDescription || 'Leave unset to let user-facing pages default to the hybrid envelope model.'}
                  </span>
                </label>

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">Preview</span>
                  <div className="cyber-panel-soft flex min-h-[54px] items-center border px-3 py-3">
                    {normalizedPreview ? (
                      <CopyModelBadge
                        modelKey={normalizedPreview.modelKey}
                        config={normalizedPreview.config}
                        summary={getCopyBuyModelDefinition(normalizedPreview.modelKey).shortDescription}
                      />
                    ) : (
                      <span className="text-sm text-white/45">Not set</span>
                    )}
                  </div>
                </div>

                {modelDefinition?.fields.map((field) => (
                  <label key={field.key} className="flex flex-col gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">{field.label}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={String((formState.recommendedCopyModelConfig as Record<string, unknown>)[field.key] ?? '')}
                      onChange={(event) => updateModelField(field.key, event.target.value)}
                      className="cyber-control px-3 py-3 text-sm text-white"
                      placeholder={`${field.min} - ${field.max}`}
                    />
                  </label>
                ))}

                <label className="md:col-span-2 flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">Why this style is recommended</span>
                  <textarea
                    value={formState.recommendedCopyModelReason}
                    onChange={(event) => setFormState((current) => ({ ...current, recommendedCopyModelReason: event.target.value }))}
                    rows={3}
                    className="cyber-control px-3 py-3 text-sm text-white"
                    placeholder="Short operator-facing reason"
                  />
                </label>

                <label className="md:col-span-2 flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">Operator Notes</span>
                  <textarea
                    value={formState.operatorNotes}
                    onChange={(event) => setFormState((current) => ({ ...current, operatorNotes: event.target.value }))}
                    rows={3}
                    className="cyber-control px-3 py-3 text-sm text-white"
                    placeholder="Private notes for operator review"
                  />
                </label>
              </section>

              <section className="cyber-panel-soft mt-5 border p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/55">
                  Review Before Save
                  <InfoTooltip>
                    This action updates the database row. Tracked wallets are always kept on the Helius watched-address list until the row is removed.
                  </InfoTooltip>
                </div>
                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <div className="text-white/70">Wallet: <span className="font-mono text-white">{formState.wallet || '—'}</span></div>
                  <div className="text-white/70">Recommendation: <span className="text-white">{formState.recommendedCopyModelKey || 'Not set'}</span></div>
                </div>
              </section>
              </div>

              <div className="flex flex-wrap justify-end gap-3 border-t border-white/[0.08] px-5 py-4">
                <button type="button" onClick={closeModal} className="cyber-control px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-white/70">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || syncingWebhook}
                  className="cyber-action-primary inline-flex items-center gap-2 border border-emerald-400/60 bg-emerald-400/14 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  {editingTrader ? 'Save Changes' : 'Create Trader'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </AuthRequired>
  );
}
