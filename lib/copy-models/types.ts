export const COPY_BUY_MODEL_KEYS = [
  'current_ratio',
  'fixed_available_pct',
  'fixed_starting_pct',
  'target_buy_pct_with_cap',
  'hybrid_envelope_leader_ratio',
] as const;

export type CopyBuyModelKey = (typeof COPY_BUY_MODEL_KEYS)[number];

export type CurrentRatioCopyModelConfig = Record<string, never>;

export interface FixedAvailablePctCopyModelConfig {
  buyPct: number;
}

export interface FixedStartingPctCopyModelConfig {
  buyPct: number;
}

export interface TargetBuyPctWithCapCopyModelConfig {
  targetBuyPct: number;
  maxBuyPct: number;
}

export interface HybridEnvelopeLeaderRatioCopyModelConfig {
  envelopePct: number;
}

export type CopyBuyModelConfig =
  | CurrentRatioCopyModelConfig
  | FixedAvailablePctCopyModelConfig
  | FixedStartingPctCopyModelConfig
  | TargetBuyPctWithCapCopyModelConfig
  | HybridEnvelopeLeaderRatioCopyModelConfig;

export interface CopyBuyModelFieldDefinition {
  key: string;
  label: string;
  description?: string;
  min: number;
  max: number;
  step: number;
}

export interface CopyBuyModelDefinition {
  key: CopyBuyModelKey;
  label: string;
  shortDescription: string;
  fields: CopyBuyModelFieldDefinition[];
}

export interface CopyModelRecommendation {
  modelKey: CopyBuyModelKey;
  config: CopyBuyModelConfig;
  reason: string;
  source: 'simulation_2026_04_19';
}

export interface DemoBuySizingContext {
  leaderBuyUsdValue: number;
  leaderRawRatio: number;
  leaderFinalRatio: number;
  leaderMetric: number;
  tradeAgeMs: number;
}

export interface DemoBuySpendResolution {
  buyAmount: number;
  limitedByAvailableCash: boolean;
  reason: string | null;
}
