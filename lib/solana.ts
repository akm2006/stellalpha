import { Connection, PublicKey, ParsedTransactionWithMeta } from "@solana/web3.js";

const HELIUS_API_KEY = process.env.NEXT_PUBLIC_HELIUS_API_KEY;

if (!HELIUS_API_KEY) {
    console.warn("⚠️ NEXT_PUBLIC_HELIUS_API_KEY environment variable is not set. Helius features may not work.");
}
const RPC_ENDPOINT = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const connection = new Connection(RPC_ENDPOINT, "confirmed");

async function withRetry<T>(fn: () => Promise<T>, retries = 5, delay = 2000): Promise<T> {
    try {
        return await fn();
    } catch (error: any) {
        if (retries > 0 && error?.message?.includes('429')) {
            console.log(`RPC Rate limit hit, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return withRetry(fn, retries - 1, delay * 2);
        }
        throw error;
    }
}

// --- Types ---

export interface Asset {
    name: string;
    symbol: string;
    mint: string;
    amount: number;
    value: number;
    price: number;
    color: string;
}

export interface Trade {
    date: string;
    type: 'Open Long' | 'Close Long' | 'Open Short' | 'Close Short' | 'Swap' | 'Transfer' | 'Unknown';
    symbol: string;
    price: string;
    amount: string;
    value: string;
    pnl?: string;
    signature: string;
}

// --- Assets Fetching ---

export async function fetchTraderAssets(walletAddress: string): Promise<Asset[]> {
    try {
        const pubKey = new PublicKey(walletAddress);
        const accounts = await withRetry(() => connection.getParsedTokenAccountsByOwner(pubKey, {
            programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") // Token Program
        }));

        // Filter non-zero balances
        const nonZeroAccounts = accounts.value.filter(acc => {
            const amount = acc.account.data.parsed.info.tokenAmount.uiAmount;
            return amount > 0;
        });

        if (nonZeroAccounts.length === 0) return [];

        // Get Mints
        const mints = nonZeroAccounts.map(acc => acc.account.data.parsed.info.mint);

        // Fetch Token Info from Jupiter
        const tokenMap = await fetchJupiterTokenList(mints);

        // Fetch Prices
        const priceMap = await fetchJupiterPrices(mints);

        // Map to Asset
        const assets: Asset[] = nonZeroAccounts.map(acc => {
            const mint = acc.account.data.parsed.info.mint;
            const amount = acc.account.data.parsed.info.tokenAmount.uiAmount;
            const token = tokenMap.get(mint);
            const price = priceMap.get(mint) || 0;
            const value = amount * price;

            return {
                name: token?.name || "Unknown Token",
                symbol: token?.symbol || mint.slice(0, 4),
                mint,
                amount,
                value,
                price,
                color: generateColor(mint)
            };
        }).filter(a => a.value > 1); // Filter dust (< $1)

        // Sort by value desc
        return assets.sort((a, b) => b.value - a.value);

    } catch (error) {
        console.error("Error fetching assets:", error);
        return [];
    }
}

// --- History Fetching ---

export async function fetchTraderRecentTrades(walletAddress: string): Promise<Trade[]> {
    try {
        const pubKey = new PublicKey(walletAddress);
        const signatures = await withRetry(() => connection.getSignaturesForAddress(pubKey, { limit: 10 }));

        const trades: Trade[] = [];

        // Fetch parsed transactions
        // Note: getParsedTransactions is better but might hit rate limits on public RPC
        // We'll do serial for safety on public RPC, or small batch
        for (const sigInfo of signatures) {
            const tx = await withRetry(() => connection.getParsedTransaction(sigInfo.signature, {
                maxSupportedTransactionVersion: 0
            }));

            if (!tx) continue;

            const trade = parseTransaction(tx, sigInfo.signature, walletAddress);
            if (trade) trades.push(trade);
        }

        return trades;

    } catch (error) {
        console.error("Error fetching trades:", error);
        return [];
    }
}

// --- Helpers ---

async function fetchJupiterTokenList(mints: string[]): Promise<Map<string, { name: string, symbol: string }>> {
    try {
        if (mints.length === 0) return new Map();

        // Fetch strict list with timeout and error handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const response = await fetch("https://token.jup.ag/strict", { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`Jupiter Token API error: ${response.statusText}`);

        const tokens = await response.json();
        const map = new Map();
        tokens.forEach((t: any) => {
            if (mints.includes(t.address)) {
                map.set(t.address, { name: t.name, symbol: t.symbol });
            }
        });
        return map;
    } catch (e) {
        console.error("Error fetching token list:", e);
        return new Map();
    }
}

async function fetchJupiterPrices(mints: string[]): Promise<Map<string, number>> {
    try {
        if (mints.length === 0) return new Map();

        const ids = mints.join(',');
        const response = await fetch(`https://price.jup.ag/v4/price?ids=${ids}`);

        if (!response.ok) throw new Error(`Jupiter Price API error: ${response.statusText}`);

        const data = await response.json();
        const map = new Map();

        if (data.data) {
            Object.values(data.data).forEach((p: any) => {
                map.set(p.id, p.price);
            });
        }
        return map;
    } catch (e) {
        console.error("Error fetching prices:", e);
        return new Map();
    }
}

function parseTransaction(tx: ParsedTransactionWithMeta, signature: string, wallet: string): Trade | null {
    if (!tx.meta || !tx.blockTime) return null;

    // Very basic parsing logic
    // We look for balance changes to guess what happened
    const preBalances = tx.meta.preTokenBalances || [];
    const postBalances = tx.meta.postTokenBalances || [];

    // Find changes for this wallet
    // This is complex. For now, let's just return a generic "Interaction"
    // or try to find a Swap.

    // Check logs for common programs
    const logs = tx.meta.logMessages || [];
    const isJupiter = logs.some(l => l.includes("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4")); // Jupiter Aggregator v6

    let type: Trade['type'] = 'Unknown';
    if (isJupiter) type = 'Swap';

    return {
        date: new Date(tx.blockTime * 1000).toLocaleString(),
        type,
        symbol: 'SOL/USDC', // Placeholder, hard to derive without deep parsing
        price: '0.00',
        amount: '0.00',
        value: '0.00',
        pnl: undefined,
        signature
    };
}

function generateColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase();
    return '#' + "00000".substring(0, 6 - c.length) + c;
}
