use anchor_lang::prelude::*;
use crate::state::*;
use crate::constants::*;

#[derive(Accounts)]
#[instruction(match_id: String)]
pub struct CreateMarket<'info> {
    #[account(
        init,
        payer = authority,
        space = MarketState::LEN,
        seeds = [MARKET_SEED.as_bytes(), match_id.as_bytes()],
        bump
    )]
    pub market: Account<'info, MarketState>,

    /// CHECK: vault is a raw SOL escrow PDA, no data
    #[account(
        mut,
        seeds = [VAULT_SEED.as_bytes(), match_id.as_bytes()],
        bump
    )]
    pub vault: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn create_market_handler(
    ctx: Context<CreateMarket>,
    match_id: String,
    home_team: String,
    away_team: String,
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;

    market.authority = ctx.accounts.authority.key();
    market.match_id = match_id;
    market.home_team = home_team;
    market.away_team = away_team;
    market.total_pool = 0;
    market.home_pool = 0;
    market.draw_pool = 0;
    market.away_pool = 0;
    market.outcome = Outcome::Unresolved;
    market.status = MarketStatus::Open;
    market.created_at = clock.unix_timestamp;
    market.resolved_at = 0;
    market.bump = ctx.bumps.market;
    market.vault_bump = ctx.bumps.vault;

    msg!("Market created for match: {}", market.match_id);
    Ok(())
}
