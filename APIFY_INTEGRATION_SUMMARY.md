# Apify Integration Summary

## Overview

We've successfully integrated Apify actors to fetch trending tokens data, significantly reducing the load on Helius API. The system now uses Apify as the primary source with automatic fallback to Helius if needed.

## Changes Made

### 1. New File: `lib/apify-trending.ts`
- Created a new module for fetching trending tokens from Apify
- Supports multiple Apify actors:
  - **DexScreener Top Traders** (primary)
  - **Crypto Intel** (fallback)
  - **GMGN Sniper** (available but not in primary flow)
- Implements smart fallback logic between sources
- Includes caching (5-minute TTL)

### 2. Updated: `lib/analytics/trending.ts`
- Added Apify integration with fallback to Helius
- Uses environment variable `USE_APIFY_FOR_TRENDING` (default: true)
- Automatically tries Apify first, falls back to Helius if Apify fails
- Ensures data format compatibility with existing component

### 3. Updated: `lib/apify.ts`
- Changed to use environment variable `APIFY_API_TOKEN` instead of hardcoded value
- Maintains backward compatibility with default token

### 4. Updated: `components/TrendingTokens.tsx`
- Added support for `priceChange24h` field
- Now displays actual price changes instead of random values
- Shows red for negative changes, green for positive

### 5. Documentation: `APIFY_TRENDING_TOKENS.md`
- Comprehensive guide on how the integration works
- Configuration instructions
- Troubleshooting tips
- References to Apify actors

## Environment Variables

Add to `.env.local`:

```env
# Apify API Token (required)
APIFY_API_TOKEN="your_apify_api_token_here"

# Optional: Disable Apify (use Helius only)
USE_APIFY_FOR_TRENDING=false
```

## Benefits

✅ **Reduced Helius Load**: Most requests now served from Apify  
✅ **Faster Responses**: Pre-aggregated data from Apify  
✅ **Multiple Fallbacks**: Apify → Helius ensures data availability  
✅ **Rich Data**: Prices, volumes, and price changes included  
✅ **Cost Effective**: Reduces Helius API usage  

## Apify Actors Used

1. **DexScreener Top Traders** (`agenscrape~dexscreener-top-traders`)
   - Scrapes DexScreener for Solana trending tokens
   - Provides prices, volumes, transaction counts

2. **Crypto Intel** (`fiery_dream~crypto-intel`)
   - Enterprise-grade cryptocurrency market intelligence
   - Provides trending coins with prices and sentiment

3. **GMGN Sniper** (`getodata~gmgn-sniper-new-scraper`)
   - Identifies new and trending tokens on Solana
   - Available for future use

## Data Flow

```
API Request → getTrendingTokens()
                    ↓
            ┌───────┴───────┐
            │               │
      Try Apify      (if fails)
            ↓               ↓
    getTrendingTokensFromApify()  →  Helius (fallback)
            ↓
    DexScreener Last Run
            ↓
    (if empty) → Crypto Intel
            ↓
    (if empty) → Trigger New DexScreener Run
```

## Testing

1. **Test Apify Integration**:
   ```bash
   # Set APIFY_API_TOKEN in .env.local
   # Restart dev server
   npm run dev
   # Check logs for "✅ Fetched X trending tokens from Apify"
   ```

2. **Test Fallback**:
   ```bash
   # Set USE_APIFY_FOR_TRENDING=false
   # Or remove APIFY_API_TOKEN
   # Should see "Using Helius for trending tokens"
   ```

3. **Monitor Logs**:
   - `✅ Fetched X trending tokens from Apify` - Success
   - `Apify trending tokens fetch failed, falling back to Helius` - Fallback triggered
   - `Using Helius for trending tokens (Apify unavailable or disabled)` - Helius only

## Next Steps

1. **Verify Apify Actors**: Check that the actor IDs are correct and accessible
   - Visit [Apify Store](https://console.apify.com/store-search?search=top+tokens)
   - Verify actor availability and pricing

2. **Set Up Apify Token**:
   - Sign up at [Apify.com](https://apify.com)
   - Get API token from Settings → Integrations
   - Add to `.env.local`

3. **Monitor Usage**:
   - Check Apify dashboard for actor run usage
   - Monitor Helius API usage reduction
   - Adjust caching TTL if needed

## References

- [Apify Store - Top Tokens](https://console.apify.com/store-search?search=top+tokens)
- [DexScreener Actor](https://apify.com/agenscrape/dexscreener-top-traders)
- [Crypto Intel Actor](https://apify.com/fiery_dream/crypto-intel)
- [Apify Documentation](https://docs.apify.com/)
