import BN from 'bn.js';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  CpAmm,
  getCurrentPoint,
  getTokenProgram,
  SwapMode,
  type PoolState,
} from '@meteora-ag/cp-amm-sdk';
import type { TradeSourceClassification } from '@/lib/ingestion/trade-source-classifier';
import {
  getLivePilotMeteoraDammV2CandidatePools,
  isMeteoraDammV2Source,
  METEORA_DAMM_V2_PROGRAM_ID,
} from '@/lib/live-pilot/meteora-damm-v2-cache';
import {
  resolveWithinBudget,
  uniqueBoundedCandidates,
} from '@/lib/live-pilot/direct-route-resolution';
import { sendLivePilotTransaction } from '@/lib/live-pilot/fast-sender';

interface MeteoraDammV2SwapPlan {
  inputMint: string;
  outputMint: string;
  inputAmountRaw: string;
  inputDecimals: number;
  outputDecimals: number;
  slippageBps: number | null;
  maxPriceImpactPct: number;
  sourceClassification?: TradeSourceClassification;
}

export interface MeteoraDammV2ExecutionResult {
  pool: string;
  signature: string;
  signedTransaction: string;
  quotedInputRaw: string;
  quotedOutputRaw: string | null;
  quotedInputAmount: number;
  quotedOutputAmount: number | null;
  priceImpactPct: number;
  quoteReceivedAt: string;
  txBuiltAt: string;
  txSubmittedAt: string;
}

type MeteoraError = Error & {
  code?: string;
  sourceClassification?: TradeSourceClassification;
};

const DEFAULT_METEORA_SLIPPAGE_BPS = 1000;
const DEFAULT_METEORA_COMPUTE_UNIT_LIMIT = 350_000;
const DEFAULT_METEORA_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = 25_000;
const DEFAULT_METEORA_POOL_DISCOVERY_TIMEOUT_MS = 650;
const POOL_CACHE_TTL_MS = 10 * 60 * 1000;

const poolByPairKey = new Map<string, {
  pool: string;
  expiresAt: number;
}>();

function readBooleanEnv(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function readPositiveIntEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readNonNegativeIntEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export const meteoraDammV2LivePilotConfig = {
  enabled: readBooleanEnv('LIVE_PILOT_METEORA_DAMM_V2_ENABLED', false),
  directFirst: readBooleanEnv('LIVE_PILOT_METEORA_DAMM_V2_FIRST', false),
  buyFirst: readBooleanEnv('LIVE_PILOT_METEORA_DAMM_V2_FIRST', false)
    || readBooleanEnv('LIVE_PILOT_METEORA_DAMM_V2_BUY_FIRST', false),
  sellFirst: readBooleanEnv('LIVE_PILOT_METEORA_DAMM_V2_FIRST', false)
    || readBooleanEnv('LIVE_PILOT_METEORA_DAMM_V2_SELL_FIRST', false),
  skipPreflight: readBooleanEnv('LIVE_PILOT_METEORA_SKIP_PREFLIGHT', true),
  slippageBps: readPositiveIntEnv('LIVE_PILOT_METEORA_SLIPPAGE_BPS', DEFAULT_METEORA_SLIPPAGE_BPS),
  computeUnitLimit: readPositiveIntEnv('LIVE_PILOT_METEORA_COMPUTE_UNIT_LIMIT', DEFAULT_METEORA_COMPUTE_UNIT_LIMIT),
  computeUnitPriceMicroLamports: readNonNegativeIntEnv(
    'LIVE_PILOT_METEORA_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS',
    DEFAULT_METEORA_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS,
  ),
  poolDiscoveryTimeoutMs: readPositiveIntEnv(
    'LIVE_PILOT_METEORA_POOL_DISCOVERY_TIMEOUT_MS',
    DEFAULT_METEORA_POOL_DISCOVERY_TIMEOUT_MS,
  ),
};

function createMeteoraError(
  code: string,
  message: string,
  sourceClassification?: TradeSourceClassification,
) {
  const error = new Error(message) as MeteoraError;
  error.code = code;
  error.sourceClassification = sourceClassification;
  return error;
}

function publicKeyString(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof (value as { toBase58?: unknown })?.toBase58 === 'function') {
    return (value as { toBase58: () => string }).toBase58();
  }
  return String(value || '');
}

