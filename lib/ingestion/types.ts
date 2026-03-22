export interface IngestedTransaction {
  signature: string;
  timestamp: number; // Unix timestamp in seconds (on-chain)
  feePayer: string;
  source?: 'webhook' | 'websocket' | 'startup_reconcile' | 'cron_reconcile';
  raw: any; // The raw transport-specific transaction payload intended for parsers
}

export interface IngestionResult {
  processed: number;
  inserted: number;
}
