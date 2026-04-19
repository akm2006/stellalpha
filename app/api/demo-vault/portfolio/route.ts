import { NextRequest, NextResponse } from 'next/server';
import {
  calculateDemoVaultPortfolioValue,
  fetchDemoVaultPriceMap,
  normalizeDemoVaultPositions,
} from '@/lib/demo-vault-pricing';
import { formatCopyBuyModelConfigSummary, formatCopyBuyModelLabel } from '@/lib/copy-models/format';
import { supabase } from '@/lib/supabase';
import { getTokensMetadata } from '@/lib/jupiter-tokens';
import { getSession } from '@/lib/session';

const JUPITER_API_KEY = process.env.JUPITER_API_KEY;

// USDC and wrapped SOL mints
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const SOL_LOGO = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png';

interface Position {
  mint: string;
  symbol: string;
  name: string;
  logoURI: string | null;
  amount: number;
  costBasis: number;
  avgCost: number;
  currentPrice: number | null;
  currentValue: number | null;
  unrealizedPnL: number | null;
  unrealizedPercent: number | null;
  portfolioPercent: number | null;
  priceStale: boolean;
}

interface PortfolioResponse {
  traderStateId: string;
  starTrader: string;
  allocatedUsd: number;
  realizedPnlUsd: number;
  copyModelKey: string;
  copyModelConfig: Record<string, unknown>;
  copyModelSummary: string;
  isInitialized: boolean;
  isPaused: boolean;
  isSettled: boolean;
  
  // Positions
  positions: Position[];
  
  // ============================================
  // METRICS (per authoritative spec)
  // ============================================
  portfolioValue: number;       // Σ (currentPrice × amount)
  totalCostBasis: number;       // Σ position.costBasis
  
  // THE SINGLE TRUTH: totalPnL = portfolioValue - allocatedUsd
  totalPnL: number;
  totalPnLPercent: number;      // (totalPnL / allocatedUsd) × 100
  
  // Split
  unrealizedPnL: number;        // portfolioValue - totalCostBasis
  unrealizedPnLPercent: number;
  
  // Invariant check
  invariantValid: boolean;      // |totalPnL - (realizedPnL + unrealizedPnL)| < $0.01
  
  // Price status
  hasStalePrices: boolean;
  usdcBalance?: number;
}

// ============================================
// HELPER: Safe division (guards against /0)
// ============================================
function safeDivide(numerator: number, denominator: number, fallback = 0): number {
  if (denominator === 0 || isNaN(denominator)) return fallback;
  return numerator / denominator;
}

