use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::*;
use crate::constants::*;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(match_id: String)]
pub struct PlaceBet<'info> {
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
        init,
        payer = user,
        space = UserBet::LEN,
        seeds = [BET_SEED.as_bytes(), market.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_bet: Account<'info, UserBet>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn place_bet_handler(
    ctx: Context<PlaceBet>,
    match_id: String,
    side: Outcome,
    amount: u64,
) -> Result<()> {
    let market = &mut ctx.accounts.market;

    require!(market.status == MarketStatus::Open, ErrorCode::MarketNotOpen);
    require!(amount >= MIN_BET, ErrorCode::BetTooSmall);

    // transfer SOL from user to vault via raw invoke
    anchor_lang::solana_program::program::invoke(
        &anchor_lang::solana_program::system_instruction::transfer(
            ctx.accounts.user.key,
            ctx.accounts.vault.key,
            amount,
        ),
        &[
            ctx.accounts.user.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
    )?;

    // update pool totals
    market.total_pool += amount;
    match side {
        Outcome::Home => market.home_pool += amount,
        Outcome::Draw => market.draw_pool += amount,
        Outcome::Away => market.away_pool += amount,
        Outcome::Unresolved => unreachable!(),
    }

    // record user bet
    let user_bet = &mut ctx.accounts.user_bet;
    user_bet.user = ctx.accounts.user.key();
    user_bet.market = market.key();
    user_bet.side = side;
    user_bet.amount = amount;
    user_bet.claimed = false;
    user_bet.bump = ctx.bumps.user_bet;

    msg!("Bet placed: {} lamports on match {}", amount, match_id);
    Ok(())
}
