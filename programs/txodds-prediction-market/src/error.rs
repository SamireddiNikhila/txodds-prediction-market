use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Market is not open for betting")]
    MarketNotOpen,
    #[msg("Market is not resolved yet")]
    MarketNotResolved,
    #[msg("Bet amount below minimum")]
    BetTooSmall,
    #[msg("You did not win this market")]
    NotAWinner,
    #[msg("Winnings already claimed")]
    AlreadyClaimed,
    #[msg("Unauthorized: not the market authority")]
    Unauthorized,
    #[msg("Market already resolved")]
    AlreadyResolved,
}
