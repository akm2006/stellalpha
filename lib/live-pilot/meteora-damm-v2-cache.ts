import type { TradeSourceClassification } from '@/lib/ingestion/trade-source-classifier';

export const METEORA_DAMM_V2_PROGRAM_ID = 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG';

const MAX_ENTRIES = 500;
const candidatePoolsBySignature = new Map<string, string[]>();

function normalizePublicKey(value: unknown) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && 'pubkey' in value) {
    return normalizePublicKey((value as { pubkey?: unknown }).pubkey);
  }
  if (typeof (value as { toBase58?: unknown })?.toBase58 === 'function') {
    return (value as { toBase58: () => string }).toBase58();
  }
  return null;
}

function instructionProgramId(instruction: any) {
  return normalizePublicKey(instruction?.programId);
}

function instructionAccounts(instruction: any) {
  if (!Array.isArray(instruction?.accounts)) return [];
  return instruction.accounts
    .map(normalizePublicKey)
    .filter((account: string | null): account is string => Boolean(account));
}

function collectInstructions(raw: any) {
  const instructions: any[] = [];

  if (Array.isArray(raw?.instructions)) {
    instructions.push(...raw.instructions);
  }

  if (Array.isArray(raw?.transaction?.message?.instructions)) {
    instructions.push(...raw.transaction.message.instructions);
  }

  if (Array.isArray(raw?.message?.instructions)) {
    instructions.push(...raw.message.instructions);
  }

  const innerGroups = [
    ...(Array.isArray(raw?.innerInstructions) ? raw.innerInstructions : []),
    ...(Array.isArray(raw?.meta?.innerInstructions) ? raw.meta.innerInstructions : []),
  ];

  for (const group of innerGroups) {
    if (Array.isArray(group?.instructions)) {
      instructions.push(...group.instructions);
    }
  }

  return instructions;
}

export function extractMeteoraDammV2CandidatePools(raw: any) {
  const candidates = new Set<string>();

  // Support for standard Solana instruction structures
  for (const instruction of collectInstructions(raw)) {
    if (instructionProgramId(instruction) !== METEORA_DAMM_V2_PROGRAM_ID) {
      continue;
    }

    for (const account of instructionAccounts(instruction)) {
      if (account.length >= 32 && account.length <= 44) {
        candidates.add(account);
      }
    }
  }

  // Support for Carbon parser custom payload from worker/index.ts
  if (Array.isArray(raw?.__decoderCandidates)) {
    for (const candidate of raw.__decoderCandidates) {
      if (typeof candidate === 'string' && candidate.length >= 32 && candidate.length <= 44) {
        candidates.add(candidate);
      }
    }
  }

  // If the program ID is present but no candidates were found in instructions,
  // we might want to check all account keys as a last resort, but decoder_candidates
  // from Carbon is usually more precise.

  return [...candidates];
}

export function rememberLivePilotMeteoraDammV2CandidatePools(
  signature: string | null | undefined,
  candidates: string[],
) {
  if (!signature || candidates.length === 0) return;
  candidatePoolsBySignature.set(signature, candidates);

  while (candidatePoolsBySignature.size > MAX_ENTRIES) {
    const oldestKey = candidatePoolsBySignature.keys().next().value;
    if (!oldestKey) break;
    candidatePoolsBySignature.delete(oldestKey);
  }
}

export function getLivePilotMeteoraDammV2CandidatePools(signature: string | null | undefined) {
  if (!signature) return [];
  return candidatePoolsBySignature.get(signature) || [];
}

export function isMeteoraDammV2Source(classification: TradeSourceClassification | null | undefined) {
  return Boolean(
    classification
    && classification.venue === 'meteora'
    && classification.programIds.includes(METEORA_DAMM_V2_PROGRAM_ID),
  );
}
