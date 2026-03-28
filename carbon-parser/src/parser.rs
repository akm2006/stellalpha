use crate::carbon_decoders::{extract_protocol_trade_candidates, ProtocolTradeCandidate};
use crate::constants::{
    is_base_mint, is_sol_like_mint, priority_rank, SOL_LITERAL, WSOL,
};
use crate::domain::{
    CanonicalEnvelope, EngineTrade, NoTradeDecision, ParseDecision, TokenBalanceSnapshot, TokenDelta,
    TradeConfidence, UnknownDecision,
};
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

const DELTA_EPSILON: f64 = 0.000001;
const BASE_FLOW_EPSILON: f64 = 0.00000001;
const NATIVE_EPSILON: f64 = 0.001;
const SYSTEM_PROGRAM_ID: &str = "11111111111111111111111111111111";
const TOKEN_PROGRAM_ID: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID: &str = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const SWAP_PROTOCOL_HINTS: [&str; 7] = [
    "carbon-jupiter-swap-decoder",
    "carbon-meteora-damm-v2-decoder",
    "carbon-meteora-dbc-decoder",
    "carbon-meteora-dlmm-decoder",
    "carbon-orca-whirlpool-decoder",
    "carbon-pump-swap-decoder",
    "carbon-pumpfun-decoder",
];
const INFRA_PROGRAM_IDS: [&str; 6] = [
    "11111111111111111111111111111111",
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    "ComputeBudget111111111111111111111111111111",
    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
    "memoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
];

pub trait TradeParser {
    fn parse(&self, envelope: &CanonicalEnvelope) -> ParseDecision;
}

#[derive(Debug, Default)]
pub struct CarbonYellowstoneParser;

#[derive(Debug, Clone)]
struct ClusterMintState {
    mint: String,
    pre_amount: f64,
    post_amount: f64,
    delta_amount: f64,
}

#[derive(Debug, Clone)]
struct TokenAccountInfo {
    mint: String,
    owner: Option<String>,
    decimals: u8,
}

fn compare_delta_priority(a: &TokenDelta, b: &TokenDelta) -> Ordering {
    let a_rank = priority_rank(&a.mint);
    let b_rank = priority_rank(&b.mint);

    a_rank
        .cmp(&b_rank)
        .then_with(|| b.delta_amount.abs().total_cmp(&a.delta_amount.abs()))
}

fn cluster_state_delta_significant(mint: &str, delta_amount: f64) -> bool {
    let threshold = if is_base_mint(mint) {
        BASE_FLOW_EPSILON
    } else {
        DELTA_EPSILON
    };

    delta_amount.abs() >= threshold
}

fn cluster_members(envelope: &CanonicalEnvelope) -> HashSet<String> {
    let mut members = HashSet::from([envelope.wallet.to_lowercase()]);
    if let Some(fee_payer) = envelope.fee_payer.as_ref() {
        members.insert(fee_payer.to_lowercase());
    }
    members
}

fn wallet_members(envelope: &CanonicalEnvelope) -> HashSet<String> {
    HashSet::from([envelope.wallet.to_lowercase()])
}

fn aggregate_cluster_token_states(
    pre: &[TokenBalanceSnapshot],
    post: &[TokenBalanceSnapshot],
    cluster: &HashSet<String>,
) -> Vec<ClusterMintState> {
    let mut states = HashMap::<String, (f64, f64)>::new();

    for balance in pre.iter().filter(|balance| {
        balance
            .owner
            .as_ref()
            .map(|owner| cluster.contains(&owner.to_lowercase()))
            .unwrap_or(false)
    }) {
        let entry = states.entry(balance.mint.clone()).or_insert((0.0, 0.0));
        entry.0 += balance.ui_amount;
    }

    for balance in post.iter().filter(|balance| {
        balance
            .owner
            .as_ref()
            .map(|owner| cluster.contains(&owner.to_lowercase()))
            .unwrap_or(false)
    }) {
        let entry = states.entry(balance.mint.clone()).or_insert((0.0, 0.0));
        entry.1 += balance.ui_amount;
    }

    states
        .into_iter()
        .map(|(mint, (pre_amount, post_amount))| ClusterMintState {
            mint,
            pre_amount,
            post_amount,
            delta_amount: post_amount - pre_amount,
        })
        .filter(|state| cluster_state_delta_significant(&state.mint, state.delta_amount))
        .collect()
}

fn cluster_native_delta_lamports(
    envelope: &CanonicalEnvelope,
    cluster: &HashSet<String>,
) -> i64 {
    envelope
        .account_keys
        .iter()
        .enumerate()
        .filter(|(_, account)| cluster.contains(&account.to_lowercase()))
        .map(|(index, _)| {
            let pre = *envelope.pre_balances.get(index).unwrap_or(&0) as i64;
            let post = *envelope.post_balances.get(index).unwrap_or(&0) as i64;
            post - pre
        })
        .sum()
}

fn wallet_effective_native_spend(envelope: &CanonicalEnvelope) -> Option<f64> {
    let wallet = envelope.wallet.to_lowercase();
    let wallet_delta_lamports: i64 = envelope
        .account_keys
        .iter()
        .enumerate()
        .filter(|(_, account)| account.to_lowercase() == wallet)
        .map(|(index, _)| {
            let pre = *envelope.pre_balances.get(index).unwrap_or(&0) as i64;
            let post = *envelope.post_balances.get(index).unwrap_or(&0) as i64;
            post - pre
        })
        .sum();

    if wallet_delta_lamports >= 0 {
        return None;
    }

    let mut spend_sol = (-wallet_delta_lamports) as f64 / 1_000_000_000.0;
    if !is_relayer(envelope) {
        spend_sol -= envelope.fee_lamports as f64 / 1_000_000_000.0;
    }

    if spend_sol > NATIVE_EPSILON {
        Some(spend_sol)
    } else {
        None
    }
}

