import { RawTrade } from '@/lib/trade-parser';

const METEORA_PROGRAM_IDS = new Set([
  'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo', // Meteora DLMM
  'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB', // Meteora DAMM v1
  'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG', // Meteora DAMM v2
  'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN', // Meteora DBC
]);

export const METEORA_DAMM_V2_PROGRAM_ID = 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG';

const JUPITER_PROGRAM_IDS = new Set([
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
]);

const RAYDIUM_PROGRAM_IDS = new Set([
  '675kPX9MHTjS2zt1qfr1NYMEk3qR8wH2HPbWAGGxxZJ', // Raydium AMM v4
  'CPMMoo8L3F4NbTegBCKVN34Y7H4W2E7oKkhKGe3Z2J3', // Raydium CPMM
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // Raydium CLMM
]);

export const PUMP_BONDING_CURVE_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMPSWAP_PROGRAM_ID = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';

const PUMP_BONDING_CURVE_PROGRAM_IDS = new Set([
  PUMP_BONDING_CURVE_PROGRAM_ID,
]);

const PUMPSWAP_PROGRAM_IDS = new Set([
  PUMPSWAP_PROGRAM_ID,
]);

const PUMP_PROGRAM_IDS = new Set([
  ...PUMP_BONDING_CURVE_PROGRAM_IDS,
  ...PUMPSWAP_PROGRAM_IDS,
]);

const ORCA_PROGRAM_IDS = new Set([
  'whirLbMiicVdio4qvUfM5KAg6CtD3sGzyzyE6WELQ3',
  '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
]);

export interface TradeSourceClassification {
  venue: 'meteora' | 'jupiter' | 'raydium' | 'pump' | 'orca' | 'unknown';
  protocols?: Array<
    | 'meteora_damm_v2'
    | 'pump_bonding_curve'
    | 'pumpswap'
    | 'jupiter'
    | 'raydium'
    | 'orca'
  >;
  labels: string[];
  programIds: string[];
  parserSource: string | null;
}

function collectStringValues(value: unknown, output: Set<string>) {
  if (!value) return;

  if (typeof value === 'string') {
    output.add(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectStringValues(entry, output);
    }
  }
}

function collectProgramIds(raw: any) {
  const output = new Set<string>();
  collectStringValues(raw?.top_level_program_ids, output);
  collectStringValues(raw?.inner_program_ids, output);
  collectStringValues(raw?.__programIds, output);
  collectStringValues(raw?.protocol?.address, output);
  collectStringValues(raw?.source_protocol?.address, output);
  collectStringValues(raw?.actions?.map((entry: any) => entry?.source_protocol?.address), output);
  collectStringValues(raw?.transaction?.message?.accountKeys?.map((entry: any) => entry?.pubkey || entry), output);
  collectStringValues(raw?.transaction?.message?.instructions?.map((entry: any) => entry?.programId), output);
  collectStringValues(raw?.accountKeys?.map((entry: any) => entry?.pubkey || entry), output);
  collectStringValues(raw?.message?.instructions?.map((entry: any) => entry?.programId), output);
  collectStringValues(raw?.instructions?.map((entry: any) => entry?.programId || entry?.programIdIndex), output);
  return [...output].filter((entry) => entry.length >= 32 && entry.length <= 44);
}

function collectLabels(raw: any) {
  const output = new Set<string>();
  collectStringValues(raw?.decoder_candidates, output);
  collectStringValues(raw?.__decoderCandidates, output);
  collectStringValues(raw?.protocol?.name, output);
  collectStringValues(raw?.source_protocol?.name, output);
  collectStringValues(raw?.actions?.map((entry: any) => entry?.source_protocol?.name), output);
  collectStringValues(raw?.actions?.map((entry: any) => entry?.info?.swaps?.map((swap: any) => swap?.source)), output);
  collectStringValues(raw?.events?.swap?.innerSwaps?.map((entry: any) => entry?.programInfo?.source), output);
  collectStringValues(raw?.type, output);
  collectStringValues(raw?.source, output);
  return [...output].map((entry) => entry.toLowerCase());
}

function hasAny(programIds: string[], candidates: Set<string>) {
  return programIds.some((programId) => candidates.has(programId));
}

export function classifyTradeSource(trade: RawTrade, raw?: any): TradeSourceClassification {
  const programIds = collectProgramIds(raw);
  const labels = collectLabels(raw);
  const source = trade.source?.toLowerCase() || '';
  const labelText = [...labels, source].join(' ');
  const protocols: NonNullable<TradeSourceClassification['protocols']> = [];

  if (programIds.includes(METEORA_DAMM_V2_PROGRAM_ID)) {
    protocols.push('meteora_damm_v2');
  }
  if (hasAny(programIds, PUMP_BONDING_CURVE_PROGRAM_IDS)) {
    protocols.push('pump_bonding_curve');
  }
  if (hasAny(programIds, PUMPSWAP_PROGRAM_IDS)) {
    protocols.push('pumpswap');
  }
  if (hasAny(programIds, JUPITER_PROGRAM_IDS)) {
    protocols.push('jupiter');
  }
  if (hasAny(programIds, RAYDIUM_PROGRAM_IDS)) {
    protocols.push('raydium');
  }
  if (hasAny(programIds, ORCA_PROGRAM_IDS)) {
    protocols.push('orca');
  }

  const venue =
    hasAny(programIds, METEORA_PROGRAM_IDS) || /meteora|dlmm|damm|dbc/.test(labelText)
      ? 'meteora'
      : hasAny(programIds, JUPITER_PROGRAM_IDS) || /jupiter|jup/.test(labelText)
        ? 'jupiter'
        : hasAny(programIds, RAYDIUM_PROGRAM_IDS) || /raydium/.test(labelText)
          ? 'raydium'
          : hasAny(programIds, PUMP_PROGRAM_IDS) || /pump/.test(labelText)
            ? 'pump'
            : hasAny(programIds, ORCA_PROGRAM_IDS) || /orca|whirlpool/.test(labelText)
              ? 'orca'
              : 'unknown';

  return {
    venue,
    protocols,
    labels,
    programIds,
    parserSource: trade.source || null,
  };
}

export function formatTradeSourceClassification(classification: TradeSourceClassification) {
  const labels = classification.labels.slice(0, 6).join(',');
  const protocols = classification.protocols?.slice(0, 8).join(',') || '';
  const programs = classification.programIds.slice(0, 8).join(',');
  return `venue=${classification.venue}; protocols=${protocols || 'none'}; parser=${classification.parserSource || 'unknown'}; labels=${labels || 'none'}; programs=${programs || 'none'}`;
}
