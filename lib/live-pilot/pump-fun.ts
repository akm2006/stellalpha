import bs58 from 'bs58';
import BN from 'bn.js';
import { createRequire } from 'module';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  type AccountInfo,
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, NATIVE_MINT } from '@solana/spl-token';
import type {
  BondingCurve,
  FeeConfig,
  Global,
  OnlinePumpSdk as OnlinePumpSdkType,
} from '@pump-fun/pump-sdk';
import {
  PUMP_BONDING_CURVE_PROGRAM_ID,
  type TradeSourceClassification,
} from '@/lib/ingestion/trade-source-classifier';

interface PumpFunSwapPlan {
  inputMint: string;
  outputMint: string;
  inputAmountRaw: string;
  inputDecimals: number;
  outputDecimals: number;
  slippageBps: number | null;
  maxPriceImpactPct: number;
  sourceClassification?: TradeSourceClassification;
}

export interface PumpFunExecutionResult {
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

type PumpFunError = Error & {
  code?: string;
  sourceClassification?: TradeSourceClassification;
};

const DEFAULT_PUMPFUN_SLIPPAGE_BPS = 1000;
const DEFAULT_PUMPFUN_COMPUTE_UNIT_LIMIT = 250_000;
const DEFAULT_PUMPFUN_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = 25_000;
const SOL_MINT = NATIVE_MINT.toBase58();
const require = createRequire(import.meta.url);
const {
  getBuyTokenAmountFromSolAmount,
  getSellSolAmountFromTokenAmount,
  OnlinePumpSdk,
  PUMP_PROGRAM_ID,
  PUMP_SDK,
} = require('@pump-fun/pump-sdk') as typeof import('@pump-fun/pump-sdk');

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

export const pumpFunLivePilotConfig = {
  enabled: readBooleanEnv('LIVE_PILOT_PUMPFUN_ENABLED', true),
  directFirst: readBooleanEnv('LIVE_PILOT_PUMPFUN_FIRST', false),
  buyFirst: readBooleanEnv('LIVE_PILOT_PUMPFUN_FIRST', false)
    || readBooleanEnv('LIVE_PILOT_PUMPFUN_BUY_FIRST', false),
  sellFirst: readBooleanEnv('LIVE_PILOT_PUMPFUN_FIRST', false)
    || readBooleanEnv('LIVE_PILOT_PUMPFUN_SELL_FIRST', false),
  skipPreflight: readBooleanEnv('LIVE_PILOT_PUMPFUN_SKIP_PREFLIGHT', true),
  slippageBps: readPositiveIntEnv('LIVE_PILOT_PUMPFUN_SLIPPAGE_BPS', DEFAULT_PUMPFUN_SLIPPAGE_BPS),
  computeUnitLimit: readPositiveIntEnv('LIVE_PILOT_PUMPFUN_COMPUTE_UNIT_LIMIT', DEFAULT_PUMPFUN_COMPUTE_UNIT_LIMIT),
  computeUnitPriceMicroLamports: readNonNegativeIntEnv(
    'LIVE_PILOT_PUMPFUN_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS',
    DEFAULT_PUMPFUN_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS,
  ),
};

function createPumpFunError(
  code: string,
  message: string,
  sourceClassification?: TradeSourceClassification,
) {
  const error = new Error(message) as PumpFunError;
  error.code = code;
  error.sourceClassification = sourceClassification;
  return error;
}

function rawToUi(rawAmount: string | bigint, decimals: number) {
  const raw = typeof rawAmount === 'bigint' ? rawAmount : BigInt(rawAmount);
  return Number(raw) / Math.pow(10, decimals);
}

export function isPumpFunSource(classification: TradeSourceClassification | null | undefined) {
  return Boolean(
    classification
    && (
      classification.protocols?.includes('pump_bonding_curve')
      || classification.programIds.includes(PUMP_BONDING_CURVE_PROGRAM_ID)
    )
  );
}

export function shouldUsePumpFunForBuy(plan: {
  sourceClassification?: TradeSourceClassification;
}, leaderType: string | null | undefined) {
  return (
    pumpFunLivePilotConfig.enabled
    && leaderType === 'buy'
    && isPumpFunSource(plan.sourceClassification)
  );
}

export function shouldUsePumpFunForSell(plan: {
  sourceClassification?: TradeSourceClassification;
}, leaderType: string | null | undefined) {
  return (
    pumpFunLivePilotConfig.enabled
    && leaderType === 'sell'
    && isPumpFunSource(plan.sourceClassification)
  );
}

export function shouldUsePumpFunBuyFirst(plan: {
  sourceClassification?: TradeSourceClassification;
}, leaderType: string | null | undefined) {
  return (
    pumpFunLivePilotConfig.enabled
    && pumpFunLivePilotConfig.buyFirst
    && leaderType === 'buy'
    && isPumpFunSource(plan.sourceClassification)
  );
}

export function shouldUsePumpFunSellFirst(plan: {
  sourceClassification?: TradeSourceClassification;
}, leaderType: string | null | undefined) {
  return (
    pumpFunLivePilotConfig.enabled
    && pumpFunLivePilotConfig.sellFirst
    && leaderType === 'sell'
    && isPumpFunSource(plan.sourceClassification)
  );
}

export function shouldUsePumpFunFirst(plan: {
  sourceClassification?: TradeSourceClassification;
}, leaderType: string | null | undefined) {
  return shouldUsePumpFunBuyFirst(plan, leaderType) || shouldUsePumpFunSellFirst(plan, leaderType);
}

function isSolQuoteBondingCurve(bondingCurve: BondingCurve) {
  return (
    bondingCurve.quoteMint.equals(PublicKey.default)
    || bondingCurve.quoteMint.equals(NATIVE_MINT)
  );
}

function assertBondingCurveTradable(
  bondingCurve: BondingCurve,
  mint: PublicKey,
  sourceClassification?: TradeSourceClassification,
) {
  if (bondingCurve.complete || bondingCurve.virtualTokenReserves.isZero()) {
    throw createPumpFunError(
      'pumpfun_graduated_or_invalid',
      `Pump.fun bonding curve is complete for ${mint.toBase58()}. Token has graduated to PumpSwap.`,
      sourceClassification,
    );
  }

  if (!isSolQuoteBondingCurve(bondingCurve)) {
    throw createPumpFunError(
      'pumpfun_unsupported_quote_mint',
      `Pump.fun direct path only supports SOL quote bonding curves, got quote mint ${bondingCurve.quoteMint.toBase58()}`,
      sourceClassification,
    );
  }
}

async function fetchPumpState(args: {
  sdk: OnlinePumpSdkType;
  mint: PublicKey;
  user: PublicKey;
  isBuy: boolean;
  sourceClassification?: TradeSourceClassification;
}): Promise<{
  global: Global;
  feeConfig: FeeConfig;
  bondingCurveAccountInfo: AccountInfo<Buffer>;
  bondingCurve: BondingCurve;
  associatedUserAccountInfo?: AccountInfo<Buffer> | null;
}> {
  try {
    const [global, feeConfig, state] = await Promise.all([
      args.sdk.fetchGlobal(),
      args.sdk.fetchFeeConfig(),
      args.isBuy
        ? args.sdk.fetchBuyState(args.mint, args.user, TOKEN_PROGRAM_ID)
        : args.sdk.fetchSellState(args.mint, args.user, TOKEN_PROGRAM_ID),
    ]);

    assertBondingCurveTradable(state.bondingCurve, args.mint, args.sourceClassification);

    const buyState = state as Partial<Awaited<ReturnType<OnlinePumpSdkType['fetchBuyState']>>>;

    return {
      global,
      feeConfig,
      bondingCurveAccountInfo: state.bondingCurveAccountInfo,
      bondingCurve: state.bondingCurve,
      associatedUserAccountInfo: args.isBuy
        ? buyState.associatedUserAccountInfo ?? null
        : undefined,
    };
  } catch (error) {
    if ((error as PumpFunError).code) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (/bonding curve account not found/i.test(message)) {
      throw createPumpFunError(
        'pumpfun_graduated_or_invalid',
        `Pump.fun bonding curve account not found for ${args.mint.toBase58()}. Token might have graduated to PumpSwap.`,
        args.sourceClassification,
      );
    }

    throw createPumpFunError(
      'pumpfun_state_fetch_failed',
      `Pump.fun state fetch failed: ${message}`,
      args.sourceClassification,
    );
  }
}

export async function executePumpFunSwap(args: {
  connection: Connection;
  keypair: Keypair;
  leaderSignature: string | null | undefined;
  plan: PumpFunSwapPlan;
  isBuy: boolean;
}): Promise<PumpFunExecutionResult> {
  const { connection, keypair, plan, isBuy } = args;

  const sdk = new OnlinePumpSdk(connection);
  const slippagePct = (plan.slippageBps ?? pumpFunLivePilotConfig.slippageBps) / 100;
  const quoteReceivedAt = new Date().toISOString();
  
  let instructions: Awaited<ReturnType<typeof PUMP_SDK.buyInstructions>>;
  let quotedOutputRaw: string | null = null;
  
  try {
    if (isBuy) {
      const mint = new PublicKey(plan.outputMint);
      const buyAmountSol = BigInt(plan.inputAmountRaw);
      const state = await fetchPumpState({
        sdk,
        mint,
        user: keypair.publicKey,
        isBuy: true,
        sourceClassification: plan.sourceClassification,
      });
      const tokenAmount = getBuyTokenAmountFromSolAmount({
        global: state.global,
        feeConfig: state.feeConfig,
        mintSupply: state.bondingCurve.tokenTotalSupply,
        bondingCurve: state.bondingCurve,
        amount: new BN(plan.inputAmountRaw),
      });
      quotedOutputRaw = tokenAmount.toString();
      
      instructions = await PUMP_SDK.buyInstructions({
        global: state.global,
        bondingCurveAccountInfo: state.bondingCurveAccountInfo,
        bondingCurve: state.bondingCurve,
        associatedUserAccountInfo: state.associatedUserAccountInfo ?? null,
        mint,
        user: keypair.publicKey,
        amount: tokenAmount,
        solAmount: new BN(buyAmountSol.toString()),
        slippage: slippagePct,
        tokenProgram: TOKEN_PROGRAM_ID,
      });
    } else {
      const mint = new PublicKey(plan.inputMint);
      const sellTokenAmount = BigInt(plan.inputAmountRaw);
      const state = await fetchPumpState({
        sdk,
        mint,
        user: keypair.publicKey,
        isBuy: false,
        sourceClassification: plan.sourceClassification,
      });
      const solAmount = getSellSolAmountFromTokenAmount({
        global: state.global,
        feeConfig: state.feeConfig,
        mintSupply: state.bondingCurve.tokenTotalSupply,
        bondingCurve: state.bondingCurve,
        amount: new BN(plan.inputAmountRaw),
      });
      quotedOutputRaw = solAmount.toString();
      
      instructions = await PUMP_SDK.sellInstructions({
        global: state.global,
        bondingCurveAccountInfo: state.bondingCurveAccountInfo,
        bondingCurve: state.bondingCurve,
        mint,
        user: keypair.publicKey,
        amount: new BN(sellTokenAmount.toString()),
        solAmount,
        slippage: slippagePct,
        tokenProgram: TOKEN_PROGRAM_ID,
        mayhemMode: state.bondingCurve.isMayhemMode,
        cashback: state.bondingCurve.isCashbackCoin,
      });
    }
  } catch (error) {
    if ((error as PumpFunError).code) {
      throw error;
    }
    let msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Bonding curve account not found')) {
      throw createPumpFunError(
        'pumpfun_graduated_or_invalid',
        `Pump.fun trade failed: ${msg}. Token might have graduated to PumpSwap.`,
        plan.sourceClassification,
      );
    }
    throw createPumpFunError(
      'pumpfun_build_failed',
      `Pump.fun transaction build failed: ${msg}`,
      plan.sourceClassification,
    );
  }