fn wallet_mint_delta(envelope: &CanonicalEnvelope, mint: &str) -> Option<f64> {
    let wallet = envelope.wallet.to_lowercase();
    let target_mint = if is_sol_like_mint(mint) { WSOL } else { mint };
    let mut pre_amount = 0.0;
    let mut post_amount = 0.0;
    let mut found = false;

    for balance in envelope
        .pre_token_balances
        .iter()
        .filter(|balance| balance.mint == target_mint)
    {
        if balance
            .owner
            .as_ref()
            .map(|owner| owner.to_lowercase() == wallet)
            .unwrap_or(false)
        {
            pre_amount += balance.ui_amount;
            found = true;
        }
    }

    for balance in envelope
        .post_token_balances
        .iter()
        .filter(|balance| balance.mint == target_mint)
    {
        if balance
            .owner
            .as_ref()
            .map(|owner| owner.to_lowercase() == wallet)
            .unwrap_or(false)
        {
            post_amount += balance.ui_amount;
            found = true;
        }
    }

    if !found {
        return None;
    }

    let delta = post_amount - pre_amount;
    // Distinguish "wallet found with zero delta" (arb routing, return Some(0.0))
    // from "wallet not found at all" (relayer/CPI, return None).
    // Returning None for zero delta was a bug: downstream code treated None as
    // "wallet absent from balances" and let false-positive trades through.
    Some(delta)
}

fn wallet_positive_native_like_delta(envelope: &CanonicalEnvelope) -> Option<(String, f64)> {
    if let Some(delta) = wallet_mint_delta(envelope, WSOL) {
        if delta > DELTA_EPSILON {
            return Some((WSOL.to_string(), delta));
        }
    }

    let wallet = envelope.wallet.to_lowercase();
    let wallet_delta_lamports: i64 = envelope
        .account_keys
        .iter()
        .enumerate()
        .filter(|(_, account)| account.to_lowercase() == wallet)
        .map(|(index, _)| {
            let pre = *envelope.pre_balances.get(index).unwrap_or(&0) as i64;
            let post = *envelope.post_balances.get(index).unwrap_or(&0) as i64;
            post - pre
        })
        .sum();

    let delta_sol = wallet_delta_lamports as f64 / 1_000_000_000.0;
    if delta_sol > DELTA_EPSILON {
        Some((SOL_LITERAL.to_string(), delta_sol))
    } else {
        None
    }
}

fn wallet_positive_native_like_delta_tiny(envelope: &CanonicalEnvelope) -> Option<(String, f64)> {
    let wallet = envelope.wallet.to_lowercase();

    let mut pre_amount = 0.0;
    let mut post_amount = 0.0;
    let mut found_wsol = false;
    for balance in envelope
        .pre_token_balances
        .iter()
        .filter(|balance| balance.mint == WSOL)
    {
        if balance
            .owner
            .as_ref()
            .map(|owner| owner.to_lowercase() == wallet)
            .unwrap_or(false)
        {
            pre_amount += balance.ui_amount;
            found_wsol = true;
        }
    }

    for balance in envelope
        .post_token_balances
        .iter()
        .filter(|balance| balance.mint == WSOL)
    {
        if balance
            .owner
            .as_ref()
            .map(|owner| owner.to_lowercase() == wallet)
            .unwrap_or(false)
        {
            post_amount += balance.ui_amount;
            found_wsol = true;
        }
    }

    if found_wsol {
        let delta = post_amount - pre_amount;
        if delta > BASE_FLOW_EPSILON {
            return Some((WSOL.to_string(), delta));
        }
    }

    let wallet_delta_lamports: i64 = envelope
        .account_keys
        .iter()
        .enumerate()
        .filter(|(_, account)| account.to_lowercase() == wallet)
        .map(|(index, _)| {
            let pre = *envelope.pre_balances.get(index).unwrap_or(&0) as i64;
            let post = *envelope.post_balances.get(index).unwrap_or(&0) as i64;
            post - pre
        })
        .sum();
    let delta_sol = wallet_delta_lamports as f64 / 1_000_000_000.0;
    if delta_sol > BASE_FLOW_EPSILON {
        Some((SOL_LITERAL.to_string(), delta_sol))
    } else {
        None
    }
}

fn infer_confidence(token_in_mint: &str, token_out_mint: &str) -> TradeConfidence {
    let input_is_base = is_base_mint(token_in_mint);
    let output_is_base = is_base_mint(token_out_mint);

    if input_is_base && output_is_base {
        TradeConfidence::Medium
    } else if input_is_base || output_is_base {
        TradeConfidence::High
    } else {
        TradeConfidence::Low
    }
}

fn wallet_supports_trade_direction(
    envelope: &CanonicalEnvelope,
    trade_type: &str,
    token_mint: &str,
) -> bool {
    if is_base_mint(token_mint) {
        return false;
    }

    let Some(delta) = wallet_mint_delta(envelope, token_mint) else {
        return false;
    };

    match trade_type {
        "buy" => delta > DELTA_EPSILON,
        "sell" => delta < -DELTA_EPSILON,
        _ => false,
    }
}

fn mint_matches_flow(mint: &str, flow_mint: &str) -> bool {
    mint == flow_mint || (is_sol_like_mint(mint) && is_sol_like_mint(flow_mint))
}

fn flows_contain_mint(flows: &[TokenDelta], mint: &str) -> bool {
    flows.iter().any(|flow| {
        flow.delta_amount.abs() > DELTA_EPSILON && mint_matches_flow(mint, &flow.mint)
    })
}

fn direct_instruction_flows_support_trade(
    sent: &[TokenDelta],
    received: &[TokenDelta],
    token_in_mint: &str,
    token_out_mint: &str,
) -> bool {
    flows_contain_mint(sent, token_in_mint) && flows_contain_mint(received, token_out_mint)
}

fn trade_shape_supported(
    envelope: &CanonicalEnvelope,
    trade_type: &str,
    token_mint: &str,
    token_in_mint: &str,
    token_out_mint: &str,
    direct_sent: &[TokenDelta],
    direct_received: &[TokenDelta],
) -> bool {
    wallet_supports_trade_direction(envelope, trade_type, token_mint)
        || direct_instruction_flows_support_trade(
            direct_sent,
            direct_received,
            token_in_mint,
            token_out_mint,
        )
}

fn protocol_trade_support_score(
    envelope: &CanonicalEnvelope,
    trade: &EngineTrade,
    direct_sent: &[TokenDelta],
    direct_received: &[TokenDelta],
) -> i32 {
    let mut score = 0;

    if wallet_supports_trade_direction(envelope, &trade.trade_type, &trade.token_mint) {
        score += 20;
    }

    if direct_instruction_flows_support_trade(
        direct_sent,
        direct_received,
        &trade.token_in_mint,
        &trade.token_out_mint,
    ) {
        score += 30;
    }

    if is_base_mint(&trade.token_in_mint) != is_base_mint(&trade.token_out_mint) {
        score += 5;
    }

    score
}

