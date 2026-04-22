import { getCopyBuyModelDefinition } from '@/lib/copy-models/catalog';
import { CopyBuyModelConfig, CopyBuyModelKey } from '@/lib/copy-models/types';

export function formatPercent(value: number | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0%';
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

export function formatCopyBuyModelLabel(modelKey: CopyBuyModelKey) {
  return getCopyBuyModelDefinition(modelKey).label;
}

export function formatCopyBuyModelConfigSummary(modelKey: CopyBuyModelKey, config: CopyBuyModelConfig) {
  switch (modelKey) {
    case 'current_ratio':
      return 'Follow the trader wallet sizing';
    case 'fixed_available_pct':
      return `Use ${formatPercent((config as { buyPct?: number }).buyPct)} of free cash on each buy`;
    case 'fixed_starting_pct':
      return `Use ${formatPercent((config as { buyPct?: number }).buyPct)} of starting funds on each buy`;
    case 'target_buy_pct_with_cap':
      return `Copy ${formatPercent((config as { targetBuyPct?: number }).targetBuyPct)} of each trader buy, capped at ${formatPercent((config as { maxBuyPct?: number }).maxBuyPct)} of free cash`;
    case 'hybrid_envelope_leader_ratio':
      return `Use up to ${formatPercent((config as { envelopePct?: number }).envelopePct)} of free cash, scaled by trader sizing`;
  }
}

export function formatCopyBuyModelConfigBadge(modelKey: CopyBuyModelKey, config: CopyBuyModelConfig) {
  switch (modelKey) {
    case 'current_ratio':
      return 'live';
    case 'fixed_available_pct':
      return formatPercent((config as { buyPct?: number }).buyPct);
    case 'fixed_starting_pct':
      return formatPercent((config as { buyPct?: number }).buyPct);
    case 'target_buy_pct_with_cap':
      return `${formatPercent((config as { targetBuyPct?: number }).targetBuyPct)}/${formatPercent((config as { maxBuyPct?: number }).maxBuyPct)} cap`;
    case 'hybrid_envelope_leader_ratio':
      return `${formatPercent((config as { envelopePct?: number }).envelopePct)} max`;
  }
}
