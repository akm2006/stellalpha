import fs from 'node:fs/promises';
import path from 'node:path';
import bs58 from 'bs58';
import { createClient } from '@supabase/supabase-js';
import { yellowstone } from '@kdt-sol/solana-grpc-client';

const DEFAULT_DURATION_SECONDS = 30;
const DEFAULT_FALLBACK_DURATION_SECONDS = 30;
const DEFAULT_OUTPUT_ROOT = path.join(process.cwd(), 'ai', 'stream-latency', 'publicnode-yellowstone');
const DEFAULT_FALLBACK_ADDRESS = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const DEFAULT_ENDPOINT = 'https://solana-yellowstone-grpc.publicnode.com:443';
const DEFAULT_COMMITMENT = 'processed';
const BLOCK_META_GRACE_MS = 5000;

function normalizeCommitment(rawCommitment) {
  const value = String(rawCommitment ?? DEFAULT_COMMITMENT).toLowerCase();
  if (value !== 'processed' && value !== 'confirmed' && value !== 'finalized') {
    throw new Error(`Invalid commitment "${rawCommitment}". Expected one of: processed, confirmed, finalized.`);
  }
  return value;
}

function toYellowstoneCommitment(commitment) {
  if (commitment === 'processed') return yellowstone.CommitmentLevel.PROCESSED;
  if (commitment === 'confirmed') return yellowstone.CommitmentLevel.CONFIRMED;
  return yellowstone.CommitmentLevel.FINALIZED;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (const arg of args) {
    if (!arg.startsWith('--')) continue;
    const [key, rawValue] = arg.slice(2).split('=');
    options[key] = rawValue ?? 'true';
  }

  return {
    durationSeconds: Number(options['duration-seconds'] ?? DEFAULT_DURATION_SECONDS),
    fallbackDurationSeconds: Number(options['fallback-duration-seconds'] ?? DEFAULT_FALLBACK_DURATION_SECONDS),
    fallbackAddress: options['fallback-address'] ?? DEFAULT_FALLBACK_ADDRESS,
    outputRoot: options['output-root'] ?? DEFAULT_OUTPUT_ROOT,
    endpoint: options['endpoint'] ?? process.env.PUBLICNODE_YELLOWSTONE_ENDPOINT ?? DEFAULT_ENDPOINT,
    token: options['token'] ?? process.env.PUBLICNODE_YELLOWSTONE_TOKEN ?? process.env.PUBLICNODE_TOKEN ?? '',
    commitment: normalizeCommitment(options['commitment'] ?? DEFAULT_COMMITMENT),
  };
}

async function getTrackedWallets() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecret = process.env.SUPABASE_SECRET;

  if (!supabaseUrl || !supabaseSecret) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET in environment.');
  }

  const supabase = createClient(supabaseUrl, supabaseSecret);
  const { data, error } = await supabase.from('star_traders').select('address');
  if (error) {
    throw new Error(`Failed to load star_traders: ${error.message}`);
  }

  return (data ?? []).map((row) => row.address).filter(Boolean);
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? null;
}

function summarizeMetric(records, field) {
  const values = records.map((record) => record[field]).filter((value) => value !== null);
  if (values.length === 0) {
    return { count: 0, min: null, p50: null, p90: null, max: null, average: null };
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    min: Math.min(...values),
    p50: percentile(values, 50),
    p90: percentile(values, 90),
    max: Math.max(...values),
    average: Number((total / values.length).toFixed(1)),
  };
}

function updateDerivedLatencies(record) {
  if (!record) return;

  record.networkOverheadMs = record.streamCreatedAtMs
    ? record.receivedAtMs - record.streamCreatedAtMs
    : null;

  record.providerLatencyMs = (record.streamCreatedAtMs && record.blockTimeMs)
    ? record.streamCreatedAtMs - record.blockTimeMs
    : null;

  record.endToEndLatencyMs = record.blockTimeMs
    ? record.receivedAtMs - record.blockTimeMs
    : null;

  // Preserve the original field for backwards compatibility with earlier runs.
  record.latencyMs = record.endToEndLatencyMs;
}

function applyKnownBlockTime(record, blockTimesBySlot) {
  if (!record || record.slot === null || record.slot === undefined) return;

  const blockTimeMs = blockTimesBySlot.get(record.slot) ?? null;
  if (!blockTimeMs) return;

  record.blockTimeMs = blockTimeMs;
  record.blockTimeIso = new Date(blockTimeMs).toISOString();
  record.blockTimeResolution = 'yellowstone_blockMeta';
  updateDerivedLatencies(record);
}