fn protocol_trade_path_rank(parser_path: &str) -> i32 {
    match parser_path {
        "carbon_pump_swap_buy_exact_quote_in" => 3,
        "carbon_pump_swap_buy" | "carbon_pump_swap_sell" => 2,
        "carbon_pumpfun_buy" | "carbon_pumpfun_sell" => 1,
        _ => 0,
    }
}

fn build_mint_decimals_map(envelope: &CanonicalEnvelope) -> HashMap<String, u8> {
    let mut decimals = HashMap::new();

    for balance in envelope
        .pre_token_balances
        .iter()
        .chain(envelope.post_token_balances.iter())
    {
        decimals.entry(balance.mint.clone()).or_insert(balance.decimals);
    }

    decimals
}

fn build_token_account_lookup(envelope: &CanonicalEnvelope) -> HashMap<String, TokenAccountInfo> {
    let mut lookup = HashMap::new();

    for balance in envelope
        .pre_token_balances
        .iter()
        .chain(envelope.post_token_balances.iter())
    {
        if let Some(account_pubkey) = envelope.account_keys.get(balance.account_index) {
            lookup.entry(account_pubkey.clone()).or_insert(TokenAccountInfo {
                mint: balance.mint.clone(),
                owner: balance.owner.clone(),
                decimals: balance.decimals,
            });
        }
    }

    lookup
}

fn raw_amount_to_ui(
    raw_amount: u64,
    mint: &str,
    mint_decimals: &HashMap<String, u8>,
) -> Option<f64> {
    let decimals = if is_sol_like_mint(mint) {
        9
    } else {
        *mint_decimals.get(mint)?
    };

    Some(raw_amount as f64 / 10_f64.powi(decimals as i32))
}

fn parse_le_u64(bytes: &[u8]) -> Option<u64> {
    let slice = bytes.get(..8)?;
    Some(u64::from_le_bytes(slice.try_into().ok()?))
}

fn push_aggregated_flow(map: &mut HashMap<String, f64>, mint: &str, amount: f64) {
    if amount <= DELTA_EPSILON {
        return;
    }

    *map.entry(mint.to_string()).or_insert(0.0) += amount;
}

fn finalize_flow_map(mut flows: Vec<TokenDelta>) -> Vec<TokenDelta> {
    flows.retain(|flow| flow.delta_amount.abs() > DELTA_EPSILON);
    flows.sort_by(compare_delta_priority);
    flows
}

fn extract_direct_instruction_flows(envelope: &CanonicalEnvelope) -> (Vec<TokenDelta>, Vec<TokenDelta>) {
    let wallet = envelope.wallet.to_lowercase();
    let account_lookup = build_token_account_lookup(envelope);
    let mut sent_aggregated = HashMap::<String, f64>::new();
    let mut received_aggregated = HashMap::<String, f64>::new();

    for instruction in envelope
        .top_level_instructions
        .iter()
        .chain(envelope.inner_instructions.iter())
    {
        match instruction.program_id.as_str() {
            TOKEN_PROGRAM_ID | TOKEN_2022_PROGRAM_ID => {
                let Some((&opcode, rest)) = instruction.data.split_first() else {
                    continue;
                };

                match opcode {
                    3 => {
                        let (Some(source), Some(destination), authority) = (
                            instruction.accounts.get(0),
                            instruction.accounts.get(1),
                            instruction.accounts.get(2),
                        ) else {
                            continue;
                        };
                        let Some(amount_raw) = parse_le_u64(rest) else {
                            continue;
                        };
                        let Some(source_info) = account_lookup.get(&source.pubkey) else {
                            continue;
                        };
                        let destination_info = account_lookup.get(&destination.pubkey);
                        let source_involved = source_info
                            .owner
                            .as_ref()
                            .map(|owner| owner.to_lowercase() == wallet)
                            .unwrap_or(false)
                            || authority
                                .map(|entry| entry.pubkey.to_lowercase() == wallet)
                                .unwrap_or(false);
                        let destination_involved = destination_info
                            .and_then(|info| info.owner.as_ref())
                            .map(|owner| owner.to_lowercase() == wallet)
                            .unwrap_or(false);

                        if source_involved == destination_involved {
                            continue;
                        }

                        let amount = amount_raw as f64 / 10_f64.powi(source_info.decimals as i32);
                        if source_involved {
                            push_aggregated_flow(&mut sent_aggregated, &source_info.mint, amount);
                        } else {
                            push_aggregated_flow(
                                &mut received_aggregated,
                                &source_info.mint,
                                amount,
                            );
                        }
                    }
                    12 => {
                        let (Some(source), Some(mint_account), Some(destination), authority) = (
                            instruction.accounts.get(0),
                            instruction.accounts.get(1),
                            instruction.accounts.get(2),
                            instruction.accounts.get(3),
                        ) else {
                            continue;
                        };
                        let Some(amount_raw) = parse_le_u64(rest) else {
                            continue;
                        };
                        let decimals = rest.get(8).copied().unwrap_or_default();
                        let mint = account_lookup
                            .get(&source.pubkey)
                            .map(|info| info.mint.clone())
                            .or_else(|| {
                                account_lookup
                                    .get(&destination.pubkey)
                                    .map(|info| info.mint.clone())
                            })
                            .unwrap_or_else(|| mint_account.pubkey.clone());
                        let source_involved = account_lookup
                            .get(&source.pubkey)
                            .and_then(|info| info.owner.as_ref())
                            .map(|owner| owner.to_lowercase() == wallet)
                            .unwrap_or(false)
                            || authority
                                .map(|entry| entry.pubkey.to_lowercase() == wallet)
                                .unwrap_or(false);
                        let destination_involved = account_lookup
                            .get(&destination.pubkey)
                            .and_then(|info| info.owner.as_ref())
                            .map(|owner| owner.to_lowercase() == wallet)
                            .unwrap_or(false);

                        if source_involved == destination_involved {
                            continue;
                        }

                        let amount = amount_raw as f64 / 10_f64.powi(decimals as i32);
                        if source_involved {
                            push_aggregated_flow(&mut sent_aggregated, &mint, amount);
                        } else {
                            push_aggregated_flow(&mut received_aggregated, &mint, amount);
                        }
                    }
                    _ => {}
                }
            }
            SYSTEM_PROGRAM_ID => {
                if instruction.data.len() < 12 {
                    continue;
                }

                let discriminator = u32::from_le_bytes(
                    instruction.data[0..4]
                        .try_into()
                        .expect("system instruction discriminator slice must be 4 bytes"),
                );
                if discriminator != 2 {
                    continue;
                }

                let Some(amount_raw) = instruction
                    .data
                    .get(4..12)
                    .and_then(|slice| slice.try_into().ok())
                    .map(u64::from_le_bytes)
                else {
                    continue;
                };
                let (Some(source), Some(destination)) =
                    (instruction.accounts.get(0), instruction.accounts.get(1))
                else {
                    continue;
                };

                let source_involved = source.pubkey.to_lowercase() == wallet;
                let destination_involved = destination.pubkey.to_lowercase() == wallet;
                if source_involved == destination_involved {
                    continue;
                }

                let amount = amount_raw as f64 / 1_000_000_000.0;
                if source_involved {
                    push_aggregated_flow(&mut sent_aggregated, SOL_LITERAL, amount);
                } else {
                    push_aggregated_flow(&mut received_aggregated, SOL_LITERAL, amount);
                }
            }
            _ => {}
        }
    }

    // Net flows per mint: in multi-hop arb transactions, the same mint can appear
    // in both sent and received (tokens route through the wallet). Only the residual
    // represents the wallet's actual position change.
    let all_flow_mints: HashSet<String> = sent_aggregated
        .keys()
        .chain(received_aggregated.keys())
        .cloned()
        .collect();
    let mut net_sent = HashMap::<String, f64>::new();
    let mut net_received = HashMap::<String, f64>::new();

    for mint in all_flow_mints {
        let sent = sent_aggregated.get(&mint).copied().unwrap_or(0.0);
        let received = received_aggregated.get(&mint).copied().unwrap_or(0.0);
        let net = received - sent;
        if net > DELTA_EPSILON {
            net_received.insert(mint, net);
        } else if net < -DELTA_EPSILON {
            net_sent.insert(mint, net.abs());
        }
    }

    (
        finalize_flow_map(
            net_sent
                .into_iter()
                .map(|(mint, amount)| TokenDelta {
                    mint,
                    pre_amount: 0.0,
                    post_amount: 0.0,
                    delta_amount: amount,
                })
                .collect(),
        ),
        finalize_flow_map(
            net_received
                .into_iter()
                .map(|(mint, amount)| TokenDelta {
                    mint,
                    pre_amount: 0.0,
                    post_amount: 0.0,
                    delta_amount: amount,
                })
                .collect(),
        ),
    )
}

