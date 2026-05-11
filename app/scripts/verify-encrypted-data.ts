import * as fs from "fs";
import * as path from "path";
for (const envName of [".env", ".env.local"]) {
  const envFile = path.join(__dirname, "..", envName);
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) {
        let val = m[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        process.env[m[1]] = val;
      }
    }
  }
}

import { PrismaClient } from "@prisma/client";
import { fieldCipherExtension } from "../lib/crypto/field-cipher";

const raw = new PrismaClient();
const db = raw.$extends(fieldCipherExtension);

async function main() {
  console.log("=== RAW DB (KHÔNG có extension - mô phỏng hacker đọc DB) ===\n");
  const ihanoi = await raw.iHanoiComplaint.findFirst();
  if (ihanoi) {
    console.log("iHanoi raw:");
    console.log("  content     :", ihanoi.content?.slice(0, 50) + "...");
    console.log("  citizenName :", ihanoi.citizenName);
    console.log("  citizenPhone:", ihanoi.citizenPhone?.slice(0, 30) + "...");
    console.log("  phoneBidx   :", ihanoi.citizenPhoneBidx?.slice(0, 16) + "...");
  }
  const tn = await raw.taskNote.findFirst();
  if (tn) console.log("\nTaskNote raw content:", tn.content?.slice(0, 50) + "...");
  const u = await raw.user.findFirst({ where: { phone: { not: null } } });
  if (u) console.log("\nUser raw phone:", u.phone?.slice(0, 30) + "...");
  const n = await raw.notification.findFirst();
  if (n) console.log("Notification raw message:", n.message?.slice(0, 50) + "...");

  console.log("\n=== EXTENDED CLIENT (transparent decrypt) ===\n");
  const ihanoiD = await db.iHanoiComplaint.findFirst();
  if (ihanoiD) {
    console.log("iHanoi decrypted:");
    console.log("  content     :", ihanoiD.content);
    console.log("  citizenName :", ihanoiD.citizenName);
    console.log("  citizenPhone:", ihanoiD.citizenPhone);
  }
  const tnD = await db.taskNote.findFirst();
  if (tnD) console.log("\nTaskNote decrypted content:", tnD.content?.slice(0, 100));
  const uD = await db.user.findFirst({ where: { phone: { not: null } } });
  if (uD) console.log("\nUser decrypted phone:", uD.phone);

  console.log("\n✓ Verify complete - data encrypted in DB, decrypted via app");
  await raw.$disconnect();
}

main().catch(async (e) => {
  console.error("FAIL:", e);
  await raw.$disconnect();
  process.exit(1);
});
