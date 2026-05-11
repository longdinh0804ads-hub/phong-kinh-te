/**
 * Integration test cho login-protection module với DB thật.
 * Tạo 1 user test, simulate fail login, check lockout/captcha logic.
 */
import * as fs from "fs";
import * as path from "path";

// Load .env
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
process.env.BETTER_AUTH_SECRET = "test-secret-32bytes-min-padding-padding";

import { PrismaClient } from "@prisma/client";
import {
  checkLockout,
  recordFailedLogin,
  recordSuccessfulLogin,
  adminUnlockUser,
} from "../lib/security/login-protection";

const db = new PrismaClient();
const TEST_EMAIL = "test-lockout@phongkinhte-tranphu.vn";
const TEST_IP = "10.99.99.99";

async function cleanup() {
  await db.loginAttempt.deleteMany({ where: { email: TEST_EMAIL } });
  await db.loginAttempt.deleteMany({ where: { ipAddress: TEST_IP } });
  const u = await db.user.findUnique({ where: { email: TEST_EMAIL } });
  if (u) {
    await db.passwordHistory.deleteMany({ where: { userId: u.id } });
    await db.securityEvent.deleteMany({ where: { userId: u.id } });
    await db.session.deleteMany({ where: { userId: u.id } });
    await db.account.deleteMany({ where: { userId: u.id } });
    await db.user.delete({ where: { id: u.id } });
  }
}

async function setupTestUser() {
  return db.user.create({
    data: {
      email: TEST_EMAIL,
      name: "Test User",
      role: "CHUYEN_VIEN",
      department: "TAI_CHINH_KE_HOACH",
      position: "Chuyên viên test",
      fields: [],
      areas: [],
      managedDepartments: [],
      isActive: true,
      emailVerified: true,
    },
  });
}

async function main() {
  await cleanup();
  console.log("✓ Cleanup OK\n");

  const user = await setupTestUser();
  console.log("✓ Created test user:", user.id, "\n");

  // Test 1: initial state - no captcha required
  const s0 = await checkLockout(TEST_EMAIL, TEST_IP);
  console.log("[Test 1] Initial state:", s0);
  if (s0.locked || s0.requireCaptcha) throw new Error("Initial should be clean");

  // Test 2: After 1 fail - no captcha yet
  await recordFailedLogin({
    email: TEST_EMAIL,
    userId: user.id,
    ipAddress: TEST_IP,
    failReason: "wrong_password",
  });
  const s1 = await checkLockout(TEST_EMAIL, TEST_IP);
  console.log("[Test 2] After 1 fail:", s1);
  if (s1.requireCaptcha) throw new Error("Captcha should NOT require yet (need 2+)");

  // Test 3: After 2 fail - captcha required
  await recordFailedLogin({
    email: TEST_EMAIL,
    userId: user.id,
    ipAddress: TEST_IP,
    failReason: "wrong_password",
  });
  const s2 = await checkLockout(TEST_EMAIL, TEST_IP);
  console.log("[Test 3] After 2 fail:", s2);
  if (!s2.requireCaptcha) throw new Error("Captcha SHOULD require after 2 fail");

  // Test 4: After 5 fail - lockout
  for (let i = 0; i < 3; i++) {
    await recordFailedLogin({
      email: TEST_EMAIL,
      userId: user.id,
      ipAddress: TEST_IP,
      failReason: "wrong_password",
    });
  }
  const s3 = await checkLockout(TEST_EMAIL, TEST_IP);
  console.log("[Test 4] After 5 fail:", s3);
  if (!s3.locked) throw new Error("Should be LOCKED after 5 fail");
  if (!s3.lockedUntil) throw new Error("lockedUntil should be set");
  const lockMinutes = (s3.lockedUntil!.getTime() - Date.now()) / 60000;
  console.log(`   Lock duration ~${lockMinutes.toFixed(1)} phút (expect ~15)`);

  // Test 5: Admin unlock
  await adminUnlockUser(user.id);
  const s4 = await checkLockout(TEST_EMAIL, TEST_IP);
  console.log("[Test 5] After admin unlock:", s4);
  if (s4.locked) throw new Error("Should NOT be locked after admin unlock");

  // Test 6: Success login reset counter
  await recordSuccessfulLogin({
    userId: user.id,
    email: TEST_EMAIL,
    ipAddress: TEST_IP,
  });
  const reset = await db.user.findUnique({ where: { id: user.id } });
  console.log("[Test 6] After success - failedLoginCount:", reset?.failedLoginCount);
  if (reset?.failedLoginCount !== 0) throw new Error("Counter should reset on success");

  await cleanup();
  console.log("\n✓ All login protection tests passed");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("✗ FAIL:", e);
  await cleanup().catch(() => {});
  await db.$disconnect();
  process.exit(1);
});
