// End-to-end integration test: simulate đúng flow của /api/ai/chat
// (trừ auth + LLM call), verify chunks → buildRAGUserMessage có Điều 3.
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

import { retrieveHybrid } from "../lib/rag-hybrid";
import { retrieveRelevantChunks, buildRAGUserMessage } from "../lib/rag";

async function main() {
  const question = "chức năng của sở là gì";
  console.log(`Question: "${question}"\n`);

  // === Mô phỏng đúng flow chat route ===
  let chunks = await retrieveHybrid(question, 8);
  if (chunks.length === 0) {
    console.log("Hybrid empty → fallback BM25 cũ");
    chunks = await retrieveRelevantChunks(question, 5);
  }

  console.log(`Retrieved ${chunks.length} chunks:`);
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    console.log(
      `  [${i + 1}] ${c.article || "?"} ${c.section || ""} | ${c.documentNumber} | score=${c.score.toFixed(3)}`
    );
  }

  // Build user message như thật
  const userMessage = buildRAGUserMessage(question, chunks);
  console.log(`\n=== User message length: ${userMessage.length} chars ===`);

  // Verify có Điều 3 trong message
  const hasArticle3 =
    userMessage.includes("Điều 3") &&
    /Vị trí và chức năng của sở|cơ quan chuyên môn thuộc Ủy ban nhân dân/i.test(userMessage);
  console.log(`Có Điều 3 trong context: ${hasArticle3 ? "✓ YES" : "✗ NO"}`);

  if (!hasArticle3) {
    console.log("\n❌ KHÔNG TÌM THẤY ĐIỀU 3 trong context truyền cho LLM!");
    process.exit(1);
  }

  console.log("\n✓ Integration test passed - LLM sẽ thấy Điều 3 và trả lời đúng");

  // Test thêm 1 lần với câu hỏi natural khác
  const q2 = "sở có tư cách pháp nhân không";
  console.log(`\n${"=".repeat(60)}\nQuestion 2: "${q2}"`);
  const chunks2 = await retrieveHybrid(q2, 8);
  for (let i = 0; i < Math.min(3, chunks2.length); i++) {
    const c = chunks2[i];
    console.log(`  [${i + 1}] ${c.article || "?"} | ${c.documentNumber} | score=${c.score.toFixed(3)}`);
  }
  const msg2 = buildRAGUserMessage(q2, chunks2);
  const has3 = /tư cách pháp nhân|Điều 3/.test(msg2);
  console.log(`Đề cập tư cách pháp nhân: ${has3 ? "✓" : "✗"}`);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
