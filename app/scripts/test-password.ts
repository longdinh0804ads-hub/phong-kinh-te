// Smoke test password module: argon2 hash/verify + bcrypt legacy
process.env.BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET || "test-secret-not-used-in-prod-32bytes-required-here-pad-pad-pad";

import { hashPassword, verifyPassword, generateTempPassword } from "../lib/crypto/password";
import bcrypt from "bcryptjs";

async function main() {
  console.log("--- Test 1: argon2 hash/verify ---");
  const h = await hashPassword("ChangeMe@2026Strong");
  console.log("Hash:", h.slice(0, 40) + "...");
  console.log("Starts with $argon2id:", h.startsWith("$argon2id"));
  const r1 = await verifyPassword("ChangeMe@2026Strong", h);
  console.log("Verify correct:", r1);
  const r2 = await verifyPassword("wrong", h);
  console.log("Verify wrong:", r2);

  console.log("\n--- Test 2: bcrypt legacy → needsRehash ---");
  const bcryptHash = await bcrypt.hash("legacy123", 12);
  const r3 = await verifyPassword("legacy123", bcryptHash);
  console.log("Bcrypt verify correct:", r3, "(needsRehash should be true)");
  const r4 = await verifyPassword("nope", bcryptHash);
  console.log("Bcrypt verify wrong:", r4);

  console.log("\n--- Test 3: generateTempPassword (16) ---");
  for (let i = 0; i < 3; i++) console.log(" ", generateTempPassword(16));

  console.log("\n--- Test 4: pepper sensitivity (same pw + diff pepper = diff hash) ---");
  const h1 = await hashPassword("samepw");
  const h2 = await hashPassword("samepw");
  console.log("Two hashes different (random salt):", h1 !== h2);
  // Verify cả hai
  console.log("Verify hash1:", (await verifyPassword("samepw", h1)).valid);
  console.log("Verify hash2:", (await verifyPassword("samepw", h2)).valid);

  console.log("\n✓ All password tests passed");
}

main().catch((e) => {
  console.error("✗ Test failed:", e);
  process.exit(1);
});
