use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TradeConfidence {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EngineTrade {
    pub signature: String,
    pub wallet: String,
    #[serde(rename = "type")]
    pub trade_type: String,
    pub token_mint: String,
    pub token_amount: f64,
    pub base_amount: f64,
    pub base_mint: String,
    pub token_in_mint: String,
    pub token_in_amount: f64,
    pub token_in_pre_balance: f64,
    pub token_out_mint: String,
    pub token_out_amount: f64,
    pub timestamp: i64,
    pub source: String,
    pub gas: f64,
    pub confidence: TradeConfidence,
    pub parser_path: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NoTradeDecision {
    pub signature: String,
    pub wallet: String,
    pub slot: u64,
    pub reason: String,
    pub parser_path: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UnknownDecision {
    pub signature: String,
    pub wallet: String,
    pub slot: u64,
    pub reason: String,
    pub parser_path: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ParseDecision {
    Trade(EngineTrade),
    NoTrade(NoTradeDecision),
    Unknown(UnknownDecision),
}

#[derive(Debug, Clone)]
pub struct TokenBalanceSnapshot {
    pub mint: String,
    pub owner: Option<String>,
    pub account_index: usize,
    pub decimals: u8,
    pub ui_amount: f64,
}

#[derive(Debug, Clone)]
pub struct InstructionAccountMeta {
    pub pubkey: String,
    pub account_index: usize,
    pub is_signer: bool,
    pub is_writable: bool,
}

#[derive(Debug, Clone)]
pub struct CanonicalInstruction {
    pub program_id: String,
    pub accounts: Vec<InstructionAccountMeta>,
    pub data: Vec<u8>,
    pub stack_height: u32,
    pub index: u32,
}

#[derive(Debug, Clone)]
pub struct TokenDelta {
    pub mint: String,
    pub pre_amount: f64,
    pub post_amount: f64,
    pub delta_amount: f64,
}

#[derive(Debug, Clone)]
pub struct CanonicalEnvelope {
    pub signature: String,
    pub wallet: String,
    pub slot: u64,
    pub timestamp: Option<i64>,
    pub source_received_at: String,
    pub yellowstone_created_at: Option<String>,
    pub fee_payer: Option<String>,
    pub fee_lamports: u64,
    pub account_keys: Vec<String>,
    pub top_level_program_ids: Vec<String>,
    pub inner_program_ids: Vec<String>,
    pub decoder_candidates: Vec<String>,
    pub pre_balances: Vec<u64>,
    pub post_balances: Vec<u64>,
    pub pre_token_balances: Vec<TokenBalanceSnapshot>,
    pub post_token_balances: Vec<TokenBalanceSnapshot>,
    pub log_messages: Vec<String>,
    pub top_level_instructions: Vec<CanonicalInstruction>,
    pub inner_instructions: Vec<CanonicalInstruction>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ExpectedTrade {
    pub signature: String,
    pub wallet: String,
    #[serde(rename = "type")]
    pub trade_type: String,
    #[serde(rename = "tokenMint")]
    pub token_mint: String,
    #[serde(rename = "tokenAmount")]
    pub token_amount: f64,
    #[serde(rename = "baseAmount")]
    pub base_amount: f64,
    #[serde(rename = "baseMint")]
    pub base_mint: String,
    #[serde(rename = "tokenInMint")]
    pub token_in_mint: String,
    #[serde(rename = "tokenInAmount")]
    pub token_in_amount: f64,
    #[serde(rename = "tokenInPreBalance")]
    pub token_in_pre_balance: f64,
    #[serde(rename = "tokenOutMint")]
    pub token_out_mint: String,
    #[serde(rename = "tokenOutAmount")]
    pub token_out_amount: f64,
    pub timestamp: i64,
    pub source: String,
    pub gas: f64,
    pub confidence: TradeConfidence,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TruthEntry {
    pub signature: String,
    pub wallet: String,
    pub slot: u64,
    #[serde(rename = "sourceReceivedAt")]
    pub source_received_at: String,
    #[serde(rename = "parserStatus")]
    pub parser_status: String,
    #[serde(rename = "parserOutput")]
    pub parser_output: Option<ExpectedTrade>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReplayMismatch {
    pub signature: String,
    pub wallet: String,
    pub slot: u64,
    pub expected_status: String,
    pub actual_status: String,
    pub differing_fields: Vec<String>,
    pub parser_path: String,
    pub decoder_candidates: Vec<String>,
    pub actual_trade: Option<EngineTrade>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReplaySummary {
    pub total: usize,
    pub exact_matches: usize,
    pub status_matches: usize,
    pub trade_matches: usize,
    pub no_trade_matches: usize,
    pub unknown_count: usize,
    pub mismatches: usize,
    pub actual_status_counts: BTreeMap<String, usize>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReplayReport {
    pub summary: ReplaySummary,
    pub mismatches: Vec<ReplayMismatch>,
}
