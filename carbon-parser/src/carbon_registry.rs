use std::collections::BTreeSet;

fn carbon_decoder_for_program(program_id: &str) -> Option<&'static str> {
    match program_id {
        "11111111111111111111111111111111" => Some("carbon-system-program-decoder"),
        "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL" => {
            Some("carbon-associated-token-account-decoder")
        }
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" => Some("carbon-token-program-decoder"),
        "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" => Some("carbon-token-2022-decoder"),
        "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P" => Some("carbon-pumpfun-decoder"),
        "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA" => Some("carbon-pump-swap-decoder"),
        "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ" => Some("carbon-pump-fees-decoder"),
        "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG" => Some("carbon-meteora-damm-v2-decoder"),
        "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN" => Some("carbon-meteora-dbc-decoder"),
        "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo" => Some("carbon-meteora-dlmm-decoder"),
        "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc" => Some("carbon-orca-whirlpool-decoder"),
        "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4" => Some("carbon-jupiter-swap-decoder"),
        "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C" => Some("carbon-raydium-cpmm-decoder"),
        _ => None,
    }
}

pub fn decoder_candidates(program_ids: &[String]) -> Vec<String> {
    let mut decoders = BTreeSet::new();

    for program_id in program_ids {
        if let Some(decoder) = carbon_decoder_for_program(program_id) {
            decoders.insert(decoder.to_string());
        }
    }

    decoders.into_iter().collect()
}
