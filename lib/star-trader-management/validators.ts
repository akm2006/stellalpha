import { PublicKey } from '@solana/web3.js';
import { parseCopyBuyModelSelection } from '@/lib/copy-models/catalog';
import { StarTraderManagementError } from '@/lib/star-trader-management/types';
import type { UpsertManagedStarTraderInput } from '@/lib/star-trader-management/types';

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function normalizeImageUrl(value: unknown) {
  const normalized = normalizeText(value, 512);
  if (!normalized) return null;

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Unsupported protocol');
    }
    return url.toString();
  } catch {
    throw new StarTraderManagementError(400, 'invalid_image_url', 'Image URL must be a valid http or https URL');
  }
}

export function normalizeStarTraderWallet(rawWallet: unknown) {
  if (typeof rawWallet !== 'string' || !rawWallet.trim()) {
    throw new StarTraderManagementError(400, 'wallet_required', 'Wallet address is required');
  }

  const wallet = rawWallet.trim();
  try {
    return new PublicKey(wallet).toBase58();
  } catch {
    throw new StarTraderManagementError(400, 'invalid_wallet', 'Wallet address is not a valid Solana public key');
  }
}

export function normalizeStarTraderUpsertInput(rawBody: Record<string, unknown>): UpsertManagedStarTraderInput {
  const wallet = rawBody.wallet !== undefined ? normalizeStarTraderWallet(rawBody.wallet) : undefined;
  const name = normalizeText(rawBody.name, 120);
  const imageUrl = normalizeImageUrl(rawBody.imageUrl);
  const recommendedCopyModelReason = normalizeText(rawBody.recommendedCopyModelReason, 400);
  const operatorNotes = normalizeText(rawBody.operatorNotes, 1200);
  const hasRecommendation = typeof rawBody.recommendedCopyModelKey === 'string' && rawBody.recommendedCopyModelKey.trim().length > 0;
  const selection = hasRecommendation
    ? parseCopyBuyModelSelection(
        rawBody.recommendedCopyModelKey,
        rawBody.recommendedCopyModelConfig,
      )
    : null;

  return {
    wallet,
    name,
    imageUrl,
    recommendedCopyModelKey: selection?.modelKey ?? null,
    recommendedCopyModelConfig: selection?.config ?? null,
    recommendedCopyModelReason,
    operatorNotes,
  };
}