function rawToUi(rawAmount: string | bigint, decimals: number) {
  const raw = typeof rawAmount === 'bigint' ? rawAmount : BigInt(rawAmount);
  return Number(raw) / Math.pow(10, decimals);
}

function decimalToNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof (value as { toNumber?: unknown })?.toNumber === 'function') {
    const parsed = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof (value as { toString?: unknown })?.toString === 'function') {
    const parsed = Number((value as { toString: () => string }).toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function poolMatchesPair(poolState: PoolState, inputMint: string, outputMint: string) {
  const tokenAMint = publicKeyString((poolState as any).tokenAMint);
  const tokenBMint = publicKeyString((poolState as any).tokenBMint);
  return (
    (tokenAMint === inputMint && tokenBMint === outputMint)
    || (tokenAMint === outputMint && tokenBMint === inputMint)
  );
}

function pairKey(inputMint: string, outputMint: string) {
  return [inputMint, outputMint].sort().join(':');
}

function rememberPairPool(inputMint: string, outputMint: string, pool: PublicKey) {
  poolByPairKey.set(pairKey(inputMint, outputMint), {
    pool: pool.toBase58(),
    expiresAt: Date.now() + POOL_CACHE_TTL_MS,
  });
}

async function fetchCachedPairPool(args: {
  cpAmm: CpAmm;
  inputMint: string;
  outputMint: string;
}) {
  const cached = poolByPairKey.get(pairKey(args.inputMint, args.outputMint));
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    poolByPairKey.delete(pairKey(args.inputMint, args.outputMint));
    return null;
  }

  try {
    const pool = new PublicKey(cached.pool);
    const poolState = await args.cpAmm.fetchPoolState(pool);
    if (poolMatchesPair(poolState, args.inputMint, args.outputMint)) {
      return { pool, poolState, source: 'pair_cache' as const };
    }
  } catch {
    poolByPairKey.delete(pairKey(args.inputMint, args.outputMint));
  }

  return null;
}

async function fetchCandidatePool(args: {
  cpAmm: CpAmm;
  inputMint: string;
  outputMint: string;
  candidates: string[];
}) {
  const results = await Promise.all(
    args.candidates.map(async (candidate) => {
      try {
        const pool = new PublicKey(candidate);
        const poolState = await args.cpAmm.fetchPoolState(pool);
        if (poolMatchesPair(poolState, args.inputMint, args.outputMint)) {
          return { pool, poolState, source: 'leader_candidates' as const };
        }
      } catch {
        // Candidate account lists contain mints, vaults, programs, and users too.
      }
      return null;
    }),
  );

  const match = results.find((result) => Boolean(result)) ?? null;
  if (match) {
    rememberPairPool(args.inputMint, args.outputMint, match.pool);
  }

  return match;
}

async function fetchPoolByTokenMint(args: {
  cpAmm: CpAmm;
  inputMint: string;
  outputMint: string;
}) {
  const tokenMints = Array.from(new Set([args.inputMint, args.outputMint]));

  for (const tokenMint of tokenMints) {
    try {
      const pools = await args.cpAmm.fetchPoolStatesByTokenAMint(new PublicKey(tokenMint));
      const match = pools.find((entry) => poolMatchesPair(entry.account, args.inputMint, args.outputMint));
      if (match) {
        rememberPairPool(args.inputMint, args.outputMint, match.publicKey);
        return {
          pool: match.publicKey,
          poolState: match.account,
          source: 'token_a_lookup' as const,
        };
      }
    } catch {
      // Some tokens are tokenB, not tokenA, or RPC may reject under load; try the next mint.
    }
  }

  return null;
}

async function resolveMeteoraDammV2Pool(args: {
  cpAmm: CpAmm;
  signature: string | null | undefined;
  inputMint: string;
  outputMint: string;
}) {
  const candidates = uniqueBoundedCandidates(getLivePilotMeteoraDammV2CandidatePools(args.signature));

  return resolveWithinBudget(
    (async () => {
      const cached = await fetchCachedPairPool(args);
      if (cached) return cached;

      const candidatePool = await fetchCandidatePool({
        ...args,
        candidates,
      });
      if (candidatePool) return candidatePool;

      return fetchPoolByTokenMint(args);
    })(),
    meteoraDammV2LivePilotConfig.poolDiscoveryTimeoutMs,
  );
}

export function shouldUseMeteoraDammV2ForBuy(plan: {
  sourceClassification?: TradeSourceClassification;
}, leaderType: string | null | undefined) {
  return shouldUseMeteoraDammV2ForSwap(plan, leaderType) && leaderType === 'buy';
}

export function shouldUseMeteoraDammV2ForSwap(plan: {
  sourceClassification?: TradeSourceClassification;
}, leaderType: string | null | undefined) {
  return (
    meteoraDammV2LivePilotConfig.enabled
    && (leaderType === 'buy' || leaderType === 'sell')
    && isMeteoraDammV2Source(plan.sourceClassification)
  );
}

export function shouldUseMeteoraDammV2BuyFirst(plan: {
  sourceClassification?: TradeSourceClassification;
}, leaderType: string | null | undefined) {
  return (
    meteoraDammV2LivePilotConfig.enabled
    && meteoraDammV2LivePilotConfig.buyFirst
    && leaderType === 'buy'
    && isMeteoraDammV2Source(plan.sourceClassification)
  );
}

export function shouldUseMeteoraDammV2SellFirst(plan: {
  sourceClassification?: TradeSourceClassification;
}, leaderType: string | null | undefined) {
  return (
    meteoraDammV2LivePilotConfig.enabled
    && meteoraDammV2LivePilotConfig.sellFirst
    && leaderType === 'sell'
    && isMeteoraDammV2Source(plan.sourceClassification)
  );
}

export function shouldUseMeteoraDammV2First(plan: {
  sourceClassification?: TradeSourceClassification;
}, leaderType: string | null | undefined) {
  return shouldUseMeteoraDammV2BuyFirst(plan, leaderType)
    || shouldUseMeteoraDammV2SellFirst(plan, leaderType);
}

export async function executeMeteoraDammV2Swap(args: {
  connection: Connection;
  keypair: Keypair;
  leaderSignature: string | null | undefined;
  plan: MeteoraDammV2SwapPlan;
}) {
  const { connection, keypair, leaderSignature, plan } = args;
  const cpAmm = new CpAmm(connection);

  const resolved = await resolveMeteoraDammV2Pool({
    cpAmm,
    signature: leaderSignature,
    inputMint: plan.inputMint,
    outputMint: plan.outputMint,
  });

  if (!resolved) {
    throw createMeteoraError(
      'meteora_pool_unresolved',
      `Meteora DAMM v2 pool could not be resolved for ${plan.inputMint} -> ${plan.outputMint}`,
      plan.sourceClassification,
    );
  }

  const inputMint = new PublicKey(plan.inputMint);
  const outputMint = new PublicKey(plan.outputMint);
  const amountIn = new BN(plan.inputAmountRaw);
  const slippageBps = plan.slippageBps ?? meteoraDammV2LivePilotConfig.slippageBps;
  const slippagePct = slippageBps / 100;
  const quoteReceivedAt = new Date().toISOString();

  let quote: any;
  try {
    quote = cpAmm.getQuote2({
      inputTokenMint: inputMint,
      slippage: slippagePct,
      currentPoint: await getCurrentPoint(connection, (resolved.poolState as any).activationType),
      poolState: resolved.poolState,
      tokenADecimal: plan.inputMint === publicKeyString((resolved.poolState as any).tokenAMint)
        ? plan.inputDecimals
        : plan.outputDecimals,
      tokenBDecimal: plan.outputMint === publicKeyString((resolved.poolState as any).tokenBMint)
        ? plan.outputDecimals
        : plan.inputDecimals,
      hasReferral: false,
      swapMode: SwapMode.ExactIn,
      amountIn,
    });
  } catch (error) {
    throw createMeteoraError(
      'meteora_quote_failed',
      `Meteora DAMM v2 quote failed: ${error instanceof Error ? error.message : String(error)}`,
      plan.sourceClassification,
    );
  }

  const priceImpactPct = decimalToNumber(quote.priceImpact);
  const quotedOutputRaw = quote.outputAmount?.toString?.() || null;
  if (quotedOutputRaw === '0') {
    throw createMeteoraError(
      'meteora_zero_output',
      'Meteora DAMM v2 quote returned zero output; falling back before submitting a zero-output swap',
      plan.sourceClassification,
    );
  }

  if (plan.maxPriceImpactPct > 0 && Math.abs(priceImpactPct) > plan.maxPriceImpactPct) {
    throw createMeteoraError(
      'price_impact_too_high',
      `Meteora price impact ${priceImpactPct.toFixed(4)} exceeded ${plan.maxPriceImpactPct.toFixed(4)}`,
      plan.sourceClassification,
    );
  }

  let transaction: Transaction;
  try {
    const tokenAProgram = (resolved.poolState as any).tokenAProgram
      || getTokenProgram((resolved.poolState as any).tokenAFlag);
    const tokenBProgram = (resolved.poolState as any).tokenBProgram
      || getTokenProgram((resolved.poolState as any).tokenBFlag);

    transaction = await cpAmm.swap2({
      payer: keypair.publicKey,
      pool: resolved.pool,
      inputTokenMint: inputMint,
      outputTokenMint: outputMint,
      tokenAMint: (resolved.poolState as any).tokenAMint,
      tokenBMint: (resolved.poolState as any).tokenBMint,
      tokenAVault: (resolved.poolState as any).tokenAVault,
      tokenBVault: (resolved.poolState as any).tokenBVault,
      tokenAProgram,
      tokenBProgram,
      referralTokenAccount: null,
      poolState: resolved.poolState,
      swapMode: SwapMode.ExactIn,
      amountIn,
      minimumAmountOut: quote.minimumAmountOut,
    });
  } catch (error) {
    throw createMeteoraError(
      'meteora_build_failed',
      `Meteora DAMM v2 transaction build failed: ${error instanceof Error ? error.message : String(error)}`,
      plan.sourceClassification,
    );
  }

  if (meteoraDammV2LivePilotConfig.computeUnitLimit > 0) {
    transaction.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({
      units: meteoraDammV2LivePilotConfig.computeUnitLimit,
    }));
  }

  if (meteoraDammV2LivePilotConfig.computeUnitPriceMicroLamports > 0) {
    transaction.instructions.unshift(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: meteoraDammV2LivePilotConfig.computeUnitPriceMicroLamports,
    }));
  }

  let sent: Awaited<ReturnType<typeof sendLivePilotTransaction>>;
  try {
    sent = await sendLivePilotTransaction({
      connection,
      keypair,
      transaction,
      skipPreflight: meteoraDammV2LivePilotConfig.skipPreflight,
      label: 'meteora_damm_v2',
    });
  } catch (error) {
    throw createMeteoraError(
      'meteora_send_failed',
      `Meteora DAMM v2 send failed: ${error instanceof Error ? error.message : String(error)}`,
      plan.sourceClassification,
    );
  }

  return {
    pool: resolved.pool.toBase58(),
    signature: sent.signature,
    signedTransaction: sent.signedTransaction,
    quotedInputRaw: plan.inputAmountRaw,
    quotedOutputRaw,
    quotedInputAmount: rawToUi(plan.inputAmountRaw, plan.inputDecimals),
    quotedOutputAmount: quotedOutputRaw ? rawToUi(quotedOutputRaw, plan.outputDecimals) : null,
    priceImpactPct,
    quoteReceivedAt,
    txBuiltAt: sent.txBuiltAt,
    txSubmittedAt: sent.txSubmittedAt,
    programId: METEORA_DAMM_V2_PROGRAM_ID,
  };
}

export const executeMeteoraDammV2BuySwap = executeMeteoraDammV2Swap;
