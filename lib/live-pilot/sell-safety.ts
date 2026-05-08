import type { RawTrade } from '@/lib/trade-parser';

export type LivePilotSellSizingSource =
  | 'copied_position_lifecycle'
  | 'leader_pre_balance'
  | 'defensive_full_exit';

export type LivePilotSellSizingDecision = {
  copyRatio: number;
  sellFraction: number;
  source: LivePilotSellSizingSource;
  fallbackReason: string | null;
};

function clampSellFraction(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.max(value, 0), 1);
}

export function resolveLivePilotSellSizing(args: {
  trade: Pick<RawTrade, 'tokenInAmount' | 'tokenInPreBalance'>;
  lifecycleSellFraction: number | null | undefined;
}): LivePilotSellSizingDecision {
  const lifecycleRatio = clampSellFraction(Number(args.lifecycleSellFraction || 0));
  if (lifecycleRatio > 0) {
    return {
      copyRatio: lifecycleRatio,
      sellFraction: lifecycleRatio,
      source: 'copied_position_lifecycle',
      fallbackReason: null,
    };
  }

  const leaderPreBalance = Number(args.trade.tokenInPreBalance || 0);
  const leaderSellAmount = Number(args.trade.tokenInAmount || 0);
  const sourceRatio = leaderPreBalance > 0
    ? clampSellFraction(leaderSellAmount / leaderPreBalance)
    : 0;

  if (sourceRatio > 0) {
    return {
      copyRatio: sourceRatio,
      sellFraction: sourceRatio,
      source: 'leader_pre_balance',
      fallbackReason: 'source_pre_balance_sell_fraction',
    };
  }

  return {
    copyRatio: 1,
    sellFraction: 1,
    source: 'defensive_full_exit',
    fallbackReason: 'defensive_full_exit_missing_sell_state',
  };
}
