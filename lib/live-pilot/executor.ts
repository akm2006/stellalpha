import bs58 from 'bs58';
import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import type { LivePilotWalletConfig } from '@/lib/live-pilot/config';
import type { PilotTradeRow } from '@/lib/live-pilot/types';
import { formatSolscanTxUrl, sendLivePilotAlert } from '@/lib/live-pilot/alerts';
import { evaluateSellExitProtection, evaluateWalletCircuitBreaker } from '@/lib/live-pilot/breaker';
import { broadcastLivePilotQueueWake } from '@/lib/live-pilot/queue-wake';
import { isPilotMintQuarantined, quarantinePilotMint } from '@/lib/live-pilot/repositories/pilot-mint-quarantines.repo';
import {
  createPilotTradeAttempt,
  updatePilotTradeAttempt,
} from '@/lib/live-pilot/repositories/pilot-trade-attempts.repo';
import { updatePilotRuntimeState } from '@/lib/live-pilot/repositories/pilot-runtime-state.repo';
import { createPilotTrade, updatePilotTrade } from '@/lib/live-pilot/repositories/pilot-trades.repo';
import {
  getCopyPositionState,
  recordSuccessfulCopiedBuy,
  recordSuccessfulCopiedSell,
} from '@/lib/repositories/copy-position-states.repo';
import { getTokenDecimals, getTokenSymbol, WSOL } from '@/lib/services/token-service';
import { BUY_STALENESS_THRESHOLD_MS } from '@/lib/ingestion/copy-signal';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const JUPITER_API_KEY = process.env.JUPITER_API_KEY;
const HELIUS_GATEKEEPER_ENABLED = ['1', 'true', 'yes', 'on']
  .includes((process.env.HELIUS_GATEKEEPER_ENABLED || '').trim().toLowerCase());
const HELIUS_RPC_URL =
  process.env.HELIUS_GATEKEEPER_RPC_URL
  || process.env.HELIUS_API_RPC_URL
  || (HELIUS_API_KEY
    ? `${HELIUS_GATEKEEPER_ENABLED ? 'https://beta.helius-rpc.com' : 'https://mainnet.helius-rpc.com'}/?api-key=${HELIUS_API_KEY}`
    : '');
const JUPITER_SWAP_BASE_URL = process.env.JUPITER_SWAP_BASE_URL || 'https://api.jup.ag/swap/v2';
const SOL_MINT = WSOL;
const CONFIRM_POLL_INTERVAL_MS = 500;
const CONFIRM_TIMEOUT_MS = 8_000;
const EXECUTE_RETRY_WINDOW_MS = 120_000;
const EXECUTE_RETRY_MIN_INTERVAL_MS = 5_000;
const RETRY_BACKOFF_BASE_MS = 1_000;
const RETRY_BACKOFF_MAX_MS = 8_000;
const FAST_BUY_REQUOTE_DELAY_MS = 250;
export const LIVE_PILOT_TECHNICAL_MIN_SOL = 0;
const SELL_SLIPPAGE_LADDER_BPS = [1000, 3000, 5000, 8000];
const SELL_EXIT_CHUNK_LADDER = [
  { numerator: 1n, denominator: 1n, label: '100%' },
  { numerator: 1n, denominator: 2n, label: '50%' },
  { numerator: 1n, denominator: 4n, label: '25%' },
  { numerator: 1n, denominator: 10n, label: '10%' },
  { numerator: 1n, denominator: 20n, label: '5%' },
];

type JupiterApiError = Error & {
  code?: string;
  stage?: 'order' | 'execute' | 'confirmation';
  httpStatus?: number;
  derivedSignature?: string | null;
  submittedAt?: string | null;
};

interface JupiterOrderResponse {
  transaction?: string;
  requestId?: string;
  router?: string;
  routerName?: string;
  priceImpactPct?: string | number;
  priceImpact?: string | number;
  inputAmount?: string | number;
  outputAmount?: string | number;
  inAmount?: string | number;
  outAmount?: string | number;
  lastValidBlockHeight?: number;
  prioritizationFeeLamports?: string | number;
  errorCode?: string | number;
  error?: string;
  message?: string;
}

interface JupiterExecuteResponse {
  status?: string;
  signature?: string;
  txid?: string;
  transactionId?: string;
  slot?: number;
  code?: string | number;
  errorCode?: string | number;
  error?: string;
  message?: string;
  inputAmountResult?: string | number;
  outputAmountResult?: string | number;
}

type ExecutionPlan =
  | {
      kind: 'skip';
      reason: string;
      message: string;
    }
  | {
      kind: 'swap';
      inputMint: string;
      outputMint: string;
    inputAmountUi: number;
    inputAmountRaw: string;
    quotedInputDecimals: number;
    maxAttempts: number;
    slippageBps: number | null;
    positionDriftMessage?: string | null;
    chunkFraction?: {
      numerator: bigint;
      denominator: bigint;
      label: string;
    } | null;
    };

type ConfirmationResult =
  | { state: 'confirmed'; slot: number | null }
  | { state: 'failed'; message: string }
  | { state: 'pending' };

type ExecutionOutcome =
  | { outcome: 'skipped'; reason: string; message: string }
  | { outcome: 'requeued'; message: string }
  | { outcome: 'submitted'; signature: string | null; recoveryPending?: boolean }
  | { outcome: 'confirmed'; signature: string }
  | { outcome: 'failed'; message: string };

function buildJupiterHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (JUPITER_API_KEY) {
    headers['x-api-key'] = JUPITER_API_KEY;
  }

  return headers;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOlderThan(timestamp: string | null | undefined, ms: number) {
  if (!timestamp) {
    return false;
  }

  const parsed = new Date(timestamp).getTime();
  return Number.isFinite(parsed) && Date.now() - parsed >= ms;
}

export function computeRetryDelayMs(attemptCount: number) {
  const exponent = Math.max(attemptCount - 1, 0);
  const baseDelay = Math.min(RETRY_BACKOFF_BASE_MS * Math.pow(2, exponent), RETRY_BACKOFF_MAX_MS);
  const jitter = Math.floor(Math.random() * 250);
  return baseDelay + jitter;
}

