import {
  COPY_BUY_MODEL_KEYS,
  CopyBuyModelConfig,
  CopyBuyModelDefinition,
  CopyBuyModelKey,
  FixedAvailablePctCopyModelConfig,
  FixedStartingPctCopyModelConfig,
  GuardedHybridCopyModelConfig,
  HybridEnvelopeLeaderRatioCopyModelConfig,
  TargetBuyPctWithCapCopyModelConfig,
} from '@/lib/copy-models/types';

const BUY_PERCENT_MIN = 0.1;
const BUY_PERCENT_MAX = 100;

export const COPY_BUY_MODEL_DEFINITIONS: CopyBuyModelDefinition[] = [
  {
    key: 'current_ratio',
    label: 'Trader Ratio',
    shortDescription: 'Matches the trader sizing based on their wallet activity.',
    fields: [],
  },
  {
    key: 'fixed_available_pct',
    label: 'Fixed % of Free Cash',
    shortDescription: 'Uses the same share of your free cash on every buy.',
    fields: [
      {
        key: 'buyPct',
        label: 'Use this % of free cash',
        min: BUY_PERCENT_MIN,
        max: BUY_PERCENT_MAX,
        step: 0.5,
      },
    ],
  },
  {
    key: 'fixed_starting_pct',
    label: 'Fixed % of Starting Funds',
    shortDescription: 'Uses the same share of your starting funds on every buy.',
    fields: [
      {
        key: 'buyPct',
        label: 'Use this % of starting funds',
        min: BUY_PERCENT_MIN,
        max: BUY_PERCENT_MAX,
        step: 0.5,
      },
    ],
  },
  {
    key: 'target_buy_pct_with_cap',
    label: 'Trader Buy % With Cap',
    shortDescription: 'Copies part of each trader buy, with a hard limit to protect your balance.',
    fields: [
      {
        key: 'targetBuyPct',
        label: 'Copy this % of each trader buy',
        min: BUY_PERCENT_MIN,
        max: BUY_PERCENT_MAX,
        step: 0.5,
      },
      {
        key: 'maxBuyPct',
        label: 'Never use more than this % of free cash',
        min: BUY_PERCENT_MIN,
        max: BUY_PERCENT_MAX,
        step: 0.5,
      },
    ],
  },
  {
    key: 'hybrid_envelope_leader_ratio',
    label: 'Balanced Hybrid',
    shortDescription: 'Sets a small cash limit, then adjusts inside it using the trader sizing.',
    fields: [
      {
        key: 'envelopePct',
        label: 'Use up to this % of free cash',
        min: BUY_PERCENT_MIN,
        max: BUY_PERCENT_MAX,
        step: 0.5,
      },
    ],
  },
  {
    key: 'guarded_hybrid',
    label: 'Guarded Hybrid',
    shortDescription: 'Copies high-velocity signals with small sizing, DCA throttles, and per-token exposure caps.',
    fields: [
      {
        key: 'baseBuyPct',
        label: 'Copy this % of each trader buy',
        min: BUY_PERCENT_MIN,
        max: BUY_PERCENT_MAX,
        step: 0.25,
      },
      {
        key: 'maxBuyPct',
        label: 'Never use more than this % of free cash',
        min: BUY_PERCENT_MIN,
        max: BUY_PERCENT_MAX,
        step: 0.25,
      },
      {
        key: 'maxMintExposurePct',
        label: 'Maximum exposure per token',
        min: BUY_PERCENT_MIN,
        max: BUY_PERCENT_MAX,
        step: 0.5,
      },
      {
        key: 'maxDcaBuysPerMint',
        label: 'Maximum buys per token sequence',
        min: 1,
        max: 20,
        step: 1,
      },
      {
        key: 'dcaSecondBuyPct',
        label: 'Second buy size multiplier',
        min: BUY_PERCENT_MIN,
        max: BUY_PERCENT_MAX,
        step: 5,
      },
      {
        key: 'dcaThirdBuyPct',
        label: 'Third buy size multiplier',
        min: BUY_PERCENT_MIN,
        max: BUY_PERCENT_MAX,
        step: 5,
      },
      {
        key: 'newPositionMaxAgeMs',
        label: 'Fresh-entry cutoff in milliseconds',
        min: 500,
        max: 10_000,
        step: 100,
      },
    ],
  },
];

