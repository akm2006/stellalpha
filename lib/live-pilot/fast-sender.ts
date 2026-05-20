import bs58 from 'bs58';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';

const DEFAULT_SENDER_ENDPOINT = 'https://sender.helius-rpc.com/fast';
const SWQOS_MIN_TIP_LAMPORTS = 5_000;
const DUAL_ROUTE_MIN_TIP_LAMPORTS = 200_000;

const TIP_ACCOUNTS = [
  '4ACfpUFoaSD9bfPdeu6DBt89gB6ENTeHBXCAi87NhDEE',
  'D2L6yPZ2FmmmTKPgzaMKdhu6EWZcTpLy1Vhx8uvZe7NZ',
  '9bnz4RShgq1hAnLnZbP8kbgBg1kEmcJBYQq3gQbmnSta',
  '5VY91ws6B2hMmBFRsXkoAAdsPHBJwRfBht4DXox3xkwn',
  '2nyhqdwKcJZR2vcqCyrYsaPVdAnFoJjiksCXJ7hfEYgD',
  '2q5pghRs6arqVjRvT5gfgWfWcHWmw1ZuCzphgd5KfWGJ',
  'wyvPkWjVZz1M8fHQnMMCDTQDbkManefNNhweYk5WkcF',
  '3KCKozbAaF75qEU33jtzozcJ29yJuaLJTy2jFdzUY8bT',
  '4vieeGHPYPG2MmyPRcYjdiDmmhN3ww7hsFNap8pVN3Ey',
  '4TQLFNWK8AovT1gFvda5jfw2oJeRMKEmw7aH6MGBJ3or',
];

function boolEnv(name: string, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function intEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function getFastSenderConfig() {
  const enabled = boolEnv('LIVE_PILOT_FAST_SENDER_ENABLED', false);
  const swqosOnly = boolEnv('LIVE_PILOT_SENDER_SWQOS_ONLY', true);
  const minTip = swqosOnly ? SWQOS_MIN_TIP_LAMPORTS : DUAL_ROUTE_MIN_TIP_LAMPORTS;
  const tipLamports = intEnv('LIVE_PILOT_SENDER_TIP_LAMPORTS', minTip);
  const tipMaxLamports = intEnv('LIVE_PILOT_SENDER_TIP_MAX_LAMPORTS', tipLamports);
  return {
    enabled,
    endpoint: process.env.LIVE_PILOT_SENDER_ENDPOINT || DEFAULT_SENDER_ENDPOINT,
    swqosOnly,
    timeoutMs: intEnv('LIVE_PILOT_SENDER_TIMEOUT_MS', 1_000),
    fallbackRpc: boolEnv('LIVE_PILOT_SENDER_RPC_FALLBACK_ENABLED', true),
    tipLamports: enabled ? Math.min(Math.max(tipLamports, minTip), Math.max(tipMaxLamports, minTip)) : 0,
  };
}

function chooseTipAccount(label: string) {
  let hash = 0;
  for (const char of label) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }
  return new PublicKey(TIP_ACCOUNTS[Math.abs(hash) % TIP_ACCOUNTS.length]!);
}

function senderUrl(endpoint: string, swqosOnly: boolean) {
  const url = new URL(endpoint);
  if (swqosOnly) {
    url.searchParams.set('swqos_only', 'true');
  }
  return url.toString();
}

async function postSender(args: {
  url: string;
  signedTransaction: string;
  timeoutMs: number;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
  try {
    const response = await fetch(args.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'live-pilot',
        method: 'sendTransaction',
        params: [
          args.signedTransaction,
          {
            encoding: 'base64',
            skipPreflight: true,
            maxRetries: 0,
          },
        ],
      }),
    });
    const body = await response.json().catch(() => null) as { result?: string; error?: { message?: string } } | null;
    if (!response.ok || body?.error || !body?.result) {
      throw new Error(body?.error?.message || `Helius Sender failed with HTTP ${response.status}`);
    }
    return body.result;
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendLivePilotTransaction(args: {
  connection: Connection;
  keypair: Keypair;
  transaction: Transaction;
  skipPreflight: boolean;
  label: string;
}) {
  const config = getFastSenderConfig();
  const blockhash = await args.connection.getLatestBlockhash('processed');

  if (config.enabled && config.tipLamports > 0) {
    args.transaction.add(SystemProgram.transfer({
      fromPubkey: args.keypair.publicKey,
      toPubkey: chooseTipAccount(args.label),
      lamports: config.tipLamports,
    }));
  }

  args.transaction.feePayer = args.keypair.publicKey;
  args.transaction.recentBlockhash = blockhash.blockhash;
  args.transaction.sign(args.keypair);

  const txBuiltAt = new Date().toISOString();
  const serialized = args.transaction.serialize();
  const signedTransaction = serialized.toString('base64');
  const derivedSignature = args.transaction.signature ? bs58.encode(args.transaction.signature) : null;

  if (config.enabled) {
    try {
      const signature = await postSender({
        url: senderUrl(config.endpoint, config.swqosOnly),
        signedTransaction,
        timeoutMs: config.timeoutMs,
      });
      if (derivedSignature && signature !== derivedSignature) {
        console.warn(`[LIVE_PILOT_SENDER] Sender returned signature ${signature}, derived signature ${derivedSignature}`);
      }
      return {
        signature,
        signedTransaction,
        txBuiltAt,
        txSubmittedAt: new Date().toISOString(),
        lastValidBlockHeight: blockhash.lastValidBlockHeight,
        sender: 'helius_sender',
        senderEndpoint: config.endpoint,
        tipLamports: String(config.tipLamports),
      };
    } catch (error) {
      if (!config.fallbackRpc) {
        throw error;
      }
      console.warn(`[LIVE_PILOT_SENDER] Sender failed for ${args.label}; falling back to RPC:`, error);
    }
  }

  const signature = await args.connection.sendRawTransaction(serialized, {
    maxRetries: 0,
    skipPreflight: args.skipPreflight,
    preflightCommitment: 'processed',
  });
  if (derivedSignature && signature !== derivedSignature) {
    console.warn(`[LIVE_PILOT_SENDER] RPC returned signature ${signature}, derived signature ${derivedSignature}`);
  }
  return {
    signature,
    signedTransaction,
    txBuiltAt,
    txSubmittedAt: new Date().toISOString(),
    lastValidBlockHeight: blockhash.lastValidBlockHeight,
    sender: 'rpc',
    senderEndpoint: null,
    tipLamports: config.enabled ? String(config.tipLamports) : null,
  };
}