fn no_trade(envelope: &CanonicalEnvelope, parser_path: &str, reason: impl Into<String>) -> ParseDecision {
    ParseDecision::NoTrade(NoTradeDecision {
        signature: envelope.signature.clone(),
        wallet: envelope.wallet.clone(),
        slot: envelope.slot,
        reason: reason.into(),
        parser_path: parser_path.to_string(),
    })
}

fn unknown(envelope: &CanonicalEnvelope, parser_path: &str, reason: impl Into<String>) -> ParseDecision {
    ParseDecision::Unknown(UnknownDecision {
        signature: envelope.signature.clone(),
        wallet: envelope.wallet.clone(),
        slot: envelope.slot,
        reason: reason.into(),
        parser_path: parser_path.to_string(),
    })
}

fn build_state_map(states: &[ClusterMintState]) -> HashMap<String, ClusterMintState> {
    states
        .iter()
        .cloned()
        .map(|state| (state.mint.clone(), state))
        .collect()
}

fn is_relayer(envelope: &CanonicalEnvelope) -> bool {
    envelope
        .fee_payer
        .as_ref()
        .map(|fee_payer| fee_payer.to_lowercase() != envelope.wallet.to_lowercase())
        .unwrap_or(false)
}

fn native_base_mint(envelope: &CanonicalEnvelope) -> &'static str {
    if is_relayer(envelope) {
        WSOL
    } else {
        SOL_LITERAL
    }
}

fn native_like_amount_and_prebalance(
    mint: &str,
    state_map: &HashMap<String, ClusterMintState>,
    native_trade_delta_sol: f64,
    envelope: &CanonicalEnvelope,
) -> Option<(f64, f64)> {
    if !is_sol_like_mint(mint) {
        let state = state_map.get(mint)?;
        return Some((state.delta_amount.abs(), state.pre_amount));
    }

    if let Some(state) = state_map.get(WSOL) {
        return Some((state.delta_amount.abs(), state.pre_amount));
    }

    if native_trade_delta_sol.abs() > NATIVE_EPSILON {
        return Some((native_trade_delta_sol.abs(), 0.0));
    }

    if mint == native_base_mint(envelope) {
        return Some((0.0, 0.0));
    }

    None
}

fn tx_wide_mint_delta(envelope: &CanonicalEnvelope, mint: &str) -> Option<f64> {
    let mut pre_amount = 0.0;
    let mut post_amount = 0.0;
    let mut found = false;

    for balance in envelope.pre_token_balances.iter().filter(|balance| balance.mint == mint) {
        pre_amount += balance.ui_amount;
        found = true;
    }

    for balance in envelope.post_token_balances.iter().filter(|balance| balance.mint == mint) {
        post_amount += balance.ui_amount;
        found = true;
    }

    if !found {
        return None;
    }

    let delta = post_amount - pre_amount;
    if delta.abs() <= DELTA_EPSILON {
        None
    } else {
        Some(delta)
    }
}

fn max_positive_mint_delta(envelope: &CanonicalEnvelope, mint: &str) -> Option<f64> {
    let mut pre_by_account = HashMap::<usize, f64>::new();
    let mut post_by_account = HashMap::<usize, f64>::new();

    for balance in envelope.pre_token_balances.iter().filter(|balance| balance.mint == mint) {
        pre_by_account.insert(balance.account_index, balance.ui_amount);
    }

    for balance in envelope.post_token_balances.iter().filter(|balance| balance.mint == mint) {
        post_by_account.insert(balance.account_index, balance.ui_amount);
    }

    let mut max_positive = None::<f64>;
    for account_index in pre_by_account
        .keys()
        .chain(post_by_account.keys())
        .copied()
        .collect::<HashSet<_>>()
    {
        let pre_amount = *pre_by_account.get(&account_index).unwrap_or(&0.0);
        let post_amount = *post_by_account.get(&account_index).unwrap_or(&0.0);
        let delta = post_amount - pre_amount;
        if delta > DELTA_EPSILON {
            max_positive = Some(max_positive.map_or(delta, |current| current.max(delta)));
        }
    }

    max_positive
}

