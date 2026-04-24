import type { CopyBuyModelConfig, CopyBuyModelKey, CopyModelRecommendation } from '@/lib/copy-models/types';

export interface StarTraderRecord {
  address: string;
  name: string | null;
  image_url: string | null;
  created_at: string | null;
  recommended_copy_model_key: CopyBuyModelKey | null;
  recommended_copy_model_config: CopyBuyModelConfig | null;
  recommended_copy_model_reason: string | null;
  operator_notes: string | null;
  updated_at: string | null;
}

export interface StarTraderRecordQueryResult {
  records: StarTraderRecord[];
  supportsExtendedFields: boolean;
}

export interface ManagedStarTraderRecommendation extends CopyModelRecommendation {
  label: string;
  summary: string;
}

export type StarTraderSyncStatus =
  | 'in_sync'
  | 'db_only'
  | 'webhook_only'
  | 'webhook_unconfigured'
  | 'webhook_error';

export interface ManagedStarTrader {
  wallet: string;
  name: string;
  image: string;
  rawName: string | null;
  rawImageUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  operatorNotes: string | null;
  recommendation: ManagedStarTraderRecommendation | null;
  syncStatus: StarTraderSyncStatus;
  syncMessage: string;
}

export interface WebhookOnlyAddress {
  wallet: string;
  syncStatus: Extract<StarTraderSyncStatus, 'webhook_only'>;
  syncMessage: string;
}

export interface StarTraderManagementListResult {
  traders: ManagedStarTrader[];
  webhookOnlyAddresses: WebhookOnlyAddress[];
  supportsExtendedFields: boolean;
  webhookConfigured: boolean;
  webhookError: string | null;
}

export interface UpsertManagedStarTraderInput {
  wallet?: string;
  name?: string | null;
  imageUrl?: string | null;
  recommendedCopyModelKey?: CopyBuyModelKey | null;
  recommendedCopyModelConfig?: CopyBuyModelConfig | null;
  recommendedCopyModelReason?: string | null;
  operatorNotes?: string | null;
}

export class StarTraderManagementError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
