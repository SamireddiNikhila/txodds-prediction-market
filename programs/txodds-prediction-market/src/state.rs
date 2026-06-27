use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum Outcome {
    Home,
    Draw,
    Away,
    Unresolved,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum MarketStatus {
    Open,
    Closed,
    Resolved,
}

#[account]
pub struct MarketState {
    pub authority: Pubkey,       // admin who created + resolves
    pub match_id: String,        // TxODDS match ID
    pub home_team: String,
    pub away_team: String,
    pub total_pool: u64,         // total SOL in lamports
    pub home_pool: u64,
    pub draw_pool: u64,
    pub away_pool: u64,
    pub outcome: Outcome,
    pub status: MarketStatus,
    pub created_at: i64,
    pub resolved_at: i64,
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
pub struct UserBet {
    pub user: Pubkey,
    pub market: Pubkey,
    pub side: Outcome,
    pub amount: u64,             // lamports
    pub claimed: bool,
    pub bump: u8,
}

impl MarketState {
    pub const LEN: usize = 8    // discriminator
        + 32                    // authority
        + 4 + 32                // match_id (max 32 chars)
        + 4 + 32                // home_team
        + 4 + 32                // away_team
        + 8                     // total_pool
        + 8                     // home_pool
        + 8                     // draw_pool
        + 8                     // away_pool
        + 1                     // outcome enum
        + 1                     // status enum
        + 8                     // created_at
        + 8                     // resolved_at
        + 1                     // bump
        + 1;                    // vault_bump
}

impl UserBet {
    pub const LEN: usize = 8    // discriminator
        + 32                    // user
        + 32                    // market
        + 1                     // side enum
        + 8                     // amount
        + 1                     // claimed
        + 1;                    // bump
}