fn build_trade_from_candidate(
    envelope: &CanonicalEnvelope,
    candidate: &ProtocolTradeCandidate,
    state_map: &HashMap<String, ClusterMintState>,
    mint_decimals: &HashMap<String, u8>,
    native_trade_delta_sol: f64,
) -> Option<EngineTrade> {
    let timestamp = envelope.timestamp?;

    let native_base_mint = native_base_mint(envelope);
    let input_mint = if candidate.input_mint == SOL_LITERAL {
        native_base_mint.to_string()
    } else {
        candidate.input_mint.clone()
    };
    let mut output_mint = if candidate.output_mint == SOL_LITERAL {
        native_base_mint.to_string()
    } else {
        candidate.output_mint.clone()
    };

    let token_in_amount = if candidate.parser_path == "carbon_pump_swap_buy_exact_quote_in" {
        if is_relayer(envelope)
            && envelope
                .top_level_program_ids
                .iter()
                .any(|program_id| program_id == TOKEN_2022_PROGRAM_ID)
            && native_trade_delta_sol.abs() > NATIVE_EPSILON
        {
            native_trade_delta_sol.abs()
        } else if let Some(wsol_delta) = max_positive_mint_delta(envelope, WSOL) {
            wsol_delta
        } else if native_trade_delta_sol.abs() > NATIVE_EPSILON {
            native_trade_delta_sol.abs()
        } else {
            native_like_amount_and_prebalance(&input_mint, state_map, native_trade_delta_sol, envelope)?.0
        }
    } else if let Some(raw) = candidate.input_amount_raw {
        raw_amount_to_ui(raw, &input_mint, mint_decimals)?
    } else {
        native_like_amount_and_prebalance(&input_mint, state_map, native_trade_delta_sol, envelope)?.0
    };
    let mut token_out_amount = if let Some(raw) = candidate.output_amount_raw {
        raw_amount_to_ui(raw, &output_mint, mint_decimals)?
    } else {
        native_like_amount_and_prebalance(&output_mint, state_map, native_trade_delta_sol, envelope)?.0
    };

    if token_in_amount <= DELTA_EPSILON || token_out_amount <= DELTA_EPSILON {
        return None;
    }

    let input_is_base = is_base_mint(&input_mint);
    let output_is_base = is_base_mint(&output_mint);

    if !input_is_base && output_is_base {
        if let Some(wsol_delta) = tx_wide_mint_delta(envelope, WSOL) {
            if wsol_delta < -DELTA_EPSILON {
                output_mint = WSOL.to_string();
                token_out_amount = wsol_delta.abs();
            }
        }
    }

    let (trade_type, token_mint, token_amount, base_amount, base_mint_str) = if input_is_base && !output_is_base {
        (
            "buy".to_string(),
            output_mint.clone(),
            token_out_amount,
            token_in_amount,
            input_mint.clone(),
        )
    } else if !input_is_base && output_is_base {
        (
            "sell".to_string(),
            input_mint.clone(),
            token_in_amount,
            token_out_amount,
            output_mint.clone(),
        )
    } else if input_is_base && output_is_base {
        (
            "buy".to_string(),
            output_mint.clone(),
            token_out_amount,
            token_in_amount,
            input_mint.clone(),
        )
    } else {
        (
            "sell".to_string(),
            input_mint.clone(),
            token_in_amount,
            token_out_amount,
            output_mint.clone(),
        )
    };

    if let Some(wallet_delta) = wallet_mint_delta(envelope, &token_mint) {
        // Reject if wallet delta contradicts the trade direction
        if (trade_type == "buy" && wallet_delta < -DELTA_EPSILON)
            || (trade_type == "sell" && wallet_delta > DELTA_EPSILON)
        {
            return None;
        }
        // Reject if wallet's net position in the token is zero — this indicates
        // a round-trip arb where tokens route through the wallet but are not held.
        // The candidate decoded one leg of the arb, not a real wallet trade.
        if wallet_delta.abs() <= DELTA_EPSILON {
            return None;
        }
    } else {
        // wallet_mint_delta returned None — wallet has no matching token balance entries.
        // This can mean: (a) Token-2022 token not in standard balances, or
        // (b) round-trip arb where wallet's token account was ephemeral.
        //
        // Distinguish by checking if the token exists for OTHER accounts (known owners):
        // if it does, the wallet didn't hold it. Also check if the wallet spent SOL
        // (legitimate buy routes SOL through DEX → token comes back).
        let wallet_lower = envelope.wallet.to_lowercase();
        let token_held_by_others = envelope
            .pre_token_balances
            .iter()
            .chain(envelope.post_token_balances.iter())
            .filter(|b| b.mint == token_mint)
            .any(|b| {
                b.owner
                    .as_ref()
                    .map_or(false, |o| o.to_lowercase() != wallet_lower)
            });
        if token_held_by_others && !is_relayer(envelope) {
            // Token exists in standard balances for other accounts but not the wallet.
            // For non-relayer transactions, require SOL movement evidence:
            // legitimate buy routes SOL through DEX, round-trip arb barely moves SOL.
            // For relayer transactions, the relayer handles SOL on the wallet's behalf,
            // so lack of wallet SOL movement is expected — don't reject.
            let has_sol_evidence = wallet_effective_native_spend(envelope)
                .map_or(false, |spend| spend > NATIVE_EPSILON)
                || wallet_mint_delta(envelope, WSOL)
                    .map_or(false, |d| d.abs() > DELTA_EPSILON);
            if !has_sol_evidence {
                return None;
            }
        }
    }

    if candidate.parser_path == "carbon_pump_swap_buy_exact_quote_in" && !is_relayer(envelope) {
        if let Some(wallet_output_delta) = wallet_mint_delta(envelope, &token_mint) {
            if let Some(max_output_delta) = max_positive_mint_delta(envelope, &token_mint) {
                if max_output_delta > wallet_output_delta + DELTA_EPSILON
                    && wallet_effective_native_spend(envelope).is_none()
                {
                    return None;
                }
            }
        }
    }

    Some(EngineTrade {
        signature: envelope.signature.clone(),
        wallet: envelope.wallet.clone(),
        trade_type,
        token_mint,
        token_amount,
        base_amount,
        base_mint: base_mint_str,
        token_in_mint: input_mint.clone(),
        token_in_amount,
        token_in_pre_balance: 0.0,
        token_out_mint: output_mint.clone(),
        token_out_amount,
        timestamp,
        source: "YELLOWSTONE_CARBON".to_string(),
        gas: envelope.fee_lamports as f64 / 1_000_000_000.0,
        confidence: infer_confidence(&input_mint, &output_mint),
        parser_path: candidate.parser_path.clone(),
    })
}

