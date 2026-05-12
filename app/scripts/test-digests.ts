/**
 * Test Morning + Day-end digest.
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
import { PrismaClient } from "@prisma/client";
import { runMorningDigest } from "../lib/ai-monitor/morning-digest";
import { runDayEndDigest } from "../lib/ai-monitor/dayend-digest";

const db = new PrismaClient();

async function cleanup() {
  await db.notification.deleteMany({
    where: { type: { in: ["DIGEST_MORNING", "DIGEST_DAYEND"] } },
  });
}

async function main() {
  await cleanup();

  console.log("=== Morning Digest ===");
  const m1 = await runMorningDigest();
  console.log(JSON.stringify(m1, null, 2));
  if (m1.errors.length > 0) throw new Error("morning errors: " + m1.errors.join("; "));

  // Verify TP nhận notification
  const tp = await db.user.findFirst({ where: { role: "TRUONG_PHONG" } });
  if (tp) {
    const notif = await db.notification.findFirst({
      where: { userId: tp.id, type: "DIGEST_MORNING" },
    });
    console.log(`\nTP notification:`, notif ? "✓ created" : "✗ missing");
    if (notif) {
      console.log("Title:", notif.title);
      console.log("Message preview:");
      console.log(notif.message.split("\n").slice(0, 8).map((l) => "  " + l).join("\n"));
    }
  }

  // Dedup test
  console.log("\n=== Morning Digest (dedup) ===");
  const m2 = await runMorningDigest();
  console.log(`notificationsCreated: ${m2.notificationsCreated} (expect 0)`);
  console.log(`notificationsSkippedDedup: ${m2.notificationsSkippedDedup}`);

  console.log("\n=== Day-End Digest ===");
  const d1 = await runDayEndDigest();
  console.log(JSON.stringify(d1, null, 2));
  if (d1.errors.length > 0) throw new Error("dayend errors: " + d1.errors.join("; "));

  if (tp) {
    const notif = await db.notification.findFirst({
      where: { userId: tp.id, type: "DIGEST_DAYEND" },
    });
    console.log(`\nTP notification:`, notif ? "✓ created" : "✗ missing");
    if (notif) {
      console.log("Title:", notif.title);
      console.log("Message preview:");
      console.log(notif.message.split("\n").slice(0, 12).map((l) => "  " + l).join("\n"));
    }
  }

  await cleanup();
  console.log("\n✓ All digest tests done");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("FAIL:", e);
  await cleanup().catch(() => {});
  await db.$disconnect();
  process.exit(1);
});
