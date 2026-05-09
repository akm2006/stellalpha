import bs58 from 'bs58';
import BN from 'bn.js';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import { NATIVE_MINT } from '@solana/spl-token';
import {
  OnlinePumpAmmSdk,
  PUMP_AMM_SDK,
  PUMP_AMM_PROGRAM_ID,
  buyQuoteInput,
  canonicalPumpPoolPda,
  poolV2Pda,
  sellBaseInput,
} from '@pump-fun/pump-swap-sdk';
import type { TradeSourceClassification } from '@/lib/ingestion/trade-source-classifier';
import {
  extractPumpSwapCandidatePools,
  getLivePilotPumpSwapCandidatePools,
  isPumpSwapSource,
} from '@/lib/live-pilot/pump-swap-cache';

interface PumpSwapRoutePlan {
  inputMint: string;
  outputMint: string;
  sourceClassification?: TradeSourceClassification;
}

interface PumpSwapPlan extends PumpSwapRoutePlan {
  inputAmountRaw: string;
  inputDecimals: number;
  outputDecimals: number;
  slippageBps: number | null;
  maxPriceImpactPct: number;
}

export interface PumpSwapExecutionResult {
  pool: string;
  programId: string;
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

type PumpSwapError = Error & {
  code?: string;
  sourceClassification?: TradeSourceClassification;
};

const DEFAULT_PUMPSWAP_SLIPPAGE_BPS = 1000;
const DEFAULT_PUMPSWAP_COMPUTE_UNIT_LIMIT = 300_000;
const DEFAULT_PUMPSWAP_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = 25_000;
const SOL_MINT = NATIVE_MINT.toBase58();

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

export const pumpSwapLivePilotConfig = {
  enabled: readBooleanEnv('LIVE_PILOT_PUMPSWAP_ENABLED', true),
  directFirst: readBooleanEnv('LIVE_PILOT_PUMPSWAP_FIRST', false),
  buyFirst: readBooleanEnv('LIVE_PILOT_PUMPSWAP_FIRST', false)
    || readBooleanEnv('LIVE_PILOT_PUMPSWAP_BUY_FIRST', false),
  sellFirst: readBooleanEnv('LIVE_PILOT_PUMPSWAP_FIRST', false)
    || readBooleanEnv('LIVE_PILOT_PUMPSWAP_SELL_FIRST', false),
  skipPreflight: readBooleanEnv('LIVE_PILOT_PUMPSWAP_SKIP_PREFLIGHT', true),
  slippageBps: readPositiveIntEnv('LIVE_PILOT_PUMPSWAP_SLIPPAGE_BPS', DEFAULT_PUMPSWAP_SLIPPAGE_BPS),
  computeUnitLimit: readPositiveIntEnv('LIVE_PILOT_PUMPSWAP_COMPUTE_UNIT_LIMIT', DEFAULT_PUMPSWAP_COMPUTE_UNIT_LIMIT),
  computeUnitPriceMicroLamports: readNonNegativeIntEnv(
    'LIVE_PILOT_PUMPSWAP_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS',
    DEFAULT_PUMPSWAP_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS,
  ),
};

function createPumpSwapError(
  code: string,
  message: string,
  sourceClassification?: TradeSourceClassification,
) {
  const error = new Error(message) as PumpSwapError;
  error.code = code;
  error.sourceClassification = sourceClassification;
  return error;
}

function rawToUi(rawAmount: string | bigint, decimals: number) {
  const raw = typeof rawAmount === 'bigint' ? rawAmount : BigInt(rawAmount);
  return Number(raw) / Math.pow(10, decimals);
}

function isSolMint(mint: string | null | undefined) {
  return mint === SOL_MINT;
}

function getBaseMintForPlan(plan: PumpSwapRoutePlan, leaderType: string | null | undefined) {
  if (leaderType === 'buy' && isSolMint(plan.inputMint) && plan.outputMint) {
    return plan.outputMint;
  }
  if (leaderType === 'sell' && plan.inputMint && isSolMint(plan.outputMint)) {
    return plan.inputMint;
  }
  return null;
}

function isPumpSwapSupportedPlan(plan: PumpSwapRoutePlan, leaderType: string | null | undefined) {
  return Boolean(getBaseMintForPlan(plan, leaderType));
}

export function shouldUsePumpSwapForSwap(plan: PumpSwapRoutePlan, leaderType: string | null | undefined) {
  return (
    pumpSwapLivePilotConfig.enabled
    && (leaderType === 'buy' || leaderType === 'sell')
    && isPumpSwapSupportedPlan(plan, leaderType)
    && isPumpSwapSource(plan.sourceClassification)
  );
}

export function shouldUsePumpSwapForGraduatedPump(plan: PumpSwapRoutePlan, leaderType: string | null | undefined) {
  return (
    pumpSwapLivePilotConfig.enabled
    && (leaderType === 'buy' || leaderType === 'sell')
    && isPumpSwapSupportedPlan(plan, leaderType)
  );
}

export function shouldUsePumpSwapBuyFirst(plan: PumpSwapRoutePlan, leaderType: string | null | undefined) {
  return (
    pumpSwapLivePilotConfig.enabled
    && pumpSwapLivePilotConfig.buyFirst
    && leaderType === 'buy'
    && isPumpSwapSupportedPlan(plan, leaderType)
    && isPumpSwapSource(plan.sourceClassification)
  );
}

export function shouldUsePumpSwapSellFirst(plan: PumpSwapRoutePlan, leaderType: string | null | undefined) {
  return (
    pumpSwapLivePilotConfig.enabled
    && pumpSwapLivePilotConfig.sellFirst
    && leaderType === 'sell'
    && isPumpSwapSupportedPlan(plan, leaderType)
    && isPumpSwapSource(plan.sourceClassification)
  );
}

export function shouldUsePumpSwapFirst(plan: PumpSwapRoutePlan, leaderType: string | null | undefined) {
  return shouldUsePumpSwapBuyFirst(plan, leaderType) || shouldUsePumpSwapSellFirst(plan, leaderType);
}

function poolMints(poolState: any) {
  return {
    baseMint: poolState?.baseMint?.toBase58?.() || null,
    quoteMint: poolState?.quoteMint?.toBase58?.() || null,
  };
}

function poolMatchesPlan(poolState: any, tokenMint: string) {
  const mints = poolMints(poolState);
  return (
    mints.baseMint === tokenMint && mints.quoteMint === SOL_MINT
  ) || (
    mints.baseMint === SOL_MINT && mints.quoteMint === tokenMint
  );
}

function poolOrientation(poolState: any, tokenMint: string): 'token_base' | 'token_quote' | null {
  const mints = poolMints(poolState);
  if (mints.baseMint === tokenMint && mints.quoteMint === SOL_MINT) {
    return 'token_base';
  }
  if (mints.baseMint === SOL_MINT && mints.quoteMint === tokenMint) {
    return 'token_quote';
  }
  return null;
}

async function fetchLeaderTransactionForPoolCandidates(connection: Connection, signature: string) {
  try {
    return await connection.getParsedTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
  } catch (error) {
    console.warn('[LIVE_PILOT_PUMPSWAP] Failed to fetch leader transaction for pool resolution:', error);
    return null;
  }
}

async function resolvePumpSwapPool(args: {
  connection: Connection;
  signature: string | null | undefined;
  user: PublicKey;
  baseMint: PublicKey;
}) {
  const sdk = new OnlinePumpAmmSdk(args.connection);
  const candidateSet = new Set(getLivePilotPumpSwapCandidatePools(args.signature));
  const tried = new Set<string>();

  candidateSet.add(canonicalPumpPoolPda(args.baseMint).toBase58());
  candidateSet.add(poolV2Pda(args.baseMint).toBase58());

  const tryResolveCandidates = async () => {
    for (const candidate of candidateSet) {
      if (tried.has(candidate)) {
        continue;
      }
      tried.add(candidate);

      try {
        const pool = new PublicKey(candidate);
        const state = await sdk.swapSolanaState(pool, args.user);
        if (poolMatchesPlan(state.pool, args.baseMint.toBase58())) {
          return { pool, state };
        }
      } catch {
        // PumpSwap instructions contain many non-pool accounts; skip anything that cannot decode as a pool.
      }
    }
    return null;
  };

  const cachedResolved = await tryResolveCandidates();
  if (cachedResolved) {
    return cachedResolved;
  }

  if (args.signature) {
    const rawTx = await fetchLeaderTransactionForPoolCandidates(args.connection, args.signature);
    for (const candidate of extractPumpSwapCandidatePools(rawTx)) {
      candidateSet.add(candidate);
    }
  }

  return tryResolveCandidates();
}

function computePriceImpactPct(args: {
  expectedOutputRaw: BN;
  actualOutputRaw: BN;
}) {
  if (args.expectedOutputRaw.isZero()) return 0;
  const diff = args.expectedOutputRaw.sub(args.actualOutputRaw);
  return Number(diff.muln(10_000).div(args.expectedOutputRaw).toString()) / 100;
}

export async function executePumpSwap(args: {
  connection: Connection;
  keypair: Keypair;
  leaderSignature: string | null | undefined;
  plan: PumpSwapPlan;
  isBuy: boolean;
}): Promise<PumpSwapExecutionResult> {
  const { connection, keypair, leaderSignature, plan, isBuy } = args;
  const leaderType = isBuy ? 'buy' : 'sell';
  const baseMintText = getBaseMintForPlan(plan, leaderType);

  if (!baseMintText) {
    throw createPumpSwapError(
      'pumpswap_unsupported_pair',
      `PumpSwap direct path only supports SOL quote swaps, got ${plan.inputMint} -> ${plan.outputMint}`,
      plan.sourceClassification,
    );
  }

  const baseMint = new PublicKey(baseMintText);
  const resolved = await resolvePumpSwapPool({
    connection,
    signature: leaderSignature,
    user: keypair.publicKey,
    baseMint,
  });

  if (!resolved) {
    throw createPumpSwapError(
      'pumpswap_pool_unresolved',
      `PumpSwap pool could not be resolved for ${baseMint.toBase58()}`,
      plan.sourceClassification,
    );
  }

  const amountIn = new BN(plan.inputAmountRaw);
  const slippagePct = (plan.slippageBps ?? pumpSwapLivePilotConfig.slippageBps) / 100;
  const quoteReceivedAt = new Date().toISOString();

  let instructions: Awaited<ReturnType<typeof PUMP_AMM_SDK.buyQuoteInput>>;
  let quotedOutputRaw: string | null = null;
  let priceImpactPct = 0;
  const orientation = poolOrientation(resolved.state.pool, baseMint.toBase58());

  if (!orientation) {
    throw createPumpSwapError(
      'pumpswap_pool_unresolved',
      `PumpSwap pool orientation did not match ${baseMint.toBase58()}`,
      plan.sourceClassification,
    );
  }

  try {
    if (isBuy && orientation === 'token_base') {
      const quote = buyQuoteInput({
        quote: amountIn,
        slippage: slippagePct,
        baseReserve: resolved.state.poolBaseAmount,
        quoteReserve: resolved.state.poolQuoteAmount,
        globalConfig: resolved.state.globalConfig,
        baseMintAccount: resolved.state.baseMintAccount,
        baseMint,
        coinCreator: resolved.state.pool.coinCreator,
        creator: resolved.state.pool.creator,
        feeConfig: resolved.state.feeConfig,
      });
      quotedOutputRaw = quote.base.toString();
      const expectedAtSpot = resolved.state.poolBaseAmount.mul(amountIn).div(resolved.state.poolQuoteAmount);
      priceImpactPct = computePriceImpactPct({
        expectedOutputRaw: expectedAtSpot,
        actualOutputRaw: quote.base,
      });
      instructions = await PUMP_AMM_SDK.buyQuoteInput(resolved.state, amountIn, slippagePct);
    } else if (!isBuy && orientation === 'token_base') {
      const quote = sellBaseInput({
        base: amountIn,
        slippage: slippagePct,
        baseReserve: resolved.state.poolBaseAmount,
        quoteReserve: resolved.state.poolQuoteAmount,
        globalConfig: resolved.state.globalConfig,
        baseMintAccount: resolved.state.baseMintAccount,
        baseMint,
        coinCreator: resolved.state.pool.coinCreator,
        creator: resolved.state.pool.creator,
        feeConfig: resolved.state.feeConfig,
      });
      quotedOutputRaw = quote.uiQuote.toString();
      const expectedAtSpot = resolved.state.poolQuoteAmount.mul(amountIn).div(resolved.state.poolBaseAmount);
      priceImpactPct = computePriceImpactPct({
        expectedOutputRaw: expectedAtSpot,
        actualOutputRaw: quote.uiQuote,
      });
      instructions = await PUMP_AMM_SDK.sellBaseInput(resolved.state, amountIn, slippagePct);
    } else if (isBuy && orientation === 'token_quote') {
      const quote = sellBaseInput({
        base: amountIn,
        slippage: slippagePct,
        baseReserve: resolved.state.poolBaseAmount,
        quoteReserve: resolved.state.poolQuoteAmount,
        globalConfig: resolved.state.globalConfig,
        baseMintAccount: resolved.state.baseMintAccount,
        baseMint: resolved.state.pool.baseMint,
        coinCreator: resolved.state.pool.coinCreator,
        creator: resolved.state.pool.creator,
        feeConfig: resolved.state.feeConfig,
      });
      quotedOutputRaw = quote.uiQuote.toString();
      const expectedAtSpot = resolved.state.poolQuoteAmount.mul(amountIn).div(resolved.state.poolBaseAmount);
      priceImpactPct = computePriceImpactPct({
        expectedOutputRaw: expectedAtSpot,
        actualOutputRaw: quote.uiQuote,
      });
      instructions = await PUMP_AMM_SDK.sellBaseInput(resolved.state, amountIn, slippagePct);
    } else {
      const quote = buyQuoteInput({
        quote: amountIn,
        slippage: slippagePct,
        baseReserve: resolved.state.poolBaseAmount,
        quoteReserve: resolved.state.poolQuoteAmount,
        globalConfig: resolved.state.globalConfig,
        baseMintAccount: resolved.state.baseMintAccount,
        baseMint: resolved.state.pool.baseMint,
        coinCreator: resolved.state.pool.coinCreator,
        creator: resolved.state.pool.creator,
        feeConfig: resolved.state.feeConfig,
      });
      quotedOutputRaw = quote.base.toString();
      const expectedAtSpot = resolved.state.poolBaseAmount.mul(amountIn).div(resolved.state.poolQuoteAmount);
      priceImpactPct = computePriceImpactPct({
        expectedOutputRaw: expectedAtSpot,
        actualOutputRaw: quote.base,
      });
      instructions = await PUMP_AMM_SDK.buyQuoteInput(resolved.state, amountIn, slippagePct);
    }
  } catch (error) {
    throw createPumpSwapError(
      'pumpswap_quote_or_build_failed',
      `PumpSwap quote/build failed: ${error instanceof Error ? error.message : String(error)}`,
      plan.sourceClassification,
    );
  }

  if (plan.maxPriceImpactPct > 0 && Math.abs(priceImpactPct) > plan.maxPriceImpactPct) {
    throw createPumpSwapError(
      'price_impact_too_high',
      `PumpSwap price impact ${priceImpactPct.toFixed(4)} exceeded ${plan.maxPriceImpactPct.toFixed(4)}`,
      plan.sourceClassification,
    );
  }

  const transaction = new Transaction();

  if (pumpSwapLivePilotConfig.computeUnitLimit > 0) {
    transaction.add(ComputeBudgetProgram.setComputeUnitLimit({
      units: pumpSwapLivePilotConfig.computeUnitLimit,
    }));
  }

  if (pumpSwapLivePilotConfig.computeUnitPriceMicroLamports > 0) {
    transaction.add(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: pumpSwapLivePilotConfig.computeUnitPriceMicroLamports,
    }));
  }

  transaction.add(...instructions);
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
      skipPreflight: pumpSwapLivePilotConfig.skipPreflight,
      preflightCommitment: 'processed',
    });
  } catch (error) {
    throw createPumpSwapError(
      'pumpswap_send_failed',
      `PumpSwap send failed: ${error instanceof Error ? error.message : String(error)}`,
      plan.sourceClassification,
    );
  }

  if (derivedSignature && signature !== derivedSignature) {
    console.warn(
      `[LIVE_PILOT_PUMPSWAP] RPC returned signature ${signature}, derived signature ${derivedSignature}`,
    );
  }

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
    programId: PUMP_AMM_PROGRAM_ID.toBase58(),
  };
}