fn token_delta_from_state(state: &ClusterMintState) -> TokenDelta {
    TokenDelta {
        mint: state.mint.clone(),
        pre_amount: state.pre_amount,
        post_amount: state.post_amount,
        delta_amount: state.delta_amount,
    }
}

fn choose_best_flow_pair(sent: &[TokenDelta], received: &[TokenDelta]) -> Option<(TokenDelta, TokenDelta)> {
    let mut candidates: Vec<(TokenDelta, TokenDelta, i32)> = Vec::new();

    for input in sent {
        for output in received {
            if input.mint == output.mint {
                continue;
            }

            let input_is_base = is_base_mint(&input.mint);
            let output_is_base = is_base_mint(&output.mint);
            let input_is_sol = is_sol_like_mint(&input.mint);
            let output_is_sol = is_sol_like_mint(&output.mint);

            let mut score = 0;
            if input_is_base != output_is_base {
                score += 20;
            }
            if input_is_base && !output_is_base {
                score += 12;
            }
            if !input_is_base && output_is_base {
                score += 12;
            }
            if (input_is_sol && !output_is_base) || (!input_is_base && output_is_sol) {
                score += 8;
            }
            if !input_is_base && !output_is_base {
                score -= 8;
            }
            if input_is_base && output_is_base {
                score -= 4;
            }
            score += (priority_rank(&output.mint) as i32) * -1;

            candidates.push((input.clone(), output.clone(), score));
        }
    }

    candidates.sort_by(|left, right| {
        right
            .2
            .cmp(&left.2)
            .then_with(|| compare_delta_priority(&left.0, &right.0))
            .then_with(|| compare_delta_priority(&right.1, &left.1))
    });

    candidates
        .into_iter()
        .next()
        .map(|(input, output, _)| (input, output))
}

fn build_trade_from_flows(
    envelope: &CanonicalEnvelope,
    parser_path: &str,
    sent: &[TokenDelta],
    received: &[TokenDelta],
) -> Option<EngineTrade> {
    let timestamp = envelope.timestamp?;
    let (input, output) = choose_best_flow_pair(sent, received)?;
    let input_is_base = is_base_mint(&input.mint);
    let output_is_base = is_base_mint(&output.mint);
    let mut input_mint = input.mint.clone();
    let mut input_amount = input.delta_amount.abs();
    let mut output_mint = output.mint.clone();
    let mut output_amount = output.delta_amount.abs();

    if input_is_base && !output_is_base {
        if parser_path == "instruction_flow_fallback" {
            // Use wallet-scoped WSOL delta (not tx-wide max) to correct the buy cost.
            // tx-wide max_positive_mint_delta picks up pool WSOL deltas from OTHER legs
            // in multi-hop arb transactions, inflating the buy cost.
            if let Some(wallet_wsol) = wallet_mint_delta(envelope, WSOL) {
                let wallet_wsol_abs = wallet_wsol.abs();
                if wallet_wsol_abs > input_amount + DELTA_EPSILON {
                    input_amount = wallet_wsol_abs;
                    if !envelope
                        .decoder_candidates
                        .iter()
                        .any(|candidate| candidate == "carbon-pumpfun-decoder")
                    {
                        input_mint = WSOL.to_string();
                    }
                }
            } else if input_mint == SOL_LITERAL {
                if let Some(native_spend) = wallet_effective_native_spend(envelope) {
                    if native_spend > input_amount + DELTA_EPSILON {
                        input_amount = native_spend;
                    }
                }
            }
        } else if input_mint == SOL_LITERAL {
            if let Some(native_spend) = wallet_effective_native_spend(envelope) {
                if native_spend > input_amount + DELTA_EPSILON {
                    input_amount = native_spend;
                }
            }
        }
    }

    if !input_is_base && output_is_base {
        if parser_path == "instruction_flow_fallback" {
            if let Some(wallet_wsol_delta) = wallet_mint_delta(envelope, WSOL) {
                if wallet_wsol_delta > DELTA_EPSILON {
                    output_mint = WSOL.to_string();
                    output_amount = wallet_wsol_delta;
                }
            } else if let Some(wsol_delta) = tx_wide_mint_delta(envelope, WSOL) {
                if wsol_delta < -DELTA_EPSILON {
                    output_mint = WSOL.to_string();
                    output_amount = wsol_delta.abs();
                }
            } else if let Some((wallet_base_mint, wallet_base_amount)) =
                wallet_positive_native_like_delta(envelope)
            {
                output_mint = wallet_base_mint;
                output_amount = wallet_base_amount;
            }
        } else if let Some(wsol_delta) = tx_wide_mint_delta(envelope, WSOL) {
            if wsol_delta < -DELTA_EPSILON {
                output_mint = WSOL.to_string();
                output_amount = wsol_delta.abs();
            }
        }
    }

    if parser_path == "instruction_flow_fallback" && input_is_base && output_is_base {
        return None;
    }

    let (trade_type, token_mint, token_amount, base_amount, base_mint_raw) = if input_is_base && !output_is_base {
        (
            "buy".to_string(),
            output_mint.clone(),
            output_amount,
            input_amount,
            input_mint.clone(),
        )
    } else if !input_is_base && output_is_base {
        (
            "sell".to_string(),
            input_mint.clone(),
            input_amount,
            output_amount,
            output_mint.clone(),
        )
    } else {
        (
            "sell".to_string(),
            input_mint.clone(),
            input_amount,
            output_amount,
            output_mint.clone(),
        )
    };

    // Normalize SOL-like base mints: instruction flows may use the WSOL address
    // ("So111...112") while the canonical output should use "SOL" for non-relayer
    // transactions and WSOL for relayer transactions.
    let base_mint_str = if is_sol_like_mint(&base_mint_raw) {
        native_base_mint(envelope).to_string()
    } else {
        base_mint_raw
    };

    if parser_path == "instruction_flow_fallback"
        && trade_type == "buy"
        && !trade_shape_supported(
            envelope,
            &trade_type,
            &token_mint,
            &input_mint,
            &output_mint,
            sent,
            received,
        )
    {
        if let Some(trade) =
            build_instruction_flow_net_sell_from_wallet_base(envelope, sent)
        {
            return Some(trade);
        }
    }

    if parser_path == "instruction_flow_fallback"
        && !trade_shape_supported(
            envelope,
            &trade_type,
            &token_mint,
            &input_mint,
            &output_mint,
            sent,
            received,
        )
    {
        return None;
    }

    Some(EngineTrade {
        signature: envelope.signature.clone(),
        wallet: envelope.wallet.clone(),
        trade_type,
        token_mint,
        token_amount,
        base_amount,
        base_mint: base_mint_str,
        token_in_mint: input_mint.clone(),
        token_in_amount: input_amount,
        token_in_pre_balance: {
            let _ = input.pre_amount;
            0.0
        },
        token_out_mint: output_mint.clone(),
        token_out_amount: output_amount,
        timestamp,
        source: "YELLOWSTONE_CARBON".to_string(),
        gas: envelope.fee_lamports as f64 / 1_000_000_000.0,
        confidence: infer_confidence(&input_mint, &output_mint),
        parser_path: parser_path.to_string(),
    })
}

