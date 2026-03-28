use crate::domain::ParseDecision;
use crate::envelope::canonicalize_capture;
use crate::fixtures::RawBlockMetaCapture;
use crate::fixtures::RawTransactionCapture;
use crate::parser::{CarbonYellowstoneParser, TradeParser};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{self, BufRead, Write};

#[derive(Debug, Deserialize)]
struct StreamParseRequest {
    capture: RawTransactionCapture,
    block_meta: Option<RawBlockMetaCapture>,
    fallback_timestamp: Option<i64>,
}

#[derive(Debug, Serialize)]
struct StreamParseResponse {
    signature: String,
    wallet: String,
    slot: u64,
    decision: ParseDecision,
    decoder_candidates: Vec<String>,
    top_level_program_ids: Vec<String>,
    inner_program_ids: Vec<String>,
}

pub fn run_stream() -> Result<()> {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    let parser = CarbonYellowstoneParser::default();

    for line in stdin.lock().lines() {
        let line = line.context("failed to read stream input line")?;
        if line.trim().is_empty() {
            continue;
        }

        let request: StreamParseRequest =
            serde_json::from_str(&line).context("failed to parse stream request JSON")?;

        let mut block_meta_by_slot = HashMap::new();
        if let Some(block_meta) = request.block_meta {
            block_meta_by_slot.insert(block_meta.slot, block_meta);
        }

        let envelope = canonicalize_capture(&request.capture, &block_meta_by_slot, request.fallback_timestamp)
            .with_context(|| format!("failed to canonicalize capture {}", request.capture.signature))?;
        let decision = parser.parse(&envelope);

        let response = StreamParseResponse {
            signature: envelope.signature,
            wallet: envelope.wallet,
            slot: envelope.slot,
            decision,
            decoder_candidates: envelope.decoder_candidates,
            top_level_program_ids: envelope.top_level_program_ids,
            inner_program_ids: envelope.inner_program_ids,
        };

        serde_json::to_writer(&mut stdout, &response)
            .context("failed to write stream response JSON")?;
        stdout
            .write_all(b"\n")
            .context("failed to write stream response newline")?;
        stdout.flush().context("failed to flush stream response")?;
    }

    Ok(())
}
