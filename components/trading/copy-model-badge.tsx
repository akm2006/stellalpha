'use client';

import { COPY_BUY_MODEL_DEFINITIONS, parseCopyBuyModelSelection } from '@/lib/copy-models/catalog';
import {
  formatCopyBuyModelConfigBadge,
  formatCopyBuyModelConfigSummary,
  formatCopyBuyModelLabel,
} from '@/lib/copy-models/format';
import { CopyBuyModelConfig, CopyBuyModelKey } from '@/lib/copy-models/types';
import { Tooltip } from '@/components/cyber/tooltip';

function getCopyStyleBadgeLabel(modelKey: CopyBuyModelKey) {
  switch (modelKey) {
    case 'current_ratio':
      return 'Ratio';
    case 'fixed_available_pct':
      return 'Fixed Cash';
    case 'fixed_starting_pct':
      return 'Fixed Start';
    case 'target_buy_pct_with_cap':
      return 'Target';
    case 'hybrid_envelope_leader_ratio':
      return 'Hybrid';
  }
}

interface CopyModelBadgeProps {
  modelKey: CopyBuyModelKey;
  config: CopyBuyModelConfig;
  summary?: string;
  compact?: boolean;
}

export function CopyModelBadge({
  modelKey,
  config,
  summary,
  compact = false,
}: CopyModelBadgeProps) {
  const normalizedModel = parseCopyBuyModelSelection(modelKey, config);
  const label = formatCopyBuyModelLabel(normalizedModel.modelKey);
  const badgeLabel = getCopyStyleBadgeLabel(normalizedModel.modelKey);
  const definition = COPY_BUY_MODEL_DEFINITIONS.find((item) => item.key === normalizedModel.modelKey);
  const configBadge = formatCopyBuyModelConfigBadge(normalizedModel.modelKey, normalizedModel.config);
  const configSummary = formatCopyBuyModelConfigSummary(normalizedModel.modelKey, normalizedModel.config);

  const tooltipBody = (() => {
    switch (normalizedModel.modelKey) {
      case 'current_ratio':
        return (
          <>
            <strong>How buys work:</strong> this setup follows the trader wallet&apos;s buy size ratio for each detected buy.<br /><br />
            <strong>Current config:</strong> live trader ratio, with no fixed percent cap in this model.<br /><br />
            <span className="text-white/55">Sells still follow the trader&apos;s sell ratio for the copied position.</span>
          </>
        );
      case 'fixed_available_pct':
        return (
          <>
            <strong>How buys work:</strong> each detected buy uses {configBadge} of this setup&apos;s free demo cash.<br /><br />
            <strong>Current config:</strong> {configSummary}.<br /><br />
            <span className="text-white/55">This keeps every new buy small relative to the remaining cash balance.</span>
          </>
        );
      case 'fixed_starting_pct':
        return (
          <>
            <strong>How buys work:</strong> each detected buy uses {configBadge} of this setup&apos;s original allocated amount.<br /><br />
            <strong>Current config:</strong> {configSummary}.<br /><br />
            <span className="text-white/55">This makes buy size stable, but it does not shrink as free cash falls.</span>
          </>
        );
      case 'target_buy_pct_with_cap':
        return (
          <>
            <strong>How buys work:</strong> this setup copies a smaller target share of the trader&apos;s buy, then applies a free-cash cap.<br /><br />
            <strong>Current config:</strong> {configSummary}.<br /><br />
            <span className="text-white/55">The cap prevents one large trader buy from consuming too much of the setup balance.</span>
          </>
        );
      case 'hybrid_envelope_leader_ratio':
        return (
          <>
            <strong>How buys work:</strong> this setup first limits the buy to a {configBadge} cash envelope, then scales inside that envelope using the trader&apos;s sizing ratio.<br /><br />
            <strong>Current config:</strong> {configSummary}.<br /><br />
            <span className="text-white/55">This preserves trader intent while keeping follower exposure small.</span>
          </>
        );
    }
  })();

  return (
    <Tooltip
      ariaLabel={`${label} copy style details`}
      trigger={(
        <span className={`copy-style-badge inline-flex max-w-full items-center gap-1 truncate rounded-none font-mono font-semibold uppercase tracking-[0.14em] ${compact ? 'px-2 py-1 text-[9px]' : 'px-2.5 py-1.5 text-[10px]'}`}>
          <span className="text-[#00FF85]/70">[</span>
          <span className="truncate">{badgeLabel}</span>
          <span className="shrink-0 text-[#00FF85]/75">· {configBadge}</span>
          <span className="text-[#00FF85]/70">]</span>
        </span>
      )}
      triggerClassName="max-w-full border-0 bg-transparent p-0 text-left"
      label="Model Info"
    >
      <strong>{label}</strong><br />
      {summary || definition?.shortDescription || configSummary}<br /><br />
      {tooltipBody}
    </Tooltip>
  );
}
