use crate::carbon_registry::decoder_candidates;
use crate::domain::{
    CanonicalEnvelope, CanonicalInstruction, InstructionAccountMeta, TokenBalanceSnapshot,
};
use crate::fixtures::{RawBlockMetaCapture, RawTransactionCapture};
use crate::serialized::{
    as_f64, as_i64, as_string_vec, as_u64, decode_buffer, decode_pubkey_vec, path,
};
use anyhow::{Context, Result};
use serde_json::Value;
use std::collections::{BTreeSet, HashMap};

#[derive(Debug, Clone)]
struct ResolvedAccountKey {
    pubkey: String,
    is_signer: bool,
    is_writable: bool,
}

fn parse_u64_vec(value: Option<&Value>) -> Vec<u64> {
    value
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(as_u64).collect::<Vec<u64>>())
        .unwrap_or_default()
}

fn parse_token_balances(value: Option<&Value>) -> Vec<TokenBalanceSnapshot> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let mint = item.get("mint")?.as_str()?.to_string();
                    let owner = item.get("owner").and_then(Value::as_str).map(|s| s.to_string());
                    let account_index = item.get("accountIndex")?.as_u64()? as usize;
                    let decimals = item
                        .get("uiTokenAmount")
                        .and_then(|amount| amount.get("decimals"))
                        .and_then(Value::as_u64)
                        .unwrap_or_default() as u8;
                    let ui_amount = item
                        .get("uiTokenAmount")
                        .and_then(|amount| amount.get("uiAmountString"))
                        .and_then(Value::as_str)
                        .and_then(|s| s.parse::<f64>().ok())
                        .or_else(|| {
                            item.get("uiTokenAmount")
                                .and_then(|amount| amount.get("uiAmount"))
                                .and_then(as_f64)
                        })
                        .unwrap_or(0.0);

                    Some(TokenBalanceSnapshot {
                        mint,
                        owner,
                        account_index,
                        decimals,
                        ui_amount,
                    })
                })
                .collect::<Vec<TokenBalanceSnapshot>>()
        })
        .unwrap_or_default()
}

fn resolve_program_ids(instructions: Option<&Value>, account_keys: &[String]) -> Vec<String> {
    let mut ids = BTreeSet::new();

    if let Some(items) = instructions.and_then(Value::as_array) {
        for item in items {
            let program_index = item.get("programIdIndex").and_then(Value::as_u64);
            if let Some(index) = program_index.map(|value| value as usize) {
                if let Some(program_id) = account_keys.get(index) {
                    ids.insert(program_id.clone());
                }
            }
        }
    }

    ids.into_iter().collect()
}

fn build_resolved_account_keys(transaction_update: &Value) -> Vec<ResolvedAccountKey> {
    let static_keys = decode_pubkey_vec(path(
        transaction_update,
        &["transaction", "transaction", "message", "accountKeys"],
    ));
    let loaded_writable = decode_pubkey_vec(path(
        transaction_update,
        &["transaction", "meta", "loadedWritableAddresses"],
    ));
    let loaded_readonly = decode_pubkey_vec(path(
        transaction_update,
        &["transaction", "meta", "loadedReadonlyAddresses"],
    ));

    let header = path(
        transaction_update,
        &["transaction", "transaction", "message", "header"],
    );
    let num_required_signatures = header
        .and_then(|value| value.get("numRequiredSignatures"))
        .and_then(Value::as_u64)
        .unwrap_or_default() as usize;
    let num_readonly_signed_accounts = header
        .and_then(|value| value.get("numReadonlySignedAccounts"))
        .and_then(Value::as_u64)
        .unwrap_or_default() as usize;
    let num_readonly_unsigned_accounts = header
        .and_then(|value| value.get("numReadonlyUnsignedAccounts"))
        .and_then(Value::as_u64)
        .unwrap_or_default() as usize;

    let static_count = static_keys.len();
    let writable_signed_count = num_required_signatures.saturating_sub(num_readonly_signed_accounts);
    let unsigned_static_count = static_count.saturating_sub(num_required_signatures);
    let writable_unsigned_count =
        unsigned_static_count.saturating_sub(num_readonly_unsigned_accounts);

    let mut resolved = Vec::with_capacity(static_count + loaded_writable.len() + loaded_readonly.len());

    for (index, pubkey) in static_keys.into_iter().enumerate() {
        let is_signer = index < num_required_signatures;
        let is_writable = if is_signer {
            index < writable_signed_count
        } else {
            let unsigned_index = index.saturating_sub(num_required_signatures);
            unsigned_index < writable_unsigned_count
        };

        resolved.push(ResolvedAccountKey {
            pubkey,
            is_signer,
            is_writable,
        });
    }

    for pubkey in loaded_writable {
        resolved.push(ResolvedAccountKey {
            pubkey,
            is_signer: false,
            is_writable: true,
        });
    }

    for pubkey in loaded_readonly {
        resolved.push(ResolvedAccountKey {
            pubkey,
            is_signer: false,
            is_writable: false,
        });
    }

    resolved
}

