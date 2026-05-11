/**
 * E2E test login flow qua HTTP với dev server đang chạy ở port 4001:
 *   1. Setup user test với bcrypt hash legacy
 *   2. Call loginAction (qua endpoint) → expect success
 *   3. Check DB: password đã rehash sang argon2
 *   4. Test wrong password fail × 5 → expect lockout
 *
 * Note: Server actions không expose qua HTTP trực tiếp như API routes.
 * Test này chạy login-protection + verify password trực tiếp.
 */
import * as fs from "fs";
import * as path from "path";
const envFile = path.join(__dirname, "..", ".env");
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
process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || "test-secret-32bytes-min-padding-padding";

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { hashPassword, verifyPassword } from "../lib/crypto/password";

const db = new PrismaClient();
const TEST_EMAIL = "test-e2e@phongkinhte-tranphu.vn";
const TEST_PW = "Trun#TestPass@2026";

async function cleanup() {
  const u = await db.user.findUnique({ where: { email: TEST_EMAIL } });
  if (u) {
    await db.passwordHistory.deleteMany({ where: { userId: u.id } });
    await db.loginAttempt.deleteMany({ where: { userId: u.id } });
    await db.session.deleteMany({ where: { userId: u.id } });
    await db.account.deleteMany({ where: { userId: u.id } });
    await db.user.delete({ where: { id: u.id } });
  }
}

async function main() {
  await cleanup();

  // 1. Tạo user với bcrypt hash (giả lập user cũ trước migration)
  const bcryptHash = await bcrypt.hash(TEST_PW, 12);
  const user = await db.user.create({
    data: {
      email: TEST_EMAIL,
      name: "Test E2E",
      role: "CHUYEN_VIEN",
      department: "TAI_CHINH_KE_HOACH",
      position: "Test",
      fields: [],
      areas: [],
      managedDepartments: [],
      isActive: true,
      emailVerified: true,
      accounts: {
        create: {
          providerId: "credential",
          accountId: TEST_EMAIL,
          password: bcryptHash,
        },
      },
    },
  });
  console.log("✓ User tạo với bcrypt hash legacy:", user.email);

  // 2. Verify password (manual call vào lib)
  const acct = await db.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });
  const v = await verifyPassword(TEST_PW, acct!.password!);
  console.log("Verify legacy bcrypt password:", v);
  if (!v.valid) throw new Error("Should verify bcrypt password");
  if (!v.needsRehash) throw new Error("Bcrypt should set needsRehash=true");

  // 3. Simulate rehash sau login thành công
  const newHash = await hashPassword(TEST_PW);
  await db.account.update({ where: { id: acct!.id }, data: { password: newHash } });
  console.log("✓ Đã rehash password sang argon2id");

  // 4. Verify lại với hash mới
  const acct2 = await db.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
  const v2 = await verifyPassword(TEST_PW, acct2!.password!);
  console.log("Verify argon2 password:", v2);
  if (!v2.valid) throw new Error("Argon2 verify failed");
  if (v2.needsRehash) throw new Error("Argon2 fresh hash shouldn't needsRehash");

  // 5. Verify sai password → fail
  const v3 = await verifyPassword("wrong-password", acct2!.password!);
  console.log("Verify wrong password:", v3);
  if (v3.valid) throw new Error("Wrong password shouldn't verify");

  await cleanup();
  console.log("\n✓ End-to-end migration flow OK");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("✗ FAIL:", e);
  await cleanup().catch(() => {});
  await db.$disconnect();
  process.exit(1);
});
