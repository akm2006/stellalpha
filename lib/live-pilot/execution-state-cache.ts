import { Connection, PublicKey } from '@solana/web3.js';

export interface CachedSolBalance {
  rawLamports: bigint;
  uiAmount: number;
}

export interface CachedTokenBalance {
  rawAmount: string;
  uiAmount: number;
  decimals: number;
}

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const DEFAULT_SOL_BALANCE_CACHE_TTL_MS = 1_500;
const DEFAULT_TOKEN_BALANCE_CACHE_TTL_MS = 1_500;

const solBalanceCache = new Map<string, CacheEntry<CachedSolBalance>>();
const tokenBalanceCache = new Map<string, CacheEntry<CachedTokenBalance>>();

function readTtl(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function rawToUi(rawAmount: string | bigint, decimals: number) {
  const raw = typeof rawAmount === 'bigint' ? rawAmount : BigInt(rawAmount);
  return Number(raw) / Math.pow(10, decimals);
}

function tokenCacheKey(ownerAddress: string, mintAddress: string) {
  return `${ownerAddress}:${mintAddress}`;
}

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string) {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs: number) {
  if (ttlMs <= 0) {
    cache.delete(key);
    return value;
  }

  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
}

export async function getCachedSolBalance(
  connection: Connection,
  ownerAddress: string,
): Promise<CachedSolBalance> {
  const cached = getCached(solBalanceCache, ownerAddress);
  if (cached) {
    return cached;
  }

  const lamports = BigInt(await connection.getBalance(new PublicKey(ownerAddress), 'confirmed'));
  return setCached(
    solBalanceCache,
    ownerAddress,
    {
      rawLamports: lamports,
      uiAmount: rawToUi(lamports, 9),
    },
    readTtl('LIVE_PILOT_SOL_BALANCE_CACHE_TTL_MS', DEFAULT_SOL_BALANCE_CACHE_TTL_MS),
  );
}

export async function getCachedTokenBalance(
  ownerAddress: string,
  mintAddress: string,
  loader: () => Promise<CachedTokenBalance>,
): Promise<CachedTokenBalance> {
  const key = tokenCacheKey(ownerAddress, mintAddress);
  const cached = getCached(tokenBalanceCache, key);
  if (cached) {
    return cached;
  }

  return setCached(
    tokenBalanceCache,
    key,
    await loader(),
    readTtl('LIVE_PILOT_TOKEN_BALANCE_CACHE_TTL_MS', DEFAULT_TOKEN_BALANCE_CACHE_TTL_MS),
  );
}

export function recordSubmittedSwapInCache(args: {
  ownerAddress: string;
  inputMint: string;
  outputMint: string;
  inputRawAmount: string;
  inputDecimals: number;
  outputRawAmount?: string | null;
  outputDecimals?: number | null;
  solMint: string;
}) {
  const {
    ownerAddress,
    inputMint,
    outputMint,
    inputRawAmount,
    inputDecimals,
    outputRawAmount,
    outputDecimals,
    solMint,
  } = args;

  if (inputMint === solMint) {
    const cachedSol = getCached(solBalanceCache, ownerAddress);
    if (cachedSol) {
      const nextRaw = cachedSol.rawLamports > BigInt(inputRawAmount)
        ? cachedSol.rawLamports - BigInt(inputRawAmount)
        : 0n;
      cachedSol.rawLamports = nextRaw;
      cachedSol.uiAmount = rawToUi(nextRaw, 9);
    }
  } else {
    const key = tokenCacheKey(ownerAddress, inputMint);
    const cachedToken = getCached(tokenBalanceCache, key);
    if (cachedToken) {
      const currentRaw = BigInt(cachedToken.rawAmount);
      const nextRaw = currentRaw > BigInt(inputRawAmount)
        ? currentRaw - BigInt(inputRawAmount)
        : 0n;
      cachedToken.rawAmount = nextRaw.toString();
      cachedToken.uiAmount = rawToUi(nextRaw, inputDecimals);
    }
  }

  if (outputMint !== solMint && outputRawAmount && outputDecimals !== null && outputDecimals !== undefined) {
    const key = tokenCacheKey(ownerAddress, outputMint);
    const cachedToken = getCached(tokenBalanceCache, key);
    if (cachedToken) {
      const nextRaw = BigInt(cachedToken.rawAmount) + BigInt(outputRawAmount);
      cachedToken.rawAmount = nextRaw.toString();
      cachedToken.uiAmount = rawToUi(nextRaw, outputDecimals);
    }
  }
}
