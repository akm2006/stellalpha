import { NextRequest, NextResponse } from 'next/server';
import { getTokensMetadata } from '@/lib/jupiter-tokens';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const JUPITER_API_KEY = process.env.JUPITER_API_KEY;
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const NATIVE_SOL = 'NATIVE_SOL'; // Special identifier for native SOL

// Add Stablecoins to ensure price fetching (even if mocked as $1 by some UIs, we want real data if possible or consistent $1)
const STABLE_MINTS = [
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB'  // USD1
];

// Configuration for Jupiter API batching
const BATCH_SIZE = 30; // Jupiter works well with ~30 tokens per request
const REQUEST_TIMEOUT_MS = 8000; // 8 seconds timeout per batch
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

interface PortfolioItem {
  mint: string;
  symbol: string;
  name: string;
  logoURI: string | null;
  balance: number;
  decimals: number;
  pricePerToken: number | null;
  totalValue: number | null;
  holdingPercent: number | null;
  isNative: boolean;
  isDust: boolean;
}

// Helper: fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Helper: delay for retries
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch prices from Jupiter Price API v3 with batching and retry logic
async function fetchJupiterPrices(mints: string[]): Promise<Record<string, number>> {
  if (mints.length === 0) return {};
  
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (JUPITER_API_KEY) headers['x-api-key'] = JUPITER_API_KEY;
  
  const allPrices: Record<string, number> = {};
  
  // Split mints into batches
  const batches: string[][] = [];
  for (let i = 0; i < mints.length; i += BATCH_SIZE) {
    batches.push(mints.slice(i, i + BATCH_SIZE));
  }
  
  console.log(`[Portfolio] Fetching prices for ${mints.length} tokens in ${batches.length} batch(es)`);
  
  // Process batches SEQUENTIALLY to avoid rate limits
  const DELAY_BETWEEN_BATCHES_MS = 200;
  
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    
    // Add delay between batches (except for first one)
    if (i > 0) {
      await delay(DELAY_BETWEEN_BATCHES_MS);
    }
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetchWithTimeout(
          `https://api.jup.ag/price/v3?ids=${batch.join(',')}`,
          { headers },
          REQUEST_TIMEOUT_MS
        );
        
        // Handle rate limiting with longer backoff
        if (response.status === 429) {
          console.warn(`[Portfolio] Price API rate limited (429), waiting...`);
          await delay(1500);
          continue;
        }
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        for (const [mint, info] of Object.entries(data)) {
          if (info && typeof info === 'object' && 'usdPrice' in info) {
            allPrices[mint] = (info as { usdPrice: number }).usdPrice;
          }
        }
        
        break; // Success, exit retry loop
      } catch (err) {
        if (attempt === MAX_RETRIES) {
          console.warn(`[Portfolio] Price batch ${i + 1}/${batches.length} failed:`, err);
        } else {
          await delay(RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }
  }
  
  console.log(`[Portfolio] Successfully fetched ${Object.keys(allPrices).length} prices`);
  return allPrices;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');
  
  if (!wallet) {
    return NextResponse.json({ error: 'Wallet address required' }, { status: 400 });
  }
  
  if (!HELIUS_API_KEY) {
    return NextResponse.json({ error: 'Helius API key not configured' }, { status: 500 });
  }
  
  try {
    // Fetch assets from Helius
    const response = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'portfolio-query',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: wallet,
          page: 1,
          limit: 1000,
          displayOptions: {
            showFungible: true,
            showNativeBalance: true
          }
        }
      })
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.error('Helius RPC error:', data.error);
      return NextResponse.json({ error: 'Failed to fetch portfolio' }, { status: 500 });
    }
    
    const result = data.result;
    
    // Track all items with balances
    const items: { mint: string; balance: number; decimals: number; symbol: string; name: string; logoURI: string | null; isNative: boolean }[] = [];
    
    // Extract native SOL balance (this is the actual SOL, not wrapped)
    const nativeBalance = result.nativeBalance || {};
    const nativeSolBalance = (nativeBalance.lamports || 0) / 1e9;
    
    if (nativeSolBalance > 0.0001) {
      items.push({
        mint: NATIVE_SOL,
        balance: nativeSolBalance,
        decimals: 9,
        symbol: 'SOL',
        name: 'Solana (Native)',
        logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
        isNative: true
      });
    }
    
    // Extract fungible tokens (including wrapped SOL if any)
    for (const item of result.items || []) {
      if (item.interface === 'FungibleToken' || item.interface === 'FungibleAsset') {
        const tokenInfo = item.token_info || {};
        const metadata = item.content?.metadata || {};
        const links = item.content?.links || {};
        
        const rawBalance = tokenInfo.balance || 0;
        const decimals = tokenInfo.decimals || 0;
        const adjustedBalance = rawBalance / Math.pow(10, decimals);
        
        // Skip dust
        if (adjustedBalance < 0.0001) continue;
        
        // Identify wrapped SOL
        const isWrappedSol = item.id === SOL_MINT;
        
        items.push({
          mint: item.id,
          balance: adjustedBalance,
          decimals,
          symbol: isWrappedSol ? 'wSOL' : (metadata.symbol || item.id.slice(0, 6)),
          name: isWrappedSol ? 'Wrapped SOL' : (metadata.name || 'Unknown Token'),
          logoURI: links.image || (isWrappedSol ? 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png' : null),
          isNative: false
        });
      }
    }
    
    // Get mints for price fetching (use SOL_MINT for both native and wrapped SOL price)
    const mintsForPricing = items.map(item => item.mint === NATIVE_SOL ? SOL_MINT : item.mint);
    const uniqueMints = [...new Set(mintsForPricing)];
    
    // Fetch prices and token metadata from Jupiter (unified cache with demo vault)
    const [prices, tokenMeta] = await Promise.all([
      fetchJupiterPrices(uniqueMints),
      getTokensMetadata(items.filter(i => !i.isNative).map(i => i.mint))
    ]);
    
    // Apply Jupiter metadata to items (overrides stale Helius data)
    for (const item of items) {
      if (!item.isNative && tokenMeta[item.mint]) {
        const meta = tokenMeta[item.mint];
        item.symbol = meta.symbol || item.symbol;
        item.name = meta.name || item.name;
        item.logoURI = meta.logoURI || item.logoURI;
      }
    }
    
    // Build portfolio items with prices
    let totalPortfolioValue = 0;
    const portfolioItems: PortfolioItem[] = [];
    
    for (const item of items) {
      // For native SOL, use the wSOL price
      const priceMint = item.mint === NATIVE_SOL ? SOL_MINT : item.mint;
      const price = prices[priceMint] || null;
      const totalValue = price ? item.balance * price : null;
      
      if (totalValue !== null) {
        totalPortfolioValue += totalValue;
      }
      
      portfolioItems.push({
        mint: item.mint,
        symbol: item.symbol,
        name: item.name,
        logoURI: item.logoURI,
        balance: item.balance,
        decimals: item.decimals,
        pricePerToken: price,
        totalValue,
        holdingPercent: null, // Will calculate after we have total
        isNative: item.isNative,
        isDust: false // Will be set after calculating percentages
      });
    }
    
    // Calculate holding percentages and mark dust
    for (const item of portfolioItems) {
      if (item.totalValue !== null && totalPortfolioValue > 0) {
        item.holdingPercent = (item.totalValue / totalPortfolioValue) * 100;
        item.isDust = item.holdingPercent < 0.1;
      } else {
        item.isDust = true; // No price = dust
      }
    }
    
    // Sort by value (highest first), with native SOL at top
    portfolioItems.sort((a, b) => {
      if (a.isNative) return -1;
      if (b.isNative) return 1;
      return (b.totalValue || 0) - (a.totalValue || 0);
    });
    
    // Extract native SOL for separate display
    const nativeSolItem = portfolioItems.find(p => p.isNative);
    const solBalance = nativeSolItem ? {
      balance: nativeSolItem.balance,
      pricePerToken: nativeSolItem.pricePerToken,
      totalValue: nativeSolItem.totalValue,
      holdingPercent: nativeSolItem.holdingPercent
    } : null;
    
    // Tokens list (excludes native SOL, but includes wrapped SOL if any)
    const tokens = portfolioItems.filter(p => !p.isNative);
    
    return NextResponse.json({
      wallet,
      solBalance,
      tokens,
      totalTokens: tokens.length,
      totalPortfolioValue
    });
  } catch (error) {
    console.error('Portfolio fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch portfolio' }, { status: 500 });
  }
}
