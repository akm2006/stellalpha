import type { TradeSourceClassification } from '@/lib/ingestion/trade-source-classifier';
import {
  collectSolanaAccountKeys,
  collectSolanaInstructions,
  normalizePublicKey,
  resolveSolanaInstructionAccounts,
  resolveSolanaInstructionProgramId,
} from '@/lib/ingestion/solana-raw-instructions';

export const METEORA_DAMM_V2_PROGRAM_ID = 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG';
export const METEORA_DAMM_V2_POOL_AUTHORITY = 'HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC';

const MAX_ENTRIES = 500;
const candidatePoolsBySignature = new Map<string, string[]>();

function addCandidate(candidates: Set<string>, account: string | null | undefined) {
  if (account && account.length >= 32 && account.length <= 44) {
    candidates.add(account);
  }
}

function addCandidateArray(candidates: Set<string>, accounts: unknown) {
  if (!Array.isArray(accounts)) return;

  for (const account of accounts) {
    addCandidate(candidates, normalizePublicKey(account));
  }
}

export function extractMeteoraDammV2CandidatePools(raw: any) {
  const candidates = new Set<string>();

  // Carbon fast-path payloads carry compact source-proven pool candidates.
  // Decoder candidate names are labels, not account addresses, and must not be
  // treated as pool candidates.
  addCandidateArray(candidates, raw?.__meteoraDammV2CandidatePools);

  const accountKeys = collectSolanaAccountKeys(raw);

  for (const instruction of collectSolanaInstructions(raw)) {
    if (resolveSolanaInstructionProgramId(instruction, accountKeys) !== METEORA_DAMM_V2_PROGRAM_ID) {
      continue;
    }

    const accounts = resolveSolanaInstructionAccounts(instruction, accountKeys);
    if (accounts[0] === METEORA_DAMM_V2_POOL_AUTHORITY) {
      // Official DAMM v2 swap/swap2 layout puts poolAuthority first and pool second.
      addCandidate(candidates, accounts[1]);
    }

    for (const account of accounts) {
      addCandidate(candidates, account);
    }
  }

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
