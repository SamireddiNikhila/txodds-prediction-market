import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Connection, Keypair, SystemProgram } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import axios from "axios";
import nacl from "tweetnacl";
import fs from "fs";

// devnet addresses
const TXLINE_PROGRAM_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");
const TXL_TOKEN_MINT = new PublicKey("4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG");
const API_BASE = "https://txline-dev.txodds.com/api";

const walletKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(`${process.env.HOME}/.config/solana/id.json`, "utf-8")))
);

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const wallet = new anchor.Wallet(walletKeypair);
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

async function main() {
  console.log("wallet:", walletKeypair.publicKey.toBase58());

  // derive PDAs
  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    TXLINE_PROGRAM_ID
  );
  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    TXL_TOKEN_MINT,
    tokenTreasuryPda,
    true,
    TOKEN_2022_PROGRAM_ID
  );
  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    TXLINE_PROGRAM_ID
  );

  console.log("tokenTreasuryPda:", tokenTreasuryPda.toBase58());
  console.log("pricingMatrixPda:", pricingMatrixPda.toBase58());

  // get or create user token account for TxL
  const userTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    walletKeypair,
    TXL_TOKEN_MINT,
    walletKeypair.publicKey,
    false,
    "confirmed",
    undefined,
    TOKEN_2022_PROGRAM_ID
  );
  console.log("userTokenAccount:", userTokenAccount.address.toBase58());

  // load txline IDL
  const idl = JSON.parse(fs.readFileSync("./app/txline_idl.json", "utf-8"));
  const program = new anchor.Program(idl, provider);

  // subscribe to free tier (service level 1 = world cup, 60s delay)
  console.log("\n[1] subscribing to free world cup tier...");
  const SERVICE_LEVEL_ID = 1;
  const DURATION_WEEKS = 4;

  const txSig = await program.methods
    .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
    .accounts({
      user: walletKeypair.publicKey,
      pricingMatrix: pricingMatrixPda,
      tokenMint: TXL_TOKEN_MINT,
      userTokenAccount: userTokenAccount.address,
      tokenTreasuryVault,
      tokenTreasuryPda,
      tokenProgram: TOKEN_2022_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("subscription tx:", txSig);

  // activate API token
  console.log("\n[2] activating API token...");
  const authResponse = await axios.post("https://txline-dev.txodds.com/auth/guest/start");
  const jwt = authResponse.data.token;

  const SELECTED_LEAGUES: number[] = [];
  const messageString = `${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`;
  const message = new TextEncoder().encode(messageString);
  const signatureBytes = nacl.sign.detached(message, walletKeypair.secretKey);
  const walletSignature = Buffer.from(signatureBytes).toString("base64");

  const activationResponse = await axios.post(
    "https://txline-dev.txodds.com/api/token/activate",
    { txSig, walletSignature, leagues: SELECTED_LEAGUES },
    { headers: { Authorization: `Bearer ${jwt}` } }
  );

  const apiToken = activationResponse.data.token || activationResponse.data;
  console.log("API token activated!");

  // save token to file
  fs.writeFileSync("./app/api_token.json", JSON.stringify({ jwt, apiToken }, null, 2));
  console.log("saved to app/api_token.json");

  // test: fetch live fixtures
  console.log("\n[3] fetching world cup fixtures...");
  const fixturesResponse = await axios.get(
    `${API_BASE}/fixtures/snapshot`,
    { headers: { Authorization: `Bearer ${apiToken}` } }
  );

  const fixtures = fixturesResponse.data;
  console.log("fixtures sample:", JSON.stringify(fixtures).slice(0, 500));
}

main().catch(console.error);
