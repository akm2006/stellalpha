pub const SOL_LITERAL: &str = "SOL";
pub const WSOL: &str = "So11111111111111111111111111111111111111112";
pub const USDC: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
pub const USDT: &str = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
pub const USD1: &str = "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB";

pub fn is_base_mint(mint: &str) -> bool {
    matches!(mint, WSOL | USDC | USDT | USD1 | SOL_LITERAL)
}

pub fn is_stable_mint(mint: &str) -> bool {
    matches!(mint, USDC | USDT | USD1)
}

pub fn is_sol_like_mint(mint: &str) -> bool {
    matches!(mint, WSOL | SOL_LITERAL)
}

pub fn priority_rank(mint: &str) -> usize {
    match mint {
        WSOL => 0,
        USDC => 1,
        USDT => 2,
        USD1 => 3,
        _ => 10,
    }
}

