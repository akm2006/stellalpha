// Jupiter Token API v2 with Supabase caching

import { supabase } from './supabase';

const JUPITER_API_KEY = process.env.JUPITER_API_KEY;

interface TokenMeta {
  symbol: string;
  name: string;
  logoURI: string | null;
  decimals: number;
  usdPrice?: number | null;  // NEW: Price from Jupiter
}

// In-memory cache for current session
const memoryCache = new Map<string, TokenMeta>();

// ============ VERCEL OPTIMIZATION: Pre-seed common tokens to avoid cold-start API calls ============
const COMMON_TOKENS: Record<string, TokenMeta> = {
  'So11111111111111111111111111111111111111112': {
    symbol: 'SOL',
    name: 'Wrapped SOL',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    decimals: 9
  },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': {
    symbol: 'USDC',
    name: 'USD Coin',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    decimals: 6
  },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': {
    symbol: 'USDT',
    name: 'USDT',
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg',
    decimals: 6
  },
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': {
    symbol: 'BONK',
    name: 'Bonk',
    logoURI: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I',
    decimals: 5
  },
  '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN': {
    symbol: 'TRUMP',
    name: 'Official Trump',
    logoURI: null,
    decimals: 6
  }
};

// Pre-seed cache on module load
for (const [mint, meta] of Object.entries(COMMON_TOKENS)) {
  memoryCache.set(mint, meta);
}

// Search for a token by mint address using Jupiter Tokens API v2
async function fetchFromJupiter(mint: string): Promise<TokenMeta | null> {
  try {
    const headers: Record<string, string> = {};
    if (JUPITER_API_KEY) headers['x-api-key'] = JUPITER_API_KEY;
    
    const response = await fetch(
      `https://api.jup.ag/tokens/v2/search?query=${encodeURIComponent(mint)}`,
      { headers }
    );
    
    if (!response.ok) return null;
    
    const tokens = await response.json();
    const token = tokens.find((t: any) => t.id === mint);
    if (!token) return null;
    
    return {
      symbol: token.symbol,
      name: token.name,
      logoURI: token.icon || null,
      decimals: token.decimals,
      usdPrice: token.usdPrice ?? null
    };
  } catch (err) {
    console.error('Jupiter API error:', err);
    return null;
  }
}

// Batch fetch multiple tokens using Jupiter Tokens API v2
// Now with batching, timeout, and retry logic for wallets with 100+ tokens
async function fetchManyFromJupiter(mints: string[]): Promise<Record<string, TokenMeta>> {
  const result: Record<string, TokenMeta> = {};
  if (mints.length === 0) return result;
  
  // Limit to top 200 tokens to avoid excessive API calls
  // Most valuable tokens are discovered early via database cache
  const mintsToFetch = mints.slice(0, 200);
  if (mints.length > 200) {
    console.log(`[Portfolio] Limiting metadata fetch to 200 tokens (${mints.length} requested)`);
  }
  
  const headers: Record<string, string> = {};
  if (JUPITER_API_KEY) headers['x-api-key'] = JUPITER_API_KEY;
  
  const BATCH_SIZE = 15; // Smaller batches to avoid rate limits
  const TIMEOUT_MS = 8000;
  const MAX_RETRIES = 1; // Fewer retries to avoid hammering
  const DELAY_BETWEEN_BATCHES_MS = 300; // Delay between batches
  
  // Helper: fetch with timeout
  const fetchWithTimeout = async (url: string): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  };
  
  // Split into batches
  const batches: string[][] = [];
  for (let i = 0; i < mintsToFetch.length; i += BATCH_SIZE) {
    batches.push(mintsToFetch.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`[Portfolio] Fetching metadata for ${mintsToFetch.length} tokens in ${batches.length} batch(es)`);
  
  // Process batches SEQUENTIALLY to avoid rate limits
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    
    // Add delay between batches (except for first one)
    if (i > 0) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
    }
    
    // Process single batch with retry logic
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const query = batch.map(m => encodeURIComponent(m)).join(',');
        const response = await fetchWithTimeout(
          `https://api.jup.ag/tokens/v2/search?query=${query}`
        );
        
        // Handle rate limiting with longer backoff
        if (response.status === 429) {
          console.warn(`[Portfolio] Rate limited (429), waiting longer...`);
          await new Promise(r => setTimeout(r, 2000)); // 2 second wait on 429
          continue;
        }
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const tokens = await response.json();
        for (const token of tokens) {
          if (batch.includes(token.id)) {
            result[token.id] = {
              symbol: token.symbol,
              name: token.name,
              logoURI: token.icon || null,
              decimals: token.decimals,
              usdPrice: token.usdPrice ?? null
            };
          }
        }
        break; // Success, exit retry loop
      } catch (err) {
        if (attempt === MAX_RETRIES) {
          console.warn(`[Portfolio] Metadata batch ${i + 1}/${batches.length} failed:`, err);
        } else {
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        }
      }
    }
  }
  
  console.log(`[Portfolio] Successfully fetched metadata for ${Object.keys(result).length} tokens`);
  return result;
}

