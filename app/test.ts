import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, Keypair, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";

// load wallet
const walletKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(`${process.env.HOME}/.config/solana/id.json`, "utf-8")))
);

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const wallet = new anchor.Wallet(walletKeypair);
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

const programId = new PublicKey("2AEnPyT7dpi9jiDKjj767TGZdHZq7iUemmzDoL27Vjtx");
const idl = JSON.parse(fs.readFileSync("./target/idl/txodds_prediction_market.json", "utf-8"));
const program = new Program(idl, provider);

const MARKET_SEED = "market";
const BET_SEED = "bet";
const VAULT_SEED = "vault";

async function main() {
  const matchId = "WC2026_ARG_FRA_FINAL";

  // derive PDAs
  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(MARKET_SEED), Buffer.from(matchId)],
    programId
  );
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(VAULT_SEED), Buffer.from(matchId)],
    programId
  );
  const [betPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(BET_SEED), marketPda.toBuffer(), walletKeypair.publicKey.toBuffer()],
    programId
  );

  console.log("wallet:  ", walletKeypair.publicKey.toBase58());
  console.log("market:  ", marketPda.toBase58());
  console.log("vault:   ", vaultPda.toBase58());
  console.log("bet:     ", betPda.toBase58());

  // 1. create market
  console.log("\n[1] creating market...");
  const tx1 = await program.methods
    .createMarket(matchId, "Argentina", "France")
    .accounts({
      market: marketPda,
      vault: vaultPda,
      authority: walletKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("create_market tx:", tx1);

  // 2. place bet on Home (Argentina)
  console.log("\n[2] placing bet on Home...");
  const betAmount = new BN(0.1 * LAMPORTS_PER_SOL); // 0.1 SOL
  const tx2 = await program.methods
    .placeBet(matchId, { home: {} }, betAmount)
    .accounts({
      market: marketPda,
      vault: vaultPda,
      userBet: betPda,
      user: walletKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("place_bet tx:", tx2);

  // 3. resolve market as Home win
  console.log("\n[3] resolving market as Home win...");
  const tx3 = await program.methods
    .resolveMarket(matchId, { home: {} })
    .accounts({
      market: marketPda,
      authority: walletKeypair.publicKey,
    })
    .rpc();
  console.log("resolve_market tx:", tx3);

  // 4. claim winnings
  console.log("\n[4] claiming winnings...");
  const tx4 = await program.methods
    .claimWinnings(matchId)
    .accounts({
      market: marketPda,
      vault: vaultPda,
      userBet: betPda,
      user: walletKeypair.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log("claim_winnings tx:", tx4);

  console.log("\n✅ all instructions executed successfully!");
}

main().catch(console.error);