// ============================================
// HELPER: Fetch Jupiter prices with stale handling
// ============================================
// ============================================
// GET /api/demo-vault/portfolio
// ============================================
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session.isLoggedIn || !session.user?.wallet) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestedWallet = searchParams.get('wallet');
    const wallet = session.user.wallet;
    const traderStateId = searchParams.get('traderStateId');

    if (requestedWallet && requestedWallet !== wallet) {
      return NextResponse.json({ error: 'Forbidden: wallet does not match authenticated user' }, { status: 403 });
    }
    
    if (!traderStateId) {
      return NextResponse.json({ error: 'Missing traderStateId' }, { status: 400 });
    }
    
    // 1. Fetch trader state with ownership check
    const { data: traderState, error: tsError } = await supabase
      .from('demo_trader_states')
      .select(`
        id,
        star_trader,
        allocated_usd,
        realized_pnl_usd,
        copy_model_key,
        copy_model_config,
        is_initialized,
        is_paused,
        is_settled,
        demo_vaults!inner(user_wallet)
      `)
      .eq('id', traderStateId)
      .eq('demo_vaults.user_wallet', wallet)
      .single();
    
    if (tsError || !traderState) {
      return NextResponse.json({ error: 'Trader state not found' }, { status: 404 });
    }
    
    // 2. Fetch positions for this trader state
    const { data: dbPositions, error: posError } = await supabase
      .from('demo_positions')
      .select('token_mint, token_symbol, size, cost_usd, avg_cost')
      .eq('trader_state_id', traderStateId);
    
    if (posError) {
      console.error('Error fetching positions:', posError);
      return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 });
    }
    
    // Filter out 0-balance positions (they clutter the UI)
    const positions = normalizeDemoVaultPositions(dbPositions);
    
    // 3. Fetch live prices from Jupiter
    const mints = positions.map(p => p.token_mint);
    const priceMap = await fetchDemoVaultPriceMap(mints, {
      apiKey: JUPITER_API_KEY,
    });
    
    // 4. Fetch token metadata
    const tokenMeta = await getTokensMetadata(mints);
    
    // 5. Build enriched positions with per-position metrics
    const { portfolioValue, totalCostBasis, hasStalePrices } = calculateDemoVaultPortfolioValue(
      positions,
      priceMap
    );
    
    const enrichedPositions: Position[] = [];
    
    for (const pos of positions) {
      const amount = pos.size;
      const costBasis = pos.cost_usd;
      const avgCost = pos.avg_cost;
      
      const priceInfo = priceMap.get(pos.token_mint) || { price: 0, stale: true };
      const currentPrice = priceInfo.price;
      const priceStale = priceInfo.stale;
      
      // Current value = price × amount
      const currentValue = currentPrice * amount;
      
      // Unrealized PnL per position
      const unrealizedPnL = currentValue - costBasis;
      const unrealizedPercent = safeDivide(unrealizedPnL, costBasis) * 100;
      
      // Get token metadata
      const meta = tokenMeta[pos.token_mint];
      const isWrappedSol = pos.token_mint === WSOL_MINT;
      
      enrichedPositions.push({
        mint: pos.token_mint,
        symbol: isWrappedSol ? 'SOL' : (meta?.symbol || pos.token_symbol || pos.token_mint.slice(0, 6)),
        name: isWrappedSol ? 'Solana' : (meta?.name || 'Unknown'),
        logoURI: isWrappedSol ? SOL_LOGO : (meta?.logoURI || null),
        amount,
        costBasis,
        avgCost,
        currentPrice: priceStale ? null : currentPrice,
        currentValue: priceStale ? null : currentValue,
        unrealizedPnL: priceStale ? null : unrealizedPnL,
        unrealizedPercent: priceStale ? null : unrealizedPercent,
        portfolioPercent: null, // Calculated after total
        priceStale
      });
    }
    
    // 6. Calculate portfolio percentages
    for (const pos of enrichedPositions) {
      if (pos.currentValue !== null && portfolioValue > 0) {
        pos.portfolioPercent = safeDivide(pos.currentValue, portfolioValue) * 100;
      }
    }
    
    // Sort by current value (highest first)
    enrichedPositions.sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0));
    
    // ============================================
    // 7. AUTHORITATIVE METRICS
    // ============================================
    
    const allocatedUsd = Number(traderState.allocated_usd);
    const realizedPnlUsd = Number(traderState.realized_pnl_usd) || 0;
    const copyModelKey = traderState.copy_model_key || 'current_ratio';
    const copyModelConfig = traderState.copy_model_config || {};
    
    // Unrealized = Portfolio Value - Cost Basis (what we'd gain/lose if we sold now)
    const unrealizedPnL = portfolioValue - totalCostBasis;
    const unrealizedPnLPercent = safeDivide(unrealizedPnL, totalCostBasis) * 100;
    
    // THE SINGLE TRUTH: Total PnL = Realized + Unrealized
    const totalPnL = realizedPnlUsd + unrealizedPnL;
    const totalPnLPercent = safeDivide(totalPnL, allocatedUsd) * 100;
    
    // Invariant check: portfolioValue should equal allocatedUsd + totalPnL (approximately)
    const expectedPortfolioValue = allocatedUsd + totalPnL;
    const invariantDiff = Math.abs(portfolioValue - expectedPortfolioValue);
    const invariantValid = invariantDiff < 0.1; // $0.10 tolerance
    
    if (!invariantValid) {
      console.warn(`Portfolio invariant violation: portfolioValue=${portfolioValue.toFixed(2)}, expected=${expectedPortfolioValue.toFixed(2)}, diff=${invariantDiff.toFixed(2)}`);
    }
    
    // 8. Build response
    const response: PortfolioResponse = {
      traderStateId,
      starTrader: traderState.star_trader,
      allocatedUsd,
      realizedPnlUsd,
      copyModelKey,
      copyModelConfig,
      copyModelSummary: `${formatCopyBuyModelLabel(copyModelKey)} • ${formatCopyBuyModelConfigSummary(copyModelKey, copyModelConfig)}`,
      isInitialized: traderState.is_initialized,
      isPaused: traderState.is_paused,
      isSettled: traderState.is_settled,
      
      positions: enrichedPositions,
      
      // Metrics
      portfolioValue,
      totalCostBasis,
      totalPnL,
      totalPnLPercent,
      unrealizedPnL,
      unrealizedPnLPercent,
      
      invariantValid,
      hasStalePrices,
      usdcBalance: positions.find(p => p.token_mint === USDC_MINT)?.size || 0, // <--- New Field for V2 Logic
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Portfolio API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
