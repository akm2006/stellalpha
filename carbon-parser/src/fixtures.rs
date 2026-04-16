use crate::domain::TruthEntry;
use anyhow::{Context, Result};
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Deserialize)]
pub struct RawCaptureExport {
    #[serde(rename = "exportedAt")]
    pub exported_at: String,
    pub source: String,
    pub transactions: Vec<RawTransactionCapture>,
    #[serde(rename = "blocksMeta")]
    pub blocks_meta: Vec<RawBlockMetaCapture>,
}

#[derive(Debug, Deserialize)]
pub struct RawTransactionCapture {
    pub signature: String,
    pub wallet: String,
    pub slot: u64,
    pub receive_commitment: String,
    pub source_received_at: String,
    pub yellowstone_created_at: Option<String>,
    pub transaction_update: Value,
}

#[derive(Debug, Deserialize)]
pub struct RawBlockMetaCapture {
    pub slot: u64,
    pub block_time: Option<i64>,
    pub block_meta_update: Value,
    pub created_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TruthExport {
    #[serde(rename = "exportedAt")]
    pub exported_at: String,
    pub entries: Vec<TruthEntry>,
}

pub fn load_raw_capture(path: &Path) -> Result<RawCaptureExport> {
    let contents = fs::read_to_string(path)
        .with_context(|| format!("failed to read raw capture file: {}", path.display()))?;

    serde_json::from_str(&contents)
        .with_context(|| format!("failed to parse raw capture file: {}", path.display()))
}

pub fn load_truth(path: &Path) -> Result<TruthExport> {
    let contents = fs::read_to_string(path)
        .with_context(|| format!("failed to read truth file: {}", path.display()))?;

    serde_json::from_str(&contents)
        .with_context(|| format!("failed to parse truth file: {}", path.display()))
}

pub fn block_meta_by_slot(
    blocks_meta: Vec<RawBlockMetaCapture>,
) -> HashMap<u64, RawBlockMetaCapture> {
    blocks_meta
        .into_iter()
        .map(|entry| (entry.slot, entry))
        .collect()
}

pub fn truth_by_signature(entries: Vec<TruthEntry>) -> HashMap<String, TruthEntry> {
    entries
        .into_iter()
        .map(|entry| (entry.signature.clone(), entry))
        .collect()
}
