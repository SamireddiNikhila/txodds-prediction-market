import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair, SystemProgram } from "@solana/web3.js";
import fs from "fs";

const PROGRAM_ID = new PublicKey("2AEnPyT7dpi9jiDKjj767TGZdHZq7iUemmzDoL27Vjtx");
const MARKET_SEED = "market";
const BET_SEED = "bet";
const VAULT_SEED = "vault";

const walletKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(`${process.env.HOME}/.config/solana/id.json`, "utf-8")))
);
const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const wallet = new anchor.Wallet(walletKeypair);
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);
const idl = JSON.parse(fs.readFileSync("./target/idl/txodds_prediction_market.json", "utf-8"));
const program = new anchor.Program(idl, provider) as any;

const matchId = process.argv[2];

async function main() {
  if (!matchId) {
    console.log("usage: npx ts-node app/withdraw_one.ts <matchId>");
    console.log("example: npx ts-node app/withdraw_one.ts 17588245");
    return;
  }

  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(MARKET_SEED), Buffer.from(matchId)], PROGRAM_ID
  );
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(VAULT_SEED), Buffer.from(matchId)], PROGRAM_ID
  );
  const [betPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(BET_SEED), marketPda.toBuffer(), walletKeypair.publicKey.toBuffer()], PROGRAM_ID
  );

  const bet = await program.account.userBet.fetch(betPda);
  if (bet.claimed) { console.log("already claimed!"); return; }

  const market = await program.account.marketState.fetch(marketPda);
  if (market.status.resolved === undefined) {
    console.log(`resolving as your side: ${JSON.stringify(bet.side)}`);
    await program.methods
      .resolveMarket(matchId, bet.side)
      .accounts({ market: marketPda, authority: walletKeypair.publicKey })
      .rpc();
  }

  await program.methods
    .claimWinnings(matchId)
    .accounts({ market: marketPda, vault: vaultPda, userBet: betPda, user: walletKeypair.publicKey, systemProgram: SystemProgram.programId })
    .rpc();

  const balance = await connection.getBalance(walletKeypair.publicKey);
  console.log(`✅ withdrawn! balance: ${balance / 1e9} SOL`);
}

main().catch(console.error);
