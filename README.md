# TxODDS Prediction Market

A decentralized World Cup 2026 prediction market built on Solana, powered by TxODDS live match data.

##  Hackathon

Built for the [TxODDS World Cup Hackathon](https://superteam.fun/earn/listing/prediction-markets-and-settlement) on Superteam Earn — Prediction Markets track ($18,000 USD prize pool).

## 🔗 Deployed Program

- **Program ID:** `2AEnPyT7dpi9jiDKjj767TGZdHZq7iUemmzDoL27Vjtx`
- **Network:** Solana Devnet
- **Explorer:** https://explorer.solana.com/address/2AEnPyT7dpi9jiDKjj767TGZdHZq7iUemmzDoL27Vjtx?cluster=devnet

##  Architecture

```
TxODDS API (live WC data)
        ↓
   Keeper Script (polls scores, detects FT)
        ↓
resolve_market ix → MarketState.outcome set on-chain
        ↓
Winners call claim_winnings → proportional SOL payout
```

##  Stack

- **Anchor 1.0.2** — Solana program framework (Rust)
- **TxLINE API** — TxODDS cryptographically verifiable World Cup data
- **React + Wallet Adapter** — Frontend
- **TypeScript** — Keeper + scripts

##  On-Chain Instructions

| Instruction | Description |
|---|---|
| `create_market` | Admin creates a market for a TxODDS fixture ID |
| `place_bet` | User deposits SOL, picks Home/Draw/Away |
| `resolve_market` | Admin posts TxODDS result on-chain |
| `claim_winnings` | Winner withdraws proportional share of pool |

##  How It Works

1. Admin calls `create_market` with a TxODDS `fixture_id` as the market ID
2. Users connect wallet and place SOL bets on Home / Draw / Away
3. SOL is held in a PDA vault — trustless escrow, no custodian
4. When match finishes, keeper script fetches result from TxODDS API and calls `resolve_market`
5. Winners call `claim_winnings` and receive `(their_bet / winning_pool) * total_pool` SOL

##  Payout Formula

```
payout = (user_bet / winning_pool) * total_pool
```

All funds are held in a program-derived vault. No admin can access user funds.

##  TxODDS Integration

- On-chain subscription to TxLINE free World Cup tier (service level 1)
- Fetches live fixtures via `/api/fixtures/snapshot` (19 World Cup matches)
- Keeper polls `/api/scores/historical/{fixtureId}` for final results
- Soccer status codes handled: `F` = Full Time, `FET` = After Extra Time, `FPE` = After Penalties
- Devnet program: `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`

##  Running Locally

### Prerequisites
- Rust + Cargo
- Solana CLI 3.x
- Anchor CLI 1.0.2
- Node.js 20+

### Setup

```bash
# Clone
git clone https://github.com/SamireddiNikhila/txodds-prediction-market
cd txodds-prediction-market

# Install dependencies
yarn install

# Build program
anchor build

# Deploy to devnet
solana program deploy target/deploy/txodds_prediction_market.so --with-compute-unit-price 50000

# Run end-to-end test
npx ts-node app/test.ts

# Subscribe to TxLINE free tier
npx ts-node app/subscribe.ts

# Fetch World Cup fixtures
npx ts-node app/fetch_fixtures.ts

# Run keeper (auto-resolution)
npx ts-node app/keeper.ts

# Start frontend
cd app/frontend && yarn start
```

##  Project Structure

```
programs/txodds-prediction-market/src/
├── lib.rs                    # Program entry point
├── state.rs                  # MarketState, UserBet accounts
├── error.rs                  # Custom errors
├── constants.rs              # PDA seeds, minimum bet
└── instructions/
    ├── create_market.rs      # Create a prediction market
    ├── place_bet.rs          # Place SOL bet on outcome
    ├── resolve_market.rs     # Post TxODDS result on-chain
    └── claim_winnings.rs     # Withdraw proportional winnings

app/
├── test.ts                   # End-to-end on-chain test
├── subscribe.ts              # TxLINE API subscription
├── fetch_fixtures.ts         # Fetch WC fixture list
├── keeper.ts                 # Auto-resolution keeper script
└── frontend/                 # React UI with wallet adapter
    └── src/App.tsx           # Main prediction market UI
```

##  Security Design

As a smart contract auditor, the following security properties were explicitly designed:

- **No admin withdrawal** — vault is a PDA, only program can move funds
- **Claimed flag** — prevents double-claiming via `user_bet.claimed` check
- **Integer arithmetic** — payout uses `u128` checked math to prevent overflow
- **Authority check** — `has_one = authority` on resolve_market prevents unauthorized resolution
- **Market status checks** — bets rejected on closed/resolved markets

##  Verified On-Chain Transactions (Devnet)

- Create market: `gT2wDeiyNeZ7npAC3KhSw4wX91irNCawM9Wg15ezfTk5dPKsLjadQ55SpRUS8fMJpttGQBwkRoNPK492AEUuPdU`
- Place bet: `oJBLZafQeifFecwRTLoYw8Ct73386DNXEyzVUYVW2cYLoYDNoenQXfUz7fCvET4Q7ahtd54QkiAhS4YxNTjN8mq`
- Resolve market: `3edLot6f5g8SAr5NUk8X5ZN4snyzSsNVxh8c3HDnHhvfco3pGmWM6NaYLqFXMtrSVwfQsfs8oHkHr5aSqTS1kEQe`
- Claim winnings: `2z7gUwLBmM5sJf2QwjTga8qNJrJVmEK6MLvX29dyadD2bhxdcRgtLFRaubVCdr3VeakX1pFikKZ2S2MSXf8UbYpi`

##  World Cup Fixtures Integrated

| TxODDS Fixture ID | Match |
|---|---|
| 18172280 | Netherlands vs Morocco |
| 18172469 | Brazil vs Japan |
| 18175397 | Ivory Coast vs Norway |
| 18175918 | Argentina vs Cape Verde |
| 18175981 | France vs Sweden |

##  License

MIT

##  Trustless Resolution via TxLINE validateStat

The verified keeper (`app/keeper_verified.ts`) implements trustless market resolution using TxLINE's cryptographic Merkle proofs:

1. Fetches score snapshot from `/api/scores/snapshot/{fixtureId}`
2. Fetches three-stage Merkle proof from `/api/scores/stat-validation`
3. Calls TxLINE's `validateStat` instruction on-chain to verify home goals > away goals (or vice versa) against the on-chain Merkle root — **no trust in the keeper required**
4. Only if validation passes, calls `resolve_market` on our program

This means market resolution is cryptographically verified against TxLINE's on-chain data anchored on Solana — fully trustless, no admin can post a fake result.

### TxLINE Endpoints Used

| Endpoint | Purpose |
|---|---|
| `/api/fixtures/snapshot` | Fetch World Cup fixture list |
| `/api/scores/snapshot/{fixtureId}` | Get latest score + game state |
| `/api/scores/historical/{fixtureId}` | Get full score history |
| `/api/scores/stat-validation` | Fetch Merkle proof for on-chain validation |
| TxLINE `validateStat` ix | On-chain cryptographic verification |