function normalizePriceImpact(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeRawAmount(value: unknown) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.floor(value).toString();
  }

  return null;
}

function rawToUi(rawAmount: string | bigint, decimals: number) {
  const raw = typeof rawAmount === 'bigint' ? rawAmount : BigInt(rawAmount);
  return Number(raw) / Math.pow(10, decimals);
}

function uiToRaw(amount: number, decimals: number) {
  const scaled = Math.floor(amount * Math.pow(10, decimals));
  return BigInt(Math.max(scaled, 0));
}

function ceilDiv(numerator: bigint, denominator: bigint) {
  return (numerator + denominator - 1n) / denominator;
}

function getSellChunkFraction(attemptNumber: number) {
  const normalizedAttempt = Math.max(attemptNumber, 1);
  return SELL_EXIT_CHUNK_LADDER[Math.min(normalizedAttempt - 1, SELL_EXIT_CHUNK_LADDER.length - 1)]!;
}

export function isNoRouteFailure(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes('no route')
    || lower.includes('no quote')
    || lower.includes('route not found')
    || lower.includes('failed to get quotes')
    || lower.includes('failed to get quote')
  );
}

export function getSellSlippageBps(wallet: LivePilotWalletConfig, attemptNumber: number) {
  const ladder = buildSellSlippageLadderBps(wallet);
  const normalizedAttempt = Math.max(attemptNumber, 1);
  return ladder[Math.min(normalizedAttempt - 1, ladder.length - 1)] ?? ladder[0] ?? null;
}

export function buildSellSlippageLadderBps(wallet: LivePilotWalletConfig) {
  const firstAttemptBps = Math.max(wallet.sellSlippageRetryBps || 0, SELL_SLIPPAGE_LADDER_BPS[0]);
  return [firstAttemptBps, ...SELL_SLIPPAGE_LADDER_BPS.filter((bps) => bps > firstAttemptBps)];
}

export function isRetryableSellExecutionFailure(
  trade: Pick<PilotTradeRow, 'leader_type'>,
  code: string | null,
  message: string,
) {
  if (trade.leader_type !== 'sell') {
    return false;
  }

  const lower = message.toLowerCase();
  return (
    code === '15001'
    || code === '6001'
    || code === '6017'
    || lower.includes('15001')
    || lower.includes('6001')
    || lower.includes('6017')
    || lower.includes('slippage tolerance exceeded')
    || lower.includes('slippage limit exceeded')
    || lower.includes('slippagelimitexceeded')
    || lower.includes('exactoutamountnotmatched')
    || lower.includes('moved out of range')
    || lower.includes('tick array')
    || lower.includes('bitmap extension')
  );
}

export function isRetryableBuyExecutionFailure(
  trade: Pick<PilotTradeRow, 'leader_type'>,
  code: string | null,
  message: string,
) {
  if (trade.leader_type !== 'buy') {
    return false;
  }

  const lower = message.toLowerCase();
  return (
    code === '6001'
    || lower.includes('6001')
    || lower.includes('slippage tolerance exceeded')
    || lower.includes('slippage limit exceeded')
    || lower.includes('slippagelimitexceeded')
  );
}

export function getTradeRetryDelayMs(
  trade: Pick<PilotTradeRow, 'leader_type'>,
  attemptCount: number,
  code: string | null,
  message: string,
) {
  if (isRetryableBuyExecutionFailure(trade, code, message)) {
    return FAST_BUY_REQUOTE_DELAY_MS;
  }

  return computeRetryDelayMs(attemptCount);
}

export function getPilotTradeMaxAttempts(wallet: LivePilotWalletConfig, trade: PilotTradeRow) {
  if (trade.leader_type === 'buy') {
    return 1 + Math.max(wallet.buyMaxRequotes, 0);
  }

  return Math.max(buildSellSlippageLadderBps(wallet).length, SELL_EXIT_CHUNK_LADDER.length);
}

export function isExecuteRetryWindowOpen(attemptTimestamp: string | null | undefined) {
  return !isOlderThan(attemptTimestamp, EXECUTE_RETRY_WINDOW_MS);
}

function loadKeypair(secret: string) {
  try {
    return Keypair.fromSecretKey(bs58.decode(secret));
  } catch {
    const parsed = JSON.parse(secret);
    if (!Array.isArray(parsed)) {
      throw new Error('PILOT wallet secret must be base58 or a JSON array of bytes');
    }
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  }
}

function createJupiterError(
  code: string,
  message: string,
  stage?: 'order' | 'execute' | 'confirmation',
  httpStatus?: number,
) {
  const error = new Error(message) as JupiterApiError;
  error.code = code;
  error.stage = stage;
  error.httpStatus = httpStatus;
  return error;
}

export function classifyJupiterFailure(
  message: string,
  code: string | null,
  retryable: boolean,
  options?: {
    retryNoRoute?: boolean;
  },
) {
  const lower = message.toLowerCase();
  if (isNoRouteFailure(message)) {
    if (options?.retryNoRoute) {
      return { terminalStatus: 'failed' as const, reason: 'retryable_no_route', retryable: true };
    }

    return { terminalStatus: 'skipped' as const, reason: 'no_route', retryable: false };
  }

  const priceImpact = lower.includes('price impact');
  if (priceImpact) {
    return { terminalStatus: 'skipped' as const, reason: 'price_impact_too_high', retryable: false };
  }

  if (retryable || code === '-1000' || code === '-2000' || code === '-2003') {
    return { terminalStatus: 'failed' as const, reason: 'retryable_execution_error', retryable: true };
  }

  return { terminalStatus: 'failed' as const, reason: 'execution_failed', retryable: false };
}

export function isRetryableExecutionCode(code: string | null) {
  return code === '429' || code === '-1000' || code === '-2000' || code === '-2003';
}

