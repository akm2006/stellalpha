import bs58 from 'bs58';
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
  SwapMode,
  type PoolState,
} from '@meteora-ag/cp-amm-sdk';
import type { TradeSourceClassification } from '@/lib/ingestion/trade-source-classifier';
import {
  extractMeteoraDammV2CandidatePools,
  getLivePilotMeteoraDammV2CandidatePools,
  isMeteoraDammV2Source,
  METEORA_DAMM_V2_PROGRAM_ID,
} from '@/lib/live-pilot/meteora-damm-v2-cache';

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
  buyFirst: readBooleanEnv('LIVE_PILOT_METEORA_DAMM_V2_BUY_FIRST', false),
  skipPreflight: readBooleanEnv('LIVE_PILOT_METEORA_SKIP_PREFLIGHT', false),
  slippageBps: readPositiveIntEnv('LIVE_PILOT_METEORA_SLIPPAGE_BPS', DEFAULT_METEORA_SLIPPAGE_BPS),
  computeUnitLimit: readPositiveIntEnv('LIVE_PILOT_METEORA_COMPUTE_UNIT_LIMIT', DEFAULT_METEORA_COMPUTE_UNIT_LIMIT),
  computeUnitPriceMicroLamports: readNonNegativeIntEnv('LIVE_PILOT_METEORA_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS', 0),
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

async function fetchLeaderTransactionForPoolCandidates(connection: Connection, signature: string) {
  try {
    return await connection.getParsedTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
  } catch (error) {
    console.warn('[LIVE_PILOT_METEORA] Failed to fetch leader transaction for pool resolution:', error);
    return null;
  }
}

async function resolveMeteoraDammV2Pool(args: {
  connection: Connection;
  cpAmm: CpAmm;
  signature: string | null | undefined;
  inputMint: string;
  outputMint: string;
}) {
  const candidateSet = new Set(getLivePilotMeteoraDammV2CandidatePools(args.signature));

  if (candidateSet.size === 0 && args.signature) {
    const rawTx = await fetchLeaderTransactionForPoolCandidates(args.connection, args.signature);
    for (const candidate of extractMeteoraDammV2CandidatePools(rawTx)) {
      candidateSet.add(candidate);
    }
  }

  for (const candidate of candidateSet) {
    try {
      const pool = new PublicKey(candidate);
      const poolState = await args.cpAmm.fetchPoolState(pool);
      if (poolMatchesPair(poolState, args.inputMint, args.outputMint)) {
        return { pool, poolState };
      }
    } catch {
      // Candidate account lists contain mints, vaults, programs, and users too.
    }
  }

  return null;
}

export function shouldUseMeteoraDammV2ForBuy(plan: {
  sourceClassification?: TradeSourceClassification;
}, leaderType: string | null | undefined) {
  return (
    meteoraDammV2LivePilotConfig.enabled
    && leaderType === 'buy'
    && (!plan.sourceClassification || isMeteoraDammV2Source(plan.sourceClassification))
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

export async function executeMeteoraDammV2BuySwap(args: {
  connection: Connection;
  keypair: Keypair;
  leaderSignature: string | null | undefined;
  plan: MeteoraDammV2SwapPlan;
}) {
  const { connection, keypair, leaderSignature, plan } = args;
  const cpAmm = new CpAmm(connection);

  const resolved = await resolveMeteoraDammV2Pool({
    connection,
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
  if (plan.maxPriceImpactPct > 0 && Math.abs(priceImpactPct) > plan.maxPriceImpactPct) {
    throw createMeteoraError(
      'price_impact_too_high',
      `Meteora price impact ${priceImpactPct.toFixed(4)} exceeded ${plan.maxPriceImpactPct.toFixed(4)}`,
      plan.sourceClassification,
    );
  }

  let transaction: Transaction;
  try {
    transaction = await cpAmm.swap2({
      payer: keypair.publicKey,
      pool: resolved.pool,
      inputTokenMint: inputMint,
      outputTokenMint: outputMint,
      tokenAMint: (resolved.poolState as any).tokenAMint,
      tokenBMint: (resolved.poolState as any).tokenBMint,
      tokenAVault: (resolved.poolState as any).tokenAVault,
      tokenBVault: (resolved.poolState as any).tokenBVault,
      tokenAProgram: (resolved.poolState as any).tokenAProgram,
      tokenBProgram: (resolved.poolState as any).tokenBProgram,
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

  transaction.feePayer = keypair.publicKey;
  transaction.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
  transaction.sign(keypair);

  const txBuiltAt = new Date().toISOString();
  const derivedSignature = transaction.signature ? bs58.encode(transaction.signature) : null;
  const signedTransaction = transaction.serialize().toString('base64');

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(transaction.serialize(), {
      maxRetries: 0,
      skipPreflight: meteoraDammV2LivePilotConfig.skipPreflight,
      preflightCommitment: 'processed',
    });
  } catch (error) {
    throw createMeteoraError(
      'meteora_send_failed',
      `Meteora DAMM v2 send failed: ${error instanceof Error ? error.message : String(error)}`,
      plan.sourceClassification,
    );
  }

  if (derivedSignature && signature !== derivedSignature) {
    console.warn(
      `[LIVE_PILOT_METEORA] RPC returned signature ${signature}, derived signature ${derivedSignature}`,
    );
  }

  const quotedOutputRaw = quote.outputAmount?.toString?.() || null;
  return {
    pool: resolved.pool.toBase58(),
    signature,
    signedTransaction,
    quotedInputRaw: plan.inputAmountRaw,
    quotedOutputRaw,
    quotedInputAmount: rawToUi(plan.inputAmountRaw, plan.inputDecimals),
    quotedOutputAmount: quotedOutputRaw ? rawToUi(quotedOutputRaw, plan.outputDecimals) : null,
    priceImpactPct,
    quoteReceivedAt,
    txBuiltAt,
    txSubmittedAt: new Date().toISOString(),
    programId: METEORA_DAMM_V2_PROGRAM_ID,
  };
}
