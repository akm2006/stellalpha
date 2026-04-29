import {
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  createCloseAccountInstruction,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { formatSolscanTxUrl, sendLivePilotAlert } from '@/lib/live-pilot/alerts';

const DEFAULT_CLOSE_CHUNK_SIZE = 8;

export interface TokenAccountCloseTarget {
  pubkey: PublicKey;
  programId: PublicKey;
  mint: string;
  lamports: number;
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
    maxRetries: 3,
    skipPreflight: false,
  });
  const confirmation = await connection.confirmTransaction({
    signature,
    blockhash: latestBlockhash.blockhash,
    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
  }, 'confirmed');

  if (confirmation.value.err) {
    throw new Error(
      `Close token account transaction failed: ${signature} err=${JSON.stringify(confirmation.value.err)}`,
    );
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