fn parse_instruction_account_indices(value: &Value) -> Result<Vec<usize>> {
    if let Some(items) = value.as_array() {
        return Ok(items
            .iter()
            .filter_map(as_u64)
            .map(|index| index as usize)
            .collect());
    }

    let raw = decode_buffer(value)?;
    Ok(raw.into_iter().map(|index| index as usize).collect())
}

fn canonicalize_instruction(
    value: &Value,
    resolved_account_keys: &[ResolvedAccountKey],
    stack_height: u32,
    index: u32,
) -> Result<Option<CanonicalInstruction>> {
    let Some(program_id_index) = value.get("programIdIndex").and_then(Value::as_u64) else {
        return Ok(None);
    };

    let program_id_index = program_id_index as usize;
    let Some(program_key) = resolved_account_keys.get(program_id_index) else {
        return Ok(None);
    };

    let Some(accounts_value) = value.get("accounts") else {
        return Ok(None);
    };
    let Some(data_value) = value.get("data") else {
        return Ok(None);
    };

    let account_indices = parse_instruction_account_indices(accounts_value)?;
    let mut accounts = Vec::with_capacity(account_indices.len());
    for account_index in account_indices {
        if let Some(entry) = resolved_account_keys.get(account_index) {
            accounts.push(InstructionAccountMeta {
                pubkey: entry.pubkey.clone(),
                account_index,
                is_signer: entry.is_signer,
                is_writable: entry.is_writable,
            });
        }
    }

    Ok(Some(CanonicalInstruction {
        program_id: program_key.pubkey.clone(),
        accounts,
        data: decode_buffer(data_value)?,
        stack_height,
        index,
    }))
}

fn parse_top_level_instructions(
    transaction_update: &Value,
    resolved_account_keys: &[ResolvedAccountKey],
) -> Result<Vec<CanonicalInstruction>> {
    let mut instructions = Vec::new();
    let items = path(
        transaction_update,
        &["transaction", "transaction", "message", "instructions"],
    )
    .and_then(Value::as_array)
    .cloned()
    .unwrap_or_default();

    for (index, value) in items.iter().enumerate() {
        if let Some(instruction) =
            canonicalize_instruction(value, resolved_account_keys, 1, index as u32)?
        {
            instructions.push(instruction);
        }
    }

    Ok(instructions)
}

fn parse_inner_instructions(
    transaction_update: &Value,
    resolved_account_keys: &[ResolvedAccountKey],
) -> Result<Vec<CanonicalInstruction>> {
    let mut instructions = Vec::new();
    let groups = path(transaction_update, &["transaction", "meta", "innerInstructions"])
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    for group in groups {
        let group_index = group
            .get("index")
            .and_then(Value::as_u64)
            .unwrap_or_default() as u32;
        let items = group
            .get("instructions")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        for (inner_offset, value) in items.iter().enumerate() {
            let stack_height = value
                .get("stackHeight")
                .and_then(Value::as_u64)
                .unwrap_or(2) as u32;
            if let Some(instruction) = canonicalize_instruction(
                value,
                resolved_account_keys,
                stack_height,
                (group_index * 1000) + inner_offset as u32,
            )? {
                instructions.push(instruction);
            }
        }
    }

    Ok(instructions)
}

