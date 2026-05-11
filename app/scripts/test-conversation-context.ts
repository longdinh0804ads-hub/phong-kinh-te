// Test conversation context: follow-up detection, reuse chunks, history loading.
import * as fs from "fs";
import * as path from "path";

const envFile = path.join(__dirname, "..", ".env.local");
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

import {
  isFollowUpQuestion,
  buildChatMessages,
  getChunksFromPreviousSources,
} from "../lib/rag-conversation";
import { db } from "../lib/db";

async function main() {
console.log("=== TEST 1: Follow-up detection ===");
const testCases: Array<{ q: string; hasHistory: boolean; expected: boolean }> = [
  { q: "tóm tắt những ý chính thôi", hasHistory: true, expected: true },
  { q: "tóm tắt", hasHistory: true, expected: true },
  { q: "ngắn gọn hơn", hasHistory: true, expected: true },
  { q: "rút gọn lại", hasHistory: true, expected: true },
  { q: "giải thích thêm", hasHistory: true, expected: true },
  { q: "cho ví dụ cụ thể", hasHistory: true, expected: true },
  { q: "vậy còn cấp xã thì sao", hasHistory: true, expected: true },
  { q: "thế còn nhiệm vụ?", hasHistory: true, expected: true },
  { q: "ok", hasHistory: true, expected: true }, // ≤4 từ
  { q: "nhiệm vụ của sở là gì", hasHistory: true, expected: false }, // câu hỏi mới
  { q: "thẩm quyền của UBND cấp tỉnh trong giao đất", hasHistory: true, expected: false },
  { q: "tóm tắt", hasHistory: false, expected: false }, // chưa có history
  { q: "chức năng của sở", hasHistory: false, expected: false },
];

let pass = 0;
let fail = 0;
for (const tc of testCases) {
  const got = isFollowUpQuestion(tc.q, tc.hasHistory);
  const ok = got === tc.expected;
  console.log(
    `  ${ok ? "✓" : "✗"} "${tc.q}" (hist=${tc.hasHistory}) → ${got} (expect ${tc.expected})`
  );
  if (ok) pass++;
  else fail++;
}
console.log(`\nResult: ${pass}/${testCases.length} PASS`);
if (fail > 0) process.exit(1);

console.log("\n=== TEST 2: Build chat messages ===");
const history = [
  { question: "nhiệm vụ của sở là gì", answer: "Sở có 16 nhiệm vụ chính: 1. Trình UBND tỉnh..." },
  { question: "có những nhiệm vụ nào về tài chính", answer: "Khoản 13 quy định: Quản lý và chịu trách nhiệm về tài chính, tài sản..." },
];
const messages = buildChatMessages(history, "tóm tắt những ý chính thôi");
console.log(`  Total messages: ${messages.length} (expect 5: 2 turns × 2 + 1 current)`);
for (let i = 0; i < messages.length; i++) {
  console.log(`  [${i}] ${messages[i].role}: ${messages[i].content.slice(0, 80)}...`);
}
if (messages.length !== 5) {
  console.log("✗ FAIL: wrong message count");
  process.exit(1);
}
if (messages[messages.length - 1].role !== "user") {
  console.log("✗ FAIL: last message must be user");
  process.exit(1);
}
console.log("✓ Messages structure correct");

console.log("\n=== TEST 3: Reuse chunks from previous sources ===");
// Mock previous sources (như structure đã lưu trong chatHistory.sources)
const doc = await db.legalDocument.findFirst({
  where: { docNumber: { contains: "150" } },
  select: { id: true, title: true },
});
if (!doc) {
  console.log("⚠ Doc 150 not in DB, skip test 3");
  process.exit(0);
}

const fakePrevSources = {
  _provider: "gemini",
  refs: [
    { documentId: doc.id, documentTitle: doc.title, article: "Điều 4", section: null },
    { documentId: doc.id, documentTitle: doc.title, article: "Điều 3", section: null },
  ],
};
const chunks = await getChunksFromPreviousSources(fakePrevSources);
console.log(`  Pulled ${chunks.length} chunks from previous sources`);
const articleSet = new Set(chunks.map((c) => c.article));
console.log(`  Articles: ${Array.from(articleSet).join(", ")}`);

const dieu4Count = chunks.filter((c) => c.article === "Điều 4").length;
const dieu3Count = chunks.filter((c) => c.article === "Điều 3").length;
console.log(`  Điều 4: ${dieu4Count} chunks (expect 17)`);
console.log(`  Điều 3: ${dieu3Count} chunks (expect 1)`);

if (dieu4Count >= 10 && dieu3Count >= 1) {
  console.log("✓ Reuse chunks pulled full articles (đầy đủ Khoản)");
} else {
  console.log("✗ FAIL: incomplete reuse");
  process.exit(1);
}

console.log("\n✓ All conversation context tests passed");
process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
