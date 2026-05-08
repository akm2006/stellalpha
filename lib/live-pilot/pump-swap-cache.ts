import type { TradeSourceClassification } from '@/lib/ingestion/trade-source-classifier';
import { PUMPSWAP_PROGRAM_ID } from '@/lib/ingestion/trade-source-classifier';

export const PUMPSWAP_PROGRAM_ID_STRING = PUMPSWAP_PROGRAM_ID;

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

export function extractPumpSwapCandidatePools(raw: any) {
  const candidates = new Set<string>();

  for (const instruction of collectInstructions(raw)) {
    if (instructionProgramId(instruction) !== PUMPSWAP_PROGRAM_ID_STRING) {
      continue;
    }

    for (const account of instructionAccounts(instruction)) {
      if (account.length >= 32 && account.length <= 44) {
        candidates.add(account);
      }
    }
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
