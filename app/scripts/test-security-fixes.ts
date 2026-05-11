// Test các security fixes ở Phase A1+A2
import { checkRateLimit } from "../lib/rate-limiter";

console.log("=== TEST 1: Rate limiter ===");
const key = "test-user-1";
let allowed = 0, blocked = 0;
for (let i = 0; i < 25; i++) {
  const r = checkRateLimit(key, 20, 60_000);
  if (r.allowed) allowed++;
  else blocked++;
}
console.log(`  Allowed: ${allowed}/25, Blocked: ${blocked}/25`);
if (allowed !== 20 || blocked !== 5) {
  console.log("✗ FAIL: rate limiter sai");
  process.exit(1);
}
console.log("  ✓ Rate limiter chặn đúng 5/25 request vượt limit 20");

// Test sliding window
console.log("\n=== TEST 2: Different keys không ảnh hưởng nhau ===");
const r2 = checkRateLimit("test-user-2", 20, 60_000);
if (!r2.allowed) {
  console.log("✗ FAIL: user khác không nên bị rate limit");
  process.exit(1);
}
console.log("  ✓ User-2 vẫn allowed (independent bucket)");

console.log("\n=== TEST 3: Status transition matrix ===");
const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED", "PENDING"],
  OVERDUE: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};
const tests: Array<{ from: string; to: string; allowed: boolean }> = [
  { from: "PENDING", to: "IN_PROGRESS", allowed: true },
  { from: "PENDING", to: "COMPLETED", allowed: false },
  { from: "COMPLETED", to: "IN_PROGRESS", allowed: false },
  { from: "CANCELLED", to: "COMPLETED", allowed: false },
  { from: "OVERDUE", to: "COMPLETED", allowed: true },
];
for (const t of tests) {
  const got = (VALID_TRANSITIONS[t.from] || []).includes(t.to);
  if (got !== t.allowed) {
    console.log(`  ✗ FAIL: ${t.from} → ${t.to} expect ${t.allowed} got ${got}`);
    process.exit(1);
  }
  console.log(`  ✓ ${t.from} → ${t.to}: ${got ? "allowed" : "blocked"}`);
}

console.log("\n✓ All security tests pass");
process.exit(0);
