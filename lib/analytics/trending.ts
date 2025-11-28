import { fetchTransactions, fetchTokenMetadata } from "../helius-api";
import { getTrendingTokensFromApify, TrendingToken } from "../apify-trending";
import { fetchTokenData } from "../coingecko-api";
import NodeCache from "node-cache";

const JUPITER_ROUTER_V6 = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
const trendingCache = new NodeCache({ stdTTL: 300 }); // Cache for 5 minutes

// Use Apify by default to reduce Helius load, fallback to Helius if Apify fails
const USE_APIFY_FIRST = process.env.USE_APIFY_FOR_TRENDING !== 'false'; // Default to true

// Default tokens that should always appear in the list (SOL, WBTC, WETH)
const DEFAULT_TOKENS = [
    {
        mint: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
        name: "Solana",
    },
    {
        mint: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh",
        symbol: "WBTC",
        name: "Wrapped Bitcoin",
    },
    {
        mint: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
        symbol: "WETH",
        name: "Wrapped Ethereum",
    },
];

// Helper function to create default token objects with proper structure
async function createDefaultTokens(): Promise<any[]> {
    const defaultMints = DEFAULT_TOKENS.map(t => t.mint);
    
    // Fetch metadata and comprehensive data for default tokens
    const metadata = await fetchTokenMetadata(defaultMints);
    const metadataMap = new Map(metadata.map((m: any) => [m.id, m]));
    
    let comprehensiveData = new Map();
    try {
        comprehensiveData = await fetchTokenData(defaultMints);
    } catch (e) {
        console.error("Failed to fetch comprehensive data for default tokens:", e);
    }
    
    return DEFAULT_TOKENS.map(token => {
        const meta = metadataMap.get(token.mint);
        const logo = meta?.content?.links?.image || "";
        const mintLower = token.mint.toLowerCase();
        const tokenData = comprehensiveData.get(mintLower);
        
        return {
            mint: token.mint,
            address: token.mint,
            symbol: meta?.content?.metadata?.symbol || token.symbol,
            name: meta?.content?.metadata?.name || token.name,
            logo: logo,
            logoURI: logo,
            price: tokenData?.price || 0,
            marketCap: tokenData?.marketCap,
            volume24h: tokenData?.volume24h || 0,
            daily_volume: tokenData?.volume24h || 0,
            priceChange24h: tokenData?.priceChange24h,
            priceChange7d: tokenData?.priceChange7d,
            priceChange30d: tokenData?.priceChange30d,
            circulatingSupply: tokenData?.circulatingSupply,
            totalSupply: tokenData?.totalSupply,
            holders: tokenData?.holders,
            txCount: 0,
            uniqueWallets: 0,
            score: 999999, // High score to ensure they appear at top
            isDefault: true, // Flag to identify default tokens
        };
    });
}

