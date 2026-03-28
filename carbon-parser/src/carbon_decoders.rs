use crate::constants::SOL_LITERAL;
use crate::domain::{CanonicalEnvelope, CanonicalInstruction};
use carbon_core::deserialize::ArrangeAccounts;
use carbon_core::instruction::InstructionDecoder;
use carbon_pump_swap_decoder::instructions::{
    buy::Buy as PumpSwapBuy, buy_exact_quote_in::BuyExactQuoteIn, sell::Sell as PumpSwapSell,
    PumpSwapInstruction,
};
use carbon_pump_swap_decoder::PumpSwapDecoder;
use carbon_pumpfun_decoder::instructions::{
    buy::Buy as PumpfunBuy, sell::Sell as PumpfunSell, PumpfunInstruction,
};
use carbon_pumpfun_decoder::PumpfunDecoder;
use solana_instruction::{AccountMeta, Instruction};
use solana_pubkey::Pubkey;

const PUMPFUN_PROGRAM_ID: &str = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const PUMP_SWAP_PROGRAM_ID: &str = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";

#[derive(Debug, Clone)]
pub struct ProtocolTradeCandidate {
    pub input_mint: String,
    pub output_mint: String,
    pub input_amount_raw: Option<u64>,
    pub output_amount_raw: Option<u64>,
    pub parser_path: String,
}

fn parse_pubkey(pubkey: &str) -> Option<Pubkey> {
    pubkey.parse().ok()
}

fn to_instruction(instruction: &CanonicalInstruction) -> Option<Instruction> {
    let program_id = parse_pubkey(&instruction.program_id)?;
    let mut accounts = Vec::with_capacity(instruction.accounts.len());

    for account in &instruction.accounts {
        accounts.push(AccountMeta {
            pubkey: parse_pubkey(&account.pubkey)?,
            is_signer: account.is_signer,
            is_writable: account.is_writable,
        });
    }

    Some(Instruction {
        program_id,
        accounts,
        data: instruction.data.clone(),
    })
}

fn decode_pumpfun_instruction(instruction: &CanonicalInstruction) -> Option<ProtocolTradeCandidate> {
    if instruction.program_id != PUMPFUN_PROGRAM_ID {
        return None;
    }

    let instruction = to_instruction(instruction)?;
    let decoder = PumpfunDecoder;
    let decoded = decoder.decode_instruction(&instruction)?;

    match &decoded.data {
        PumpfunInstruction::Buy(data) => {
            let arranged = PumpfunBuy::arrange_accounts(&decoded.accounts)?;
            Some(ProtocolTradeCandidate {
                input_mint: SOL_LITERAL.to_string(),
                output_mint: arranged.mint.to_string(),
                input_amount_raw: None,
                output_amount_raw: Some(data.amount),
                parser_path: "carbon_pumpfun_buy".to_string(),
            })
        }
        PumpfunInstruction::Sell(data) => {
            let arranged = PumpfunSell::arrange_accounts(&decoded.accounts)?;
            Some(ProtocolTradeCandidate {
                input_mint: arranged.mint.to_string(),
                output_mint: SOL_LITERAL.to_string(),
                input_amount_raw: Some(data.amount),
                output_amount_raw: None,
                parser_path: "carbon_pumpfun_sell".to_string(),
            })
        }
        _ => None,
    }
}

fn decode_pump_swap_instruction(
    instruction: &CanonicalInstruction,
) -> Option<ProtocolTradeCandidate> {
    if instruction.program_id != PUMP_SWAP_PROGRAM_ID {
        return None;
    }

    let instruction = to_instruction(instruction)?;
    let decoder = PumpSwapDecoder;
    let decoded = decoder.decode_instruction(&instruction)?;

    match &decoded.data {
        PumpSwapInstruction::Buy(data) => {
            let arranged = PumpSwapBuy::arrange_accounts(&decoded.accounts)?;
            Some(ProtocolTradeCandidate {
                input_mint: arranged.quote_mint.to_string(),
                output_mint: arranged.base_mint.to_string(),
                input_amount_raw: None,
                output_amount_raw: Some(data.base_amount_out),
                parser_path: "carbon_pump_swap_buy".to_string(),
            })
        }
        PumpSwapInstruction::BuyExactQuoteIn(data) => {
            let arranged = BuyExactQuoteIn::arrange_accounts(&decoded.accounts)?;
            Some(ProtocolTradeCandidate {
                input_mint: arranged.quote_mint.to_string(),
                output_mint: arranged.base_mint.to_string(),
                input_amount_raw: Some(data.spendable_quote_in),
                output_amount_raw: None,
                parser_path: "carbon_pump_swap_buy_exact_quote_in".to_string(),
            })
        }
        PumpSwapInstruction::Sell(data) => {
            let arranged = PumpSwapSell::arrange_accounts(&decoded.accounts)?;
            Some(ProtocolTradeCandidate {
                input_mint: arranged.base_mint.to_string(),
                output_mint: arranged.quote_mint.to_string(),
                input_amount_raw: Some(data.base_amount_in),
                output_amount_raw: None,
                parser_path: "carbon_pump_swap_sell".to_string(),
            })
        }
        _ => None,
    }
}

pub fn extract_protocol_trade_candidates(
    envelope: &CanonicalEnvelope,
) -> Vec<ProtocolTradeCandidate> {
    let mut candidates = Vec::new();

    for instruction in envelope
        .top_level_instructions
        .iter()
        .chain(envelope.inner_instructions.iter())
    {
        if let Some(candidate) = decode_pumpfun_instruction(instruction) {
            candidates.push(candidate);
        }

        if let Some(candidate) = decode_pump_swap_instruction(instruction) {
            candidates.push(candidate);
        }
    }

    candidates
}
