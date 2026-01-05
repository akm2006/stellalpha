import { NextRequest, NextResponse } from 'next/server';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const JUPITER_API_KEY = process.env.JUPITER_API_KEY;
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const NATIVE_SOL = 'NATIVE_SOL'; // Special identifier for native SOL

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

// Fetch prices from Jupiter Price API v3
async function fetchJupiterPrices(mints: string[]): Promise<Record<string, number>> {
  if (mints.length === 0) return {};
  
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (JUPITER_API_KEY) headers['x-api-key'] = JUPITER_API_KEY;
    
    const response = await fetch(
      `https://api.jup.ag/price/v3?ids=${mints.join(',')}`,
      { headers }
    );
    
    if (!response.ok) return {};
    
    const data = await response.json();
    const prices: Record<string, number> = {};
    
    for (const [mint, info] of Object.entries(data)) {
      if (info && typeof info === 'object' && 'usdPrice' in info) {
        prices[mint] = (info as any).usdPrice;
      }
    }
    
    return prices;
  } catch (err) {
    console.error('Jupiter price fetch error:', err);
    return {};
  }
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
    
    // Fetch prices from Jupiter
    const prices = await fetchJupiterPrices(uniqueMints);
    
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
