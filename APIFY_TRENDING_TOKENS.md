# Apify Integration for Trending Tokens

This document explains how we use Apify to fetch trending tokens data, reducing load on Helius API.

## Overview

The trending tokens feature now supports **two data sources**:
1. **Apify (Primary)** - Uses web scrapers to fetch trending tokens from DexScreener and other sources
2. **Helius (Fallback)** - Falls back to on-chain transaction analysis if Apify is unavailable

By default, the system tries Apify first to reduce Helius API usage.

## Apify Actors Used

### 1. DexScreener Top Traders (`agenscrape~dexscreener-top-traders`)
- **Source**: [DexScreener](https://dexscreener.com)
- **Data**: Trending Solana tokens with prices, volume, and transaction counts
- **Best For**: Real-time trending tokens from DEX aggregator
- **Note**: This is the primary source used

### 2. Crypto Intel (`fiery_dream~crypto-intel`)
- **Source**: Multiple cryptocurrency data sources
- **Data**: Trending coins with prices and market sentiment
- **Best For**: Comprehensive market intelligence
- **Note**: Used as fallback if DexScreener fails

### 3. GMGN Sniper (`getodata~gmgn-sniper-new-scraper`)
- **Source**: GMGN platform
- **Data**: New and trending tokens on Solana
- **Best For**: Early detection of new tokens
- **Note**: Available but not currently used in primary flow

## How It Works

```
User Request → API Route → getTrendingTokens()
                                    ↓
                        ┌───────────┴───────────┐
                        │                       │
                   Try Apify              (if fails)
                        ↓                       ↓
            getTrendingTokensFromApify()   Use Helius
                        ↓
            ┌───────────┴───────────┐
            │                       │
    DexScreener Last Run    (if empty)
            ↓                       ↓
        (if empty)          Crypto Intel
                                ↓
                        (if empty)
                                ↓
                        Trigger New DexScreener Run
```

## Configuration

### Environment Variables

Add to your `.env.local`:

```env
# Apify API Token (required for Apify integration)
APIFY_API_TOKEN="your_apify_api_token_here"

# Optional: Disable Apify and use Helius only
USE_APIFY_FOR_TRENDING=false
```

### Getting an Apify API Token

1. Sign up at [Apify.com](https://apify.com)
2. Go to Settings → Integrations → API Tokens
3. Create a new token (scoped tokens recommended)
4. Copy the token and add it to `.env.local`

### Apify Actor Access

The actors used are public, but you may need to:
- Check actor availability in the [Apify Store](https://console.apify.com/store)
- Verify you have access to run these actors (some may require credits)
- Consider setting up scheduled runs if you need more frequent updates

## Benefits

✅ **Reduced Helius Load**: Most requests served from Apify  
✅ **Faster Response**: Apify data is often pre-aggregated  
✅ **Multiple Sources**: Fallback options if one source fails  
✅ **Rich Data**: Includes prices, volumes, and price changes directly  
✅ **Cost Effective**: Apify free tier may be sufficient for light usage  

## Caching

- Both Apify and Helius results are cached for **5 minutes**
- Cache key includes time window (`1h`, `6h`, `24h`)
- Server-side caching using `NodeCache`

## Fallback Logic

1. **First**: Try Apify (DexScreener last run dataset)
2. **Second**: Try Crypto Intel actor
3. **Third**: Trigger new DexScreener run (slower)
4. **Last**: Fall back to Helius-based transaction analysis

This ensures trending tokens are always available even if one source fails.

## API Endpoints

The trending tokens API route remains the same:

```
GET /api/trending?window=1h
GET /api/trending?window=6h
GET /api/trending?window=24h
```

The implementation automatically handles the Apify/Helius routing.

## Monitoring

Check your server logs for:
- `✅ Fetched X trending tokens from Apify` - Apify succeeded
- `Using Helius for trending tokens (Apify unavailable or disabled)` - Using fallback
- `Apify trending tokens fetch failed, falling back to Helius` - Apify error, using Helius

## Troubleshooting

### Apify Not Working

1. **Check API Token**: Verify `APIFY_API_TOKEN` is set correctly
2. **Check Actor Access**: Ensure actors are available in Apify Store
3. **Check Logs**: Look for error messages in server logs
4. **Fallback**: System will automatically use Helius if Apify fails

### To Force Helius

Set in `.env.local`:
```env
USE_APIFY_FOR_TRENDING=false
```

### Rate Limits

- Apify free tier: Limited actor runs
- Consider using last run datasets (faster, no new runs)
- Helius free tier: 100 requests per request limit

## References

- [Apify Store - Top Tokens](https://console.apify.com/store-search?search=top+tokens)
- [DexScreener Actor](https://apify.com/agenscrape/dexscreener-top-traders)
- [Crypto Intel Actor](https://apify.com/fiery_dream/crypto-intel)
- [Apify Documentation](https://docs.apify.com/)
