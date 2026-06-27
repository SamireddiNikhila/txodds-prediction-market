import fs from "fs";

const fixtures = JSON.parse(fs.readFileSync("./app/fixtures.json", "utf-8"));
const now = Math.floor(Date.now() / 1000);

console.log("ALL FIXTURES:\n");
fixtures.forEach((f: any) => {
  const kickoff = new Date(f.StartTime * 1000).toUTCString();
  const status = f.StartTime > now ? "UPCOMING" : "PAST";
  console.log(`[${status}] ID:${f.FixtureId} | ${f.Participant1} vs ${f.Participant2}`);
  console.log(`         Competition: ${f.Competition} | Kickoff: ${kickoff}`);
  console.log(`         CompetitionId: ${f.CompetitionId}\n`);
});
