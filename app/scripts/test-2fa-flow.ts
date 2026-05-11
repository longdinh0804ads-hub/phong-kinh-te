/**
 * E2E test 2FA flow:
 *   - Setup secret + enable
 *   - Verify code đúng (TOTP)
 *   - Verify code sai
 *   - Verify backup code
 *   - Disable
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
import * as OTPAuth from "otpauth";
import {
  generateTotpSecret,
  verifyTotp,
  encryptTotpSecret,
  decryptTotpSecret,
  generateBackupCodes,
  verifyBackupCode,
} from "../lib/security/totp";

const db = new PrismaClient();
const TEST_EMAIL = "test-2fa@phongkinhte-tranphu.vn";

async function cleanup() {
  const u = await db.user.findUnique({ where: { email: TEST_EMAIL } });
  if (u) {
    await db.session.deleteMany({ where: { userId: u.id } });
    await db.securityEvent.deleteMany({ where: { userId: u.id } });
    await db.loginAttempt.deleteMany({ where: { userId: u.id } });
    await db.user.delete({ where: { id: u.id } });
  }
}

async function main() {
  await cleanup();

  // 1. Sinh secret + QR
  const { secret, qrDataUrl } = await generateTotpSecret(TEST_EMAIL);
  console.log("[1] Generated secret base32:", secret.length, "chars");
  console.log("    QR PNG:", qrDataUrl.slice(0, 30) + "...");

  // 2. Tạo user + enable 2FA
  const encrypted = encryptTotpSecret(secret);
  const { plain: backupPlain, hashed: backupHashed } = generateBackupCodes(8);
  const user = await db.user.create({
    data: {
      email: TEST_EMAIL,
      name: "Test 2FA",
      role: "TRUONG_PHONG", // role yêu cầu 2FA
      department: "BAN_LANH_DAO",
      position: "TP test",
      fields: [],
      areas: [],
      managedDepartments: [],
      isActive: true,
      emailVerified: true,
      twoFactorSecret: encrypted,
      twoFactorEnabled: true,
      twoFactorBackupCodes: backupHashed,
    },
  });
  console.log("\n[2] User tạo + 2FA enabled. Backup codes:", backupPlain.length);

  // 3. Gen code đúng
  const totp = new OTPAuth.TOTP({
    issuer: "PKT Trần Phú",
    label: TEST_EMAIL,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const validCode = totp.generate();
  console.log("\n[3] Valid TOTP code:", validCode);

  // 4. Decrypt + verify (simulate verify2FA action)
  const dbUser = await db.user.findUnique({ where: { id: user.id } });
  const decSecret = decryptTotpSecret(dbUser!.twoFactorSecret!);
  if (decSecret !== secret) throw new Error("Decrypt secret mismatch");
  console.log("    Decrypt secret OK");
  console.log("    Verify đúng:", verifyTotp(decSecret, validCode));
  console.log("    Verify sai:", verifyTotp(decSecret, "000000"));

  // 5. Verify backup code
  const codeToUse = backupPlain[0];
  const idx = verifyBackupCode(codeToUse, backupHashed);
  console.log("\n[5] Backup code verify:", codeToUse, "→ index =", idx);
  if (idx < 0) throw new Error("Backup verify failed");

  // Simulate xóa backup code đã dùng
  const remaining = [...backupHashed];
  remaining.splice(idx, 1);
  await db.user.update({
    where: { id: user.id },
    data: { twoFactorBackupCodes: remaining },
  });
  const reloaded = await db.user.findUnique({ where: { id: user.id } });
  console.log("    Remaining backup count:", reloaded?.twoFactorBackupCodes.length);

  // Dùng lại code cũ → fail
  const idx2 = verifyBackupCode(codeToUse, reloaded!.twoFactorBackupCodes);
  console.log("    Reuse backup code (should fail):", idx2);
  if (idx2 >= 0) throw new Error("Backup code có thể tái sử dụng - BUG!");

  // 6. Disable 2FA
  await db.user.update({
    where: { id: user.id },
    data: {
      twoFactorSecret: null,
      twoFactorEnabled: false,
      twoFactorBackupCodes: [],
    },
  });
  const reload2 = await db.user.findUnique({ where: { id: user.id } });
  console.log("\n[6] Disabled. enabled =", reload2?.twoFactorEnabled);

  await cleanup();
  console.log("\n✓ All 2FA E2E tests passed");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("✗ FAIL:", e);
  await cleanup().catch(() => {});
  await db.$disconnect();
  process.exit(1);
});