function clampPercent(rawValue: unknown, fallback: number) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(BUY_PERCENT_MIN, Math.min(BUY_PERCENT_MAX, value));
}

function clampInteger(rawValue: unknown, fallback: number, min: number, max: number) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function isCopyBuyModelKey(value: unknown): value is CopyBuyModelKey {
  return typeof value === 'string' && COPY_BUY_MODEL_KEYS.includes(value as CopyBuyModelKey);
}

export function getCopyBuyModelDefinition(modelKey: CopyBuyModelKey) {
  return COPY_BUY_MODEL_DEFINITIONS.find((definition) => definition.key === modelKey)!;
}

export function getDefaultCopyBuyModelConfig(modelKey: CopyBuyModelKey): CopyBuyModelConfig {
  switch (modelKey) {
    case 'current_ratio':
      return {};
    case 'fixed_available_pct':
      return { buyPct: 5 } satisfies FixedAvailablePctCopyModelConfig;
    case 'fixed_starting_pct':
      return { buyPct: 5 } satisfies FixedStartingPctCopyModelConfig;
    case 'target_buy_pct_with_cap':
      return { targetBuyPct: 5, maxBuyPct: 5 } satisfies TargetBuyPctWithCapCopyModelConfig;
    case 'hybrid_envelope_leader_ratio':
      return { envelopePct: 5 } satisfies HybridEnvelopeLeaderRatioCopyModelConfig;
    case 'guarded_hybrid':
      return {
        baseBuyPct: 1,
        maxBuyPct: 1.5,
        maxMintExposurePct: 7.5,
        maxDcaBuysPerMint: 3,
        dcaSecondBuyPct: 60,
        dcaThirdBuyPct: 30,
        newPositionMaxAgeMs: 3_000,
      } satisfies GuardedHybridCopyModelConfig;
  }
}

export function normalizeCopyBuyModelConfig(
  modelKey: CopyBuyModelKey,
  rawConfig: unknown,
): CopyBuyModelConfig {
  const config = rawConfig && typeof rawConfig === 'object'
    ? rawConfig as Record<string, unknown>
    : {};

  switch (modelKey) {
    case 'current_ratio':
      return {};
    case 'fixed_available_pct':
      return {
        buyPct: clampPercent(config.buyPct, 5),
      } satisfies FixedAvailablePctCopyModelConfig;
    case 'fixed_starting_pct':
      return {
        buyPct: clampPercent(config.buyPct, 5),
      } satisfies FixedStartingPctCopyModelConfig;
    case 'target_buy_pct_with_cap':
      return {
        targetBuyPct: clampPercent(config.targetBuyPct, 5),
        maxBuyPct: clampPercent(config.maxBuyPct, 5),
      } satisfies TargetBuyPctWithCapCopyModelConfig;
    case 'hybrid_envelope_leader_ratio':
      return {
        envelopePct: clampPercent(config.envelopePct, 5),
      } satisfies HybridEnvelopeLeaderRatioCopyModelConfig;
    case 'guarded_hybrid':
      return {
        baseBuyPct: clampPercent(config.baseBuyPct, 1),
        maxBuyPct: clampPercent(config.maxBuyPct, 1.5),
        maxMintExposurePct: clampPercent(config.maxMintExposurePct, 7.5),
        maxDcaBuysPerMint: clampInteger(config.maxDcaBuysPerMint, 3, 1, 20),
        dcaSecondBuyPct: clampPercent(config.dcaSecondBuyPct, 60),
        dcaThirdBuyPct: clampPercent(config.dcaThirdBuyPct, 30),
        newPositionMaxAgeMs: clampInteger(config.newPositionMaxAgeMs, 3_000, 500, 10_000),
      } satisfies GuardedHybridCopyModelConfig;
  }
}

export function parseCopyBuyModelSelection(
  rawModelKey: unknown,
  rawConfig: unknown,
): { modelKey: CopyBuyModelKey; config: CopyBuyModelConfig } {
  const modelKey = isCopyBuyModelKey(rawModelKey) ? rawModelKey : 'current_ratio';
  return {
    modelKey,
    config: normalizeCopyBuyModelConfig(modelKey, rawConfig),
  };
}

export function modelRequiresLeaderRatio(modelKey: CopyBuyModelKey) {
  return modelKey === 'current_ratio' || modelKey === 'hybrid_envelope_leader_ratio';
}
