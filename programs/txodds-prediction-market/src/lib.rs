pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;
pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("2AEnPyT7dpi9jiDKjj767TGZdHZq7iUemmzDoL27Vjtx");

#[program]
pub mod txodds_prediction_market {
    use super::*;

    pub fn create_market(
        ctx: Context<CreateMarket>,
        match_id: String,
        home_team: String,
        away_team: String,
    ) -> Result<()> {
        create_market_handler(ctx, match_id, home_team, away_team)
    }

    pub fn place_bet(
        ctx: Context<PlaceBet>,
        match_id: String,
        side: Outcome,
        amount: u64,
    ) -> Result<()> {
        place_bet_handler(ctx, match_id, side, amount)
    }

    pub fn resolve_market(
        ctx: Context<ResolveMarket>,
        match_id: String,
        outcome: Outcome,
    ) -> Result<()> {
        resolve_market_handler(ctx, match_id, outcome)
    }

    pub fn claim_winnings(
        ctx: Context<ClaimWinnings>,
        match_id: String,
    ) -> Result<()> {
        claim_winnings_handler(ctx, match_id)
    }

    pub fn resolve_with_proof(
        ctx: Context<ResolveWithProof>,
        match_id: String,
        ts: i64,
        fixture_summary: ScoresBatchSummary,
        fixture_proof: Vec<ProofNode>,
        main_tree_proof: Vec<ProofNode>,
        home_stat: StatTerm,
        away_stat: StatTerm,
    ) -> Result<()> {
        resolve_with_proof_handler(
            ctx, match_id, ts,
            fixture_summary, fixture_proof, main_tree_proof,
            home_stat, away_stat
        )
    }
}
