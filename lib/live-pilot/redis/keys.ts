export const LIVE_PILOT_INTENTS_STREAM = 'live-pilot:intents';
export const LIVE_PILOT_RESULTS_STREAM = 'live-pilot:results';
export const LIVE_PILOT_AUDIT_STREAM = 'live-pilot:audit';
export const LIVE_PILOT_DEADLETTER_STREAM = 'live-pilot:deadletter';

export function livePilotDedupeKey(args: {
  walletAlias: string;
  starTradeSignature: string;
  leaderType: string;
}) {
  return `live-pilot:dedupe:${args.walletAlias}:${args.starTradeSignature}:${args.leaderType}`;
}

export function livePilotWalletLockKey(walletAlias: string) {
  return `live-pilot:lock:wallet:${walletAlias}`;
}

export function livePilotSubmittedKey(walletAlias: string, intentId: string) {
  return `live-pilot:submitted:${walletAlias}:${intentId}`;
}

export function livePilotGlobalControlKey() {
  return 'live-pilot:control:global';
}

export function livePilotWalletControlKey(walletAlias: string) {
  return `live-pilot:control:wallet:${walletAlias}`;
}

export function livePilotQuarantineKey(mint: string) {
  return `live-pilot:quarantine:${mint}`;
}

export function livePilotCopyStateKey(args: {
  walletAlias: string;
  starTrader: string;
  mint: string;
}) {
  return `live-pilot:copy-state:${args.walletAlias}:${args.starTrader}:${args.mint}`;
}
