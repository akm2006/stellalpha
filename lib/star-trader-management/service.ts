import { formatCopyBuyModelConfigSummary, formatCopyBuyModelLabel } from '@/lib/copy-models/format';
import { supabase } from '@/lib/supabase';
import {
  getHeliusStarTraderWebhook,
  isHeliusStarTraderWebhookConfigured,
  updateHeliusStarTraderWebhookAddresses,
} from '@/lib/star-trader-management/helius';
import {
  getStarTraderRecord,
  listStarTraderRecords,
  resolveStarTraderDisplayName,
  resolveStarTraderImage,
  resolveStoredRecommendationFromRecord,
  resolveUserRecommendationFromRecord,
} from '@/lib/star-trader-management/repository';
import type {
  ManagedStarTrader,
  StarTraderManagementListResult,
  StarTraderRecord,
  UpsertManagedStarTraderInput,
} from '@/lib/star-trader-management/types';
import { StarTraderManagementError } from '@/lib/star-trader-management/types';

function buildManagedTrader(
  record: StarTraderRecord,
  webhookAddresses: Set<string>,
  webhookConfigured: boolean,
  webhookError: string | null,
): ManagedStarTrader {
  const recommendation = resolveStoredRecommendationFromRecord(record);
  const inWebhook = webhookAddresses.has(record.address);
  const syncStatus = !webhookConfigured
    ? 'webhook_unconfigured'
    : webhookError
      ? 'webhook_error'
      : (inWebhook ? 'in_sync' : 'db_only');
  const syncMessage = !webhookConfigured
    ? 'Webhook ID not configured'
    : webhookError
      ? webhookError
      : (inWebhook ? 'Tracked in database and webhook' : 'Present in database but missing from webhook');

  return {
    wallet: record.address,
    name: resolveStarTraderDisplayName(record),
    image: resolveStarTraderImage(record),
    rawName: record.name,
    rawImageUrl: record.image_url,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    operatorNotes: record.operator_notes,
    recommendation: recommendation
      ? {
          ...recommendation,
          label: formatCopyBuyModelLabel(recommendation.modelKey),
          summary: formatCopyBuyModelConfigSummary(recommendation.modelKey, recommendation.config),
        }
      : null,
    syncStatus,
    syncMessage,
  };
}

async function assertExtendedSchema() {
  const { supportsExtendedFields } = await listStarTraderRecords();
  if (!supportsExtendedFields) {
    throw new StarTraderManagementError(
      500,
      'star_trader_schema_missing',
      'The star_traders management columns are not available yet. Run the operator star-trader schema SQL first.',
    );
  }
}

async function getWebhookState() {
  let webhookAddresses = new Set<string>();
  let webhookConfigured = isHeliusStarTraderWebhookConfigured();
  let webhookError: string | null = null;

  if (webhookConfigured) {
    try {
      const webhook = await getHeliusStarTraderWebhook();
      webhookAddresses = new Set(webhook.accountAddresses || []);
    } catch (error: any) {
      webhookError = error?.message || 'Failed to load webhook state';
    }
  }

  return { webhookAddresses, webhookConfigured, webhookError };
}

async function syncWebhookAddresses(nextWallets: string[]) {
  if (!isHeliusStarTraderWebhookConfigured()) {
    throw new StarTraderManagementError(
      500,
      'helius_webhook_unconfigured',
      'HELIUS_STAR_TRADERS_WEBHOOK_ID is not configured',
    );
  }

  return updateHeliusStarTraderWebhookAddresses(nextWallets);
}

function buildStarTraderRow(
  wallet: string,
  input: UpsertManagedStarTraderInput,
  timestamps?: { createdAt?: string | null; updatedAt?: string | null },
) {
  return {
    address: wallet,
    name: input.name || `Trader ${wallet.slice(0, 6)}`,
    image_url: input.imageUrl,
    recommended_copy_model_key: input.recommendedCopyModelKey || null,
    recommended_copy_model_config: input.recommendedCopyModelKey
      ? (input.recommendedCopyModelConfig || {})
      : null,
    recommended_copy_model_reason: input.recommendedCopyModelReason || null,
    operator_notes: input.operatorNotes,
    created_at: timestamps?.createdAt,
    updated_at: timestamps?.updatedAt,
  };
}

