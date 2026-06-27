use anchor_lang::prelude::*;
use crate::state::*;
use crate::constants::*;
use crate::error::ErrorCode;

#[derive(Accounts)]
#[instruction(match_id: String)]
pub struct ResolveMarket<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED.as_bytes(), match_id.as_bytes()],
        bump = market.bump,
        has_one = authority
    )]
    pub market: Account<'info, MarketState>,

    #[account(mut)]
    pub authority: Signer<'info>,
}

pub fn resolve_market_handler(
    ctx: Context<ResolveMarket>,
    _match_id: String,
    outcome: Outcome,
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;

    require!(market.status != MarketStatus::Resolved, ErrorCode::AlreadyResolved);
    require!(outcome != Outcome::Unresolved, ErrorCode::Unauthorized);

    market.outcome = outcome;
    market.status = MarketStatus::Resolved;
    market.resolved_at = clock.unix_timestamp;

    msg!("Market resolved for match: {}", market.match_id);
    Ok(())
}
