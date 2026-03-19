import { IngestedTransaction } from './types';

export function normalizeWebhookPayload(body: any): IngestedTransaction[] {
  const transactions = Array.isArray(body) ? body : [body];

  return transactions
    .filter((tx: any) => tx.signature)
    .map((tx: any) => ({
      signature: tx.signature,
      timestamp: tx.timestamp || 0,
      feePayer: tx.feePayer || '',
      source: 'webhook',
      raw: tx
    }));
}
