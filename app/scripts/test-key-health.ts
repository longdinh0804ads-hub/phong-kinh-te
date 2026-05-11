// Test API key health check logic
import * as fs from "fs";
import * as path from "path";
const envFile = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) { let val = m[2].trim(); if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1); process.env[m[1]] = val; }
  }
}
import { checkAllProviders, getKeyHealthSummary, getKeyHealthList } from "../lib/api-key-health";

async function main() {
  console.log("=== Running health check on all providers ===");
  const result = await checkAllProviders();
  console.log("\nGemini:", result.gemini.length, "keys");
  for (const k of result.gemini) {
    console.log(`  [${k.keyIndex}] ${k.keyPrefix} → ${k.status} (${k.latencyMs}ms)${k.errorMsg ? " - " + k.errorMsg.slice(0, 60) : ""}`);
  }
  console.log("\nDeepSeek:", result.deepseek.length, "keys");
  for (const k of result.deepseek) {
    console.log(`  [${k.keyIndex}] ${k.keyPrefix} → ${k.status} (${k.latencyMs}ms)`);
  }
  console.log("\nAnthropic:", result.anthropic.length, "keys");
  for (const k of result.anthropic) {
    console.log(`  [${k.keyIndex}] ${k.keyPrefix} → ${k.status} (${k.latencyMs}ms)`);
  }

  console.log("\n=== Summary ===");
  const sum = await getKeyHealthSummary();
  console.log(JSON.stringify(sum, null, 2));

  console.log("\n=== Read from DB ===");
  const list = await getKeyHealthList();
  console.log(`Total in DB: ${list.length} records`);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
