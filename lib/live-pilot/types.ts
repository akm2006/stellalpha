export type PilotTradeTriggerKind = 'copy' | 'liquidation';
export type PilotTradeStatus = 'queued' | 'skipped' | 'building' | 'submitted' | 'confirmed' | 'failed';
export type PilotAttemptStatus = 'building' | 'submitted' | 'confirmed' | 'failed';
export type PilotControlScopeType = 'global' | 'wallet';
export type PilotWalletMode = 'copy';
export type PilotCashMode = 'sol';
export type PilotControlAction =
  | 'global_pause'
  | 'global_resume'
  | 'wallet_pause'
  | 'wallet_resume'
  | 'kill_switch_activate'
  | 'wallet_liquidate';

export interface PilotWalletConfigSummary {
  slot: 'A' | 'B';
  alias: string;
  publicKey: string;
  starTrader: string;
  cashMode: PilotCashMode;
  mode: PilotWalletMode;
  isEnabled: boolean;
  hasSecret: boolean;
  feeReservePct: number;
  minFeeReserveSol: number;
  minTradeSizeSol: number;
  maxTradeBuypowerPct: number;
  buyMaxPriceImpactPct: number;
  buyMaxRequotes: number;
  sellSlippageRetryBps: number;
  isComplete: boolean;
  missingFields: string[];
}

export interface LivePilotConfigSummary {
  operatorWallets: string[];
  wallets: PilotWalletConfigSummary[];
  errors: string[];
}

export interface PilotControlStateRow {
  scope_type: PilotControlScopeType;
  scope_key: string;
  is_paused: boolean;
  kill_switch_active: boolean;
  liquidation_requested: boolean;
  updated_by_wallet: string | null;
  updated_at: string;
}

export interface PilotRuntimeStateRow {
  wallet_alias: string;
  star_trader: string | null;
  mode: PilotWalletMode;
  lock_owner: string | null;
  last_seen_star_trade_signature: string | null;
  last_submitted_tx_signature: string | null;
  last_confirmed_tx_signature: string | null;
  last_error: string | null;
  last_reconcile_at: string | null;
  updated_at: string;
}

export interface LivePilotLatencyMetric {
  avgMs: number | null;
  latestMs: number | null;
  samples: number;
}

export interface LivePilotLatencySummary {
  recentWindowCount: number;
  leaderToReceive: LivePilotLatencyMetric;
  receiveToIntent: LivePilotLatencyMetric;
  intentToQuote: LivePilotLatencyMetric;
  quoteToSubmit: LivePilotLatencyMetric;
  submitToConfirm: LivePilotLatencyMetric;
  leaderToSubmit: LivePilotLatencyMetric;
  leaderToConfirm: LivePilotLatencyMetric;
}

export interface PilotTradeRow {
  id: string;
  wallet_alias: string;
  wallet_public_key: string;
  trigger_kind: PilotTradeTriggerKind;
  trigger_reason: string | null;
  star_trader: string | null;
  star_trade_signature: string | null;
  leader_type: string | null;
  token_in_mint: string | null;
  token_out_mint: string | null;
  copy_ratio: number | null;
  leader_block_timestamp: string | null;
  received_at: string | null;
  intent_created_at: string | null;
  quote_received_at: string | null;
  tx_built_at: string | null;
  tx_submitted_at: string | null;
  tx_signature: string | null;
  tx_confirmed_at: string | null;
  confirmation_slot: number | null;
  quoted_input_amount: number | null;
  quoted_output_amount: number | null;
  quoted_input_amount_raw: string | null;
  actual_input_amount: number | null;
  actual_output_amount: number | null;
  price_impact_pct: number | null;
  deployable_sol_at_intent: number | null;
  sol_price_at_intent: number | null;
  next_retry_at: string | null;
  attempt_count: number;
  winning_attempt_id: string | null;
  status: PilotTradeStatus;
  skip_reason: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface PilotTradeAttemptRow {
  id: string;
  pilot_trade_id: string;
  attempt_number: number;
  execution_mode: string;
  slippage_bps: number | null;
  jupiter_request_id: string | null;
  jupiter_router: string | null;
  last_valid_block_height: number | null;
  quoted_input_amount: number | null;
  quoted_output_amount: number | null;
  quoted_input_amount_raw: string | null;
  price_impact_pct: number | null;
  prioritization_fee_lamports: string | null;
  signed_transaction: string | null;
  execute_retry_count: number;
  execute_last_attempt_at: string | null;
  tx_signature: string | null;
  tx_submitted_at: string | null;
  tx_confirmed_at: string | null;
  confirmation_slot: number | null;
  actual_input_amount: number | null;
  actual_output_amount: number | null;
  status: PilotAttemptStatus;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface LivePilotWalletStatus {
  config: PilotWalletConfigSummary;
  control: PilotControlStateRow;
  runtime: PilotRuntimeStateRow | null;
}

export interface LivePilotStatusResponse {
  generatedAt: string;
  operatorWallet: string;
  controlPlaneOnly: boolean;
  config: LivePilotConfigSummary;
  summary: {
    globalPaused: boolean;
    killSwitchActive: boolean;
    configuredWalletCount: number;
    healthyWalletCount: number;
    recentTradeCount: number;
  };
  control: {
    global: PilotControlStateRow;
    wallets: PilotControlStateRow[];
  };
  latency: LivePilotLatencySummary;
  runtime: PilotRuntimeStateRow[];
  walletStatuses: LivePilotWalletStatus[];
  recentTrades: PilotTradeRow[];
}
