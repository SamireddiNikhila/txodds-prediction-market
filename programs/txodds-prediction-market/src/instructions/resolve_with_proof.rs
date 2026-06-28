use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::Instruction;
use anchor_lang::solana_program::program::invoke;
use crate::state::*;
use crate::constants::*;
use crate::error::ErrorCode;

// TxLINE program ID (devnet)
pub const TXLINE_PROGRAM_ID: &str = "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J";

// discriminator for validate_stat instruction
pub const VALIDATE_STAT_DISCRIMINATOR: [u8; 8] = [107, 197, 232, 90, 191, 136, 105, 185];

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ProofNode {
    pub hash: [u8; 32],
    pub is_right_sibling: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ScoresUpdateStats {
    pub update_count: i32,
    pub min_timestamp: i64,
    pub max_timestamp: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ScoresBatchSummary {
    pub fixture_id: i64,
    pub update_stats: ScoresUpdateStats,
    pub events_sub_tree_root: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ScoreStat {
    pub key: u32,
    pub value: i32,
    pub period: i32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct StatTerm {
    pub stat_to_prove: ScoreStat,
    pub event_stat_root: [u8; 32],
    pub stat_proof: Vec<ProofNode>,
}

#[derive(Accounts)]
#[instruction(match_id: String)]
pub struct ResolveWithProof<'info> {
    #[account(
        mut,
        seeds = [MARKET_SEED.as_bytes(), match_id.as_bytes()],
        bump = market.bump,
        has_one = authority
    )]
    pub market: Account<'info, MarketState>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: TxLINE daily scores merkle roots account
    pub daily_scores_merkle_roots: UncheckedAccount<'info>,

    /// CHECK: TxLINE program
    pub txline_program: UncheckedAccount<'info>,
}

pub fn resolve_with_proof_handler(
    ctx: Context<ResolveWithProof>,
    match_id: String,
    ts: i64,
    fixture_summary: ScoresBatchSummary,
    fixture_proof: Vec<ProofNode>,
    main_tree_proof: Vec<ProofNode>,
    home_stat: StatTerm,
    away_stat: StatTerm,
) -> Result<()> {
    let market = &mut ctx.accounts.market;

    require!(market.status != MarketStatus::Resolved, ErrorCode::AlreadyResolved);

    // verify txline program is correct
    let txline_key = ctx.accounts.txline_program.key().to_string();
    require!(
        txline_key == TXLINE_PROGRAM_ID,
        ErrorCode::Unauthorized
    );

    // build validate_stat instruction data for home > away (home win check)
    // predicate: home_goals - away_goals > 0
    let home_win_result = call_validate_stat(
        &ctx.accounts.txline_program,
        &ctx.accounts.daily_scores_merkle_roots,
        ts,
        &fixture_summary,
        &fixture_proof,
        &main_tree_proof,
        &home_stat,
        Some(&away_stat),
        true, // home - away > 0
    )?;

    let outcome = if home_win_result {
        msg!("TxLINE verified: HOME WIN");
        Outcome::Home
    } else {
        // check away > home
        let away_win_result = call_validate_stat(
            &ctx.accounts.txline_program,
            &ctx.accounts.daily_scores_merkle_roots,
            ts,
            &fixture_summary,
            &fixture_proof,
            &main_tree_proof,
            &away_stat,
            Some(&home_stat),
            true, // away - home > 0
        )?;

        if away_win_result {
            msg!("TxLINE verified: AWAY WIN");
            Outcome::Away
        } else {
            msg!("TxLINE verified: DRAW");
            Outcome::Draw
        }
    };

    market.outcome = outcome;
    market.status = MarketStatus::Resolved;
    market.resolved_at = Clock::get()?.unix_timestamp;

    msg!("Market {} resolved trustlessly via TxLINE merkle proof", match_id);
    Ok(())
}

fn call_validate_stat<'info>(
    txline_program: &UncheckedAccount<'info>,
    daily_scores: &UncheckedAccount<'info>,
    ts: i64,
    fixture_summary: &ScoresBatchSummary,
    fixture_proof: &Vec<ProofNode>,
    main_tree_proof: &Vec<ProofNode>,
    stat_a: &StatTerm,
    stat_b: Option<&StatTerm>,
    greater_than: bool,
) -> Result<bool> {
    // serialize instruction data
    let mut data = VALIDATE_STAT_DISCRIMINATOR.to_vec();

    // ts: i64
    data.extend_from_slice(&ts.to_le_bytes());

    // fixture_summary
    fixture_summary.serialize(&mut data).unwrap();

    // fixture_proof
    fixture_proof.serialize(&mut data).unwrap();

    // main_tree_proof
    main_tree_proof.serialize(&mut data).unwrap();

    // predicate: TraderPredicate { threshold: 0, comparison: GreaterThan {} }
    0i32.serialize(&mut data).unwrap(); // threshold
    if greater_than {
        data.push(0); // GreaterThan variant = 0
    } else {
        data.push(2); // EqualTo variant = 2
    }

    // stat_a
    stat_a.serialize(&mut data).unwrap();

    // stat_b (Option<StatTerm>)
    match stat_b {
        Some(s) => {
            data.push(1); // Some
            s.serialize(&mut data).unwrap();
        }
        None => {
            data.push(0); // None
        }
    }

    // op: Option<BinaryExpression> - Subtract
    data.push(1); // Some
    data.push(1); // Subtract variant = 1

    let ix = Instruction {
        program_id: txline_program.key(),
        accounts: vec![
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                daily_scores.key(),
                false,
            ),
        ],
        data,
    };

    // invoke and capture return value
    // validate_stat is a view function - returns bool via return data
    invoke(
        &ix,
        &[
            daily_scores.to_account_info(),
            txline_program.to_account_info(),
        ],
    )?;

    // read return data from program
    if let Some((program_id, return_data)) = anchor_lang::solana_program::program::get_return_data() {
        if program_id == txline_program.key() && !return_data.is_empty() {
            return Ok(return_data[0] == 1);
        }
    }

    Ok(false)
}
