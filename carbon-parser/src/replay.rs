use crate::domain::{EngineTrade, ParseDecision, ReplayMismatch, ReplayReport, ReplaySummary};
use crate::envelope::canonicalize_captures;
use crate::fixtures::{block_meta_by_slot, load_raw_capture, load_truth, truth_by_signature};
use crate::parser::{CarbonYellowstoneParser, TradeParser};
use anyhow::{Context, Result};
use serde::Serialize;
use serde_json::to_string_pretty;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

const FLOAT_TOLERANCE: f64 = 0.000001;

fn approx_eq(left: f64, right: f64) -> bool {
    (left - right).abs() <= FLOAT_TOLERANCE
}

fn compare_trade(expected: &crate::domain::ExpectedTrade, actual: &EngineTrade) -> Vec<String> {
    let mut diffs = Vec::new();

    if expected.wallet != actual.wallet {
        diffs.push("wallet".to_string());
    }
    if expected.trade_type != actual.trade_type {
        diffs.push("type".to_string());
    }
    if expected.token_mint != actual.token_mint {
        diffs.push("tokenMint".to_string());
    }
    if !approx_eq(expected.token_amount, actual.token_amount) {
        diffs.push("tokenAmount".to_string());
    }
    if !approx_eq(expected.base_amount, actual.base_amount) {
        diffs.push("baseAmount".to_string());
    }
    if expected.base_mint != actual.base_mint {
        diffs.push("baseMint".to_string());
    }
    if expected.token_in_mint != actual.token_in_mint {
        diffs.push("tokenInMint".to_string());
    }
    if !approx_eq(expected.token_in_amount, actual.token_in_amount) {
        diffs.push("tokenInAmount".to_string());
    }
    if !approx_eq(expected.token_in_pre_balance, actual.token_in_pre_balance) {
        diffs.push("tokenInPreBalance".to_string());
    }
    if expected.token_out_mint != actual.token_out_mint {
        diffs.push("tokenOutMint".to_string());
    }
    if !approx_eq(expected.token_out_amount, actual.token_out_amount) {
        diffs.push("tokenOutAmount".to_string());
    }
    if expected.timestamp != actual.timestamp {
        diffs.push("timestamp".to_string());
    }
    if !approx_eq(expected.gas, actual.gas) {
        diffs.push("gas".to_string());
    }
    if expected.confidence != actual.confidence {
        diffs.push("confidence".to_string());
    }

    diffs
}

fn decision_status(decision: &ParseDecision) -> &'static str {
    match decision {
        ParseDecision::Trade(_) => "trade",
        ParseDecision::NoTrade(_) => "no_trade",
        ParseDecision::Unknown(_) => "unknown",
    }
}

fn parser_path(decision: &ParseDecision) -> String {
    match decision {
        ParseDecision::Trade(trade) => trade.parser_path.clone(),
        ParseDecision::NoTrade(decision) => decision.parser_path.clone(),
        ParseDecision::Unknown(decision) => decision.parser_path.clone(),
    }
}

#[derive(Debug, Serialize)]
pub struct InspectReport {
    pub signature: String,
    pub wallet: String,
    pub slot: u64,
    pub expected_status: String,
    pub expected_trade: Option<crate::domain::ExpectedTrade>,
    pub actual_decision: ParseDecision,
    pub decoder_candidates: Vec<String>,
    pub top_level_program_ids: Vec<String>,
    pub inner_program_ids: Vec<String>,
}