fn build_authority_tiny_sell_from_direct_flows(
    envelope: &CanonicalEnvelope,
    sent: &[TokenDelta],
) -> Option<EngineTrade> {
    if is_relayer(envelope) {
        return None;
    }

    let (base_mint, base_amount) = wallet_positive_native_like_delta_tiny(envelope)?;
    if base_amount > DELTA_EPSILON {
        return None;
    }

    let input = sent
        .iter()
        .filter(|delta| !is_base_mint(&delta.mint) && delta.delta_amount.abs() > DELTA_EPSILON)
        .max_by(|left, right| compare_delta_priority(left, right))?;

    if wallet_mint_delta(envelope, &input.mint).is_some() {
        return None;
    }

    Some(EngineTrade {
        signature: envelope.signature.clone(),
        wallet: envelope.wallet.clone(),
        trade_type: "sell".to_string(),
        token_mint: input.mint.clone(),
        token_amount: input.delta_amount.abs(),
        base_amount,
        base_mint: base_mint.clone(),
        token_in_mint: input.mint.clone(),
        token_in_amount: input.delta_amount.abs(),
        token_in_pre_balance: 0.0,
        token_out_mint: base_mint,
        token_out_amount: base_amount,
        timestamp: envelope.timestamp?,
        source: "YELLOWSTONE_CARBON".to_string(),
        gas: envelope.fee_lamports as f64 / 1_000_000_000.0,
        confidence: TradeConfidence::High,
        parser_path: "instruction_flow_tiny_sell_fallback".to_string(),
    })
}

fn build_instruction_flow_net_sell_from_wallet_base(
    envelope: &CanonicalEnvelope,
    sent: &[TokenDelta],
) -> Option<EngineTrade> {
    let (base_mint, base_amount) = wallet_positive_native_like_delta(envelope)?;
    let input = sent
        .iter()
        .filter(|delta| !is_base_mint(&delta.mint) && delta.delta_amount.abs() > DELTA_EPSILON)
        .max_by(|left, right| compare_delta_priority(left, right))?;

    if let Some(wallet_delta) = wallet_mint_delta(envelope, &input.mint) {
        if wallet_delta > DELTA_EPSILON {
            return None;
        }
    }

    Some(EngineTrade {
        signature: envelope.signature.clone(),
        wallet: envelope.wallet.clone(),
        trade_type: "sell".to_string(),
        token_mint: input.mint.clone(),
        token_amount: input.delta_amount.abs(),
        base_amount,
        base_mint: base_mint.clone(),
        token_in_mint: input.mint.clone(),
        token_in_amount: input.delta_amount.abs(),
        token_in_pre_balance: 0.0,
        token_out_mint: base_mint,
        token_out_amount: base_amount,
        timestamp: envelope.timestamp?,
        source: "YELLOWSTONE_CARBON".to_string(),
        gas: envelope.fee_lamports as f64 / 1_000_000_000.0,
        confidence: TradeConfidence::High,
        parser_path: "instruction_flow_net_sell_fallback".to_string(),
    })
}

fn build_cluster_flow_deltas(
    envelope: &CanonicalEnvelope,
    states: &[ClusterMintState],
    native_trade_delta_sol: f64,
) -> (Vec<TokenDelta>, Vec<TokenDelta>) {
    let mut sent = Vec::new();
    let mut received = Vec::new();

    for state in states {
        if cluster_state_delta_significant(&state.mint, state.delta_amount) && state.delta_amount > 0.0 {
            received.push(token_delta_from_state(state));
        } else if cluster_state_delta_significant(&state.mint, state.delta_amount)
            && state.delta_amount < 0.0
        {
            sent.push(token_delta_from_state(state));
        }
    }

    let native_base_mint = native_base_mint(envelope).to_string();
    let explicit_sol_delta = states
        .iter()
        .find(|state| state.mint == WSOL)
        .map(|state| state.delta_amount)
        .unwrap_or_default();

    let has_non_base_received = received.iter().any(|delta| !is_base_mint(&delta.mint));
    let has_non_base_sent = sent.iter().any(|delta| !is_base_mint(&delta.mint));
    let has_base_sent = sent.iter().any(|delta| is_base_mint(&delta.mint));
    let has_base_received = received.iter().any(|delta| is_base_mint(&delta.mint));
    let has_native_sent = sent.iter().any(|delta| is_sol_like_mint(&delta.mint));
    let has_native_received = received.iter().any(|delta| is_sol_like_mint(&delta.mint));

    if !has_native_sent
        && !has_base_sent
        && explicit_sol_delta.abs() <= DELTA_EPSILON
        && has_non_base_received
        && native_trade_delta_sol < -NATIVE_EPSILON
    {
        sent.push(TokenDelta {
            mint: native_base_mint.clone(),
            pre_amount: 0.0,
            post_amount: 0.0,
            delta_amount: native_trade_delta_sol,
        });
    }

    if !has_native_received
        && !has_base_received
        && explicit_sol_delta.abs() <= DELTA_EPSILON
        && has_non_base_sent
        && native_trade_delta_sol > NATIVE_EPSILON
    {
        received.push(TokenDelta {
            mint: native_base_mint,
            pre_amount: 0.0,
            post_amount: 0.0,
            delta_amount: native_trade_delta_sol,
        });
    }

    if !has_base_received && has_non_base_sent {
        if let Some(tiny_base_received) = states
            .iter()
            .filter(|state| {
                is_base_mint(&state.mint)
                    && state.delta_amount > BASE_FLOW_EPSILON
                    && state.delta_amount <= DELTA_EPSILON
            })
            .max_by(|left, right| left.delta_amount.total_cmp(&right.delta_amount))
        {
            received.push(token_delta_from_state(tiny_base_received));
        }
    }

    sent.sort_by(compare_delta_priority);
    received.sort_by(compare_delta_priority);
    (sent, received)
}