function buildStarTraderRowFromRecord(record: StarTraderRecord) {
  return {
    address: record.address,
    name: record.name,
    image_url: record.image_url,
    recommended_copy_model_key: record.recommended_copy_model_key,
    recommended_copy_model_config: record.recommended_copy_model_key
      ? (record.recommended_copy_model_config || {})
      : null,
    recommended_copy_model_reason: record.recommended_copy_model_reason,
    operator_notes: record.operator_notes,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

async function rollbackCreatedStarTrader(wallet: string) {
  const { error } = await supabase
    .from('star_traders')
    .delete()
    .eq('address', wallet);

  return !error;
}

async function restoreDeletedStarTrader(record: StarTraderRecord) {
  const { error } = await supabase
    .from('star_traders')
    .upsert(buildStarTraderRowFromRecord(record), { onConflict: 'address' });

  return !error;
}

export async function listManagedStarTraders(): Promise<StarTraderManagementListResult> {
  const { records, supportsExtendedFields } = await listStarTraderRecords();
  const { webhookAddresses, webhookConfigured, webhookError } = await getWebhookState();

  const traders = records.map((record) =>
    buildManagedTrader(record, webhookAddresses, webhookConfigured, webhookError),
  );

  const dbWallets = new Set(records.map((record) => record.address));
  const webhookOnlyAddresses = Array.from(webhookAddresses)
    .filter((wallet) => !dbWallets.has(wallet))
    .sort((a, b) => a.localeCompare(b))
    .map((wallet) => ({
      wallet,
      syncStatus: 'webhook_only' as const,
      syncMessage: 'Present in webhook but missing from database',
    }));

  return {
    traders,
    webhookOnlyAddresses,
    supportsExtendedFields,
    webhookConfigured,
    webhookError,
  };
}

export async function createManagedStarTrader(input: UpsertManagedStarTraderInput) {
  await assertExtendedSchema();

  if (!input.wallet) {
    throw new StarTraderManagementError(400, 'wallet_required', 'Wallet address is required');
  }

  const existing = await getStarTraderRecord(input.wallet);
  if (existing.record) {
    throw new StarTraderManagementError(409, 'star_trader_exists', 'Star trader already exists');
  }

  const { records } = await listStarTraderRecords();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('star_traders')
    .insert(buildStarTraderRow(input.wallet, input, { createdAt: now, updatedAt: now }));

  if (error) {
    throw new StarTraderManagementError(500, 'db_insert_failed', error.message, {
      wallet: input.wallet,
    });
  }

  try {
    await syncWebhookAddresses([...records.map((record) => record.address), input.wallet]);
  } catch (error: any) {
    const rolledBack = await rollbackCreatedStarTrader(input.wallet);
    throw new StarTraderManagementError(
      500,
      'helius_webhook_sync_failed',
      error?.message || 'Failed to sync Helius webhook after creating star trader',
      {
        wallet: input.wallet,
        rolledBack,
        driftDetected: !rolledBack,
      },
    );
  }

  const { record } = await getStarTraderRecord(input.wallet);
  if (!record) {
    throw new StarTraderManagementError(500, 'star_trader_missing', 'Star trader was created but could not be reloaded');
  }

  const { webhookAddresses, webhookConfigured, webhookError } = await getWebhookState();
  return {
    trader: buildManagedTrader(record, webhookAddresses, webhookConfigured, webhookError),
  };
}

export async function updateManagedStarTrader(wallet: string, input: UpsertManagedStarTraderInput) {
  await assertExtendedSchema();

  const current = await getStarTraderRecord(wallet);
  if (!current.record) {
    throw new StarTraderManagementError(404, 'star_trader_not_found', 'Star trader not found');
  }

  const { error } = await supabase
    .from('star_traders')
    .update({
      name: input.name || `Trader ${wallet.slice(0, 6)}`,
      image_url: input.imageUrl,
      recommended_copy_model_key: input.recommendedCopyModelKey || null,
      recommended_copy_model_config: input.recommendedCopyModelKey
        ? (input.recommendedCopyModelConfig || {})
        : null,
      recommended_copy_model_reason: input.recommendedCopyModelReason || null,
      operator_notes: input.operatorNotes,
      updated_at: new Date().toISOString(),
    })
    .eq('address', wallet);

  if (error) {
    throw new StarTraderManagementError(500, 'db_update_failed', error.message, { wallet });
  }

  const { record } = await getStarTraderRecord(wallet);
  if (!record) {
    throw new StarTraderManagementError(500, 'star_trader_missing', 'Star trader could not be reloaded after update');
  }

  const { webhookAddresses, webhookConfigured, webhookError } = await getWebhookState();
  return {
    trader: buildManagedTrader(record, webhookAddresses, webhookConfigured, webhookError),
  };
}

export async function deleteManagedStarTrader(wallet: string) {
  const current = await getStarTraderRecord(wallet);
  if (!current.record) {
    throw new StarTraderManagementError(404, 'star_trader_not_found', 'Star trader not found');
  }

  const { records } = await listStarTraderRecords();
  const nextWallets = records
    .filter((record) => record.address !== wallet)
    .map((record) => record.address);

  const { error } = await supabase
    .from('star_traders')
    .delete()
    .eq('address', wallet);

  if (error) {
    throw new StarTraderManagementError(500, 'db_delete_failed', error.message, {
      wallet,
    });
  }

  try {
    await syncWebhookAddresses(nextWallets);
  } catch (error: any) {
    const rolledBack = await restoreDeletedStarTrader(current.record);
    throw new StarTraderManagementError(
      500,
      'helius_webhook_sync_failed',
      error?.message || 'Failed to sync Helius webhook after deleting star trader',
      {
        wallet,
        rolledBack,
        driftDetected: !rolledBack,
      },
    );
  }

  return {
    success: true,
    wallet,
  };
}

export async function deleteWebhookOnlyWallet(wallet: string) {
  const existing = await getStarTraderRecord(wallet);
  if (existing.record) {
    throw new StarTraderManagementError(
      409,
      'wallet_exists_in_db',
      'This wallet still exists in the database. Remove the tracked trader row instead.',
      { wallet },
    );
  }

  const { webhookAddresses } = await getWebhookState();
  if (!webhookAddresses.has(wallet)) {
    throw new StarTraderManagementError(404, 'webhook_wallet_not_found', 'Wallet is not present in the webhook', { wallet });
  }

  const nextWallets = Array.from(webhookAddresses).filter((address) => address !== wallet);
  await syncWebhookAddresses(nextWallets);

  return {
    success: true,
    wallet,
  };
}

export async function syncWebhookToTrackedStarTraders() {
  const { records } = await listStarTraderRecords();
  const nextWallets = records.map((record) => record.address);
  const webhook = await syncWebhookAddresses(nextWallets);

  return {
    syncedWalletCount: nextWallets.length,
    webhookWalletCount: webhook.accountAddresses.length,
  };
}

export async function getRecommendedCopyModelForStarTrader(wallet: string) {
  const { record } = await getStarTraderRecord(wallet);
  return resolveUserRecommendationFromRecord(record);
}
