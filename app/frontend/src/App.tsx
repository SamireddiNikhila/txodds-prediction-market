import { useMemo, useState, useEffect } from "react";
import { ConnectionProvider, WalletProvider, useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import { WalletModalProvider, WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./App.css";

const PROGRAM_ID = new PublicKey("2AEnPyT7dpi9jiDKjj767TGZdHZq7iUemmzDoL27Vjtx");
const MARKET_SEED = "market";
const BET_SEED = "bet";
const VAULT_SEED = "vault";

const FIXTURES = [
  { id: "17588245", home: "Croatia", away: "Ghana" },
  { id: "17588391", home: "Colombia", away: "Portugal" },
  { id: "17588325", home: "Jordan", away: "Argentina" },
  { id: "17588402", home: "Panama", away: "England" },
  { id: "18172379", home: "USA", away: "Bosnia & Herzegovina" },
];

function MarketCard({ fixture, program, wallet }: any) {
  const [market, setMarket] = useState<any>(null);
  const [userBet, setUserBet] = useState<any>(null);
  const [betAmount, setBetAmount] = useState("0.1");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const [marketPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(MARKET_SEED), Buffer.from(fixture.id)],
    PROGRAM_ID
  );
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(VAULT_SEED), Buffer.from(fixture.id)],
    PROGRAM_ID
  );

  const fetchMarket = async () => {
    if (!program) return;
    try {
      const m = await program.account.marketState.fetch(marketPda);
      setMarket(m);
      if (wallet.publicKey) {
        const [betPda] = PublicKey.findProgramAddressSync(
          [Buffer.from(BET_SEED), marketPda.toBuffer(), wallet.publicKey.toBuffer()],
          PROGRAM_ID
        );
        try {
          const b = await program.account.userBet.fetch(betPda);
          setUserBet(b);
        } catch { setUserBet(null); }
      }
    } catch { setMarket(null); }
  };

  useEffect(() => { fetchMarket(); }, [program, wallet.publicKey]);

  const createMarket = async () => {
    if (!program || !wallet.publicKey) return;
    setLoading(true); setStatus("creating market...");
    try {
      await program.methods.createMarket(fixture.id, fixture.home, fixture.away)
        .accounts({ market: marketPda, vault: vaultPda, authority: wallet.publicKey, systemProgram: SystemProgram.programId })
        .rpc();
      setStatus("✅ market created!");
      await fetchMarket();
    } catch (e: any) { setStatus("❌ " + e.message); }
    setLoading(false);
  };

  const placeBet = async (side: string) => {
    if (!program || !wallet.publicKey) return;
    setLoading(true); setStatus(`placing bet on ${side}...`);
    try {
      const [betPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(BET_SEED), marketPda.toBuffer(), wallet.publicKey.toBuffer()],
        PROGRAM_ID
      );
      const amount = new BN(parseFloat(betAmount) * LAMPORTS_PER_SOL);
      const sideArg = side === "home" ? { home: {} } : side === "away" ? { away: {} } : { draw: {} };
      await program.methods.placeBet(fixture.id, sideArg, amount)
        .accounts({ market: marketPda, vault: vaultPda, userBet: betPda, user: wallet.publicKey, systemProgram: SystemProgram.programId })
        .rpc();
      setStatus(`✅ bet placed on ${side}!`);
      await fetchMarket();
    } catch (e: any) { setStatus("❌ " + e.message); }
    setLoading(false);
  };

  const claimWinnings = async () => {
    if (!program || !wallet.publicKey) return;
    setLoading(true); setStatus("claiming winnings...");
    try {
      const [betPda] = PublicKey.findProgramAddressSync(
        [Buffer.from(BET_SEED), marketPda.toBuffer(), wallet.publicKey.toBuffer()],
        PROGRAM_ID
      );
      await program.methods.claimWinnings(fixture.id)
        .accounts({ market: marketPda, vault: vaultPda, userBet: betPda, user: wallet.publicKey, systemProgram: SystemProgram.programId })
        .rpc();
      setStatus("✅ winnings claimed!");
      await fetchMarket();
    } catch (e: any) { setStatus("❌ " + e.message); }
    setLoading(false);
  };

  const getOutcome = (o: any) => {
    if (!o) return "unresolved";
    if (o.home !== undefined) return "🏠 Home";
    if (o.away !== undefined) return "✈️ Away";
    if (o.draw !== undefined) return "🤝 Draw";
    return "unresolved";
  };

  const getStatus = (s: any) => {
    if (!s) return "";
    if (s.open !== undefined) return "🟢 Open";
    if (s.closed !== undefined) return "🔴 Closed";
    if (s.resolved !== undefined) return "✅ Resolved";
    return "";
  };

  const totalSol = market ? (market.totalPool.toNumber() / LAMPORTS_PER_SOL).toFixed(3) : "0";
  const homeSol = market ? (market.homePool.toNumber() / LAMPORTS_PER_SOL).toFixed(3) : "0";
  const draWSol = market ? (market.drawPool.toNumber() / LAMPORTS_PER_SOL).toFixed(3) : "0";
  const awaySol = market ? (market.awayPool.toNumber() / LAMPORTS_PER_SOL).toFixed(3) : "0";

  return (
    <div className="market-card">
      <div className="match-header">
        <span className="team home-team">{fixture.home}</span>
        <span className="vs">VS</span>
        <span className="team away-team">{fixture.away}</span>
      </div>
      <div className="fixture-id">TxODDS ID: {fixture.id}</div>

      {!market ? (
        <div className="no-market">
          <p>No market yet</p>
          {wallet.publicKey && (
            <button className="btn btn-create" onClick={createMarket} disabled={loading}>
              {loading ? "..." : "Create Market"}
            </button>
          )}
        </div>
      ) : (
        <div className="market-info">
          <div className="market-stats">
            <span>{getStatus(market.status)}</span>
            {market.status?.resolved !== undefined && (
              <span className="outcome">Result: {getOutcome(market.outcome)}</span>
            )}
            <span className="pool">Pool: {totalSol} SOL</span>
          </div>

          <div className="pool-bars">
            <div className="pool-bar">
              <span>🏠 {fixture.home}</span>
              <span>{homeSol} SOL</span>
            </div>
            <div className="pool-bar">
              <span>🤝 Draw</span>
              <span>{draWSol} SOL</span>
            </div>
            <div className="pool-bar">
              <span>✈️ {fixture.away}</span>
              <span>{awaySol} SOL</span>
            </div>
          </div>

          {market.status?.open !== undefined && !userBet && wallet.publicKey && (
            <div className="bet-section">
              <input
                type="number"
                value={betAmount}
                onChange={e => setBetAmount(e.target.value)}
                min="0.001"
                step="0.01"
                className="bet-input"
              />
              <span className="sol-label">SOL</span>
              <div className="bet-buttons">
                <button className="btn btn-home" onClick={() => placeBet("home")} disabled={loading}>
                  🏠 {fixture.home}
                </button>
                <button className="btn btn-draw" onClick={() => placeBet("draw")} disabled={loading}>
                  🤝 Draw
                </button>
                <button className="btn btn-away" onClick={() => placeBet("away")} disabled={loading}>
                  ✈️ {fixture.away}
                </button>
              </div>
            </div>
          )}

          {userBet && (
            <div className="user-bet">
              <p>Your bet: {(userBet.amount.toNumber() / LAMPORTS_PER_SOL).toFixed(3)} SOL on {getOutcome(userBet.side)}</p>
              {market.status?.resolved !== undefined && !userBet.claimed && (
                <button className="btn btn-claim" onClick={claimWinnings} disabled={loading}>
                  💰 Claim Winnings
                </button>
              )}
              {userBet.claimed && <p className="claimed">✅ Winnings claimed!</p>}
            </div>
          )}
        </div>
      )}

      {status && <div className="status-msg">{status}</div>}
    </div>
  );
}

function App() {
  const network = WalletAdapterNetwork.Devnet;
  const endpoint = "https://api.devnet.solana.com";
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <Inner />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

function Inner() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [program, setProgram] = useState<any>(null);

  useEffect(() => {
    if (!wallet.publicKey) return;
    const provider = new anchor.AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    fetch("/idl.json").then(r => r.json()).then(idl => {
      setProgram(new anchor.Program(idl, provider));
    });
  }, [wallet.publicKey, connection]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>⚽ TxODDS Prediction Market</h1>
          <p>World Cup 2026 · Powered by TxODDS · Built on Solana</p>
        </div>
        <WalletMultiButton />
      </header>

      <main className="main">
        {!wallet.publicKey && (
          <div className="connect-prompt">
            <h2>Connect your wallet to start betting</h2>
            <p>Place SOL bets on World Cup matches. Winners share the pool.</p>
          </div>
        )}
        <div className="markets-grid">
          {FIXTURES.map(f => (
            <MarketCard key={f.id} fixture={f} program={program} wallet={wallet} />
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;
