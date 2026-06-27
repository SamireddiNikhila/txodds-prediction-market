use anchor_lang::prelude::*;
use crate::state::*;
use crate::constants::*;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(match_id: String)]
pub struct ClaimWinnings<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED.as_bytes(), match_id.as_bytes()],
        bump = market.bump
    )]
    pub market: Account<'info, MarketState>,

    /// CHECK: vault holds SOL escrow
    #[account(
        mut,
        seeds = [VAULT_SEED.as_bytes(), match_id.as_bytes()],
        bump = market.vault_bump
    )]
    pub vault: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [BET_SEED.as_bytes(), market.key().as_ref(), user.key().as_ref()],
        bump = user_bet.bump,
        has_one = user
    )]
    pub user_bet: Account<'info, UserBet>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn claim_winnings_handler(
    ctx: Context<ClaimWinnings>,
    match_id: String,
) -> Result<()> {
    let market = &ctx.accounts.market;
    let user_bet = &mut ctx.accounts.user_bet;

    require!(market.status == MarketStatus::Resolved, ErrorCode::MarketNotResolved);
    require!(user_bet.side == market.outcome, ErrorCode::NotAWinner);
    require!(!user_bet.claimed, ErrorCode::AlreadyClaimed);

    // winning pool size
    let winning_pool = match market.outcome {
        Outcome::Home => market.home_pool,
        Outcome::Draw => market.draw_pool,
        Outcome::Away => market.away_pool,
        Outcome::Unresolved => unreachable!(),
    };

    // proportional payout: (user_bet / winning_pool) * total_pool
    let payout = (user_bet.amount as u128)
        .checked_mul(market.total_pool as u128)
        .unwrap()
        .checked_div(winning_pool as u128)
        .unwrap() as u64;

    user_bet.claimed = true;

    // transfer SOL from vault PDA to user
    let match_id_bytes = match_id.as_bytes();
    let vault_bump = market.vault_bump;
    let seeds = &[
        VAULT_SEED.as_bytes(),
        match_id_bytes,
        &[vault_bump],
    ];
    let signer_seeds = &[&seeds[..]];

    anchor_lang::solana_program::program::invoke_signed(
        &anchor_lang::solana_program::system_instruction::transfer(
            ctx.accounts.vault.key,
            ctx.accounts.user.key,
            payout,
        ),
        &[
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.user.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    msg!("Claimed {} lamports for match {}", payout, match_id);
    Ok(())
}
