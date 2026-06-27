import axios from "axios";
import fs from "fs";

const { jwt, apiToken } = JSON.parse(fs.readFileSync("./app/api_token.json", "utf-8"));
const API_BASE = "https://txline-dev.txodds.com";

async function main() {
  // try the 5-min interval scores endpoint to see if any live data exists
  const now = Math.floor(Date.now() / 1000);
  const aligned = now - (now % 300); // align to 5-min boundary

  try {
    const res = await axios.get(`${API_BASE}/api/scores/interval/${aligned}`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "X-Api-Token": apiToken,
      },
    });
    console.log("interval scores:", JSON.stringify(res.data).slice(0, 500));
  } catch (e: any) {
    console.log("interval error:", e.response?.status, e.response?.data);
  }

  // also try the live stream snapshot
  try {
    const res2 = await axios.get(`${API_BASE}/api/scores/snapshot`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "X-Api-Token": apiToken,
      },
    });
    console.log("snapshot scores:", JSON.stringify(res2.data).slice(0, 500));
  } catch (e: any) {
    console.log("snapshot error:", e.response?.status, e.response?.data);
  }
}

main().catch(console.error);
