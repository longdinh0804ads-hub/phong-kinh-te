// Test VN timezone correctness của date-range.ts
import { computeDateRange } from "../lib/date-range";

function fmt(d: Date | undefined): string {
  if (!d) return "null";
  const vn = new Date(d.getTime() + 7 * 3600 * 1000);
  return d.toISOString() + " (VN: " + vn.toISOString().slice(0, 19).replace("T", " ") + ")";
}

// Test 1: Hôm nay
const today = computeDateRange("today");
console.log("=== TODAY ===");
console.log("from:", fmt(today?.from));
console.log("to:  ", fmt(today?.to));

// Test 2: Tuần này
const week = computeDateRange("this-week");
console.log("\n=== THIS WEEK ===");
console.log("from:", fmt(week?.from));
console.log("to:  ", fmt(week?.to));

// Test 3: Tháng này
const month = computeDateRange("this-month");
console.log("\n=== THIS MONTH ===");
console.log("from:", fmt(month?.from));
console.log("to:  ", fmt(month?.to));

// Verify: now là 2026-05-11 server time. VN day = 11/5 hoặc 12/5 tuỳ giờ.
// Today range phải bắt đầu 00:00 VN ngày hiện tại (= -7h UTC)
console.log("\n=== NOW ===");
console.log("now UTC:", new Date().toISOString());
console.log("now VN: ", fmt(new Date()));
