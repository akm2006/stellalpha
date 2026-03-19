import { IngestedTransaction } from './types';

export function normalizeWebsocketPayload(enhancedTxs: any[]): IngestedTransaction[] {
  return enhancedTxs
    .filter((tx: any) => tx.signature)
    .map((tx: any) => ({
      signature: tx.signature,
      timestamp: tx.timestamp || Math.floor(Date.now() / 1000),
      feePayer: tx.feePayer || '',
      source: 'websocket',
      raw: tx
    }));
}
