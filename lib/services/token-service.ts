import { supabase } from '@/lib/supabase';
import { getTokenMetadata } from '@/lib/jupiter-tokens';

export const WSOL = "So11111111111111111111111111111111111111112";

// Dynamic SOL price cache (refreshed every 60 seconds)
let solPriceCache: { price: number; timestamp: number } | null = null;
const SOL_PRICE_CACHE_TTL = 60000; // 60 seconds

export async function getSolPrice(): Promise<number> {
  // Return cached price if still valid
  if (solPriceCache && Date.now() - solPriceCache.timestamp < SOL_PRICE_CACHE_TTL) {
    return solPriceCache.price;
  }

  try {
    const headers: Record<string, string> = {};
    const JUPITER_API_KEY = process.env.JUPITER_API_KEY;
    if (JUPITER_API_KEY) headers['x-api-key'] = JUPITER_API_KEY;

    const response = await fetch(`https://api.jup.ag/price/v3?ids=${WSOL}`, { headers });
    if (response.ok) {
      const data = await response.json();
      const price = data[WSOL]?.usdPrice;
      if (typeof price === 'number' && price > 0) {
        solPriceCache = { price, timestamp: Date.now() };
        console.log(`[SOL Price] Fetched: $${price.toFixed(2)}`);
        return price;
      }
    }
  } catch (error) {
    console.warn('[SOL Price] Fetch failed:', error);
  }

  // Fallback to cached price or default
  return solPriceCache?.price || 150; // $150 fallback (safer than $200)
}

export const BASE_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB', // USD1
  'So11111111111111111111111111111111111111112',   // wSOL
]);

export const STABLECOIN_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB',
]);

const KNOWN_TOKENS: Record<string, string> = {
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
  'So11111111111111111111111111111111111111112': 'SOL',
  'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB': 'USD1',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'Bonk',
};

// Cache for token decimals to avoid repeated API calls
const decimalsCache = new Map<string, number>();

// Fetch token decimals using shared utility (handles DB + Jupiter API + Fallback)
export async function getTokenDecimals(mint: string): Promise<number> {
  // Check cache first
  if (decimalsCache.has(mint)) {
    return decimalsCache.get(mint)!;
  }

  try {
    const meta = await getTokenMetadata(mint);
    if (typeof meta.decimals === 'number') {
      decimalsCache.set(mint, meta.decimals);
      return meta.decimals;
    }
  } catch (error) {
    console.warn(`Failed to fetch decimals for ${mint}:`, error);
  }

  // Default fallback (should rarely be reached as getTokenMetadata has its own fallback)
  const defaultDecimals = STABLECOIN_MINTS.has(mint) ? 6 : 9;
  decimalsCache.set(mint, defaultDecimals);
  return defaultDecimals;
}

export async function getUsdValue(mint: string, amount: number): Promise<number> {
  if (STABLECOIN_MINTS.has(mint)) return amount;
  if (mint === 'SOL' || mint === WSOL) {
    const solPrice = await getSolPrice();
    return amount * solPrice;
  }
  return 0;
}

export function getTokenSymbol(mint: string): string {
  return KNOWN_TOKENS[mint] || mint.slice(0, 6);
}

// Background enrichment: fetch real symbols from Jupiter and update trades table
export async function enrichTradeSymbols(signature: string, tokenInMint: string, tokenOutMint: string): Promise<void> {
  try {
    // Collect mints that need enrichment (not in KNOWN_TOKENS)
    const mintsToFetch: string[] = [];
    if (!KNOWN_TOKENS[tokenInMint] && tokenInMint !== 'SOL') mintsToFetch.push(tokenInMint);
    if (!KNOWN_TOKENS[tokenOutMint] && tokenOutMint !== 'SOL') mintsToFetch.push(tokenOutMint);

    if (mintsToFetch.length === 0) return; // All known, nothing to do

    // Fetch metadata from Jupiter
    const symbolMap: Record<string, string> = {};
    for (const mint of mintsToFetch) {
      const meta = await getTokenMetadata(mint);
      if (meta?.symbol && meta.symbol.length <= 12) {
        symbolMap[mint] = meta.symbol;
      }
    }

    if (Object.keys(symbolMap).length === 0) return; // No symbols found

    // Update trades table with real symbols
    const updates: Record<string, string> = {};
    if (symbolMap[tokenInMint]) updates.token_in_symbol = symbolMap[tokenInMint];
    if (symbolMap[tokenOutMint]) updates.token_out_symbol = symbolMap[tokenOutMint];

    if (Object.keys(updates).length > 0) {
      await supabase.from('trades').update(updates).eq('signature', signature);
    }
  } catch (err) {
    // Silently fail - enrichment is best-effort
  }
}