export async function getTrendingTokens(timeWindow: '1h' | '6h' | '24h' = '1h') {
    const cacheKey = `trending-${timeWindow}`;
    const cached = trendingCache.get(cacheKey);
    if (cached) return cached;

    // Try Apify first to reduce Helius load
    if (USE_APIFY_FIRST) {
        try {
            const apifyTokens = await getTrendingTokensFromApify(timeWindow);
            if (apifyTokens && apifyTokens.length > 0) {
                // Transform Apify format to match expected format (component expects address and logoURI)
                let result = apifyTokens.map(token => ({
                    mint: token.mint,
                    address: token.mint, // Component uses 'address' field
                    symbol: token.symbol,
                    name: token.name,
                    logo: token.logo,
                    logoURI: token.logo || "", // Component expects 'logoURI'
                    price: token.price || 0,
                    priceChange24h: token.priceChange24h,
                    volume24h: token.volume24h,
                    daily_volume: token.volume24h || 0, // Component expects 'daily_volume'
                    txCount: token.txCount || 0,
                    uniqueWallets: token.uniqueWallets || 0,
                    score: token.score || 0
                }));

                // Enrich with comprehensive data from CoinGecko/DexScreener
                try {
                    const allMints = result.map(t => t.mint);
                    const comprehensiveData = await fetchTokenData(allMints);

                    // Merge comprehensive data into tokens
                    result = result.map(token => {
                        const mintLower = token.mint.toLowerCase();
                        const data = comprehensiveData.get(mintLower);
                        
                        if (data) {
                            return {
                                ...token,
                                // Use comprehensive data if available, otherwise keep existing
                                price: data.price || token.price || 0,
                                marketCap: data.marketCap,
                                volume24h: data.volume24h || token.volume24h,
                                priceChange24h: data.priceChange24h !== undefined 
                                    ? data.priceChange24h 
                                    : token.priceChange24h,
                                priceChange7d: data.priceChange7d,
                                priceChange30d: data.priceChange30d,
                                circulatingSupply: data.circulatingSupply,
                                totalSupply: data.totalSupply,
                                holders: data.holders,
                            };
                        }
                        return token;
                    });
                } catch (enrichError) {
                    console.error("Failed to enrich tokens with comprehensive data:", enrichError);
                }
                
                // Add default tokens (SOL, WBTC, WETH) at the top, removing duplicates from regular list
                try {
                    const defaultTokens = await createDefaultTokens();
                    const defaultMints = new Set(defaultTokens.map(t => t.mint.toLowerCase()));
                    
                    // Remove default tokens from the regular result (to avoid duplicates)
                    result = result.filter(
                        t => !defaultMints.has(t.mint.toLowerCase())
                    );
                    
                    // Prepend all default tokens at the top in order: SOL, WBTC, WETH
                    result = [...defaultTokens, ...result];
                } catch (defaultError) {
                    console.error("Failed to add default tokens:", defaultError);
                }
                
                trendingCache.set(cacheKey, result);
                console.log(`✅ Fetched ${result.length} trending tokens from Apify (with SOL, WBTC, WETH at top)`);
                return result;
            }
        } catch (error) {
            console.error("Apify trending tokens fetch failed, falling back to Helius:", error);
        }
    }

    // Fallback to Helius-based fetching
    console.log("Using Helius for trending tokens (Apify unavailable or disabled)");

    // 1. Fetch recent swaps from Jupiter Router
    // Helius free tier limit is 100 txs per request. We'll fetch a few batches.
    const transactions = await fetchTransactions(JUPITER_ROUTER_V6, {
        limit: 100,
        type: 'SWAP'
    });

    // 2. Aggregate Stats
    const stats: Record<string, { txCount: number, uniqueWallets: Set<string>, volume: number }> = {};

    for (const tx of transactions) {
        if (!tx.tokenTransfers) continue;

        for (const transfer of tx.tokenTransfers) {
            const mint = transfer.mint;
            if (mint === "So11111111111111111111111111111111111111112") continue; // Skip SOL

            if (!stats[mint]) {
                stats[mint] = { txCount: 0, uniqueWallets: new Set(), volume: 0 };
            }

            stats[mint].txCount++;
            stats[mint].uniqueWallets.add(tx.feePayer); // Approximate user
            stats[mint].volume += transfer.tokenAmount; // Raw amount, ideally need price
        }
    }

    // 3. Score and Rank
    const scored = Object.entries(stats).map(([mint, data]) => {
        // Simple score: (txs * 2) + unique_wallets
        // Volume is hard to normalize without prices, so we use it as tie-breaker or minor weight
        const score = (data.txCount * 2) + data.uniqueWallets.size;
        return {
            mint,
            txCount: data.txCount,
            uniqueWallets: data.uniqueWallets.size,
            volume: data.volume,
            score
        };
    }).sort((a, b) => b.score - a.score).slice(0, 100); // Return up to 100 tokens

    // 4. Fetch Metadata
    const mints = scored.map(s => s.mint);
    const metadata = await fetchTokenMetadata(mints);
    const metadataMap = new Map(metadata.map((m: any) => [m.id, m]));

    // 5. Fetch comprehensive token data from CoinGecko/DexScreener
    let comprehensiveData = new Map();
    try {
        comprehensiveData = await fetchTokenData(mints);
    } catch (e) {
        console.error("Failed to fetch comprehensive token data:", e);
    }

    // 6. Format Result
    const result = scored.map(item => {
        const meta = metadataMap.get(item.mint);
        const logo = meta?.content?.links?.image || "";
        const mintLower = item.mint.toLowerCase();
        const tokenData = comprehensiveData.get(mintLower);
        
        return {
            ...item,
            address: item.mint, // Component uses 'address' field
            symbol: meta?.content?.metadata?.symbol || "UNKNOWN",
            name: meta?.content?.metadata?.name || "Unknown Token",
            logo: logo,
            logoURI: logo, // Component expects 'logoURI'
            price: tokenData?.price || 0,
            marketCap: tokenData?.marketCap,
            volume24h: tokenData?.volume24h,
            daily_volume: tokenData?.volume24h || item.volume || 0, // Component expects 'daily_volume'
            priceChange24h: tokenData?.priceChange24h,
            priceChange7d: tokenData?.priceChange7d,
            priceChange30d: tokenData?.priceChange30d,
            circulatingSupply: tokenData?.circulatingSupply,
            totalSupply: tokenData?.totalSupply,
            holders: tokenData?.holders,
        };
    });

    // Add default tokens (SOL, WBTC, WETH) at the top, removing duplicates from regular list
    try {
        const defaultTokens = await createDefaultTokens();
        const defaultMints = new Set(defaultTokens.map(t => t.mint.toLowerCase()));
        
        // Remove default tokens from the regular result (to avoid duplicates)
        const filteredResult = result.filter(
            t => !defaultMints.has(t.mint.toLowerCase())
        );
        
        // Prepend all default tokens at the top in order: SOL, WBTC, WETH
        const finalResult = [...defaultTokens, ...filteredResult];
        trendingCache.set(cacheKey, finalResult);
        console.log(`✅ Fetched ${finalResult.length} trending tokens from Helius (with SOL, WBTC, WETH at top)`);
        return finalResult;
    } catch (defaultError) {
        console.error("Failed to add default tokens:", defaultError);
        trendingCache.set(cacheKey, result);
        return result;
    }
}