  const transaction = new Transaction();

  if (pumpFunLivePilotConfig.computeUnitLimit > 0) {
    transaction.add(ComputeBudgetProgram.setComputeUnitLimit({
      units: pumpFunLivePilotConfig.computeUnitLimit,
    }));
  }

  if (pumpFunLivePilotConfig.computeUnitPriceMicroLamports > 0) {
    transaction.add(ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: pumpFunLivePilotConfig.computeUnitPriceMicroLamports,
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
      skipPreflight: pumpFunLivePilotConfig.skipPreflight,
      preflightCommitment: 'processed',
    });
  } catch (error) {
    throw createPumpFunError(
      'pumpfun_send_failed',
      `Pump.fun send failed: ${error instanceof Error ? error.message : String(error)}`,
      plan.sourceClassification,
    );
  }

  if (derivedSignature && signature !== derivedSignature) {
    console.warn(
      `[LIVE_PILOT_PUMPFUN] RPC returned signature ${signature}, derived signature ${derivedSignature}`,
    );
  }

  return {
    signature,
    signedTransaction,
    quotedInputRaw: plan.inputAmountRaw,
    quotedOutputRaw,
    quotedInputAmount: rawToUi(plan.inputAmountRaw, plan.inputDecimals),
    quotedOutputAmount: quotedOutputRaw ? rawToUi(quotedOutputRaw, plan.outputDecimals) : null,
    priceImpactPct: 0,
    quoteReceivedAt,
    txBuiltAt,
    txSubmittedAt: new Date().toISOString(),
    programId: PUMP_PROGRAM_ID.toBase58(),
  };
}
