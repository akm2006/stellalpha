import { getDefaultCopyBuyModelConfig } from '@/lib/copy-models/catalog';
import { CopyModelRecommendation } from '@/lib/copy-models/types';
import { supabase } from '@/lib/supabase';
import {
  getStarTraderFallbackImage,
  getStarTraderFallbackName,
} from '@/lib/star-trader-stats';
import type {
  StarTraderRecord,
  StarTraderRecordQueryResult,
} from '@/lib/star-trader-management/types';

const LEGACY_SELECT = 'address, name, image_url, created_at';
const EXTENDED_SELECT = [
  'address',
  'name',
  'image_url',
  'created_at',
  'recommended_copy_model_key',
  'recommended_copy_model_config',
  'recommended_copy_model_reason',
  'operator_notes',
  'updated_at',
].join(', ');

function isMissingColumnError(message: string | undefined) {
  return /column .* does not exist/i.test(message || '');
}

function normalizeLegacyRow(row: any): StarTraderRecord {
  return {
    address: row.address,
    name: row.name ?? null,
    image_url: row.image_url ?? null,
    created_at: row.created_at ?? null,
    recommended_copy_model_key: null,
    recommended_copy_model_config: null,
    recommended_copy_model_reason: null,
    operator_notes: null,
    updated_at: row.created_at ?? null,
  };
}

function normalizeExtendedRow(row: any): StarTraderRecord {
  return {
    address: row.address,
    name: row.name ?? null,
    image_url: row.image_url ?? null,
    created_at: row.created_at ?? null,
    recommended_copy_model_key: row.recommended_copy_model_key ?? null,
    recommended_copy_model_config: row.recommended_copy_model_config ?? null,
    recommended_copy_model_reason: row.recommended_copy_model_reason ?? null,
    operator_notes: row.operator_notes ?? null,
    updated_at: row.updated_at ?? row.created_at ?? null,
  };
}

export async function listStarTraderRecords(): Promise<StarTraderRecordQueryResult> {
  const { data, error } = await supabase
    .from('star_traders')
    .select(EXTENDED_SELECT)
    .order('created_at', { ascending: false });

  if (!error) {
    return {
      records: (data || []).map(normalizeExtendedRow),
      supportsExtendedFields: true,
    };
  }

  if (!isMissingColumnError(error.message)) {
    throw error;
  }

  const { data: legacyData, error: legacyError } = await supabase
    .from('star_traders')
    .select(LEGACY_SELECT)
    .order('created_at', { ascending: false });

  if (legacyError) throw legacyError;

  return {
    records: (legacyData || []).map(normalizeLegacyRow),
    supportsExtendedFields: false,
  };
}

export async function getStarTraderRecord(
  wallet: string,
): Promise<{ record: StarTraderRecord | null; supportsExtendedFields: boolean }> {
  const { data, error } = await supabase
    .from('star_traders')
    .select(EXTENDED_SELECT)
    .eq('address', wallet)
    .single();

  if (!error) {
    return {
      record: normalizeExtendedRow(data),
      supportsExtendedFields: true,
    };
  }

  if (error.code === 'PGRST116') {
    return {
      record: null,
      supportsExtendedFields: !isMissingColumnError(error.message),
    };
  }

  if (!isMissingColumnError(error.message)) {
    throw error;
  }

  const { data: legacyData, error: legacyError } = await supabase
    .from('star_traders')
    .select(LEGACY_SELECT)
    .eq('address', wallet)
    .single();

  if (legacyError?.code === 'PGRST116') {
    return { record: null, supportsExtendedFields: false };
  }
  if (legacyError) throw legacyError;

  return {
    record: normalizeLegacyRow(legacyData),
    supportsExtendedFields: false,
  };
}

const DEFAULT_USER_RECOMMENDATION: CopyModelRecommendation = {
  modelKey: 'hybrid_envelope_leader_ratio',
  config: getDefaultCopyBuyModelConfig('hybrid_envelope_leader_ratio'),
  reason: 'Works best for mixed trader styles because it keeps risk capped while still following the trader sizing.',
  source: 'simulation_2026_04_19',
};

export function resolveUserRecommendationFromRecord(
  record: StarTraderRecord | null | undefined,
): CopyModelRecommendation {
  if (record?.recommended_copy_model_key) {
    return {
      modelKey: record.recommended_copy_model_key,
      config: record.recommended_copy_model_config || {},
      reason: record.recommended_copy_model_reason || DEFAULT_USER_RECOMMENDATION.reason,
      source: 'simulation_2026_04_19',
    };
  }

  return DEFAULT_USER_RECOMMENDATION;
}

export function resolveStoredRecommendationFromRecord(
  record: StarTraderRecord | null | undefined,
): CopyModelRecommendation | null {
  if (!record?.recommended_copy_model_key) {
    return null;
  }

  return {
    modelKey: record.recommended_copy_model_key,
    config: record.recommended_copy_model_config || {},
    reason: record.recommended_copy_model_reason || '',
    source: 'simulation_2026_04_19',
  };
}

export function resolveStarTraderDisplayName(record: StarTraderRecord) {
  return record.name || getStarTraderFallbackName(record.address);
}

export function resolveStarTraderImage(record: StarTraderRecord) {
  return record.image_url || getStarTraderFallbackImage(record.address);
}