export function isAmbiguousExecuteError(error: unknown) {
  const candidate = error as JupiterApiError | undefined;
  if (!candidate || candidate.stage !== 'execute') {
    return false;
  }

  if (candidate.code === 'execute_transport_error' || candidate.code === 'missing_signature') {
    return true;
  }

  return typeof candidate.httpStatus === 'number' && candidate.httpStatus >= 500;
}

function isNotableSkipReason(reason: string) {
  return [
    'mint_quarantined',
    'price_impact_too_high',
    'insufficient_balance',
    'not_followed_position',
    'insufficient_deployable_sol',
    'insufficient_sol_for_fees',
    'no_route',
    'technically_too_small',
    'trapped_unquotable',
  ].includes(reason);
}

function deriveTransactionSignature(transaction: VersionedTransaction) {
  return transaction.signatures[0] ? bs58.encode(transaction.signatures[0]) : null;
}

async function requestSwapOrder(
  plan: Extract<ExecutionPlan, { kind: 'swap' }>,
  taker: string,
) {
  const url = new URL(`${JUPITER_SWAP_BASE_URL}/order`);
  url.searchParams.set('inputMint', plan.inputMint);
  url.searchParams.set('outputMint', plan.outputMint);
  url.searchParams.set('amount', plan.inputAmountRaw);
  url.searchParams.set('taker', taker);

  if (plan.slippageBps !== null) {
    url.searchParams.set('slippageBps', String(plan.slippageBps));
  }

  const response = await fetch(url.toString(), {
    headers: buildJupiterHeaders(),
  });

  let payload: JupiterOrderResponse | null = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.transaction || !payload?.requestId) {
    const code = String(payload?.errorCode ?? response.status);
    const message = payload?.message || payload?.error || `Jupiter order failed with status ${response.status}`;
    throw createJupiterError(code, message, 'order', response.status);
  }

  return payload;
}

