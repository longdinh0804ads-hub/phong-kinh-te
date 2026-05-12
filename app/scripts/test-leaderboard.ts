/**
 * Smoke test leaderboard scoring.
 * Chạy calculateLeaderboard cho 4 period, kiểm tra output structure.
 */
import * as fs from "fs";
import * as path from "path";
for (const envName of [".env", ".env.local"]) {
  const f = path.join(__dirname, "..", envName);
  if (fs.existsSync(f))
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) {
        let v = m[2].trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
}

import { calculateLeaderboard, type Period } from "../lib/leaderboard-scoring";

async function main() {
  for (const period of ["this-week", "this-month", "this-quarter", "this-year"] as Period[]) {
    console.log("\n═════════════════════════════════════════════════════");
    console.log(`Period: ${period}`);
    console.log("═════════════════════════════════════════════════════");
    const { scores, period: info } = await calculateLeaderboard({ period });
    console.log(`Date range: ${info.from.toISOString()} → ${info.to.toISOString()}`);
    console.log(`Total users: ${scores.length}`);

    const active = scores.filter((s) => s.totalAssigned > 0);
    console.log(`Active (có task): ${active.length}`);

    console.log("\nTop 5:");
    for (const s of scores.slice(0, 5)) {
      console.log(
        `  #${s.rank} ${s.name.padEnd(25)} | ${s.points} đ | ` +
          `sớm=${s.completedEarly}, đúng=${s.completedOnTime}, trễ=${s.completedLate}, quá hạn=${s.overdueOpen} | ` +
          `% đúng=${Math.round(s.onTimeRate * 100)}% | ` +
          (s.badge || "")
      );
    }
  }

  console.log("\n✓ Leaderboard test done");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FAIL:", e);
    process.exit(1);
  });
