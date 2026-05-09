import type { TradeSourceClassification } from '@/lib/ingestion/trade-source-classifier';
import {
  collectSolanaAccountKeys,
  collectSolanaInstructions,
  normalizePublicKey,
  resolveSolanaInstructionAccounts,
  resolveSolanaInstructionProgramId,
} from '@/lib/ingestion/solana-raw-instructions';

export const METEORA_DAMM_V2_PROGRAM_ID = 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG';

const MAX_ENTRIES = 500;
const candidatePoolsBySignature = new Map<string, string[]>();

export function extractMeteoraDammV2CandidatePools(raw: any) {
  const candidates = new Set<string>();
  const accountKeys = collectSolanaAccountKeys(raw);

  for (const instruction of collectSolanaInstructions(raw)) {
    if (resolveSolanaInstructionProgramId(instruction, accountKeys) !== METEORA_DAMM_V2_PROGRAM_ID) {
      continue;
    }

    for (const account of resolveSolanaInstructionAccounts(instruction, accountKeys)) {
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
    && (
      classification.protocols?.includes('meteora_damm_v2')
      || classification.programIds.includes(METEORA_DAMM_V2_PROGRAM_ID)
    ),
  );
}
