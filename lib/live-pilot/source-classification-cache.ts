import type { TradeSourceClassification } from '@/lib/ingestion/trade-source-classifier';

const MAX_ENTRIES = 500;
const classifications = new Map<string, TradeSourceClassification>();

export function rememberLivePilotSourceClassification(
  signature: string | null | undefined,
  classification: TradeSourceClassification,
) {
  if (!signature) return;
  classifications.set(signature, classification);

  while (classifications.size > MAX_ENTRIES) {
    const oldestKey = classifications.keys().next().value;
    if (!oldestKey) break;
    classifications.delete(oldestKey);
  }
}

export function getLivePilotSourceClassification(signature: string | null | undefined) {
  if (!signature) return null;
  return classifications.get(signature) || null;
}
