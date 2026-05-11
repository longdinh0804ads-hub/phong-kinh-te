// Cleanup test data sau khi chạy các test script
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
const db = new PrismaClient();

async function main() {
  const testEmails = [
    "test-lockout@phongkinhte-tranphu.vn",
    "test-e2e@phongkinhte-tranphu.vn",
    "test-2fa@phongkinhte-tranphu.vn",
  ];
  for (const email of testEmails) {
    const u = await db.user.findUnique({ where: { email } });
    if (u) {
      await db.passwordHistory.deleteMany({ where: { userId: u.id } });
      await db.loginAttempt.deleteMany({ where: { userId: u.id } });
      await db.securityEvent.deleteMany({ where: { userId: u.id } });
      await db.session.deleteMany({ where: { userId: u.id } });
      await db.trustedDevice.deleteMany({ where: { userId: u.id } });
      await db.account.deleteMany({ where: { userId: u.id } });
      await db.user.delete({ where: { id: u.id } });
      console.log("✓ Deleted test user:", email);
    }
  }
  await db.loginAttempt.deleteMany({ where: { email: { in: testEmails } } });
  console.log("Done.");
  await db.$disconnect();
}

main();
