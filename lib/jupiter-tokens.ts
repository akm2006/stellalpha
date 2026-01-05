// Jupiter Token API v2 with Supabase caching

import { supabase } from './supabase';

const JUPITER_API_KEY = process.env.JUPITER_API_KEY;

interface TokenMeta {
  symbol: string;
  name: string;
  logoURI: string | null;
  decimals: number;
}

// In-memory cache for current session
const memoryCache = new Map<string, TokenMeta>();

// Search for a token by mint address using Jupiter v2 API
async function fetchFromJupiter(mint: string): Promise<TokenMeta | null> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (JUPITER_API_KEY) headers['x-api-key'] = JUPITER_API_KEY;
    
    const response = await fetch(
      `https://lite-api.jup.ag/tokens/v2/search?query=${mint}`,
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
      decimals: token.decimals
    };
  } catch (err) {
    console.error('Jupiter API error:', err);
    return null;
  }
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
    
    // Fetch from Jupiter API (with rate limiting)
    for (const mint of stillMissing) {
      const jupiterResult = await fetchFromJupiter(mint);
      if (jupiterResult) {
        result[mint] = jupiterResult;
        memoryCache.set(mint, jupiterResult);
        await saveToDatabase(mint, jupiterResult);
      } else {
        // Use fallback
        result[mint] = {
          symbol: mint.slice(0, 6),
          name: 'Unknown Token',
          logoURI: null,
          decimals: 6
        };
      }
    }
  }
  
  return result;
}

export default { getTokenMetadata, getTokensMetadata };