pub fn canonicalize_capture(
    capture: &RawTransactionCapture,
    block_meta_by_slot: &HashMap<u64, RawBlockMetaCapture>,
    fallback_timestamp: Option<i64>,
) -> Result<CanonicalEnvelope> {
    let resolved_account_keys = build_resolved_account_keys(&capture.transaction_update);
    let account_keys = resolved_account_keys
        .iter()
        .map(|entry| entry.pubkey.clone())
        .collect::<Vec<String>>();
    let fee_payer = account_keys.first().cloned();
    let fee_lamports = path(&capture.transaction_update, &["transaction", "meta", "fee"])
        .and_then(as_u64)
        .unwrap_or_default();
    let top_level_instructions =
        parse_top_level_instructions(&capture.transaction_update, &resolved_account_keys)?;
    let inner_instructions =
        parse_inner_instructions(&capture.transaction_update, &resolved_account_keys)?;

    let top_level_program_ids = resolve_program_ids(
        path(
            &capture.transaction_update,
            &["transaction", "transaction", "message", "instructions"],
        ),
        &account_keys,
    );

    let inner_program_ids = path(&capture.transaction_update, &["transaction", "meta", "innerInstructions"])
        .and_then(Value::as_array)
        .map(|groups| {
            let mut ids = BTreeSet::new();
            for group in groups {
                let group_ids = resolve_program_ids(group.get("instructions"), &account_keys);
                for id in group_ids {
                    ids.insert(id);
                }
            }
            ids.into_iter().collect::<Vec<String>>()
        })
        .unwrap_or_default();
    let all_program_ids = top_level_program_ids
        .iter()
        .cloned()
        .chain(inner_program_ids.iter().cloned())
        .collect::<Vec<String>>();

    let block_meta = block_meta_by_slot.get(&capture.slot);
    let timestamp = block_meta
        .and_then(|entry| entry.block_time)
        .or_else(|| {
            path(
                &capture.transaction_update,
                &["transaction", "meta", "blockTime", "timestamp"],
            )
            .and_then(as_i64)
        })
        .or(fallback_timestamp);

    Ok(CanonicalEnvelope {
        signature: capture.signature.clone(),
        wallet: capture.wallet.clone(),
        slot: capture.slot,
        timestamp,
        source_received_at: capture.source_received_at.clone(),
        yellowstone_created_at: capture.yellowstone_created_at.clone(),
        fee_payer,
        fee_lamports,
        account_keys,
        top_level_program_ids,
        inner_program_ids,
        decoder_candidates: decoder_candidates(&all_program_ids),
        pre_balances: parse_u64_vec(path(
            &capture.transaction_update,
            &["transaction", "meta", "preBalances"],
        )),
        post_balances: parse_u64_vec(path(
            &capture.transaction_update,
            &["transaction", "meta", "postBalances"],
        )),
        pre_token_balances: parse_token_balances(path(
            &capture.transaction_update,
            &["transaction", "meta", "preTokenBalances"],
        )),
        post_token_balances: parse_token_balances(path(
            &capture.transaction_update,
            &["transaction", "meta", "postTokenBalances"],
        )),
        log_messages: as_string_vec(path(
            &capture.transaction_update,
            &["transaction", "meta", "logMessages"],
        )),
        top_level_instructions,
        inner_instructions,
    })
}

pub fn canonicalize_captures(
    captures: &[RawTransactionCapture],
    block_meta_by_slot: &HashMap<u64, RawBlockMetaCapture>,
) -> Result<Vec<CanonicalEnvelope>> {
    captures
        .iter()
        .map(|capture| {
            canonicalize_capture(capture, block_meta_by_slot, None)
                .with_context(|| format!("failed to canonicalize capture {}", capture.signature))
        })
        .collect()
}
