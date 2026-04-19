import { getDefaultCopyBuyModelConfig } from '@/lib/copy-models/catalog';
import { CopyModelRecommendation } from '@/lib/copy-models/types';

const FALLBACK_RECOMMENDATION: CopyModelRecommendation = {
  modelKey: 'hybrid_envelope_leader_ratio',
  config: getDefaultCopyBuyModelConfig('hybrid_envelope_leader_ratio'),
  reason: 'Works best for mixed trader styles because it keeps risk capped while still following the trader sizing.',
  source: 'simulation_2026_04_19',
};

const RECOMMENDATION_MAP: Record<string, CopyModelRecommendation> = {
  '3kxcF8wHKm4sEtnxjXXeUvNGeDjTmo47LgtSRg71YfG5': {
    modelKey: 'hybrid_envelope_leader_ratio',
    config: { envelopePct: 5 },
    reason: 'Works best for traders like this because it limits downside while still following strong conviction buys.',
    source: 'simulation_2026_04_19',
  },
  '515vh1DrPuwMATt9Zoq9kP4sJL9fyojA1dHJu4DQpNRp': {
    modelKey: 'fixed_available_pct',
    config: { buyPct: 5 },
    reason: 'Works best for fast traders like this because it keeps enough cash free to keep following later entries.',
    source: 'simulation_2026_04_19',
  },
  'CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o': {
    modelKey: 'hybrid_envelope_leader_ratio',
    config: { envelopePct: 5 },
    reason: 'Works best for high-frequency traders like this because it keeps repeated buys from getting too large.',
    source: 'simulation_2026_04_19',
  },
  'DP7G43VPwR5Ab5rcjrCnvJ8UgvRXRHTWscMjRD1eSdGC': {
    modelKey: 'hybrid_envelope_leader_ratio',
    config: { envelopePct: 5 },
    reason: 'Works best for slower traders like this because it stays stable while positions remain open longer.',
    source: 'simulation_2026_04_19',
  },
  '4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk': {
    modelKey: 'hybrid_envelope_leader_ratio',
    config: { envelopePct: 5 },
    reason: 'Works best for additive traders like this because it avoids building oversized positions over time.',
    source: 'simulation_2026_04_19',
  },
  'FaBGrHWjcJ8vKnbgUtsdpZjvF7YAAajtQTWmmEHiKtQr': {
    modelKey: 'fixed_starting_pct',
    config: { buyPct: 5 },
    reason: 'Works best for lower-frequency traders like this because each buy stays simple and consistent.',
    source: 'simulation_2026_04_19',
  },
  'DNfuF1L62WWyW3pNakVkyGGFzVVhj4Yr52jSmdTyeBHm': {
    modelKey: 'current_ratio',
    config: {},
    reason: 'Works best for traders like this because the wallet sizing already reflects their intent clearly.',
    source: 'simulation_2026_04_19',
  },
};

export function getCopyModelRecommendationForTrader(starTrader: string): CopyModelRecommendation {
  return RECOMMENDATION_MAP[starTrader] || FALLBACK_RECOMMENDATION;
}
