import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair, SystemProgram } from "@solana/web3.js";
import axios from "axios";
import fs from "fs";

const PROGRAM_ID = new PublicKey("2AEnPyT7dpi9jiDKjj767TGZdHZq7iUemmzDoL27Vjtx");
const MARKET_SEED = "market";

const walletKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(`${process.env.HOME}/.config/solana/id.json`, "utf-8")))
);
const { jwt, apiToken } = JSON.parse(fs.readFileSync("./app/api_token.json", "utf-8"));
const API_BASE = "https://txline-dev.txodds.com";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const wallet = new anchor.Wallet(walletKeypair);
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

const idl = JSON.parse(fs.readFileSync("./target/idl/txodds_prediction_market.json", "utf-8"));
const program = new anchor.Program(idl, provider);

const FINISHED_STATES = ["F", "FET", "FPE"]; // Full Time, Full Time After Extra Time, Full Time After Penalties

async function getMatchResult(fixtureId: number): Promise<"home" | "draw" | "away" | null> {
  try {
    const res = await axios.get(`${API_BASE}/api/scores/historical/${fixtureId}`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "X-Api-Token": apiToken,
      },
    });

    const updates: any[] = res.data;
    if (!updates || updates.length === 0) {
      console.log("  no score updates found");
      return null;
    }

    // get latest update
    const latest = updates[updates.length - 1];
    const status = latest.statusSoccerId ? Object.keys(latest.statusSoccerId)[0] : null;
    console.log(`  gameState: ${latest.gameState}, soccerStatus: ${status}`);

    // check if finished
    const isFinished = status && FINISHED_STATES.includes(status);
    if (!isFinished) {
      console.log("  match not finished yet");
      return null;
    }

    const p1Goals = latest.scoreSoccer?.Participant1?.Total?.Goals ?? 0;
    const p2Goals = latest.scoreSoccer?.Participant2?.Total?.Goals ?? 0;
    console.log(`  score: ${p1Goals} - ${p2Goals}`);

    // participant1IsHome tells us which side is home
    const p1IsHome = latest.participant1IsHome;
    const homeGoals = p1IsHome ? p1Goals : p2Goals;
    const awayGoals = p1IsHome ? p2Goals : p1Goals;

    if (homeGoals > awayGoals) return "home";
    if (awayGoals > homeGoals) return "away";
    return "draw";

  } catch (e: any) {
    console.log(`  error: ${e.response?.status} ${JSON.stringify(e.response?.data)}`);
    return null;
  }
}

async function resolveMarket(matchId: string, outcome: "home" | "draw" | "away") {
  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(MARKET_SEED), Buffer.from(matchId)],
    PROGRAM_ID
  );
  const outcomeArg = outcome === "home" ? { home: {} } : outcome === "away" ? { away: {} } : { draw: {} };

  const tx = await program.methods
    .resolveMarket(matchId, outcomeArg)
    .accounts({ market: marketPda, authority: walletKeypair.publicKey })
    .rpc();

  console.log(`  resolved as ${outcome}: ${tx}`);
}

async function runKeeper(watchList: { matchId: string; fixtureId: number }[]) {
  console.log(`keeper watching ${watchList.length} markets...\n`);
  for (const { matchId, fixtureId } of watchList) {
    console.log(`checking [${fixtureId}] market: ${matchId}`);
    const result = await getMatchResult(fixtureId);
    if (result) {
      await resolveMarket(matchId, result);
    } else {
      console.log("  skipping — not resolved yet\n");
    }
  }
}

// use real fixture IDs from our fixtures.json
const watchList = [
  { matchId: "17588245", fixtureId: 17588245 }, // Croatia vs Ghana
  { matchId: "17588391", fixtureId: 17588391 }, // Colombia vs Portugal
];

runKeeper(watchList).catch(console.error);
