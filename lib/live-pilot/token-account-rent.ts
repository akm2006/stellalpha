import {
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  createBurnCheckedInstruction,
  createCloseAccountInstruction,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { formatSolscanTxUrl, sendLivePilotAlert } from '@/lib/live-pilot/alerts';
import { jupiterFetch } from '@/lib/jupiter/client';
import { waitForSignatureConfirmation } from '@/lib/live-pilot/signature-confirmation';

const DEFAULT_CLOSE_CHUNK_SIZE = 8;
const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112';
const DEFAULT_DUST_CLEANUP_BASE_URL = 'https://api.jup.ag/swap/v1';

function readBooleanEnv(name: string, fallback: boolean) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function readPositiveIntEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const TOKEN_ACCOUNT_RENT_SWEEP_SKIP_PREFLIGHT = readBooleanEnv(
  'LIVE_PILOT_ATA_SWEEP_SKIP_PREFLIGHT',
  true,
);
const TOKEN_ACCOUNT_RENT_SWEEP_CONFIRM_TIMEOUT_MS = readPositiveIntEnv(
  'LIVE_PILOT_ATA_SWEEP_CONFIRM_TIMEOUT_MS',
  12_000,
);
const TOKEN_ACCOUNT_DUST_SWEEP_SLIPPAGE_BPS = readPositiveIntEnv(
  'LIVE_PILOT_TOKEN_ACCOUNT_DUST_SWEEP_SLIPPAGE_BPS',
  1_000,
);
const TOKEN_ACCOUNT_DUST_SWEEP_MIN_OUT_LAMPORTS = readPositiveIntEnv(
  'LIVE_PILOT_TOKEN_ACCOUNT_DUST_SWEEP_MIN_OUT_LAMPORTS',
  1,
);
const TOKEN_ACCOUNT_DUST_SWEEP_PRIORITY_MAX_LAMPORTS = readPositiveIntEnv(
  'LIVE_PILOT_TOKEN_ACCOUNT_DUST_SWEEP_PRIORITY_MAX_LAMPORTS',
  100_000,
);
const TOKEN_ACCOUNT_DUST_SWEEP_REQUEST_DELAY_MS = readPositiveIntEnv(
  'LIVE_PILOT_TOKEN_ACCOUNT_DUST_SWEEP_REQUEST_DELAY_MS',
  700,
);
const TOKEN_ACCOUNT_DUST_SWEEP_SWAP_TIMEOUT_MS = readPositiveIntEnv(
  'LIVE_PILOT_TOKEN_ACCOUNT_DUST_SWEEP_SWAP_TIMEOUT_MS',
  12_000,
);

export interface TokenAccountCloseTarget {
  pubkey: PublicKey;
  programId: PublicKey;
  mint: string;
  lamports: number;
}

export interface NonZeroTokenAccountCleanupTarget extends TokenAccountCloseTarget {
  rawAmount: bigint;
  decimals: number;
  uiAmount: string;
}

interface TokenAccountCloseFailure {
  pubkey: string;
  mint: string;
  message: string;
  logs: string[];
}

async function getSendTransactionErrorLogs(connection: Connection, error: unknown) {
  if (error instanceof SendTransactionError) {
    try {
      return await error.getLogs(connection);
    } catch {
      return error.logs || [];
    }
  }

  return [];
}

async function describeCloseFailure(
  connection: Connection,
  error: unknown,
  targets: TokenAccountCloseTarget[],
) {
  const logs = await getSendTransactionErrorLogs(connection, error);
  const message = error instanceof Error ? error.message : String(error);
  return {
    message,
    logs,
    accounts: targets.map((target) => ({
      pubkey: target.pubkey.toBase58(),
      mint: target.mint,
      programId: target.programId.toBase58(),
      lamports: target.lamports,
    })),
  };
}

function buildCloseTransaction(args: {
  owner: Keypair;
  closeTargets: TokenAccountCloseTarget[];
  blockhash: string;
}) {
  const { owner, closeTargets, blockhash } = args;
  const instructions = closeTargets.map((target) =>
    createCloseAccountInstruction(
      target.pubkey,
      owner.publicKey,
      owner.publicKey,
      [],
      target.programId,
    )
  );
  const message = new TransactionMessage({
    payerKey: owner.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  transaction.sign([owner]);
  return transaction;
}

function buildBurnAndCloseTransaction(args: {
  owner: Keypair;
  target: NonZeroTokenAccountCleanupTarget;
  blockhash: string;
}) {
  const { owner, target, blockhash } = args;
  const instructions = [
    createBurnCheckedInstruction(
      target.pubkey,
      new PublicKey(target.mint),
      owner.publicKey,
      target.rawAmount,
      target.decimals,
      [],
      target.programId,
    ),
    createCloseAccountInstruction(
      target.pubkey,
      owner.publicKey,
      owner.publicKey,
      [],
      target.programId,
    ),
  ];
  const message = new TransactionMessage({
    payerKey: owner.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  transaction.sign([owner]);
  return transaction;
}

async function submitCloseTargets(args: {
  connection: Connection;
  owner: Keypair;
  closeTargets: TokenAccountCloseTarget[];
}) {
  const { connection, owner, closeTargets } = args;
  const latestBlockhash = await connection.getLatestBlockhash('confirmed');
  const transaction = buildCloseTransaction({
    owner,
    closeTargets,
    blockhash: latestBlockhash.blockhash,
  });

  const signature = await connection.sendTransaction(transaction, {
    maxRetries: 0,
    skipPreflight: TOKEN_ACCOUNT_RENT_SWEEP_SKIP_PREFLIGHT,
    preflightCommitment: 'confirmed',
  });
  const confirmation = await waitForSignatureConfirmation(connection, signature, {
    timeoutMs: TOKEN_ACCOUNT_RENT_SWEEP_CONFIRM_TIMEOUT_MS,
  });

  if (confirmation.state === 'failed') {
    throw new Error(
      `Close token account transaction failed: ${signature} err=${confirmation.message}`,
    );
  }
  if (confirmation.state === 'pending') {
    throw new Error(`Close token account confirmation pending: ${signature}`);
  }

  return signature;
}

async function submitBurnAndCloseTarget(args: {
  connection: Connection;
  owner: Keypair;
  target: NonZeroTokenAccountCleanupTarget;
}) {
  const { connection, owner, target } = args;
  const latestBlockhash = await connection.getLatestBlockhash('confirmed');
  const transaction = buildBurnAndCloseTransaction({
    owner,
    target,
    blockhash: latestBlockhash.blockhash,
  });

  const signature = await connection.sendTransaction(transaction, {
    maxRetries: 0,
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  const confirmation = await waitForSignatureConfirmation(connection, signature, {
    timeoutMs: TOKEN_ACCOUNT_RENT_SWEEP_CONFIRM_TIMEOUT_MS,
  });

  if (confirmation.state === 'failed') {
    throw new Error(
      `Burn and close token account transaction failed: ${signature} err=${confirmation.message}`,
    );
  }
  if (confirmation.state === 'pending') {
    throw new Error(`Burn and close token account confirmation pending: ${signature}`);
  }

  return signature;
}

export function collectZeroTokenAccountCloseTargets(
  responses: Array<{
    programId: PublicKey;
    response: {
      value: Array<{
        pubkey: PublicKey;
        account: {
          data: unknown;
          lamports: number;
        };
      }>;
    };
  }>,
  options: {
    mintAddress?: string;
    maxAccounts?: number;
  } = {},
) {
  const maxAccounts = Math.max(0, Math.floor(options.maxAccounts ?? Number.MAX_SAFE_INTEGER));
  const targets: TokenAccountCloseTarget[] = [];

  for (const { programId, response } of responses) {
    for (const entry of response.value) {
      if (targets.length >= maxAccounts) {
        return targets;
      }

      const parsedInfo = (entry.account.data as any)?.parsed?.info;
      if (!parsedInfo?.mint || parsedInfo?.tokenAmount?.amount !== '0') {
        continue;
      }

      if (options.mintAddress && parsedInfo.mint !== options.mintAddress) {
        continue;
      }

      targets.push({
        pubkey: entry.pubkey,
        programId,
        mint: parsedInfo.mint,
        lamports: Number(entry.account.lamports || 0),
      });
    }
  }

  return targets;
}

function normalizeMintSet(values?: Iterable<string> | null) {
  if (!values) return null;
  const set = new Set<string>();
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) set.add(normalized);
  }
  return set;
}

export function collectNonZeroTokenAccountCleanupTargets(
  responses: Array<{
    programId: PublicKey;
    response: {
      value: Array<{
        pubkey: PublicKey;
        account: {
          data: unknown;
          lamports: number;
        };
      }>;
    };
  }>,
  options: {
    cleanupMints?: Iterable<string> | null;
    protectedMints?: Iterable<string> | null;
    maxAccounts?: number;
  } = {},
) {
  const maxAccounts = Math.max(0, Math.floor(options.maxAccounts ?? Number.MAX_SAFE_INTEGER));
  const cleanupMints = normalizeMintSet(options.cleanupMints);
  const protectedMints = normalizeMintSet(options.protectedMints);
  const targets: NonZeroTokenAccountCleanupTarget[] = [];

  for (const { programId, response } of responses) {
    for (const entry of response.value) {
      if (targets.length >= maxAccounts) {
        return targets;
      }

      const parsedInfo = (entry.account.data as any)?.parsed?.info;
      const mint = parsedInfo?.mint;
      const tokenAmount = parsedInfo?.tokenAmount;
      if (!mint || mint === NATIVE_SOL_MINT || !tokenAmount?.amount) {
        continue;
      }

      if (protectedMints?.has(mint)) {
        continue;
      }

      if (cleanupMints && cleanupMints.size > 0 && !cleanupMints.has(mint)) {
        continue;
      }

      const rawAmount = BigInt(tokenAmount.amount);
      if (rawAmount <= 0n) {
        continue;
      }

      targets.push({
        pubkey: entry.pubkey,
        programId,
        mint,
        lamports: Number(entry.account.lamports || 0),
        rawAmount,
        decimals: Number(tokenAmount.decimals || 0),
        uiAmount: String(tokenAmount.uiAmountString || ''),
      });
    }
  }

  return targets;
}

export async function listZeroTokenAccountCloseTargets(args: {
  connection: Connection;
  owner: PublicKey;
  mintAddress?: string;
  maxAccounts?: number;
}) {
  const { connection, owner, mintAddress, maxAccounts } = args;
  const programIds = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
  const responses = await Promise.all(
    programIds.map((programId) =>
      connection.getParsedTokenAccountsByOwner(owner, { programId }, 'confirmed')
        .then((response) => ({ programId, response }))
    )
  );

  return collectZeroTokenAccountCloseTargets(responses, {
    mintAddress,
    maxAccounts,
  });
}

export async function listNonZeroTokenAccountCleanupTargets(args: {
  connection: Connection;
  owner: PublicKey;
  cleanupMints?: Iterable<string> | null;
  protectedMints?: Iterable<string> | null;
  maxAccounts?: number;
}) {
  const { connection, owner, cleanupMints, protectedMints, maxAccounts } = args;
  const programIds = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
  const responses = await Promise.all(
    programIds.map((programId) =>
      connection.getParsedTokenAccountsByOwner(owner, { programId }, 'confirmed')
        .then((response) => ({ programId, response }))
    )
  );

  return collectNonZeroTokenAccountCleanupTargets(responses, {
    cleanupMints,
    protectedMints,
    maxAccounts,
  });
}

function getDustCleanupBaseUrl() {
  return (process.env.LIVE_PILOT_TOKEN_ACCOUNT_DUST_SWEEP_JUPITER_BASE_URL || DEFAULT_DUST_CLEANUP_BASE_URL)
    .replace(/\/+$/, '');
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 300)}`);
  }
}

function isNoRouteMessage(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes('could not find any route')
    || lower.includes('no route')
    || lower.includes('no routes')
    || lower.includes('route not found')
    || lower.includes('token_not_tradable')
  );
}

function isFrozenTokenAccountError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes('account is frozen')
    || lower.includes('custom program error: 0x11')
    || lower.includes('"custom":17')
    || lower.includes('custom program error: 17')
  );
}

async function fetchDustCleanupQuote(target: NonZeroTokenAccountCleanupTarget) {
  const params = new URLSearchParams({
    inputMint: target.mint,
    outputMint: NATIVE_SOL_MINT,
    amount: target.rawAmount.toString(),
    slippageBps: String(TOKEN_ACCOUNT_DUST_SWEEP_SLIPPAGE_BPS),
    swapMode: 'ExactIn',
  });

  const response = await jupiterFetch(
    `${getDustCleanupBaseUrl()}/quote?${params.toString()}`,
    {},
    {
      scope: 'live',
      operation: 'token-account-dust-quote',
      timeoutMs: TOKEN_ACCOUNT_DUST_SWEEP_SWAP_TIMEOUT_MS,
      max429Retries: 1,
    },
  );
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    const message = payload?.error || payload?.message || `Jupiter quote failed with status ${response.status}`;
    if (isNoRouteMessage(String(message))) {
      return null;
    }
    throw new Error(String(message));
  }

  const outAmount = BigInt(payload?.outAmount || '0');
  if (!payload?.routePlan?.length || outAmount < BigInt(TOKEN_ACCOUNT_DUST_SWEEP_MIN_OUT_LAMPORTS)) {
    return null;
  }

  return payload;
}

async function executeDustCleanupSwap(args: {
  connection: Connection;
  owner: Keypair;
  quote: unknown;
}) {
  const { connection, owner, quote } = args;
  const response = await jupiterFetch(
    `${getDustCleanupBaseUrl()}/swap`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: owner.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            priorityLevel: 'medium',
            maxLamports: TOKEN_ACCOUNT_DUST_SWEEP_PRIORITY_MAX_LAMPORTS,
          },
        },
      }),
    },
    {
      scope: 'live',
      operation: 'token-account-dust-swap',
      timeoutMs: TOKEN_ACCOUNT_DUST_SWEEP_SWAP_TIMEOUT_MS,
      max429Retries: 1,
    },
  );
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Jupiter swap failed with status ${response.status}`);
  }

  if (!payload?.swapTransaction) {
    throw new Error(`Jupiter swap did not return swapTransaction: ${JSON.stringify(payload).slice(0, 300)}`);
  }

  const transaction = VersionedTransaction.deserialize(Buffer.from(payload.swapTransaction, 'base64'));
  transaction.sign([owner]);
  const signature = await connection.sendTransaction(transaction, {
    maxRetries: 3,
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  const confirmation = await waitForSignatureConfirmation(connection, signature, {
    timeoutMs: TOKEN_ACCOUNT_RENT_SWEEP_CONFIRM_TIMEOUT_MS,
  });

  if (confirmation.state === 'failed') {
    throw new Error(`Dust cleanup swap failed: ${signature} err=${confirmation.message}`);
  }
  if (confirmation.state === 'pending') {
    throw new Error(`Dust cleanup swap confirmation pending: ${signature}`);
  }

  return signature;
}

async function closeTargetIfEmpty(args: {
  connection: Connection;
  owner: Keypair;
  target: TokenAccountCloseTarget;
}) {
  const { connection, owner, target } = args;
  const fresh = await connection.getParsedAccountInfo(target.pubkey, 'confirmed');
  if (!fresh.value) {
    return { closed: false, reason: 'already_closed', reclaimedLamports: 0, signature: null as string | null };
  }

  const parsedInfo = (fresh.value.data as any)?.parsed?.info;
  const rawAmount = BigInt(parsedInfo?.tokenAmount?.amount || '0');
  if (rawAmount !== 0n) {
    return { closed: false, reason: 'nonzero_balance', reclaimedLamports: 0, signature: null as string | null };
  }

  const signature = await submitCloseTargets({
    connection,
    owner,
    closeTargets: [{
      ...target,
      lamports: Number(fresh.value.lamports || target.lamports || 0),
    }],
  });

  return {
    closed: true,
    reason: null,
    reclaimedLamports: Number(fresh.value.lamports || target.lamports || 0),
    signature,
  };
}

export async function closeZeroTokenAccounts(args: {
  connection: Connection;
  owner: Keypair;
  mintAddress?: string;
  maxAccounts?: number;
  alertTitle?: string;
  alertContext?: string[];
}) {
  const {
    connection,
    owner,
    mintAddress,
    maxAccounts,
    alertTitle = 'Token account rent reclaimed',
    alertContext = [],
  } = args;
  const ownerAddress = owner.publicKey.toBase58();
  const closeTargets = await listZeroTokenAccountCloseTargets({
    connection,
    owner: owner.publicKey,
    mintAddress,
    maxAccounts,
  });

  if (closeTargets.length === 0) {
    return {
      closed: 0,
      reclaimedSol: 0,
      signatures: [] as string[],
      mints: [] as string[],
    };
  }

  const signatures: string[] = [];
  const failures: TokenAccountCloseFailure[] = [];
  let reclaimedLamports = 0;
  for (let index = 0; index < closeTargets.length; index += DEFAULT_CLOSE_CHUNK_SIZE) {
    const chunk = closeTargets.slice(index, index + DEFAULT_CLOSE_CHUNK_SIZE);
    try {
      const signature = await submitCloseTargets({
        connection,
        owner,
        closeTargets: chunk,
      });
      signatures.push(signature);
      reclaimedLamports += chunk.reduce((sum, target) => sum + target.lamports, 0);
      continue;
    } catch (error) {
      const details = await describeCloseFailure(connection, error, chunk);
      console.warn('[LIVE_PILOT] Token-account close chunk failed; retrying accounts individually:', JSON.stringify(details));
    }

    for (const target of chunk) {
      try {
        const signature = await submitCloseTargets({
          connection,
          owner,
          closeTargets: [target],
        });
        signatures.push(signature);
        reclaimedLamports += target.lamports;
      } catch (error) {
        const details = await describeCloseFailure(connection, error, [target]);
        failures.push({
          pubkey: target.pubkey.toBase58(),
          mint: target.mint,
          message: details.message,
          logs: details.logs,
        });
        console.warn('[LIVE_PILOT] Token-account close failed:', JSON.stringify(details));
      }
    }
  }

  if (signatures.length === 0 && failures.length > 0) {
    const firstFailure = failures[0];
    throw new Error(
      `Failed to close ${failures.length} zero-balance token account(s); first=${firstFailure.pubkey} `
      + `mint=${firstFailure.mint} reason=${firstFailure.message} logs=${firstFailure.logs.join(' | ')}`,
    );
  }

  const mints = [...new Set(closeTargets.map((target) => target.mint))];
  const closedAccounts = closeTargets.length - failures.length;
  await sendLivePilotAlert(alertTitle, [
    `wallet=${ownerAddress}`,
    ...alertContext,
    mintAddress ? `mint=${mintAddress}` : `mints=${mints.slice(0, 12).join(', ')}`,
    `accounts=${closeTargets.length}`,
    `closedAccounts=${closedAccounts}`,
    failures.length > 0 ? `failedAccounts=${failures.length}` : '',
    `reclaimedSol=${(reclaimedLamports / 1e9).toFixed(6)}`,
    `txCount=${signatures.length}`,
    ...signatures.slice(0, 5).map((signature) => formatSolscanTxUrl(signature)),
    signatures.length > 5 ? `moreTxs=${signatures.length - 5}` : '',
  ].filter(Boolean)).catch(() => undefined);

  return {
    closed: closedAccounts,
    reclaimedSol: reclaimedLamports / 1e9,
    signatures,
    mints,
    failed: failures.length,
  };
}

export async function cleanupNonZeroTokenAccountsToSol(args: {
  connection: Connection;
  owner: Keypair;
  cleanupMints?: Iterable<string> | null;
  protectedMints?: Iterable<string> | null;
  maxAccounts?: number;
  alertTitle?: string;
  alertContext?: string[];
}) {
  const {
    connection,
    owner,
    cleanupMints,
    protectedMints,
    maxAccounts,
    alertTitle = 'Live-pilot token dust cleaned to SOL',
    alertContext = [],
  } = args;
  const ownerAddress = owner.publicKey.toBase58();
  const targets = await listNonZeroTokenAccountCleanupTargets({
    connection,
    owner: owner.publicKey,
    cleanupMints,
    protectedMints,
    maxAccounts,
  });

  if (targets.length === 0) {
    return {
      scanned: 0,
      sold: 0,
      burned: 0,
      closed: 0,
      noRoute: 0,
      frozen: 0,
      failed: 0,
      reclaimedSol: 0,
      signatures: [] as string[],
      mints: [] as string[],
    };
  }

  let sold = 0;
  let burned = 0;
  let closed = 0;
  let noRoute = 0;
  let frozen = 0;
  let failed = 0;
  let reclaimedLamports = 0;
  const signatures: string[] = [];
  const failedMessages: string[] = [];

  for (const target of targets) {
    try {
      const quote = await fetchDustCleanupQuote(target);

      if (quote) {
        const swapSignature = await executeDustCleanupSwap({
          connection,
          owner,
          quote,
        });
        sold += 1;
        signatures.push(swapSignature);

        const closeResult = await closeTargetIfEmpty({
          connection,
          owner,
          target,
        });
        if (closeResult.closed) {
          closed += 1;
          reclaimedLamports += closeResult.reclaimedLamports;
          if (closeResult.signature) signatures.push(closeResult.signature);
        }
      } else {
        noRoute += 1;
        const burnSignature = await submitBurnAndCloseTarget({
          connection,
          owner,
          target,
        });
        burned += 1;
        closed += 1;
        reclaimedLamports += target.lamports;
        signatures.push(burnSignature);
      }
    } catch (error) {
      if (isFrozenTokenAccountError(error)) {
        frozen += 1;
      } else {
        failed += 1;
      }
      failedMessages.push(
        `${target.mint}:${error instanceof Error ? error.message : String(error)}`.slice(0, 300),
      );
      console.warn('[LIVE_PILOT] Token dust cleanup target failed:', JSON.stringify({
        ata: target.pubkey.toBase58(),
        mint: target.mint,
        message: error instanceof Error ? error.message : String(error),
      }));
    }

    if (TOKEN_ACCOUNT_DUST_SWEEP_REQUEST_DELAY_MS > 0) {
      await wait(TOKEN_ACCOUNT_DUST_SWEEP_REQUEST_DELAY_MS);
    }
  }

  const mints = [...new Set(targets.map((target) => target.mint))];
  if (sold > 0 || burned > 0 || closed > 0 || frozen > 0 || failed > 0) {
    await sendLivePilotAlert(alertTitle, [
      `wallet=${ownerAddress}`,
      ...alertContext,
      `accounts=${targets.length}`,
      `sold=${sold}`,
      `burned=${burned}`,
      `closed=${closed}`,
      `noRoute=${noRoute}`,
      frozen > 0 ? `frozen=${frozen}` : '',
      failed > 0 ? `failed=${failed}` : '',
      `reclaimedSol=${(reclaimedLamports / 1e9).toFixed(6)}`,
      `mints=${mints.slice(0, 12).join(', ')}`,
      ...signatures.slice(0, 5).map((signature) => formatSolscanTxUrl(signature)),
      signatures.length > 5 ? `moreTxs=${signatures.length - 5}` : '',
      failedMessages.length > 0 ? `firstFailure=${failedMessages[0]}` : '',
    ].filter(Boolean)).catch(() => undefined);
  }

  return {
    scanned: targets.length,
    sold,
    burned,
    closed,
    noRoute,
    frozen,
    failed,
    reclaimedSol: reclaimedLamports / 1e9,
    signatures,
    mints,
  };
}
