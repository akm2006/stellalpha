import type { TradeSourceClassification } from '@/lib/ingestion/trade-source-classifier';
import { PUMPSWAP_PROGRAM_ID } from '@/lib/ingestion/trade-source-classifier';
import {
  collectSolanaAccountKeys,
  collectSolanaInstructions,
  normalizePublicKey,
  resolveSolanaInstructionAccounts,
  resolveSolanaInstructionProgramId,
} from '@/lib/ingestion/solana-raw-instructions';

export const PUMPSWAP_PROGRAM_ID_STRING = PUMPSWAP_PROGRAM_ID;

const MAX_ENTRIES = 500;
const candidatePoolsBySignature = new Map<string, string[]>();

function addCandidate(candidates: Set<string>, account: unknown) {
  const pubkey = normalizePublicKey(account);
  if (pubkey && pubkey.length >= 32 && pubkey.length <= 44) {
    candidates.add(pubkey);
  }
}

function addCandidateArray(candidates: Set<string>, accounts: unknown) {
  if (!Array.isArray(accounts)) return;

  for (const account of accounts) {
    addCandidate(candidates, account);
  }
}

export function extractPumpSwapCandidatePools(raw: any) {
  const candidates = new Set<string>();

  // Carbon fast-path payloads carry compact source-proven pool candidates.
  addCandidateArray(candidates, raw?.__pumpSwapCandidatePools);

  const accountKeys = collectSolanaAccountKeys(raw);

  for (const instruction of collectSolanaInstructions(raw)) {
    if (resolveSolanaInstructionProgramId(instruction, accountKeys) !== PUMPSWAP_PROGRAM_ID_STRING) {
      continue;
    }

    addCandidateArray(candidates, resolveSolanaInstructionAccounts(instruction, accountKeys));
  }

  return [...candidates];
}

export function rememberLivePilotPumpSwapCandidatePools(
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

export function getLivePilotPumpSwapCandidatePools(signature: string | null | undefined) {
  if (!signature) return [];
  return candidatePoolsBySignature.get(signature) || [];
}

export function isPumpSwapSource(classification: TradeSourceClassification | null | undefined) {
  return Boolean(
    classification
    && (
      classification.protocols?.includes('pumpswap')
      || classification.programIds.includes(PUMPSWAP_PROGRAM_ID_STRING)
    )
  );
}
