# CoinGecko & DexScreener Integration for Comprehensive Token Data

This document explains how we use CoinGecko and DexScreener APIs to fetch comprehensive token data including prices, market cap, volume, price changes, supply, and holders.

## Overview

The trending tokens feature now fetches comprehensive token data from multiple FREE sources:
1. **Jupiter v3 Price API (Primary)** - Price and 24h price change (FREE, no key)
2. **DexScreener API (Secondary)** - Market cap and volume (FREE, no key)
3. **CoinGecko API (Fallback)** - Comprehensive market data (FREE tier, no key)

## Data Sources

### Jupiter v3 Price API (Primary - FREE, No Key Required)
- **Endpoint**: `https://lite-api.jup.ag/price/v3`
- **Benefits**: 
  - ✅ **FREE - No API key required**
  - Native Solana price data
  - Includes 24h price change directly
  - Fast and reliable
  - Returns: `usdPrice`, `priceChange24h`, `decimals`, `blockId`
- **Rate Limits**: Reasonable limits, supports multiple tokens per request

### DexScreener API (Secondary - FREE, No Key Required)
- **Endpoint**: `https://api.dexscreener.com/latest/dex/tokens/{addresses}`
- **Benefits**: 
  - ✅ **FREE - No API key required**
  - Excellent Solana token coverage
  - Real-time DEX data
  - Includes market cap, volume, price changes
  - Fast response times
- **Rate Limits**: Reasonable limits, supports up to 30 tokens per request

### CoinGecko API (Fallback - FREE, No Key Required)
- **Endpoint**: `https://api.coingecko.com/api/v3/simple/token_price/solana`
- **Benefits**:
  - ✅ **FREE - No API key required** (free tier)
  - Comprehensive market data
  - Market cap, volume, price changes (24h, 7d, 30d)
  - Supply information
  - Holder counts (if available)
- **Rate Limits**: 
  - Free tier: 30 calls/minute (no key needed)
  - No signup or registration required

## Data Fields Fetched

The integration fetches the following comprehensive data for each token:

### Price Data
- Current price (USD)
- 24h price change (%)
- 7d price change (%)
- 30d price change (%)

### Market Data
- Market capitalization (USD)
- 24h trading volume (USD)
- Last updated timestamp

### Supply Data
- Circulating supply
- Total supply

### Holder Data
- Number of holders (if available)

## Configuration

### ✅ No Configuration Required!

Both APIs work **completely free** without any API keys, signup, or registration:
- **DexScreener**: Free, no key needed
- **CoinGecko**: Free tier (30 calls/min), no key needed

**No `.env.local` setup required!** Everything works out of the box.

## How It Works

```
User Request → API Route → getTrendingTokens()
                                    ↓
                    ┌───────────────┴───────────────┐
                    │                               │
            Try Apify/Helius              (get trending tokens)
                    ↓                               ↓
        Get token addresses          Fetch comprehensive data
                    ↓                               ↓
        fetchTokenData()  →  Priority Order:
                    ↓
        1. Jupiter v3 Price API (price + 24h change)
                    ↓
        2. DexScreener API (market cap + volume)
                    ↓
        3. CoinGecko API (fallback for missing data)
                    ↓
            Merge all data → Return enriched tokens
```

## Integration Flow

1. **Get Trending Tokens**: First, we get trending token addresses from Apify or Helius
2. **Fetch Comprehensive Data**: For each token address, we fetch comprehensive data
3. **Priority**: DexScreener first (better Solana coverage), then CoinGecko for missing data
4. **Merge**: Combine data from all sources into a unified format
5. **Cache**: Results are cached for 5 minutes to reduce API calls

## Data Structure

```typescript
interface CoinGeckoTokenData {
    price: number;                    // Current price in USD
    marketCap?: number;               // Market capitalization
    volume24h?: number;               // 24h trading volume
    priceChange24h?: number;          // 24h price change %
    priceChange7d?: number;           // 7d price change %
    priceChange30d?: number;          // 30d price change %
    circulatingSupply?: number;       // Circulating supply
    totalSupply?: number;             // Total supply
    holders?: number;                 // Number of holders
    lastUpdated?: number;             // Last updated timestamp
}
```

## Rate Limit Handling

The integration includes built-in rate limit handling:

1. **Chunking**: Requests are split into smaller chunks
2. **Delays**: Small delays between chunks to respect rate limits
3. **Error Handling**: Graceful fallback if one source fails
4. **Caching**: Aggressive caching (5 minutes) to reduce API calls

## Benefits

✅ **Comprehensive Data**: Market cap, volume, price changes, supply, holders  
✅ **Multiple Sources**: DexScreener + CoinGecko for maximum coverage  
✅ **Smart Fallback**: Uses best available source for each token  
✅ **Rate Limit Safe**: Built-in handling for API rate limits  
✅ **Fast**: Prioritizes faster sources (DexScreener)  
✅ **Cost Effective**: Free tiers work well, caching reduces costs  

## Display in UI

The enhanced TrendingTokens component now displays:

- **Price**: Current token price with proper formatting
- **Price Change**: 24h price change with color coding (green/red)
- **Market Cap**: Formatted market capitalization
- **Volume**: 24h trading volume
- **Supply**: Circulating supply (if available)
- **Holders**: Number of token holders (if available)

## Troubleshooting

### Prices showing as "Price N/A"

- Check that token addresses are valid Solana mint addresses
- Verify the token is listed on DexScreener or CoinGecko
- Check network connectivity
- Review console logs for API errors

### Rate Limit Errors

- CoinGecko free tier: 30 calls/minute
- Reduce the number of tokens fetched at once
- Increase caching duration
- Consider upgrading to a paid CoinGecko plan

### Missing Data

- Some tokens may not have all fields available
- DexScreener has better Solana coverage than CoinGecko
- New tokens may not have market cap data yet
- Check both sources for missing fields

## References

- [CoinGecko API Documentation](https://docs.coingecko.com/)
- [DexScreener API Documentation](https://docs.dexscreener.com/)
- [CoinGecko API Pricing](https://www.coingecko.com/en/api/pricing)