// Save token to database
async function saveToDatabase(mint: string, meta: TokenMeta): Promise<void> {
  try {
    await supabase.from('tokens').upsert({
      mint,
      symbol: meta.symbol,
      name: meta.name,
      logo_uri: meta.logoURI,
      decimals: meta.decimals,
      updated_at: new Date().toISOString()
    }, { onConflict: 'mint' });
  } catch (err) {
    console.error('Failed to cache token:', err);
  }
}

// Fetch from database
async function fetchFromDatabase(mint: string): Promise<TokenMeta | null> {
  try {
    const { data, error } = await supabase
      .from('tokens')
      .select('*')
      .eq('mint', mint)
      .single();
    
    if (error || !data) return null;
    
    return {
      symbol: data.symbol,
      name: data.name,
      logoURI: data.logo_uri,
      decimals: data.decimals
    };
  } catch {
    return null;
  }
}

// Fetch multiple from database
async function fetchManyFromDatabase(mints: string[]): Promise<Record<string, TokenMeta>> {
  const result: Record<string, TokenMeta> = {};
  
  try {
    const { data, error } = await supabase
      .from('tokens')
      .select('*')
      .in('mint', mints);
    
    if (!error && data) {
      for (const t of data) {
        result[t.mint] = {
          symbol: t.symbol,
          name: t.name,
          logoURI: t.logo_uri,
          decimals: t.decimals
        };
      }
    }
  } catch (err) {
    console.error('DB fetch error:', err);
  }
  
  return result;
}

// Get token metadata by mint address (DB first, then Jupiter API)
export async function getTokenMetadata(mint: string): Promise<TokenMeta> {
  // Handle SOL specially
  if (mint === 'SOL') {
    return {
      symbol: 'SOL',
      name: 'Solana',
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      decimals: 9
    };
  }
  
  // Check memory cache
  if (memoryCache.has(mint)) {
    return memoryCache.get(mint)!;
  }
  
  // Check database
  const dbResult = await fetchFromDatabase(mint);
  if (dbResult) {
    memoryCache.set(mint, dbResult);
    return dbResult;
  }
  
  // Fetch from Jupiter API
  const jupiterResult = await fetchFromJupiter(mint);
  if (jupiterResult) {
    memoryCache.set(mint, jupiterResult);
    // Save to database for next time
    await saveToDatabase(mint, jupiterResult);
    return jupiterResult;
  }
  
  // Fallback for unknown tokens
  const fallback: TokenMeta = {
    symbol: mint.slice(0, 6),
    name: 'Unknown Token',
    logoURI: null,
    decimals: 6
  };
  memoryCache.set(mint, fallback);
  return fallback;
}

// Get multiple tokens at once (optimized for batch fetching)
export async function getTokensMetadata(mints: string[]): Promise<Record<string, TokenMeta>> {
  const result: Record<string, TokenMeta> = {};
  const missingMints: string[] = [];
  
  // Add SOL if requested
  if (mints.includes('SOL')) {
    result['SOL'] = {
      symbol: 'SOL',
      name: 'Solana',
      logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      decimals: 9
    };
  }
  
  // Check memory cache first
  for (const mint of mints) {
    if (mint === 'SOL') continue;
    if (memoryCache.has(mint)) {
      result[mint] = memoryCache.get(mint)!;
    } else {
      missingMints.push(mint);
    }
  }
  
  // Fetch missing from database
  if (missingMints.length > 0) {
    const dbResults = await fetchManyFromDatabase(missingMints);
    for (const [mint, meta] of Object.entries(dbResults)) {
      result[mint] = meta;
      memoryCache.set(mint, meta);
    }
    
    // Find still missing (not in DB)
    const stillMissing = missingMints.filter(m => !dbResults[m]);
    
    // Batch fetch from Jupiter API (single request for multiple tokens)
    if (stillMissing.length > 0) {
      const jupiterResults = await fetchManyFromJupiter(stillMissing);
      for (const [mint, meta] of Object.entries(jupiterResults)) {
        result[mint] = meta;
        memoryCache.set(mint, meta);
        await saveToDatabase(mint, meta);
      }
      
      // Use fallback for any still missing
      for (const mint of stillMissing) {
        if (!jupiterResults[mint]) {
          result[mint] = {
            symbol: mint.slice(0, 6),
            name: 'Unknown Token',
            logoURI: null,
            decimals: 6
          };
        }
      }
    }
  }
  
  return result;
}

// ============ VERCEL OPTIMIZATION: Fast decimals lookup ============
// Optimized for quick decimal fetches, uses pre-seeded cache for common tokens
export async function getDecimals(mint: string): Promise<number> {
  // Fast path: Check pre-seeded common tokens first (no await!)
  if (COMMON_TOKENS[mint]) {
    return COMMON_TOKENS[mint].decimals;
  }
  
  // Check memory cache
  if (memoryCache.has(mint)) {
    return memoryCache.get(mint)!.decimals;
  }
  
  // Fall back to full metadata fetch (will cache for next time)
  const meta = await getTokenMetadata(mint);
  return meta.decimals;
}

export default { getTokenMetadata, getTokensMetadata, getDecimals };

