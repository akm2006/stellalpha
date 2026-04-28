import {
  Connection,
  Keypair,
  PublicKey,
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
  let reclaimedLamports = 0;
  for (let index = 0; index < closeTargets.length; index += DEFAULT_CLOSE_CHUNK_SIZE) {
    const chunk = closeTargets.slice(index, index + DEFAULT_CLOSE_CHUNK_SIZE);
    const latestBlockhash = await connection.getLatestBlockhash('confirmed');
    const instructions = chunk.map((target) =>
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
      recentBlockhash: latestBlockhash.blockhash,
      instructions,
    }).compileToV0Message();
    const transaction = new VersionedTransaction(message);
    transaction.sign([owner]);

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
      throw new Error(`Close token account transaction failed: ${signature}`);
    }

    signatures.push(signature);
    reclaimedLamports += chunk.reduce((sum, target) => sum + target.lamports, 0);
  }

  const mints = [...new Set(closeTargets.map((target) => target.mint))];
  await sendLivePilotAlert(alertTitle, [
    `wallet=${ownerAddress}`,
    ...alertContext,
    mintAddress ? `mint=${mintAddress}` : `mints=${mints.slice(0, 12).join(', ')}`,
    `accounts=${closeTargets.length}`,
    `reclaimedSol=${(reclaimedLamports / 1e9).toFixed(6)}`,
    `txCount=${signatures.length}`,
    ...signatures.slice(0, 5).map((signature) => formatSolscanTxUrl(signature)),
    signatures.length > 5 ? `moreTxs=${signatures.length - 5}` : '',
  ].filter(Boolean)).catch(() => undefined);

  return {
    closed: closeTargets.length,
    reclaimedSol: reclaimedLamports / 1e9,
    signatures,
    mints,
  };
}
