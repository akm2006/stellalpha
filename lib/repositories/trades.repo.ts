import { supabase } from '@/lib/supabase';

/**
 * Attempt to claim ownership of a trade by inserting it.
 * Uses the DB unique constraint on `signature` as the arbitrator.
 * Returns { claimed: true } if this process won the insert.
 * Returns { claimed: false } if another source already inserted this signature.
 */
export async function claimTrade(tradeData: any): Promise<{ claimed: boolean }> {
  const { error } = await supabase
    .from('trades')
    .insert(tradeData);

  if (error) {
    if (error.code === '23505') {
      // PostgreSQL unique_violation — another source already claimed this trade
      return { claimed: false };
    }
    // Real error — rethrow
    console.error(`[CLAIM] Unexpected insert error for signature ${tradeData.signature}:`, error);
    throw error;
  }

  return { claimed: true };
}

/**
 * Backfill PnL fields on an already-claimed trade.
 * Called after position update computes realized PnL.
 */
export async function updateTradePnL(
  signature: string,
  realizedPnl: number | null,
  avgCostBasis: number | null
) {
  return supabase
    .from('trades')
    .update({ realized_pnl: realizedPnl, avg_cost_basis: avgCostBasis })
    .eq('signature', signature);
}

export async function deleteClaimedTrade(signature: string) {
  return supabase
    .from('trades')
    .delete()
    .eq('signature', signature);
}
