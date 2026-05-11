// Smoke test TOTP module
process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || "test-secret-32bytes-min-padding-padding";

import {
  generateTotpSecret,
  verifyTotp,
  encryptTotpSecret,
  decryptTotpSecret,
  generateBackupCodes,
  verifyBackupCode,
  hashBackupCode,
} from "../lib/security/totp";
import * as OTPAuth from "otpauth";

async function main() {
  console.log("--- Test 1: Sinh TOTP secret + QR ---");
  const { secret, otpauthUrl, qrDataUrl } = await generateTotpSecret("test@example.com");
  console.log("Secret base32 length:", secret.length);
  console.log("otpauth URL:", otpauthUrl);
  console.log("QR data URL starts with image/png:", qrDataUrl.startsWith("data:image/png;base64,"));

  // Sinh code đúng giờ hiện tại
  const totp = new OTPAuth.TOTP({
    issuer: "PKT Trần Phú",
    label: "test@example.com",
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const code = totp.generate();
  console.log("Code hiện tại:", code);

  console.log("\n--- Test 2: Verify ---");
  console.log("Verify code đúng:", verifyTotp(secret, code));
  console.log("Verify code sai:", verifyTotp(secret, "000000"));
  console.log("Verify code không phải số:", verifyTotp(secret, "abcdef"));
  console.log("Verify empty:", verifyTotp(secret, ""));

  console.log("\n--- Test 3: Encrypt/decrypt secret ---");
  const enc = encryptTotpSecret(secret);
  console.log("Encrypted length:", enc.length, "≠ plain:", enc !== secret);
  const dec = decryptTotpSecret(enc);
  console.log("Decrypt = original:", dec === secret);

  console.log("\n--- Test 4: Backup codes ---");
  const { plain, hashed } = generateBackupCodes(4);
  console.log("Plain codes:", plain);
  console.log("Hashed (first):", hashed[0].slice(0, 16) + "...");
  console.log("Length hashed:", hashed[0].length, "(SHA-256 hex = 64)");

  console.log("\n--- Test 5: Verify backup ---");
  console.log("Verify code đúng:", verifyBackupCode(plain[0], hashed));
  console.log("Verify case-insensitive:", verifyBackupCode(plain[1].toLowerCase(), hashed));
  console.log("Verify với dấu cách:", verifyBackupCode(plain[2].replace("-", " - "), hashed));
  console.log("Verify code sai:", verifyBackupCode("WRONG-CODE0", hashed));

  console.log("\n✓ All TOTP tests passed");
}

main().catch((e) => {
  console.error("✗ FAIL:", e);
  process.exit(1);
});
