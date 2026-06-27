import axios from "axios";
import fs from "fs";

const { jwt, apiToken } = JSON.parse(fs.readFileSync("./app/api_token.json", "utf-8"));

const API_BASE = "https://txline-dev.txodds.com";

async function main() {
  console.log("fetching world cup fixtures...");

  const response = await axios.get(`${API_BASE}/api/fixtures/snapshot`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
      "X-Api-Token": apiToken,
    },
  });

  const fixtures = response.data;
  console.log(`got ${fixtures.length} fixtures`);

  // filter world cup only (competition ID 500001 is FIFA WC)
  const wc = fixtures.filter((f: any) =>
    f.Competition?.toLowerCase().includes("world cup") ||
    f.Competition?.toLowerCase().includes("fifa")
  );

  console.log(`\nworld cup fixtures: ${wc.length}`);
  wc.slice(0, 5).forEach((f: any) => {
    const kickoff = new Date(f.StartTime * 1000).toISOString();
    console.log(`[${f.FixtureId}] ${f.Participant1} vs ${f.Participant2} — ${kickoff}`);
  });

  // save all fixtures
  fs.writeFileSync("./app/fixtures.json", JSON.stringify(fixtures, null, 2));
  console.log("\nsaved all fixtures to app/fixtures.json");
}

main().catch(console.error);
