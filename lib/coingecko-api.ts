import NodeCache from "node-cache";

// No API key required - using free tier APIs
// CoinGecko free tier: 30 calls/min (no key needed)
// DexScreener: Free, no key needed
const coingeckoCache = new NodeCache({ stdTTL: 300 }); // Cache for 5 minutes

export interface CoinGeckoTokenData {
    price: number;
    marketCap?: number;
    volume24h?: number;
    priceChange24h?: number;
    priceChange7d?: number;
    priceChange30d?: number;
    circulatingSupply?: number;
    totalSupply?: number;
    holders?: number;
    lastUpdated?: number;
}

/**
 * Fallback: Fetch comprehensive token data from CoinGecko using Solana token addresses
 * FREE - No API key required (free tier: 30 calls/min)
 * CoinGecko API for Solana: /simple/token_price/solana
 */
export async function fetchCoinGeckoTokenData(
    mintAddresses: string[]
): Promise<Map<string, CoinGeckoTokenData>> {
    if (mintAddresses.length === 0) return new Map();

    const cacheKey = `coingecko-${mintAddresses.sort().join(',')}`;
    const cached = coingeckoCache.get<Map<string, CoinGeckoTokenData>>(cacheKey);
    if (cached) return cached;

    const result = new Map<string, CoinGeckoTokenData>();

    // CoinGecko has a rate limit (30 calls/min on free tier)
    // We'll chunk requests to respect limits
    const chunkSize = 10; // Smaller chunks to respect rate limits
    const addresses = mintAddresses.filter(addr => addr && addr.length > 0);

    for (let i = 0; i < addresses.length; i += chunkSize) {
        const chunk = addresses.slice(i, i + chunkSize);
        const addressesString = chunk.join(',');

        try {
            // Using free tier - no API key required
            // Free tier allows 30 calls/minute
            const url = `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${addressesString}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`;

            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                },
                cache: 'no-store'
            });

            if (response.ok) {
                const data = await response.json();

                Object.entries(data).forEach(([address, tokenData]: [string, any]) => {
                    if (tokenData && tokenData.usd) {
                        result.set(address.toLowerCase(), {
                            price: tokenData.usd || 0,
                            marketCap: tokenData.usd_market_cap || undefined,
                            volume24h: tokenData.usd_24h_vol || undefined,
                            priceChange24h: tokenData.usd_24h_change || undefined,
                            lastUpdated: tokenData.last_updated_at || undefined,
                        });
                    }
                });
            } else if (response.status === 429) {
                // Rate limit hit, wait and retry
                console.warn('CoinGecko rate limit hit, waiting...');
                await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 minute
            }
        } catch (error) {
            console.error(`CoinGecko API error for chunk ${i}-${i + chunkSize}:`, error);
            // Continue with other chunks
        }

        // Small delay between chunks to respect rate limits
        if (i + chunkSize < addresses.length) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
        }
    }

    if (result.size > 0) {
        coingeckoCache.set(cacheKey, result);
    }

    return result;
}

/**
 * Primary: Fetch from Jupiter Price API v3 (Solana-specific)
 * FREE - No API key required
 * Provides price and 24h price change directly
 */
export async function fetchJupiterV3PriceData(
    mintAddresses: string[]
): Promise<Map<string, CoinGeckoTokenData>> {
    if (mintAddresses.length === 0) return new Map();

    const cacheKey = `jupiter-v3-${mintAddresses.sort().join(',')}`;
    const cached = coingeckoCache.get<Map<string, CoinGeckoTokenData>>(cacheKey);
    if (cached) return cached;

    const result = new Map<string, CoinGeckoTokenData>();

    // Jupiter v3 API allows multiple addresses in query parameter
    // Chunk into reasonable sizes to avoid URL length issues
    const chunkSize = 50;
    
    for (let i = 0; i < mintAddresses.length; i += chunkSize) {
        const chunk = mintAddresses.slice(i, i + chunkSize);
        const addressesString = chunk.join(',');

        try {
            // Use Jupiter v3 price API - FREE, no key required
            const url = `https://lite-api.jup.ag/price/v3?ids=${addressesString}`;

            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                },
                cache: 'no-store'
            });

            if (response.ok) {
                const data = await response.json();

                // Jupiter v3 returns: { [address]: { usdPrice, priceChange24h, decimals, blockId } }
                Object.entries(data).forEach(([address, tokenData]: [string, any]) => {
                    if (tokenData && tokenData.usdPrice) {
                        result.set(address.toLowerCase(), {
                            price: parseFloat(tokenData.usdPrice) || 0,
                            priceChange24h: tokenData.priceChange24h !== undefined 
                                ? parseFloat(tokenData.priceChange24h) 
                                : undefined,
                            lastUpdated: Date.now() / 1000,
                        });
                    }
                });
            }
        } catch (error) {
            console.error(`Jupiter v3 API error for chunk ${i}-${i + chunkSize}:`, error);
        }

        // Small delay between chunks
        if (i + chunkSize < mintAddresses.length) {
            await new Promise(resolve => setTimeout(resolve, 500)); // 0.5 second delay
        }
    }

    if (result.size > 0) {
        coingeckoCache.set(cacheKey, result);
    }

    return result;
}

