use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("66JmdAQSiB4BH6feb88kK9sU3n2fNM91QxGjYd99E3A6");

// Jupiter V6 Program ID (Mocked to Memo v1 Program for Devnet)
pub const JUPITER_PROGRAM_ID: Pubkey = pubkey!("Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo");

// Platform Fee Wallet (Replace with actual address in production)
pub const PLATFORM_FEE_WALLET: Pubkey = pubkey!("11111111111111111111111111111111"); 

#[program]
pub mod stellalpha_vault {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>, authority: Pubkey) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.owner = ctx.accounts.owner.key();
        vault.authority = authority;
        vault.bump = ctx.bumps.vault;
        vault.is_paused = false;
        vault.trade_amount_lamports = 0;
        msg!("Vault initialized for owner: {}", vault.owner);
        Ok(())
    }

    pub fn toggle_pause(ctx: Context<TogglePause>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.is_paused = !vault.is_paused;
        msg!("Vault pause state toggled to: {}", vault.is_paused);
        Ok(())
    }

    pub fn deposit_sol(ctx: Context<DepositSol>, amount: u64) -> Result<()> {
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.owner.key(),
            &ctx.accounts.vault.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;
        msg!("Deposited {} lamports to vault", amount);
        Ok(())
    }

    pub fn withdraw_sol(ctx: Context<WithdrawSol>, amount: u64) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        let owner = &mut ctx.accounts.owner;
        
        require!(vault.owner == owner.key(), ErrorCode::Unauthorized);

        **vault.to_account_info().try_borrow_mut_lamports()? -= amount;
        **owner.to_account_info().try_borrow_mut_lamports()? += amount;

        msg!("Withdrew {} lamports from vault", amount);
        Ok(())
    }

    pub fn deposit_token(ctx: Context<DepositToken>, amount: u64) -> Result<()> {
        let cpi_accounts = Transfer {
            from: ctx.accounts.owner_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;
        msg!("Deposited {} tokens to vault", amount);
        Ok(())
    }

    pub fn withdraw_token(ctx: Context<WithdrawToken>, amount: u64) -> Result<()> {
        let vault = &ctx.accounts.vault;
        let seeds = &[
            b"user_vault",
            vault.owner.as_ref(),
            &[vault.bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.owner_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, amount)?;
        msg!("Withdrew {} tokens from vault", amount);
        Ok(())
    }

    pub fn execute_swap(ctx: Context<ExecuteSwap>, amount_in: u64, jupiter_data: Vec<u8>) -> Result<()> {
        let vault = &ctx.accounts.vault;
        require!(!vault.is_paused, ErrorCode::Paused);
        require!(vault.authority == ctx.accounts.authority.key(), ErrorCode::Unauthorized);

        // 1. Deduct Platform Fee (0.1%)
        let fee_amount = amount_in.checked_mul(10).unwrap().checked_div(10000).unwrap(); // 10 bps
        
        if fee_amount > 0 {
            let seeds = &[
                b"user_vault",
                vault.owner.as_ref(),
                &[vault.bump],
            ];
            let signer = &[&seeds[..]];

            let cpi_accounts = Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.platform_fee_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
            token::transfer(cpi_ctx, fee_amount)?;
            msg!("Deducted platform fee: {}", fee_amount);
        }

        // 2. Execute Jupiter Swap via CPI
        // We need to construct the instruction manually as we don't have the IDL
        let jupiter_program = &ctx.accounts.jupiter_program;
        let remaining_accounts = ctx.remaining_accounts;

        let mut accounts = vec![];
        for acc in remaining_accounts {
            accounts.push(if acc.is_writable {
                AccountMeta::new(acc.key(), acc.is_signer)
            } else {
                AccountMeta::new_readonly(acc.key(), acc.is_signer)
            });
        }

        let ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: jupiter_program.key(),
            accounts,
            data: jupiter_data,
        };

        let seeds = &[
            b"user_vault",
            vault.owner.as_ref(),
            &[vault.bump],
        ];
        let signer = &[&seeds[..]];

        // Invoke signed
        anchor_lang::solana_program::program::invoke_signed(
            &ix,
            remaining_accounts,
            signer,
        )?;

        msg!("Executed Jupiter Swap (CPI)");
        Ok(())
    }
}

#[account]
pub struct UserVault {
    pub owner: Pubkey,
    pub authority: Pubkey,
    pub bump: u8,
    pub is_paused: bool,
    pub trade_amount_lamports: u64,
}

impl UserVault {
    pub const LEN: usize = 8 + 32 + 32 + 1 + 1 + 8;
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        seeds = [b"user_vault", owner.key().as_ref()],
        bump,
        payer = owner,
        space = UserVault::LEN
    )]
    pub vault: Account<'info, UserVault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TogglePause<'info> {
    #[account(
        mut,
        has_one = authority @ ErrorCode::Unauthorized
    )]
    pub vault: Account<'info, UserVault>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct DepositSol<'info> {
    #[account(mut)]
    pub vault: Account<'info, UserVault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawSol<'info> {
    #[account(
        mut,
        has_one = owner @ ErrorCode::Unauthorized,
        seeds = [b"user_vault", owner.key().as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, UserVault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositToken<'info> {
    #[account(
        has_one = owner @ ErrorCode::Unauthorized
    )]
    pub vault: Account<'info, UserVault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawToken<'info> {
    #[account(
        has_one = owner @ ErrorCode::Unauthorized,
        seeds = [b"user_vault", owner.key().as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, UserVault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub owner_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ExecuteSwap<'info> {
    #[account(
        has_one = authority @ ErrorCode::Unauthorized,
        seeds = [b"user_vault", vault.owner.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, UserVault>,
    pub authority: Signer<'info>,
    
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub platform_fee_account: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    
    /// CHECK: Jupiter Program ID checked in instruction
    #[account(address = JUPITER_PROGRAM_ID)]
    pub jupiter_program: AccountInfo<'info>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("You are not authorized to perform this action.")]
    Unauthorized,
    #[msg("The vault is currently paused.")]
    Paused,
}
