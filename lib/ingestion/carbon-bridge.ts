import { spawn, ChildProcess } from 'node:child_process';
import { createInterface, Interface } from 'node:readline';
import path from 'node:path';
import { serializeYellowstoneRaw } from './yellowstone-raw-serializer';
import type { RawTrade, TradeConfidence } from '@/lib/trade-parser';

// ── Environment configuration ────────────────────────────────────────────────

const CARBON_PARSER_BINARY_DEFAULT = process.platform === 'win32'
  ? path.join(process.cwd(), 'carbon-parser', 'target', 'release', 'stellalpha-carbon-parser.exe')
  : path.join(process.cwd(), 'carbon-parser', 'target', 'release', 'stellalpha-carbon-parser');

const CARBON_WORKSPACE_DEFAULT = path.join(process.cwd(), 'carbon-parser');

const PARSE_TIMEOUT_MS = 5000;

// ── Types ────────────────────────────────────────────────────────────────────

export type CarbonParseStatus = 'trade' | 'no_trade' | 'unknown';

export interface CarbonParseResult {
  signature: string;
  wallet: string;
  slot: number;
  status: CarbonParseStatus;
  trade: RawTrade | null;
  decoderCandidates: string[];
}

export interface CarbonCaptureInput {
  signature: string;
  wallet: string;
  slot: number;
  receiveCommitment: string;
  sourceReceivedAt: string;
  yellowstoneCreatedAt: string | null;
  transactionUpdate: unknown;
}

export interface CarbonBlockMetaInput {
  slot: number;
  blockTime: number | null;
  blockMetaUpdate: unknown;
}

/** Shape of the JSON response from the Rust stream parser. */
interface CarbonStreamResponse {
  signature: string;
  wallet: string;
  slot: number;
  decision: CarbonDecision;
  decoder_candidates: string[];
  top_level_program_ids: string[];
  inner_program_ids: string[];
}

type CarbonDecision =
  | CarbonTradeDecision
  | CarbonNoTradeDecision
  | CarbonUnknownDecision;

interface CarbonTradeDecision {
  kind: 'trade';
  signature: string;
  wallet: string;
  type: string;
  token_mint: string;
  token_amount: number;
  base_amount: number;
  base_mint: string;
  token_in_mint: string;
  token_in_amount: number;
  token_in_pre_balance: number;
  token_out_mint: string;
  token_out_amount: number;
  timestamp: number;
  source: string;
  gas: number;
  confidence: string;
  parser_path: string;
}

interface CarbonNoTradeDecision {
  kind: 'no_trade';
  signature: string;
  wallet: string;
  slot: number;
  reason: string;
  parser_path: string;
}

interface CarbonUnknownDecision {
  kind: 'unknown';
  signature: string;
  wallet: string;
  slot: number;
  reason: string;
  parser_path: string;
}

// ── Mapping ──────────────────────────────────────────────────────────────────

function mapCarbonTradeToRawTrade(d: CarbonTradeDecision): RawTrade {
  return {
    signature: d.signature,
    wallet: d.wallet,
    type: d.type as 'buy' | 'sell',
    tokenMint: d.token_mint,
    tokenAmount: d.token_amount,
    baseAmount: d.base_amount,
    baseMint: d.base_mint,
    tokenInMint: d.token_in_mint,
    tokenInAmount: d.token_in_amount,
    tokenInPreBalance: d.token_in_pre_balance,
    tokenOutMint: d.token_out_mint,
    tokenOutAmount: d.token_out_amount,
    timestamp: d.timestamp,
    source: 'YELLOWSTONE_CARBON',
    gas: d.gas,
    confidence: d.confidence as TradeConfidence,
  };
}

// ── Bridge class ─────────────────────────────────────────────────────────────

