import {
  CopyBuyModelConfig,
  CopyBuyModelKey,
  DemoBuySizingContext,
  DemoBuySpendResolution,
} from '@/lib/copy-models/types';

function clampAmount(value: number, max: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(0, Math.min(value, max));
}

export function resolveDemoBuySpend(args: {
  modelKey: CopyBuyModelKey;
  modelConfig: CopyBuyModelConfig;
  availableCashUsd: number;
  startingCapitalUsd: number;
  leaderContext: DemoBuySizingContext;
}): DemoBuySpendResolution {
  const availableCashUsd = Math.max(0, Number(args.availableCashUsd) || 0);
  const startingCapitalUsd = Math.max(0, Number(args.startingCapitalUsd) || 0);
  const leaderBuyUsdValue = Math.max(0, Number(args.leaderContext.leaderBuyUsdValue) || 0);
  const leaderRawRatio = Math.max(0, Math.min(1, Number(args.leaderContext.leaderRawRatio) || 0));
  const leaderFinalRatio = Math.max(0, Math.min(1, Number(args.leaderContext.leaderFinalRatio) || 0));

  if (availableCashUsd <= 0) {
    return { buyAmount: 0, limitedByAvailableCash: false, reason: 'insufficient_available_cash' };
  }

  let proposedAmount = 0;

  switch (args.modelKey) {
    case 'current_ratio': {
      proposedAmount = availableCashUsd * leaderFinalRatio;
      return {
        buyAmount: clampAmount(proposedAmount, availableCashUsd),
        limitedByAvailableCash: false,
        reason: proposedAmount > 0 ? null : 'zero_copy_ratio',
      };
    }
    case 'fixed_available_pct': {
      const buyPct = Number((args.modelConfig as { buyPct?: number }).buyPct || 0) / 100;
      proposedAmount = availableCashUsd * buyPct;
      return {
        buyAmount: clampAmount(proposedAmount, availableCashUsd),
        limitedByAvailableCash: false,
        reason: proposedAmount > 0 ? null : 'zero_model_spend',
      };
    }
    case 'fixed_starting_pct': {
      const buyPct = Number((args.modelConfig as { buyPct?: number }).buyPct || 0) / 100;
      proposedAmount = startingCapitalUsd * buyPct;
      return {
        buyAmount: clampAmount(proposedAmount, availableCashUsd),
        limitedByAvailableCash: proposedAmount > availableCashUsd,
        reason: proposedAmount > 0 ? null : 'zero_model_spend',
      };
    }
    case 'target_buy_pct_with_cap': {
      const targetBuyPct = Number((args.modelConfig as { targetBuyPct?: number }).targetBuyPct || 0) / 100;
      const maxBuyPct = Number((args.modelConfig as { maxBuyPct?: number }).maxBuyPct || 0) / 100;
      const leaderCopyAmount = leaderBuyUsdValue * targetBuyPct;
      const followerCap = availableCashUsd * maxBuyPct;
      proposedAmount = Math.min(leaderCopyAmount, followerCap);
      return {
        buyAmount: clampAmount(proposedAmount, availableCashUsd),
        limitedByAvailableCash: leaderCopyAmount > followerCap,
        reason: proposedAmount > 0 ? null : 'zero_model_spend',
      };
    }
    case 'hybrid_envelope_leader_ratio': {
      const envelopePct = Number((args.modelConfig as { envelopePct?: number }).envelopePct || 0) / 100;
      const envelope = availableCashUsd * envelopePct;
      proposedAmount = envelope * leaderRawRatio;
      return {
        buyAmount: clampAmount(proposedAmount, availableCashUsd),
        limitedByAvailableCash: false,
        reason: proposedAmount > 0 ? null : 'zero_copy_ratio',
      };
    }
  }
}
