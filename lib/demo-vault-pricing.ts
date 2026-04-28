import { jupiterFetch, type JupiterApiScope } from '@/lib/jupiter/client';

const JUPITER_PRICE_BATCH_SIZE = 50;

export const DEMO_VAULT_STABLECOIN_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB', // USD1
]);

export interface DemoVaultDbPositionLike {
  token_mint?: string | null;
  token_symbol?: string | null;
  size?: number | string | null;
  cost_usd?: number | string | null;
  avg_cost?: number | string | null;
}

export interface NormalizedDemoVaultPosition {
  token_mint: string;
  token_symbol: string;
  size: number;
  cost_usd: number;
  avg_cost: number;
}

export interface DemoVaultPriceInfo {
  price: number;
  stale: boolean;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

export function normalizeDemoVaultPositions(
  positions: DemoVaultDbPositionLike[] | null | undefined,
  options: { positiveOnly?: boolean } = {}
): NormalizedDemoVaultPosition[] {
  const { positiveOnly = true } = options;

  return (positions || [])
    .map((position) => ({
      token_mint: position.token_mint || '',
      token_symbol: position.token_symbol || '',
      size: Number(position.size || 0),
      cost_usd: Number(position.cost_usd || 0),
      avg_cost: Number(position.avg_cost || 0),
    }))
    .filter((position) => {
      if (!position.token_mint) return false;
      if (!positiveOnly) return true;
      return position.size > 0;
    });
}

export async function fetchDemoVaultPriceMap(
  mints: string[],
  options: { apiKey?: string; fetchImpl?: typeof fetch; jupiterScope?: JupiterApiScope } = {}
): Promise<Map<string, DemoVaultPriceInfo>> {
  const fetchImpl = options.fetchImpl || fetch;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (options.apiKey) {
    headers['x-api-key'] = options.apiKey;
  }

  const uniqueMints = [...new Set(mints.filter(Boolean))];
  const priceMap = new Map<string, DemoVaultPriceInfo>();

  for (const mint of uniqueMints) {
    if (DEMO_VAULT_STABLECOIN_MINTS.has(mint)) {
      priceMap.set(mint, { price: 1, stale: false });
    }
  }

  const nonStableMints = uniqueMints.filter((mint) => !DEMO_VAULT_STABLECOIN_MINTS.has(mint));
  if (nonStableMints.length === 0) {
    return priceMap;
  }

  for (const mintBatch of chunk(nonStableMints, JUPITER_PRICE_BATCH_SIZE)) {
    try {
      const url = `https://api.jup.ag/price/v3?ids=${mintBatch.join(',')}`;
      const response = options.fetchImpl
        ? await fetchImpl(url, { headers })
        : await jupiterFetch(url, { headers }, {
          scope: options.jupiterScope || 'price',
          operation: 'demo-vault-price',
        });

      if (!response.ok) {
        for (const mint of mintBatch) {
          priceMap.set(mint, { price: 0, stale: true });
        }
        continue;
      }

      const data = await response.json();

      for (const mint of mintBatch) {
        const priceData = data?.[mint];
        if (priceData && typeof priceData === 'object' && 'usdPrice' in priceData) {
          priceMap.set(mint, { price: Number(priceData.usdPrice), stale: false });
        } else {
          priceMap.set(mint, { price: 0, stale: true });
        }
      }
    } catch (error) {
      console.error('Demo vault price fetch error:', error);
      for (const mint of mintBatch) {
        priceMap.set(mint, { price: 0, stale: true });
      }
    }
  }

  return priceMap;
}

export function calculateDemoVaultPortfolioValue(
  positions: NormalizedDemoVaultPosition[],
  priceMap: Map<string, DemoVaultPriceInfo>
) {
  let portfolioValue = 0;
  let totalCostBasis = 0;
  let hasStalePrices = false;

  for (const position of positions) {
    const priceInfo = priceMap.get(position.token_mint) || { price: 0, stale: true };

    portfolioValue += position.size * priceInfo.price;
    totalCostBasis += position.cost_usd;
    hasStalePrices ||= priceInfo.stale;
  }

  return {
    portfolioValue,
    totalCostBasis,
    hasStalePrices,
  };
}