type PendingEntry = {
  resolve: (value: CarbonParseResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class CarbonBridge {
  private child: ChildProcess | null = null;
  private rl: Interface | null = null;
  private pending = new Map<string, PendingEntry>();
  private isShuttingDown = false;
  private readonly binaryPath: string;
  private readonly workspacePath: string;

  constructor(options?: { binaryPath?: string; workspacePath?: string }) {
    this.binaryPath = options?.binaryPath
      ?? process.env.CARBON_PARSER_BINARY
      ?? CARBON_PARSER_BINARY_DEFAULT;
    this.workspacePath = options?.workspacePath ?? CARBON_WORKSPACE_DEFAULT;
  }

  async start(): Promise<boolean> {
    try {
      const fs = await import('node:fs/promises');
      await fs.access(this.binaryPath);
    } catch {
      console.warn(`[CARBON] Binary not found at ${this.binaryPath}. Carbon parser disabled.`);
      return false;
    }

    this.child = spawn(this.binaryPath, ['stream'], {
      cwd: this.workspacePath,
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    this.rl = createInterface({ input: this.child.stdout! });

    this.rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const response = JSON.parse(line) as CarbonStreamResponse;
        const key = `${response.signature}:${response.wallet}`;
        const resolver = this.pending.get(key);
        if (!resolver) return;

        clearTimeout(resolver.timer);
        this.pending.delete(key);

        const status: CarbonParseStatus =
          response.decision.kind === 'trade' ? 'trade'
          : response.decision.kind === 'no_trade' ? 'no_trade'
          : 'unknown';

        const trade = status === 'trade'
          ? mapCarbonTradeToRawTrade(response.decision as CarbonTradeDecision)
          : null;

        resolver.resolve({
          signature: response.signature,
          wallet: response.wallet,
          slot: response.slot,
          status,
          trade,
          decoderCandidates: response.decoder_candidates,
        });
      } catch (error) {
        for (const resolver of this.pending.values()) {
          clearTimeout(resolver.timer);
          resolver.reject(error instanceof Error ? error : new Error(String(error)));
        }
        this.pending.clear();
      }
    });

    this.child.on('exit', (code) => {
      if (this.isShuttingDown) return;
      console.error(`[CARBON] Parser process exited with code ${code}. Pending: ${this.pending.size}`);
      const error = new Error(`Carbon parser exited with code ${code}`);
      for (const resolver of this.pending.values()) {
        clearTimeout(resolver.timer);
        resolver.reject(error);
      }
      this.pending.clear();
    });

    this.child.on('error', (error) => {
      console.error('[CARBON] Parser process error:', error.message);
    });

    console.log(`[CARBON] Bridge started. Binary: ${this.binaryPath}`);
    return true;
  }

  async parse(
    capture: CarbonCaptureInput,
    blockMeta: CarbonBlockMetaInput | null,
  ): Promise<CarbonParseResult> {
    if (!this.child?.stdin) {
      throw new Error('Carbon bridge not started');
    }

    const request = {
      capture: {
        signature: capture.signature,
        wallet: capture.wallet,
        slot: capture.slot,
        receive_commitment: capture.receiveCommitment,
        source_received_at: capture.sourceReceivedAt,
        yellowstone_created_at: capture.yellowstoneCreatedAt,
        transaction_update: capture.transactionUpdate,
      },
      block_meta: blockMeta
        ? {
            slot: blockMeta.slot,
            block_time: blockMeta.blockTime,
            block_meta_update: blockMeta.blockMetaUpdate,
            created_at: null,
          }
        : null,
      fallback_timestamp: Math.floor(Date.now() / 1000),
    };

    const serialized = serializeYellowstoneRaw(request);
    const key = `${capture.signature}:${capture.wallet}`;

    return new Promise<CarbonParseResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(key);
        reject(new Error(`Carbon parse timeout for ${capture.signature.slice(0, 12)}...`));
      }, PARSE_TIMEOUT_MS);

      this.pending.set(key, { resolve, reject, timer });

      this.child!.stdin!.write(`${JSON.stringify(serialized)}\n`, (error) => {
        if (error) {
          clearTimeout(timer);
          this.pending.delete(key);
          reject(error);
        }
      });
    });
  }

  async stop() {
    this.isShuttingDown = true;

    for (const resolver of this.pending.values()) {
      clearTimeout(resolver.timer);
      resolver.reject(new Error('Carbon bridge shutting down'));
    }
    this.pending.clear();

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    if (this.child) {
      this.child.stdin?.end();
      const child = this.child;
      this.child = null;

      await new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        setTimeout(() => {
          if (!child.killed) child.kill();
          resolve();
        }, 2000);
      });
    }
  }

  get isRunning() {
    return this.child !== null && !this.child.killed;
  }

  get pendingCount() {
    return this.pending.size;
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let bridge: CarbonBridge | null = null;

export function getCarbonParserEnabled(): boolean {
  return process.env.CARBON_PARSER_ENABLED === 'true';
}

export async function initCarbonBridge(): Promise<CarbonBridge | null> {
  if (!getCarbonParserEnabled()) {
    console.log('[CARBON] Parser disabled (CARBON_PARSER_ENABLED !== "true")');
    return null;
  }

  bridge = new CarbonBridge();
  const started = await bridge.start();

  if (!started) {
    bridge = null;
    return null;
  }

  return bridge;
}

export function getCarbonBridge(): CarbonBridge | null {
  return bridge;
}

export async function stopCarbonBridge() {
  if (bridge) {
    await bridge.stop();
    bridge = null;
  }
}
