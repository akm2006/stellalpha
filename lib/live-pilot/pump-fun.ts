import bs58 from 'bs58';
import BN from 'bn.js';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import { PumpFunSDK } from 'pumpdotfun-sdk';
import anchor from '@coral-xyz/anchor/dist/cjs/index.js';
const { AnchorProvider } = anchor;
import type { TradeSourceClassification } from '@/lib/ingestion/trade-source-classifier';

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
const SOL_MINT = 'So11111111111111111111111111111111111111112';

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
  buyFirst: readBooleanEnv('LIVE_PILOT_PUMPFUN_BUY_FIRST', false),
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
    && classification.venue === 'pump'
  );
}

export function shouldUsePumpFunForBuy(plan: {
  sourceClassification?: TradeSourceClassification;
}, leaderType: string | null | undefined) {
  return (
    pumpFunLivePilotConfig.enabled
    && leaderType === 'buy'
    && (!plan.sourceClassification || isPumpFunSource(plan.sourceClassification))
  );
}

export function shouldUsePumpFunForSell(plan: {
  sourceClassification?: TradeSourceClassification;
}, leaderType: string | null | undefined) {
  return (
    pumpFunLivePilotConfig.enabled
    && leaderType === 'sell'
    && (!plan.sourceClassification || isPumpFunSource(plan.sourceClassification))
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

export async function executePumpFunSwap(args: {
  connection: Connection;
  keypair: Keypair;
  leaderSignature: string | null | undefined;
  plan: PumpFunSwapPlan;
  isBuy: boolean;
}): Promise<PumpFunExecutionResult> {
  const { connection, keypair, plan, isBuy } = args;

  const dummyWallet = {
    publicKey: keypair.publicKey,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
  };
  const provider = new AnchorProvider(connection, dummyWallet, { commitment: "confirmed" });
  const sdk = new PumpFunSDK(provider);

  const slippageBps = BigInt(plan.slippageBps ?? pumpFunLivePilotConfig.slippageBps);
  const quoteReceivedAt = new Date().toISOString();
  
  let baseTx: Transaction;
  
  try {
    if (isBuy) {
      const mint = new PublicKey(plan.outputMint);
      const buyAmountSol = BigInt(plan.inputAmountRaw);
      
      baseTx = await sdk.getBuyInstructionsBySolAmount(
        keypair.publicKey,
        mint,
        buyAmountSol,
        slippageBps,
        "confirmed"
      );
    } else {
      const mint = new PublicKey(plan.inputMint);
      const sellTokenAmount = BigInt(plan.inputAmountRaw);
      
      baseTx = await sdk.getSellInstructionsByTokenAmount(
        keypair.publicKey,
        mint,
        sellTokenAmount,
        slippageBps,
        "confirmed"
      );
    }
  } catch (error) {
    let msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Bonding curve account not found')) {
      throw createPumpFunError(
        'pumpfun_graduated_or_invalid',
        `Pump.fun trade failed: ${msg}. Token might have graduated to Raydium.`,
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

  transaction.add(...baseTx.instructions);
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
    quotedOutputRaw: null, // We don't get exact output quote back from the raw instructions easily
    quotedInputAmount: rawToUi(plan.inputAmountRaw, plan.inputDecimals),
    quotedOutputAmount: null,
    priceImpactPct: 0,
    quoteReceivedAt,
    txBuiltAt,
    txSubmittedAt: new Date().toISOString(),
  };
}