export async function executeSignedOrder(requestId: string, signedTransaction: string) {
  let response: Response;
  try {
    response = await fetch(`${JUPITER_SWAP_BASE_URL}/execute`, {
      method: 'POST',
      headers: buildJupiterHeaders(),
      body: JSON.stringify({
        requestId,
        signedTransaction,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createJupiterError('execute_transport_error', message, 'execute');
  }

  let payload: JupiterExecuteResponse | null = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const code = String(payload?.errorCode ?? payload?.code ?? response.status);
    const message = payload?.message || payload?.error || `Jupiter execute failed with status ${response.status}`;
    throw createJupiterError(code, message, 'execute', response.status);
  }

  return payload || {};
}

async function getTokenBalance(
  connection: Connection,
  ownerAddress: string,
  mintAddress: string,
) {
  const owner = new PublicKey(ownerAddress);
  const programIds = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
  const balances = await Promise.all(
    programIds.map((programId) =>
      connection.getParsedTokenAccountsByOwner(owner, { programId }, 'confirmed')
    )
  );

  let rawAmount = BigInt(0);
  let decimals: number | null = null;

  for (const response of balances) {
    for (const entry of response.value) {
      const parsedInfo = (entry.account.data as any)?.parsed?.info;
      if (!parsedInfo || parsedInfo.mint !== mintAddress) {
        continue;
      }

      const tokenAmount = parsedInfo.tokenAmount;
      rawAmount += BigInt(tokenAmount.amount || '0');
      decimals = tokenAmount.decimals ?? decimals;
    }
  }

  if (decimals === null) {
    decimals = await getTokenDecimals(mintAddress);
  }

  return {
    rawAmount: rawAmount.toString(),
    uiAmount: rawToUi(rawAmount, decimals),
    decimals,
  };
}

async function buildExecutionPlan(
  trade: PilotTradeRow,
  wallet: LivePilotWalletConfig,
  connection: Connection,
): Promise<ExecutionPlan> {
  const copyRatio = Math.min(Math.max(Number(trade.copy_ratio || 0), 0), 1);
  if (copyRatio <= 0) {
    return {
      kind: 'skip',
      reason: 'zero_copy_ratio',
      message: 'Copy ratio was zero at execution time',
    };
  }

  if (trade.leader_type === 'buy') {
    const leaderTimestamp = trade.leader_block_timestamp ? new Date(trade.leader_block_timestamp).getTime() : null;
    if (leaderTimestamp && Number.isFinite(leaderTimestamp)) {
      const tradeAgeMs = Date.now() - leaderTimestamp;
      if (tradeAgeMs > BUY_STALENESS_THRESHOLD_MS) {
        return {
          kind: 'skip',
          reason: 'stale_buy',
          message: `Buy intent is ${Math.round(tradeAgeMs / 1000)}s old at execution time`,
        };
      }
    }

    const outputMint = trade.token_out_mint || '';
    if (!outputMint) {
      return {
        kind: 'skip',
        reason: 'missing_output_mint',
        message: 'Buy intent is missing token_out_mint',
      };
    }

    const lamports = await connection.getBalance(new PublicKey(wallet.publicKey), 'confirmed');
    const walletBalanceSol = lamports / 1e9;
    const reserveSol = Math.max(
      walletBalanceSol * wallet.feeReservePct,
      wallet.minFeeReserveSol,
    );
    const deployableSol = Math.max(0, walletBalanceSol - reserveSol);
    const desiredInputSol = deployableSol * copyRatio;

    if (desiredInputSol <= 0) {
      return {
        kind: 'skip',
        reason: 'insufficient_deployable_sol',
        message: `Wallet ${wallet.alias} has no deployable SOL after reserves`,
      };
    }

    if (await isPilotMintQuarantined(outputMint)) {
      return {
        kind: 'skip',
        reason: 'mint_quarantined',
        message: `${getTokenSymbol(outputMint)} is quarantined for live-pilot buys`,
      };
    }

    if (desiredInputSol < LIVE_PILOT_TECHNICAL_MIN_SOL) {
      return {
        kind: 'skip',
        reason: 'technically_too_small',
        message: `Buy size ${desiredInputSol.toFixed(6)} SOL is below the technical viability floor`,
      };
    }

    return {
      kind: 'swap',
      inputMint: SOL_MINT,
      outputMint,
      inputAmountUi: desiredInputSol,
      inputAmountRaw: uiToRaw(desiredInputSol, 9).toString(),
      quotedInputDecimals: 9,
      maxAttempts: getPilotTradeMaxAttempts(wallet, trade),
      slippageBps: null,
      chunkFraction: null,
    };
  }

  const inputMint = trade.token_in_mint || '';
  if (!inputMint) {
    return {
      kind: 'skip',
      reason: 'missing_input_mint',
      message: 'Sell intent is missing token_in_mint',
    };
  }

  if (await isPilotMintQuarantined(inputMint)) {
    return {
      kind: 'skip',
      reason: 'mint_quarantined',
      message: `${getTokenSymbol(inputMint)} is quarantined for live-pilot sells`,
    };
  }

  const [tokenBalance, lamports] = await Promise.all([
    getTokenBalance(connection, wallet.publicKey, inputMint),
    connection.getBalance(new PublicKey(wallet.publicKey), 'confirmed'),
  ]);
  if (tokenBalance.uiAmount <= 0) {
    return {
      kind: 'skip',
      reason: 'insufficient_balance',
      message: `Wallet ${wallet.alias} has no ${getTokenSymbol(inputMint)} balance to sell`,
      };
  }

  const walletBalanceSol = lamports / 1e9;
  if (walletBalanceSol < wallet.minFeeReserveSol) {
    return {
      kind: 'skip',
      reason: 'insufficient_sol_for_fees',
      message: `Wallet ${wallet.alias} has only ${walletBalanceSol.toFixed(6)} SOL for fees`,
    };
  }

  const copiedPositionBefore = Math.max(Number(trade.copied_position_before || 0), 0);
  if (copiedPositionBefore <= 0) {
    return {
      kind: 'skip',
      reason: 'not_followed_position',
      message: `Wallet ${wallet.alias} did not build a copied ${getTokenSymbol(inputMint)} position`,
    };
  }

  const desiredAmountUi = copiedPositionBefore * copyRatio;
  const desiredAmountRaw = copyRatio >= 0.999
    ? uiToRaw(copiedPositionBefore, tokenBalance.decimals)
    : uiToRaw(desiredAmountUi, tokenBalance.decimals);

  if (desiredAmountRaw <= BigInt(0)) {
    return {
      kind: 'skip',
      reason: 'insufficient_balance',
      message: `Sell amount rounded to zero for ${getTokenSymbol(inputMint)}`,
    };
  }

  const chunkFraction = getSellChunkFraction(trade.attempt_count);
  const chunkedAmountRaw = trade.attempt_count <= 1
    ? desiredAmountRaw
    : (desiredAmountRaw * chunkFraction.numerator) / chunkFraction.denominator;
  const attemptedAmountRaw = chunkedAmountRaw > 0n ? chunkedAmountRaw : desiredAmountRaw > 0n ? 1n : 0n;
  const clampedAttemptedAmountRaw = attemptedAmountRaw < BigInt(tokenBalance.rawAmount)
    ? attemptedAmountRaw
    : BigInt(tokenBalance.rawAmount);

  if (clampedAttemptedAmountRaw <= 0n) {
    return {
      kind: 'skip',
      reason: 'technically_too_small',
      message: `Sell amount became technically too small for ${getTokenSymbol(inputMint)}`,
    };
  }

  const positionDriftMessage = copiedPositionBefore - tokenBalance.uiAmount > 1e-9
    ? `Copied position ${copiedPositionBefore.toFixed(6)} ${getTokenSymbol(inputMint)} exceeded on-chain balance ${tokenBalance.uiAmount.toFixed(6)}; clamping sell size`
    : null;

  return {
    kind: 'swap',
    inputMint,
    outputMint: SOL_MINT,
    inputAmountUi: rawToUi(clampedAttemptedAmountRaw, tokenBalance.decimals),
    inputAmountRaw: clampedAttemptedAmountRaw.toString(),
    quotedInputDecimals: tokenBalance.decimals,
    maxAttempts: getPilotTradeMaxAttempts(wallet, trade),
    slippageBps: getSellSlippageBps(wallet, trade.attempt_count),
    positionDriftMessage,
    chunkFraction,
  };
}

export function createLivePilotConnection() {
  if (!HELIUS_RPC_URL) {
    throw new Error('Missing HELIUS_API_RPC_URL / HELIUS_API_KEY for live-pilot execution');
  }

  return new Connection(HELIUS_RPC_URL, {
    commitment: 'confirmed',
  });
}

export async function waitForPilotConfirmation(
  connection: Connection,
  signature: string,
  timeoutMs: number = CONFIRM_TIMEOUT_MS,
): Promise<ConfirmationResult> {
  const deadline = Date.now() + timeoutMs;
  let settled = false;
  let timeoutHandle: NodeJS.Timeout | null = null;
  let pollHandle: NodeJS.Timeout | null = null;
  let subscriptionId: number | null = null;

  return new Promise<ConfirmationResult>((resolve) => {
    const cleanup = () => {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }

      if (pollHandle) {
        clearTimeout(pollHandle);
        pollHandle = null;
      }

      if (subscriptionId !== null) {
        void connection.removeSignatureListener(subscriptionId).catch(() => undefined);
        subscriptionId = null;
      }
    };

    const settle = (result: ConfirmationResult) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(result);
    };

    const pollOnce = async () => {
      if (settled) {
        return;
      }

      try {
        const statuses = await connection.getSignatureStatuses([signature], {
          searchTransactionHistory: true,
        });
        const status = statuses.value[0];

        if (status?.err) {
          settle({
            state: 'failed',
            message: JSON.stringify(status.err),
          });
          return;
        }

        if (status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized') {
          settle({
            state: 'confirmed',
            slot: status.slot ?? null,
          });
          return;
        }
      } catch {
        // Keep the websocket listener active and retry via polling until timeout.
      }

      if (!settled && Date.now() < deadline) {
        pollHandle = setTimeout(() => {
          void pollOnce();
        }, CONFIRM_POLL_INTERVAL_MS);
      }
    };

    timeoutHandle = setTimeout(() => {
      settle({ state: 'pending' });
    }, timeoutMs);

    try {
      subscriptionId = connection.onSignature(
        signature,
        (result, context) => {
          if (result.err) {
            settle({
              state: 'failed',
              message: JSON.stringify(result.err),
            });
            return;
          }

          settle({
            state: 'confirmed',
            slot: context.slot ?? null,
          });
        },
        'confirmed',
      );
    } catch {
      subscriptionId = null;
    }

    void pollOnce();
  });
}

async function maybeAlertSkippedTrade(trade: PilotTradeRow, walletAlias: string, reason: string, message: string) {
  if (!isNotableSkipReason(reason) && trade.trigger_kind !== 'liquidation') {
    return;
  }

  await sendLivePilotAlert('Trade skipped', [
    `wallet=${walletAlias}`,
    `trade=${trade.id}`,
    `trigger=${trade.trigger_kind}`,
    `reason=${reason}`,
    message,
  ]).catch(() => undefined);
}

async function maybeAlertTradeFailure(trade: PilotTradeRow, walletAlias: string, message: string) {
  await sendLivePilotAlert('Trade failed', [
    `wallet=${walletAlias}`,
    `trade=${trade.id}`,
    `trigger=${trade.trigger_kind}`,
    message,
  ]).catch(() => undefined);
}

async function maybeAlertTradeSubmitted(trade: PilotTradeRow, walletAlias: string, signature: string) {
  await sendLivePilotAlert('Trade submitted', [
    `wallet=${walletAlias}`,
    `trade=${trade.id}`,
    `trigger=${trade.trigger_kind}`,
    `signature=${signature}`,
    formatSolscanTxUrl(signature),
  ]).catch(() => undefined);
}

async function maybeAlertTradeConfirmed(trade: PilotTradeRow, walletAlias: string, signature: string) {
  await sendLivePilotAlert('Trade confirmed', [
    `wallet=${walletAlias}`,
    `trade=${trade.id}`,
    `trigger=${trade.trigger_kind}`,
    `signature=${signature}`,
    formatSolscanTxUrl(signature),
  ]).catch(() => undefined);
}

async function maybeAlertMintQuarantined(args: {
  walletAlias: string;
  trade: PilotTradeRow;
  mint: string;
  message: string;
}) {
  const { walletAlias, trade, mint, message } = args;
  await sendLivePilotAlert('Mint quarantined', [
    `wallet=${walletAlias}`,
    `trade=${trade.id}`,
    `mint=${mint}`,
    `symbol=${getTokenSymbol(mint)}`,
    message,
  ]).catch(() => undefined);
}

export async function recordConfirmedCopyPositionMutation(args: {
  trade: PilotTradeRow;
  wallet: LivePilotWalletConfig;
  inputAmount: number | null;
  outputAmount: number | null;
}) {
  const { trade, wallet, inputAmount, outputAmount } = args;
  const tradeTimestampIso = trade.leader_block_timestamp || new Date().toISOString();

  if (trade.leader_type === 'buy' && trade.token_out_mint) {
    const copiedBuyAmount = Math.max(outputAmount || 0, 0);
    const copiedCostUsd = Math.max(inputAmount || 0, 0) * Math.max(Number(trade.sol_price_at_intent || 0), 0);
    const lifecycle = await recordSuccessfulCopiedBuy({
      scopeType: 'pilot',
      scopeKey: wallet.alias,
      starTrader: trade.star_trader || wallet.starTrader || '',
      mint: trade.token_out_mint,
      tokenSymbol: getTokenSymbol(trade.token_out_mint),
      tradeSignature: trade.star_trade_signature,
      tradeTimestampIso,
      copiedBuyAmount,
      copiedCostUsd,
    });

    return {
      copiedPositionAfter: lifecycle.copiedPositionAfter,
    };
  }

  if (trade.token_in_mint) {
    const lifecycle = await recordSuccessfulCopiedSell({
      scopeType: 'pilot',
      scopeKey: wallet.alias,
      starTrader: trade.star_trader || wallet.starTrader || '',
      mint: trade.token_in_mint,
      tokenSymbol: getTokenSymbol(trade.token_in_mint),
      tradeSignature: trade.star_trade_signature,
      tradeTimestampIso,
      copiedSellAmount: Math.max(inputAmount || 0, 0),
    });

    return {
      copiedPositionAfter: lifecycle.copiedPositionAfter,
    };
  }

  return {
    copiedPositionAfter: trade.copied_position_after,
  };
}

export async function maybeQueueResidualExitTrade(args: {
  trade: PilotTradeRow;
  wallet: LivePilotWalletConfig;
  connection: Connection;
  attemptedInputRaw: string | null;
}) {
  const { trade, wallet, connection, attemptedInputRaw } = args;
  if (
    trade.leader_type !== 'sell'
    || !trade.token_in_mint
    || !attemptedInputRaw
    || trade.attempt_count <= 1
  ) {
    return null;
  }

  const chunkFraction = getSellChunkFraction(trade.attempt_count);
  if (chunkFraction.numerator === chunkFraction.denominator) {
    return null;
  }

  const attemptedRaw = BigInt(attemptedInputRaw);
  const inferredDesiredRaw = ceilDiv(attemptedRaw * chunkFraction.denominator, chunkFraction.numerator);
  const residualRaw = inferredDesiredRaw - attemptedRaw;
  if (residualRaw <= 0n) {
    return null;
  }

  const postTradeBalance = await getTokenBalance(connection, wallet.publicKey, trade.token_in_mint);
  const remainingBalanceRaw = BigInt(postTradeBalance.rawAmount);
  if (remainingBalanceRaw <= 0n) {
    return null;
  }

  const residualToSellRaw = residualRaw < remainingBalanceRaw ? residualRaw : remainingBalanceRaw;
  if (residualToSellRaw <= 0n) {
    return null;
  }

  const residualCopyRatio = Number(residualToSellRaw) / Number(remainingBalanceRaw);
  if (!Number.isFinite(residualCopyRatio) || residualCopyRatio <= 0) {
    return null;
  }

  const copyState = await getCopyPositionState({
    scopeType: 'pilot',
    scopeKey: wallet.alias,
    starTrader: trade.star_trader || wallet.starTrader || '',
    mint: trade.token_in_mint,
  });

  const createdAt = new Date().toISOString();
  const result = await createPilotTrade({
    wallet_alias: wallet.alias,
    wallet_public_key: wallet.publicKey,
    trigger_kind: trade.trigger_kind,
    trigger_reason: trade.trigger_kind === 'liquidation' ? 'residual_liquidation' : 'residual_exit',
    star_trader: trade.star_trader,
    star_trade_signature: trade.star_trade_signature,
    leader_type: trade.leader_type,
    token_in_mint: trade.token_in_mint,
    token_out_mint: trade.token_out_mint,
    copy_ratio: Math.min(Math.max(residualCopyRatio, 0), 1),
    leader_position_before: trade.leader_position_before,
    leader_position_after: trade.leader_position_after,
    copied_position_before: copyState?.copied_open_amount ?? null,
    copied_position_after: copyState?.copied_open_amount ?? null,
    sell_fraction: trade.sell_fraction,
    leader_block_timestamp: trade.leader_block_timestamp,
    received_at: createdAt,
    intent_created_at: createdAt,
    sol_price_at_intent: trade.sol_price_at_intent,
    status: 'queued',
    skip_reason: null,
    error_message: null,
    next_retry_at: null,
  });

  return result.created ? result.trade : null;
}

export async function quarantineFailedMint(args: {
  trade: PilotTradeRow;
  walletAlias: string;
  message: string;
}) {
  const { trade, walletAlias, message } = args;
  const mint = trade.token_in_mint;
  if (!mint) {
    return null;
  }

  const quarantine = await quarantinePilotMint({
    mint,
    reason: 'trapped_unquotable',
    firstWalletAlias: walletAlias,
    firstStarTrader: trade.star_trader,
    firstPilotTradeId: trade.id,
    note: message,
  });
  await maybeAlertMintQuarantined({
    walletAlias,
    trade,
    mint,
    message,
  });
  return quarantine;
}

async function queueTradeRetry(
  trade: PilotTradeRow,
  walletAlias: string,
  message: string,
  context?: {
    txSignature?: string | null;
    txSubmittedAt?: string | null;
    delayMs?: number;
  },
) {
  const delayMs = context?.delayMs ?? computeRetryDelayMs(trade.attempt_count);
  const nextRetryAt = new Date(Date.now() + delayMs).toISOString();

  await Promise.all([
    updatePilotTrade(trade.id, {
      status: 'queued',
      next_retry_at: nextRetryAt,
      error_message: message,
      skip_reason: null,
      ...(context?.txSignature !== undefined ? { tx_signature: context.txSignature } : {}),
      ...(context?.txSubmittedAt !== undefined ? { tx_submitted_at: context.txSubmittedAt } : {}),
    }),
    updatePilotRuntimeState(walletAlias, {
      last_error: message,
    }),
  ]);
  await broadcastLivePilotQueueWake({
    source: 'trade_requeued',
    walletAlias,
    tradeId: trade.id,
  });

  return nextRetryAt;
}

export async function executePilotTrade(
  trade: PilotTradeRow,
  wallet: LivePilotWalletConfig,
  connection: Connection,
): Promise<ExecutionOutcome> {
  if (!wallet.hasSecret || !wallet.secret) {
    await updatePilotTrade(trade.id, {
      status: 'skipped',
      skip_reason: 'wallet_not_ready',
      error_message: 'Pilot wallet secret is missing for execution',
    });
    await updatePilotRuntimeState(wallet.alias, {
      last_error: 'Pilot wallet secret is missing for execution',
    });
    return {
      outcome: 'skipped',
      reason: 'wallet_not_ready',
      message: 'Pilot wallet secret is missing for execution',
    };
  }

  const plan = await buildExecutionPlan(trade, wallet, connection);
  if (plan.kind === 'skip') {
    await updatePilotTrade(trade.id, {
      status: 'skipped',
      skip_reason: plan.reason,
      error_message: plan.message,
      next_retry_at: null,
    });
    await updatePilotRuntimeState(wallet.alias, {
      last_error: plan.message,
    });
    await maybeAlertSkippedTrade(trade, wallet.alias, plan.reason, plan.message);
    return {
      outcome: 'skipped',
      reason: plan.reason,
      message: plan.message,
    };
  }

  if (plan.positionDriftMessage) {
    await updatePilotRuntimeState(wallet.alias, {
      last_error: plan.positionDriftMessage,
    }).catch(() => undefined);
    await sendLivePilotAlert('Copy position reconciled to on-chain balance', [
      `wallet=${wallet.alias}`,
      `trade=${trade.id}`,
      plan.positionDriftMessage,
    ]).catch(() => undefined);
  }

  const attempt = await createPilotTradeAttempt({
    pilot_trade_id: trade.id,
    attempt_number: trade.attempt_count,
    execution_mode: 'managed_order_execute',
    slippage_bps: plan.slippageBps,
    status: 'building',
  });

  try {
    const orderResponse = await requestSwapOrder(plan, wallet.publicKey);
    const priceImpactPct = normalizePriceImpact(orderResponse.priceImpactPct ?? orderResponse.priceImpact);
    const quotedInputRaw = normalizeRawAmount(orderResponse.inputAmount ?? orderResponse.inAmount) || plan.inputAmountRaw;
    const quotedOutputRaw = normalizeRawAmount(orderResponse.outputAmount ?? orderResponse.outAmount);
    const quotedOutputAmount = quotedOutputRaw
      ? rawToUi(quotedOutputRaw, await getTokenDecimals(plan.outputMint))
      : null;
    const quotedInputAmount = rawToUi(quotedInputRaw, plan.quotedInputDecimals);
    const quoteReceivedAt = new Date().toISOString();

    const shouldEnforcePriceImpact =
      trade.leader_type === 'buy'
      && wallet.buyMaxPriceImpactPct > 0;

    if (shouldEnforcePriceImpact && Math.abs(priceImpactPct) > wallet.buyMaxPriceImpactPct) {
      const message = `Price impact ${priceImpactPct.toFixed(4)} exceeded ${wallet.buyMaxPriceImpactPct.toFixed(4)}`;
      await updatePilotTradeAttempt(attempt.id, {
        status: 'failed',
        error_code: 'price_impact_too_high',
        error_message: message,
      });
      await updatePilotTrade(trade.id, {
        status: 'skipped',
        skip_reason: 'price_impact_too_high',
        error_message: message,
        next_retry_at: null,
      });
      await updatePilotRuntimeState(wallet.alias, {
        last_error: `Price impact too high for ${trade.id}`,
      });
      await maybeAlertSkippedTrade(trade, wallet.alias, 'price_impact_too_high', message);
      return {
        outcome: 'skipped',
        reason: 'price_impact_too_high',
        message: `Price impact ${priceImpactPct.toFixed(4)} exceeded threshold`,
      };
    }

    const keypair = loadKeypair(wallet.secret);
    const unsignedTransaction = orderResponse.transaction;
    if (!unsignedTransaction) {
      throw createJupiterError('missing_transaction', 'Jupiter order did not return a transaction payload');
    }

    const txBuffer = Buffer.from(unsignedTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(txBuffer);
    transaction.sign([keypair]);
    const signedTransaction = Buffer.from(transaction.serialize()).toString('base64');
    const derivedTxSignature = deriveTransactionSignature(transaction);
    const txBuiltAt = new Date().toISOString();

    await Promise.all([
      updatePilotTradeAttempt(attempt.id, {
        jupiter_request_id: orderResponse.requestId || null,
        jupiter_router: orderResponse.router || orderResponse.routerName || null,
        last_valid_block_height: orderResponse.lastValidBlockHeight ?? null,
        quoted_input_amount: quotedInputAmount,
        quoted_output_amount: quotedOutputAmount,
        quoted_input_amount_raw: quotedInputRaw,
        price_impact_pct: priceImpactPct,
        prioritization_fee_lamports: normalizeRawAmount(orderResponse.prioritizationFeeLamports),
        signed_transaction: signedTransaction,
        tx_signature: derivedTxSignature,
        execute_retry_count: 1,
        execute_last_attempt_at: new Date().toISOString(),
      }),
      updatePilotTrade(trade.id, {
        quote_received_at: quoteReceivedAt,
        quoted_input_amount: quotedInputAmount,
        quoted_output_amount: quotedOutputAmount,
        quoted_input_amount_raw: quotedInputRaw,
        price_impact_pct: priceImpactPct,
        tx_built_at: txBuiltAt,
        next_retry_at: null,
        error_message: null,
      }),
    ]);

    let executeResponse: JupiterExecuteResponse;
    try {
      executeResponse = await executeSignedOrder(orderResponse.requestId!, signedTransaction);
    } catch (error) {
      if (!isAmbiguousExecuteError(error)) {
        throw error;
      }

      const ambiguousMessage = error instanceof Error ? error.message : 'Jupiter execute response was ambiguous';
      const pendingAt = new Date().toISOString();

      await Promise.all([
        updatePilotTradeAttempt(attempt.id, {
          status: 'submitted',
          tx_signature: derivedTxSignature,
          tx_submitted_at: pendingAt,
          error_code: (error as JupiterApiError | undefined)?.code ?? 'execute_ambiguous',
          error_message: ambiguousMessage,
        }),
        updatePilotTrade(trade.id, {
          status: 'submitted',
          tx_submitted_at: pendingAt,
          tx_signature: derivedTxSignature,
          error_message: ambiguousMessage,
          next_retry_at: null,
        }),
        updatePilotRuntimeState(wallet.alias, {
          last_submitted_tx_signature: derivedTxSignature,
          last_error: ambiguousMessage,
        }),
      ]);
      await sendLivePilotAlert('Execute response ambiguous', [
        `wallet=${wallet.alias}`,
        `trade=${trade.id}`,
        `requestId=${orderResponse.requestId}`,
        ambiguousMessage,
        'Recovery will re-submit the same signed transaction for up to 2 minutes.',
      ]).catch(() => undefined);
      return { outcome: 'submitted', signature: null, recoveryPending: true };
    }

    const txSignature = executeResponse.signature || executeResponse.txid || executeResponse.transactionId || null;
    const txSubmittedAt = new Date().toISOString();
    const actualInputRaw = normalizeRawAmount(executeResponse.inputAmountResult);
    const actualOutputRaw = normalizeRawAmount(executeResponse.outputAmountResult);
    const actualOutputAmount = actualOutputRaw
      ? rawToUi(actualOutputRaw, await getTokenDecimals(plan.outputMint))
      : null;
    const actualInputAmount = actualInputRaw
      ? rawToUi(actualInputRaw, plan.quotedInputDecimals)
      : quotedInputAmount;

    if (!txSignature || executeResponse.status === 'Failed') {
      const code = String(executeResponse.errorCode ?? executeResponse.code ?? 'execute_failed');
      const message = executeResponse.message || executeResponse.error || 'Jupiter execute did not return a transaction signature';
      const executeError = createJupiterError(code, message, 'execute');
      executeError.derivedSignature = txSignature || derivedTxSignature;
      executeError.submittedAt = txSubmittedAt;
      throw executeError;
    }

    await Promise.all([
      updatePilotTradeAttempt(attempt.id, {
        status: 'submitted',
        tx_signature: txSignature,
        tx_submitted_at: txSubmittedAt,
        actual_input_amount: actualInputAmount,
        actual_output_amount: actualOutputAmount,
        error_code: null,
        error_message: null,
      }),
      updatePilotTrade(trade.id, {
        status: 'submitted',
        tx_submitted_at: txSubmittedAt,
        tx_signature: txSignature,
        actual_input_amount: actualInputAmount,
        actual_output_amount: actualOutputAmount,
        next_retry_at: null,
        error_message: null,
      }),
      updatePilotRuntimeState(wallet.alias, {
        last_submitted_tx_signature: txSignature,
        last_error: null,
      }),
    ]);
    await maybeAlertTradeSubmitted(trade, wallet.alias, txSignature);

    const confirmation = await waitForPilotConfirmation(connection, txSignature);
    if (confirmation.state === 'confirmed') {
      const confirmedAt = new Date().toISOString();
      const lifecycle = await recordConfirmedCopyPositionMutation({
        trade,
        wallet,
        inputAmount: actualInputAmount,
        outputAmount: actualOutputAmount,
      });
      await Promise.all([
        updatePilotTradeAttempt(attempt.id, {
          status: 'confirmed',
          tx_confirmed_at: confirmedAt,
          confirmation_slot: confirmation.slot,
        }),
        updatePilotTrade(trade.id, {
          status: 'confirmed',
          tx_confirmed_at: confirmedAt,
          confirmation_slot: confirmation.slot,
          winning_attempt_id: attempt.id,
          copied_position_after: lifecycle.copiedPositionAfter,
          next_retry_at: null,
        }),
        updatePilotRuntimeState(wallet.alias, {
          last_confirmed_tx_signature: txSignature,
          last_error: null,
        }),
      ]);
      const residualTrade = await maybeQueueResidualExitTrade({
        trade,
        wallet,
        connection,
        attemptedInputRaw: quotedInputRaw,
      });
      await maybeAlertTradeConfirmed(trade, wallet.alias, txSignature);
      if (residualTrade) {
        await sendLivePilotAlert('Residual exit queued', [
          `wallet=${wallet.alias}`,
          `sourceTrade=${trade.id}`,
          `residualTrade=${residualTrade.id}`,
          `mint=${trade.token_in_mint}`,
          `chunk=${plan.chunkFraction?.label || '100%'}`,
        ]).catch(() => undefined);
      }
      return { outcome: 'confirmed', signature: txSignature };
    }

    if (confirmation.state === 'failed') {
      throw createJupiterError('confirmation_failed', confirmation.message, 'confirmation');
    }

    return { outcome: 'submitted', signature: txSignature };
  } catch (error: any) {
    const code = String(error?.code ?? 'execution_error');
    const message = error?.message || 'Unknown live-pilot execution error';
    const retryable =
      isRetryableExecutionCode(code)
      || isRetryableSellExecutionFailure(trade, code, message)
      || isRetryableBuyExecutionFailure(trade, code, message);
    const classification = classifyJupiterFailure(message, code, retryable, {
      retryNoRoute: trade.leader_type === 'sell',
    });
    const failedTxSignature = error?.derivedSignature ?? null;
    const failedSubmittedAt = error?.submittedAt ?? null;

    await updatePilotTradeAttempt(attempt.id, {
      status: 'failed',
      error_code: classification.terminalStatus === 'skipped' ? classification.reason : code,
      error_message: message,
      ...(failedTxSignature ? { tx_signature: failedTxSignature } : {}),
      ...(failedSubmittedAt ? { tx_submitted_at: failedSubmittedAt } : {}),
    });

    const shouldQuarantineMint =
      trade.leader_type === 'sell'
      && isNoRouteFailure(message)
      && trade.attempt_count >= plan.maxAttempts;

    const canRetry = classification.retryable && trade.attempt_count < plan.maxAttempts;
    if (canRetry) {
      const retryDelayMs = getTradeRetryDelayMs(trade, trade.attempt_count, code, message);
      const nextRetryAt = await queueTradeRetry(trade, wallet.alias, message, {
        txSignature: failedTxSignature,
        txSubmittedAt: failedSubmittedAt,
        delayMs: retryDelayMs,
      });
      await sendLivePilotAlert('Trade requeued', [
        `wallet=${wallet.alias}`,
        `trade=${trade.id}`,
        `nextRetryAt=${nextRetryAt}`,
        message,
      ]).catch(() => undefined);
      return {
        outcome: 'requeued',
        message,
      };
    }

    if (shouldQuarantineMint) {
      await quarantineFailedMint({
        trade,
        walletAlias: wallet.alias,
        message,
      }).catch(() => undefined);
      await updatePilotTrade(trade.id, {
        status: 'skipped',
        skip_reason: 'trapped_unquotable',
        error_message: message,
        next_retry_at: null,
        ...(failedTxSignature ? { tx_signature: failedTxSignature } : {}),
        ...(failedSubmittedAt ? { tx_submitted_at: failedSubmittedAt } : {}),
      });
      await updatePilotRuntimeState(wallet.alias, {
        ...(failedTxSignature ? { last_submitted_tx_signature: failedTxSignature } : {}),
        last_error: message,
      });
      await maybeAlertSkippedTrade(trade, wallet.alias, 'trapped_unquotable', message);
      return {
        outcome: 'skipped',
        reason: 'trapped_unquotable',
        message,
      };
    }

    const terminalStatus = classification.terminalStatus;
    await updatePilotTrade(trade.id, {
      status: terminalStatus,
      skip_reason: terminalStatus === 'skipped' ? classification.reason : null,
      error_message: message,
      next_retry_at: null,
      ...(failedTxSignature ? { tx_signature: failedTxSignature } : {}),
      ...(failedSubmittedAt ? { tx_submitted_at: failedSubmittedAt } : {}),
    });
    await updatePilotRuntimeState(wallet.alias, {
      ...(failedTxSignature ? { last_submitted_tx_signature: failedTxSignature } : {}),
      last_error: message,
    });
    if (terminalStatus === 'failed') {
      if (trade.leader_type === 'sell') {
        await evaluateSellExitProtection(wallet.alias).catch(() => undefined);
      }
      await evaluateWalletCircuitBreaker(wallet.alias).catch(() => undefined);
      await maybeAlertTradeFailure(trade, wallet.alias, message);
    } else {
      await maybeAlertSkippedTrade(trade, wallet.alias, classification.reason, message);
    }
    return terminalStatus === 'skipped'
      ? { outcome: 'skipped', reason: classification.reason, message }
      : { outcome: 'failed', message };
  }
}
