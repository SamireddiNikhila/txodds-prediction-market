import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair, ComputeBudgetProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import axios from "axios";
import fs from "fs";

// our program
const PROGRAM_ID = new PublicKey("2AEnPyT7dpi9jiDKjj767TGZdHZq7iUemmzDoL27Vjtx");
const MARKET_SEED = "market";

// TxLINE devnet program
const TXLINE_PROGRAM_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

const walletKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(`${process.env.HOME}/.config/solana/id.json`, "utf-8")))
);
const { jwt, apiToken } = JSON.parse(fs.readFileSync("./app/api_token.json", "utf-8"));
const API_BASE = "https://txline-dev.txodds.com";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const wallet = new anchor.Wallet(walletKeypair);
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

// load our IDL
const ourIdl = JSON.parse(fs.readFileSync("./target/idl/txodds_prediction_market.json", "utf-8"));
const ourProgram = new anchor.Program(ourIdl, provider);

// load TxLINE IDL
const txlineIdl = JSON.parse(fs.readFileSync("./app/txline_full_idl.json", "utf-8"));
const txlineProgram = new anchor.Program(txlineIdl, provider);

const httpClient = axios.create({
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${jwt}`,
    "X-Api-Token": apiToken
  },
  baseURL: API_BASE,
});

// stat keys for soccer
const STAT_HOME_GOALS = 1002; // home team goals
const STAT_AWAY_GOALS = 1003; // away team goals

async function verifyAndGetOutcome(fixtureId: number): Promise<"home" | "draw" | "away" | null> {
  try {
    // step 1: get score snapshot
    const snapshotRes = await httpClient.get(`/api/scores/snapshot/${fixtureId}?asOf=${Date.now()}`);
    const snapshot = snapshotRes.data;
    if (!snapshot || !snapshot.seq) {
      console.log("  no snapshot found");
      return null;
    }

    const status = snapshot.statusSoccerId ? Object.keys(snapshot.statusSoccerId)[0] : null;
    if (!["F", "FET", "FPE"].includes(status || "")) {
      console.log(`  match not finished, status: ${status}`);
      return null;
    }

    console.log(`  match finished! status: ${status}, seq: ${snapshot.seq}`);

    // step 2: fetch merkle proof for home goals vs away goals
    const validationRes = await httpClient.get("/api/scores/stat-validation", {
      params: {
        fixtureId,
        seq: snapshot.seq,
        statKey: STAT_HOME_GOALS,
        statKey2: STAT_AWAY_GOALS,
      }
    });
    const validation = validationRes.data;

    console.log(`  home goals: ${validation.statToProve?.value}, away goals: ${validation.statToProve2?.value}`);

    // step 3: validate on-chain via TxLINE validateStat (view call — trustless)
    const fixtureSummary = {
      fixtureId: new BN(validation.summary.fixtureId),
      updateStats: {
        updateCount: validation.summary.updateStats.updateCount,
        minTimestamp: new BN(validation.summary.updateStats.minTimestamp),
        maxTimestamp: new BN(validation.summary.updateStats.maxTimestamp),
      },
      eventsSubTreeRoot: validation.summary.eventStatsSubTreeRoot,
    };

    const fixtureProof = validation.subTreeProof.map((n: any) => ({ hash: n.hash, isRightSibling: n.isRightSibling }));
    const mainTreeProof = validation.mainTreeProof.map((n: any) => ({ hash: n.hash, isRightSibling: n.isRightSibling }));

    const stat1 = {
      statToProve: validation.statToProve,
      eventStatRoot: validation.eventStatRoot,
      statProof: validation.statProof.map((n: any) => ({ hash: n.hash, isRightSibling: n.isRightSibling })),
    };
    const stat2 = {
      statToProve: validation.statToProve2,
      eventStatRoot: validation.eventStatRoot2,
      statProof: validation.statProof2.map((n: any) => ({ hash: n.hash, isRightSibling: n.isRightSibling })),
    };

    const targetTs = validation.summary.updateStats.minTimestamp;
    const epochDay = Math.floor(targetTs / (24 * 60 * 60 * 1000));

    const [dailyScoresPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("daily_scores_roots"), new BN(epochDay).toBuffer("le", 2)],
      TXLINE_PROGRAM_ID
    );

    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });

    // validate home > away (home win)
    const homeWin = await txlineProgram.methods
      .validateStat(
        new BN(targetTs),
        fixtureSummary,
        fixtureProof,
        mainTreeProof,
        { threshold: 0, comparison: { greaterThan: {} } },
        stat1,
        stat2,
        { subtract: {} }
      )
      .accounts({ dailyScoresMerkleRoots: dailyScoresPda })
      .preInstructions([computeBudgetIx])
      .view();

    if (homeWin) {
      console.log("  TxLINE validated: HOME WIN ✅");
      return "home";
    }

    // validate away > home (away win)
    const awayWin = await txlineProgram.methods
      .validateStat(
        new BN(targetTs),
        fixtureSummary,
        fixtureProof,
        mainTreeProof,
        { threshold: 0, comparison: { greaterThan: {} } },
        stat2,
        stat1,
        { subtract: {} }
      )
      .accounts({ dailyScoresMerkleRoots: dailyScoresPda })
      .preInstructions([computeBudgetIx])
      .view();

    if (awayWin) {
      console.log("  TxLINE validated: AWAY WIN ✅");
      return "away";
    }

    console.log("  TxLINE validated: DRAW ✅");
    return "draw";

  } catch (e: any) {
    console.log("  verification error:", e.response?.status ?? e.message);
    return null;
  }
}

async function resolveMarket(matchId: string, outcome: "home" | "draw" | "away") {
  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(MARKET_SEED), Buffer.from(matchId)],
    PROGRAM_ID
  );
  const outcomeArg = outcome === "home" ? { home: {} } : outcome === "away" ? { away: {} } : { draw: {} };
  const tx = await ourProgram.methods
    .resolveMarket(matchId, outcomeArg)
    .accounts({ market: marketPda, authority: walletKeypair.publicKey })
    .rpc();
  console.log(`  ✅ resolved as ${outcome}: ${tx}`);
}

async function runKeeper(watchList: { matchId: string; fixtureId: number }[]) {
  console.log(`keeper (verified) watching ${watchList.length} markets...\n`);
  for (const { matchId, fixtureId } of watchList) {
    console.log(`checking [${fixtureId}] market: ${matchId}`);
    const outcome = await verifyAndGetOutcome(fixtureId);
    if (outcome) {
      await resolveMarket(matchId, outcome);
    } else {
      console.log("  skipping\n");
    }
  }
}

const watchList = [
  { matchId: "17588245", fixtureId: 17588245 },
  { matchId: "17588391", fixtureId: 17588391 },
  { matchId: "17588325", fixtureId: 17588325 },
  { matchId: "17588402", fixtureId: 17588402 },
];

runKeeper(watchList).catch(console.error);
