import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getTokensMetadata } from '@/lib/jupiter-tokens';

const JUPITER_API_KEY = process.env.JUPITER_API_KEY;

// USDC and wrapped SOL mints
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';
const SOL_LOGO = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png';

// Stablecoins always = $1
const STABLECOIN_MINTS = new Set([
  USDC_MINT,
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenUb9', // USDT
]);

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
async function fetchJupiterPrices(mints: string[]): Promise<Map<string, { price: number; stale: boolean }>> {
  const priceMap = new Map<string, { price: number; stale: boolean }>();
  
  // Set stablecoins to $1 immediately
  for (const mint of mints) {
    if (STABLECOIN_MINTS.has(mint)) {
      priceMap.set(mint, { price: 1, stale: false });
    }
  }
  
  // Filter out stablecoins for Jupiter fetch
  const nonStableMints = mints.filter(m => !STABLECOIN_MINTS.has(m));
  
  if (nonStableMints.length === 0) return priceMap;
  
  try {
    // Jupiter Price API v3 (same as star trader API)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (JUPITER_API_KEY) headers['x-api-key'] = JUPITER_API_KEY;
    
    const url = `https://api.jup.ag/price/v3?ids=${nonStableMints.join(',')}`;
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      console.warn(`Jupiter price API v3 returned ${response.status}`);
      // Mark all as stale with fallback to cached prices
      for (const mint of nonStableMints) {
        priceMap.set(mint, { price: 0, stale: true });
      }
      return priceMap;
    }
    
    const data = await response.json();
    
    // v3 API returns prices at top level with usdPrice field
    for (const mint of nonStableMints) {
      const priceData = data[mint];
      if (priceData && typeof priceData === 'object' && 'usdPrice' in priceData) {
        priceMap.set(mint, { price: Number(priceData.usdPrice), stale: false });
      } else {
        // Price not returned - mark as stale
        priceMap.set(mint, { price: 0, stale: true });
      }
    }
  } catch (error) {
    console.error('Jupiter price fetch error:', error);
    // Mark all as stale
    for (const mint of nonStableMints) {
      priceMap.set(mint, { price: 0, stale: true });
    }
  }
  
  return priceMap;
}

// ============================================
// GET /api/demo-vault/portfolio
// ============================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get('wallet');
    const traderStateId = searchParams.get('traderStateId');
    
    if (!wallet || !traderStateId) {
      return NextResponse.json({ error: 'Missing wallet or traderStateId' }, { status: 400 });
    }
    
    // 1. Fetch trader state with ownership check
    const { data: traderState, error: tsError } = await supabase
      .from('demo_trader_states')
      .select(`
        id,
        star_trader,
        allocated_usd,
        realized_pnl_usd,
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
      .select('*')
      .eq('trader_state_id', traderStateId);
    
    if (posError) {
      console.error('Error fetching positions:', posError);
      return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 });
    }
    
    const positions = dbPositions || [];
    
    // 3. Fetch live prices from Jupiter
    const mints = positions.map(p => p.token_mint);
    const priceMap = await fetchJupiterPrices(mints);
    
    // 4. Fetch token metadata
    const tokenMeta = await getTokensMetadata(mints);
    
    // 5. Build enriched positions with per-position metrics
    let portfolioValue = 0;
    let totalCostBasis = 0;
    let hasStalePrices = false;
    
    const enrichedPositions: Position[] = [];
    
    for (const pos of positions) {
      const amount = Number(pos.size) || 0;
      const costBasis = Number(pos.cost_usd) || 0;
      const avgCost = Number(pos.avg_cost) || 0;
      
      const priceInfo = priceMap.get(pos.token_mint) || { price: 0, stale: true };
      const currentPrice = priceInfo.price;
      const priceStale = priceInfo.stale;
      
      if (priceStale) hasStalePrices = true;
      
      // Current value = price × amount
      const currentValue = currentPrice * amount;
      
      // Unrealized PnL per position
      const unrealizedPnL = currentValue - costBasis;
      const unrealizedPercent = safeDivide(unrealizedPnL, costBasis) * 100;
      
      // Accumulate totals
      portfolioValue += currentValue;
      totalCostBasis += costBasis;
      
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
      hasStalePrices
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Portfolio API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