/**
 * Secondary: Fetch from DexScreener API directly (Solana-specific)
 * FREE - No API key required
 * This is faster and has better Solana token coverage for market cap and volume
 */
export async function fetchDexScreenerTokenData(
    mintAddresses: string[]
): Promise<Map<string, CoinGeckoTokenData>> {
    if (mintAddresses.length === 0) return new Map();

    const cacheKey = `dexscreener-${mintAddresses.sort().join(',')}`;
    const cached = coingeckoCache.get<Map<string, CoinGeckoTokenData>>(cacheKey);
    if (cached) return cached;

    const result = new Map<string, CoinGeckoTokenData>();

    // DexScreener allows multiple addresses in one request (up to 30)
    const chunkSize = 30;
    
    for (let i = 0; i < mintAddresses.length; i += chunkSize) {
        const chunk = mintAddresses.slice(i, i + chunkSize);
        const addressesString = chunk.join(',');

        try {
            const url = `https://api.dexscreener.com/latest/dex/tokens/${addressesString}`;

            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                },
                cache: 'no-store'
            });

            if (response.ok) {
                const data = await response.json();

                if (data.pairs && Array.isArray(data.pairs)) {
                    // Group pairs by token address
                    const tokenMap = new Map<string, any>();

                    data.pairs.forEach((pair: any) => {
                        const tokenAddress = pair.baseToken?.address?.toLowerCase();
                        if (tokenAddress && pair.chainId === 'solana') {
                            // Keep the pair with highest liquidity
                            const existing = tokenMap.get(tokenAddress);
                            if (!existing || (pair.liquidity?.usd || 0) > (existing.liquidity?.usd || 0)) {
                                tokenMap.set(tokenAddress, pair);
                            }
                        }
                    });

                    // Convert to our format
                    tokenMap.forEach((pair, address) => {
                        const price = parseFloat(pair.priceUsd || pair.priceNative || '0');
                        const priceChange24h = pair.priceChange?.h24 ? parseFloat(pair.priceChange.h24) : undefined;
                        const volume24h = pair.volume?.h24 ? parseFloat(pair.volume.h24) : undefined;
                        const marketCap = pair.marketCap ? parseFloat(pair.marketCap) : undefined;

                        if (price > 0) {
                            result.set(address, {
                                price,
                                marketCap,
                                volume24h,
                                priceChange24h,
                                lastUpdated: Date.now() / 1000,
                            });
                        }
                    });
                }
            }
        } catch (error) {
            console.error(`DexScreener API error for chunk ${i}-${i + chunkSize}:`, error);
        }

        // Small delay between chunks
        if (i + chunkSize < mintAddresses.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    if (result.size > 0) {
        coingeckoCache.set(cacheKey, result);
    }

    return result;
}

/**
 * Fetch comprehensive token data from multiple FREE sources
 * Priority order:
 * 1. Jupiter v3 Price API (price + 24h change) - FREE, no key
 * 2. DexScreener API (market cap, volume) - FREE, no key
 * 3. CoinGecko API (fallback) - FREE tier, no key
 */
export async function fetchTokenData(
    mintAddresses: string[]
): Promise<Map<string, CoinGeckoTokenData>> {
    // 1. Start with Jupiter v3 for prices and 24h price change
    let data = await fetchJupiterV3PriceData(mintAddresses);

    // 2. Enrich with DexScreener for market cap and volume
    const dexScreenerData = await fetchDexScreenerTokenData(mintAddresses);
    
    // Merge DexScreener data (market cap, volume) into existing data
    dexScreenerData.forEach((value, key) => {
        const existing = data.get(key);
        if (existing) {
            // Merge: keep price from Jupiter, add market cap and volume from DexScreener
            data.set(key, {
                ...existing,
                marketCap: value.marketCap || existing.marketCap,
                volume24h: value.volume24h || existing.volume24h,
            });
        } else {
            // New entry from DexScreener
            data.set(key, value);
        }
    });

    // 3. If still missing data, try CoinGecko for remaining tokens
    const missingAddresses = mintAddresses.filter(addr => {
        const addrLower = addr.toLowerCase();
        const tokenData = data.get(addrLower);
        return !tokenData || !tokenData.price || tokenData.price === 0;
    });
    
    if (missingAddresses.length > 0) {
        const coingeckoData = await fetchCoinGeckoTokenData(missingAddresses);
        
        // Merge CoinGecko data
        coingeckoData.forEach((value, key) => {
            const existing = data.get(key);
            if (existing) {
                // Merge existing with CoinGecko data
                data.set(key, {
                    ...existing,
                    price: value.price || existing.price,
                    marketCap: value.marketCap || existing.marketCap,
                    volume24h: value.volume24h || existing.volume24h,
                    priceChange24h: value.priceChange24h !== undefined 
                        ? value.priceChange24h 
                        : existing.priceChange24h,
                });
            } else {
                data.set(key, value);
            }
        });
    }

    return data;
}