pub fn run_replay(
    raw_captures_path: &Path,
    truth_path: &Path,
    output_path: Option<&Path>,
) -> Result<ReplayReport> {
    let raw_capture = load_raw_capture(raw_captures_path)?;
    let truth = load_truth(truth_path)?;
    let block_meta_by_slot = block_meta_by_slot(raw_capture.blocks_meta);
    let truth_by_signature = truth_by_signature(truth.entries);
    let parser = CarbonYellowstoneParser::default();
    let envelopes = canonicalize_captures(&raw_capture.transactions, &block_meta_by_slot)?;

    let mut mismatches = Vec::new();
    let mut exact_matches = 0usize;
    let mut status_matches = 0usize;
    let mut trade_matches = 0usize;
    let mut no_trade_matches = 0usize;
    let mut unknown_count = 0usize;
    let mut actual_status_counts = BTreeMap::<String, usize>::new();

    for envelope in envelopes {
        let truth_entry = truth_by_signature
            .get(&envelope.signature)
            .with_context(|| format!("missing truth entry for {}", envelope.signature))?;

        let decision = parser.parse(&envelope);
        let actual_status = decision_status(&decision).to_string();
        *actual_status_counts.entry(actual_status.clone()).or_insert(0) += 1;

        if actual_status == truth_entry.parser_status {
            status_matches += 1;
        }

        let actual_trade = match &decision {
            ParseDecision::Trade(t) => Some(t.clone()),
            _ => None,
        };

        match (&truth_entry.parser_output, &decision) {
            (Some(expected_trade), ParseDecision::Trade(actual_trade_ref)) => {
                let diffs = compare_trade(expected_trade, actual_trade_ref);
                if diffs.is_empty() {
                    exact_matches += 1;
                    trade_matches += 1;
                } else {
                    mismatches.push(ReplayMismatch {
                        signature: envelope.signature.clone(),
                        wallet: envelope.wallet.clone(),
                        slot: envelope.slot,
                        expected_status: truth_entry.parser_status.clone(),
                        actual_status,
                        differing_fields: diffs,
                        parser_path: parser_path(&decision),
                        decoder_candidates: envelope.decoder_candidates.clone(),
                        actual_trade,
                    });
                }
            }
            (None, ParseDecision::NoTrade(_)) => {
                exact_matches += 1;
                no_trade_matches += 1;
            }
            (_, ParseDecision::Unknown(_)) => {
                unknown_count += 1;
                mismatches.push(ReplayMismatch {
                    signature: envelope.signature.clone(),
                    wallet: envelope.wallet.clone(),
                    slot: envelope.slot,
                    expected_status: truth_entry.parser_status.clone(),
                    actual_status,
                    differing_fields: vec!["status".to_string()],
                    parser_path: parser_path(&decision),
                    decoder_candidates: envelope.decoder_candidates.clone(),
                    actual_trade,
                });
            }
            _ => {
                mismatches.push(ReplayMismatch {
                    signature: envelope.signature.clone(),
                    wallet: envelope.wallet.clone(),
                    slot: envelope.slot,
                    expected_status: truth_entry.parser_status.clone(),
                    actual_status,
                    differing_fields: vec!["status".to_string()],
                    parser_path: parser_path(&decision),
                    decoder_candidates: envelope.decoder_candidates.clone(),
                    actual_trade,
                });
            }
        }
    }

    let report = ReplayReport {
        summary: ReplaySummary {
            total: exact_matches + mismatches.len(),
            exact_matches,
            status_matches,
            trade_matches,
            no_trade_matches,
            unknown_count,
            mismatches: mismatches.len(),
            actual_status_counts,
        },
        mismatches,
    };

    if let Some(output_path) = output_path {
        let contents = to_string_pretty(&report)?;
        fs::write(output_path, contents)
            .with_context(|| format!("failed to write replay report: {}", output_path.display()))?;
    }

    Ok(report)
}

pub fn inspect_signature(
    raw_captures_path: &Path,
    truth_path: &Path,
    signature: &str,
) -> Result<InspectReport> {
    let raw_capture = load_raw_capture(raw_captures_path)?;
    let truth = load_truth(truth_path)?;
    let block_meta_by_slot = block_meta_by_slot(raw_capture.blocks_meta);
    let truth_by_signature = truth_by_signature(truth.entries);
    let parser = CarbonYellowstoneParser::default();
    let envelopes = canonicalize_captures(&raw_capture.transactions, &block_meta_by_slot)?;

    let envelope = envelopes
        .into_iter()
        .find(|entry| entry.signature == signature)
        .with_context(|| format!("missing raw capture for signature {}", signature))?;
    let truth_entry = truth_by_signature
        .get(signature)
        .with_context(|| format!("missing truth entry for {}", signature))?;
    let actual_decision = parser.parse(&envelope);

    Ok(InspectReport {
        signature: envelope.signature,
        wallet: envelope.wallet,
        slot: envelope.slot,
        expected_status: truth_entry.parser_status.clone(),
        expected_trade: truth_entry.parser_output.clone(),
        actual_decision,
        decoder_candidates: envelope.decoder_candidates,
        top_level_program_ids: envelope.top_level_program_ids,
        inner_program_ids: envelope.inner_program_ids,
    })
}