async function runPhase({ endpoint, token, phase, sourceLabel, accountInclude, durationMs, records, commitment, blockTimesBySlot }) {
  const controller = new AbortController();
  const client = new yellowstone.YellowstoneGeyserClient(endpoint, {
    token,
    signal: controller.signal,
    'grpc.max_receive_message_length': 64 * 1024 * 1024,
  });

  let duplicateCount = 0;
  let receivedCount = 0;
  let blockMetaCount = 0;
  let closingByTimer = false;
  const startedAtMs = Date.now();
  const transactionDeadlineMs = startedAtMs + durationMs;

  const stream = await client.subscribe();
  const rawStream = stream.duplexStream ?? stream.stream ?? null;
  rawStream?.on?.('error', (error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (
      closingByTimer &&
      (
        message.includes('Cancelled on client')
        || message.includes('aborted')
        || message.includes('AbortError')
      )
    ) {
      return;
    }

    console.error(`[PUBLICNODE_BENCH] ${phase} stream error: ${message}`);
  });
  await stream.write({
    accounts: {},
    slots: {},
    transactions: {
      benchmark: {
        vote: false,
        failed: false,
        accountInclude,
        accountExclude: [],
        accountRequired: [],
      },
    },
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {
      benchmark_block_meta: {},
    },
    entry: {},
    accountsDataSlice: [],
    commitment: toYellowstoneCommitment(commitment),
  });

  const timer = setTimeout(() => {
    closingByTimer = true;
    controller.abort(`Phase ${phase} complete`);
  }, durationMs + BLOCK_META_GRACE_MS);

  try {
    for await (const update of stream) {
      if (update.blockMeta?.slot) {
        const slot = Number(update.blockMeta.slot);
        const blockTimeSeconds = update.blockMeta.blockTime?.timestamp ?? null;
        if (slot && blockTimeSeconds) {
          const blockTimeMs = Number(blockTimeSeconds) * 1000;
          blockTimesBySlot.set(slot, blockTimeMs);
          blockMetaCount += 1;

          for (const record of records.values()) {
            if (record.slot === slot && record.blockTimeMs === null) {
              applyKnownBlockTime(record, blockTimesBySlot);
            }
          }
        }
        continue;
      }

      if (!update.transaction?.transaction?.signature) {
        continue;
      }

      if (Date.now() > transactionDeadlineMs) {
        continue;
      }

      const signature = bs58.encode(update.transaction.transaction.signature);
      if (records.has(signature)) {
        duplicateCount += 1;
        continue;
      }

      const receivedAtMs = Date.now();
      const streamCreatedAtMs = update.createdAt ? update.createdAt.getTime() : null;
      records.set(signature, {
        signature,
        slot: update.transaction.slot ? Number(update.transaction.slot) : null,
        phase,
        receiveCommitment: commitment,
        sourceLabel,
        receivedAtMs,
        receivedAtIso: new Date(receivedAtMs).toISOString(),
        streamCreatedAtIso: update.createdAt ? update.createdAt.toISOString() : null,
        streamCreatedAtMs,
        blockTimeMs: null,
        blockTimeIso: null,
        blockTimeResolution: 'missing',
        providerLatencyMs: null,
        networkOverheadMs: null,
        endToEndLatencyMs: null,
        latencyMs: null,
      });
      updateDerivedLatencies(records.get(signature));
      applyKnownBlockTime(records.get(signature), blockTimesBySlot);

      receivedCount += 1;
      console.log(`[PUBLICNODE_BENCH] ${phase} received ${receivedCount} | ${signature.slice(0, 12)} | slot=${update.transaction.slot ? update.transaction.slot.toString() : 'n/a'}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('aborted') && !message.includes('Cancelled') && !message.includes('AbortError')) {
      throw error;
    }
  } finally {
    clearTimeout(timer);
    await stream.close().catch(() => undefined);
  }

  return {
    phase,
    sourceLabel,
    accountIncludeCount: accountInclude.length,
    durationMs,
    receivedCount,
    duplicateCount,
    blockMetaCount,
    blockMetaGraceMs: BLOCK_META_GRACE_MS,
  };
}

async function main() {
  const args = parseArgs();
  if (!args.token) {
    throw new Error(
      'Missing PublicNode Yellowstone token. Set PUBLICNODE_YELLOWSTONE_TOKEN in .env.local or pass --token=... . PublicNode requires a personal token from https://www.allnodes.com/publicnode'
    );
  }

  const trackedWallets = await getTrackedWallets();
  const startedAt = new Date();
  const outputDir = path.join(args.outputRoot, startedAt.toISOString().replace(/[:.]/g, '-'));
  await fs.mkdir(outputDir, { recursive: true });

  const client = new yellowstone.YellowstoneGeyserClient(args.endpoint, {
    token: args.token,
    'grpc.max_receive_message_length': 64 * 1024 * 1024,
  });
  const version = await client.getVersion({});
  console.log(`[PUBLICNODE_BENCH] Connected to ${args.endpoint} | commitment=${args.commitment} | version=${version.version}`);

  const records = new Map();
  const blockTimesBySlot = new Map();
  const phases = [];

  const starTraderPhase = await runPhase({
    endpoint: args.endpoint,
    token: args.token,
    phase: 'star_traders',
    sourceLabel: 'tracked_star_traders',
    accountInclude: trackedWallets,
    durationMs: args.durationSeconds * 1000,
    records,
    commitment: args.commitment,
    blockTimesBySlot,
  });
  phases.push(starTraderPhase);

  if (starTraderPhase.receivedCount === 0) {
    console.log(`[PUBLICNODE_BENCH] No transactions received for star traders in ${args.durationSeconds}s. Falling back to ${args.fallbackAddress}.`);
    const fallbackPhase = await runPhase({
      endpoint: args.endpoint,
      token: args.token,
      phase: 'fallback',
      sourceLabel: `fallback:${args.fallbackAddress}`,
      accountInclude: [args.fallbackAddress],
      durationMs: args.fallbackDurationSeconds * 1000,
      records,
      commitment: args.commitment,
      blockTimesBySlot,
    });
    phases.push(fallbackPhase);
  }

  for (const record of records.values()) {
    applyKnownBlockTime(record, blockTimesBySlot);
  }

  const eventArray = [...records.values()];
  const endToEndLatencies = summarizeMetric(eventArray, 'endToEndLatencyMs');
  const providerLatencies = summarizeMetric(eventArray, 'providerLatencyMs');
  const networkOverheads = summarizeMetric(eventArray, 'networkOverheadMs');

  const summary = {
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    endpoint: args.endpoint,
    commitment: args.commitment,
    tokenConfigured: true,
    grpcVersion: version.version,
    trackedWalletCount: trackedWallets.length,
    fallbackAddress: args.fallbackAddress,
    phases,
    uniqueSlotsWithBlockMeta: blockTimesBySlot.size,
    uniqueSignatures: eventArray.length,
    latencyMs: endToEndLatencies,
    endToEndLatencyMs: endToEndLatencies,
    providerLatencyMs: providerLatencies,
    networkOverheadMs: networkOverheads,
    missingBlockTimeCount: eventArray.filter((record) => record.blockTimeMs === null).length,
  };

  await fs.writeFile(path.join(outputDir, 'config.json'), JSON.stringify({
    endpoint: args.endpoint,
    commitment: args.commitment,
    trackedWallets,
    fallbackAddress: args.fallbackAddress,
    durationSeconds: args.durationSeconds,
    fallbackDurationSeconds: args.fallbackDurationSeconds,
    blockMetaGraceMs: BLOCK_META_GRACE_MS,
    startedAt: startedAt.toISOString(),
  }, null, 2));

  await fs.writeFile(path.join(outputDir, 'events.json'), JSON.stringify(eventArray, null, 2));
  await fs.writeFile(
    path.join(outputDir, 'events.ndjson'),
    eventArray.map((record) => JSON.stringify(record)).join('\n') + (eventArray.length ? '\n' : '')
  );
  await fs.writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2));

  console.log(`[PUBLICNODE_BENCH] Output directory: ${outputDir}`);
  console.log(`[PUBLICNODE_BENCH] Unique signatures: ${summary.uniqueSignatures}`);
  console.log(`[PUBLICNODE_BENCH] End-to-end latency summary (ms): ${JSON.stringify(endToEndLatencies)}`);
  console.log(`[PUBLICNODE_BENCH] Provider latency summary (ms): ${JSON.stringify(providerLatencies)}`);
  console.log(`[PUBLICNODE_BENCH] Network overhead summary (ms): ${JSON.stringify(networkOverheads)}`);
}

main().catch((error) => {
  console.error('[PUBLICNODE_BENCH] Failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
