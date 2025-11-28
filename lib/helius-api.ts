import NodeCache from "node-cache";

const HELIUS_API_KEY = process.env.NEXT_PUBLIC_HELIUS_API_KEY;

if (!HELIUS_API_KEY) {
    console.warn("⚠️ NEXT_PUBLIC_HELIUS_API_KEY environment variable is not set. Helius features may not work.");
}
const BASE_URL = "https://api.helius.xyz/v0";

// Cache for 1 minute to respect rate limits
const cache = new NodeCache({ stdTTL: 60 });

interface TransactionOptions {
    limit?: number;
    before?: string;
    until?: string;
    type?: string;
}

/**
 * Fetch transactions from Helius v0 API
 * Can fetch by address or by transaction type
 */
export async function fetchTransactions(address: string, options: TransactionOptions = {}) {
    if (!HELIUS_API_KEY) {
        console.error("HELIUS_API_KEY is not set. Cannot fetch transactions.");
        return [];
    }

    const cacheKey = `txs-${address}-${JSON.stringify(options)}`;
    const cached = cache.get(cacheKey);
    if (cached) {
        console.log(`📦 Using cached transactions for ${address}: ${Array.isArray(cached) ? cached.length : 'non-array'}`);
        return cached;
    }

    let url = `${BASE_URL}/addresses/${address}/transactions?api-key=${HELIUS_API_KEY}`;

    if (options.limit) url += `&limit=${options.limit}`;
    if (options.before) url += `&before=${options.before}`;
    if (options.until) url += `&until=${options.until}`;
    
    console.log(`🌐 Fetching Helius transactions from: ${url.replace(HELIUS_API_KEY, '***')}`);

    try {
        const response = await fetchWithRetry(url);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Helius API Error: ${response.status} ${response.statusText}`);
            console.error(`URL: ${url.replace(HELIUS_API_KEY, '***')}`);
            console.error(`Error body: ${errorText.substring(0, 500)}`);
            return [];
        }
        
        const data = await response.json();
        
        // Helius v0 API returns transactions as an array directly
        if (Array.isArray(data)) {
            const result = data;
            if (result.length > 0) {
                cache.set(cacheKey, result);
            }
            return result;
        }
        
        // Check for common wrapper formats
        if (data.transactions && Array.isArray(data.transactions)) {
            const result = data.transactions;
            if (result.length > 0) {
                cache.set(cacheKey, result);
            }
            return result;
        }
        
        if (data.result && Array.isArray(data.result)) {
            const result = data.result;
            if (result.length > 0) {
                cache.set(cacheKey, result);
            }
            return result;
        }
        
        // Log unexpected format
        console.warn(`Unexpected Helius API response format for ${address}:`, {
            type: typeof data,
            keys: data ? Object.keys(data).slice(0, 10) : null,
            sample: JSON.stringify(data).substring(0, 200)
        });

        return [];
    } catch (error) {
        console.error("Helius API Error:", error);
        console.error(`Failed URL: ${url.replace(HELIUS_API_KEY, '***')}`);
        return [];
    }
}

/**
 * Fetch SWAP transactions from Jupiter Router
 * Jupiter Router handles most token swaps on Solana
 * This is the equivalent of getting all SWAP transactions
 */
export async function fetchSwapTransactions(options: { limit?: number; before?: string } = {}) {
    const JUPITER_ROUTER_V6 = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
    
    // Use the existing fetchTransactions function with Jupiter Router address
    return fetchTransactions(JUPITER_ROUTER_V6, {
        limit: options.limit || 100,
        before: options.before
    });
}

export async function fetchTokenMetadata(mints: string[]) {
    if (mints.length === 0) return [];

    // Chunk into batches of 100 (Helius limit)
    const chunks = [];
    for (let i = 0; i < mints.length; i += 100) {
        chunks.push(mints.slice(i, i + 100));
    }

    const results = [];
    for (const chunk of chunks) {
        try {
            const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'my-id',
                    method: 'getAssetBatch',
                    params: {
                        ids: chunk
                    }
                })
            });

            const data = await response.json();
            if (data.result) {
                results.push(...data.result);
            }
        } catch (error) {
            console.error("Metadata Fetch Error:", error);
        }
    }

    return results;
}

async function fetchWithRetry(url: string, retries = 3, delay = 1000): Promise<Response> {
    try {
        const response = await fetch(url);
        if (response.status === 429) {
            throw new Error("Rate limit exceeded");
        }
        return response;
    } catch (error: any) {
        if (retries > 0) {
            console.log(`Retrying Helius API... (${retries} left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithRetry(url, retries - 1, delay * 2);
        }
        throw error;
    }
}