fn has_swap_protocol_hint(envelope: &CanonicalEnvelope) -> bool {
    envelope
        .decoder_candidates
        .iter()
        .any(|candidate| SWAP_PROTOCOL_HINTS.contains(&candidate.as_str()))
}

fn has_custom_program_hint(envelope: &CanonicalEnvelope) -> bool {
    envelope
        .top_level_program_ids
        .iter()
        .any(|program_id| !INFRA_PROGRAM_IDS.contains(&program_id.as_str()))
}

impl TradeParser for CarbonYellowstoneParser {
    fn parse(&self, envelope: &CanonicalEnvelope) -> ParseDecision {
        let timestamp = match envelope.timestamp {
            Some(timestamp) => timestamp,
            None => return unknown(envelope, "carbon_cluster_parser", "missing block timestamp"),
        };

        let cluster = cluster_members(envelope);
        let wallet = wallet_members(envelope);
        let states = aggregate_cluster_token_states(
            &envelope.pre_token_balances,
            &envelope.post_token_balances,
            &cluster,
        );
        let wallet_states = aggregate_cluster_token_states(
            &envelope.pre_token_balances,
            &envelope.post_token_balances,
            &wallet,
        );
        let state_map = build_state_map(&states);
        let mint_decimals = build_mint_decimals_map(envelope);
        let native_cluster_delta_sol =
            cluster_native_delta_lamports(envelope, &cluster) as f64 / 1_000_000_000.0;
        let native_trade_delta_sol =
            native_cluster_delta_sol + (envelope.fee_lamports as f64 / 1_000_000_000.0);
        let native_wallet_delta_sol =
            cluster_native_delta_lamports(envelope, &wallet) as f64 / 1_000_000_000.0;
        let wallet_native_trade_delta_sol = if is_relayer(envelope) {
            native_wallet_delta_sol
        } else {
            native_wallet_delta_sol + (envelope.fee_lamports as f64 / 1_000_000_000.0)
        };
        let direct_instruction_flows = extract_direct_instruction_flows(envelope);
        let candidate_trade = extract_protocol_trade_candidates(envelope)
            .into_iter()
            .filter_map(|candidate| {
                build_trade_from_candidate(
                    envelope,
                    &candidate,
                    &state_map,
                    &mint_decimals,
                    native_trade_delta_sol,
                )
                .map(|trade| {
                    let score = protocol_trade_support_score(
                        envelope,
                        &trade,
                        &direct_instruction_flows.0,
                        &direct_instruction_flows.1,
                    );
                    let path_rank = protocol_trade_path_rank(&trade.parser_path);
                    (trade, score, path_rank)
                })
            })
            .max_by(|left, right| {
                left.1
                    .cmp(&right.1)
                    .then_with(|| left.2.cmp(&right.2))
            });
        let candidate_trade = candidate_trade.map(|(trade, _, _)| trade);

        if candidate_trade.is_none() && !has_swap_protocol_hint(envelope) && !has_custom_program_hint(envelope) {
            return no_trade(
                envelope,
                "carbon_cluster_parser",
                "no recognized swap or custom program hint for cluster fallback",
            );
        }

        if let Some(trade) = build_trade_from_flows(
            envelope,
            "instruction_flow_fallback",
            &direct_instruction_flows.0,
            &direct_instruction_flows.1,
        ) {
            if trade.trade_type == "buy" {
                if let Some(candidate_trade) = candidate_trade.as_ref() {
                    if candidate_trade.trade_type == "buy" {
                        return ParseDecision::Trade(candidate_trade.clone());
                    }
                }
            }
            if trade.timestamp != timestamp {
                return unknown(envelope, "instruction_flow_fallback", "timestamp mismatch");
            }
            return ParseDecision::Trade(trade);
        }

        if candidate_trade.is_none() {
            if let Some(trade) = build_authority_tiny_sell_from_direct_flows(
                envelope,
                &direct_instruction_flows.0,
            ) {
                return ParseDecision::Trade(trade);
            }
        }

        if let Some(trade) = candidate_trade {
            // Check whether the wallet's on-chain token balance supports the
            // trade direction.  Three cases:
            //   1. wallet_mint_delta returns Some(delta) that matches direction → accept
            //   2. wallet_mint_delta returns Some(delta) near zero or wrong direction → reject
            //      (routing intermediary: tokens pass through wallet via CPI, net = 0)
            //   3. wallet_mint_delta returns None (wallet absent from token balances) → accept
            //      (relayer/CPI pattern: another program owns the token account)
            let dominated_by_balance = if !is_base_mint(&trade.token_mint) {
                match wallet_mint_delta(envelope, &trade.token_mint) {
                    Some(delta) => match trade.trade_type.as_str() {
                        "buy" if delta < DELTA_EPSILON => true,
                        "sell" if delta > -DELTA_EPSILON => true,
                        _ => false,
                    },
                    None => false, // wallet not in balances — don't reject
                }
            } else {
                false
            };
            if !dominated_by_balance {
                return ParseDecision::Trade(trade);
            }
        }

        let (wallet_sent, wallet_received) =
            build_cluster_flow_deltas(envelope, &wallet_states, wallet_native_trade_delta_sol);
        if let Some(trade) = build_trade_from_flows(
            envelope,
            "wallet_net_fallback",
            &wallet_sent,
            &wallet_received,
        ) {
            if trade.timestamp != timestamp {
                return unknown(envelope, "wallet_net_fallback", "timestamp mismatch");
            }
            return ParseDecision::Trade(trade);
        }

        let (sent, received) = build_cluster_flow_deltas(envelope, &states, native_trade_delta_sol);
        if sent.is_empty() && received.is_empty() {
            return no_trade(envelope, "carbon_cluster_parser", "no cluster token or native delta");
        }

        if let Some(trade) =
            build_trade_from_flows(envelope, "cluster_net_fallback", &sent, &received)
        {
            if trade.timestamp != timestamp {
                return unknown(envelope, "cluster_net_fallback", "timestamp mismatch");
            }
            return ParseDecision::Trade(trade);
        }

        no_trade(
            envelope,
            "carbon_cluster_parser",
            "cluster deltas did not resolve to a supported trade shape",
        )
    }
}
