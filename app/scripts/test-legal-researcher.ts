/**
 * Test Legal Researcher Agent với 5 query có độ phức tạp tăng dần.
 */
import * as fs from "fs";
import * as path from "path";
for (const envName of [".env", ".env.local"]) {
  const f = path.join(__dirname, "..", envName);
  if (fs.existsSync(f))
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) {
        let v = m[2].trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
}

import { answerLegalQuery } from "../lib/ai-agents/legal-researcher";

const QUERIES = [
  {
    name: "Đơn giản: 1 doc",
    query: "Cấp giấy phép xây dựng nhà ở riêng lẻ cần thủ tục gì",
    expectMinCitations: 1,
  },
  {
    name: "Đơn giản: lĩnh vực rõ",
    query: "UBND xã có trách nhiệm gì về quản lý chất thải rắn sinh hoạt",
    expectMinCitations: 1,
  },
  {
    name: "Multi-hop: so sánh 2 lĩnh vực",
    query: "So sánh trách nhiệm UBND xã giữa môi trường và an toàn thực phẩm",
    expectMinCitations: 2,
  },
  {
    name: "Tổng hợp đa văn bản",
    query: "Tổng hợp các quy định cấp xã phải làm về bảo vệ môi trường năm 2026",
    expectMinCitations: 2,
  },
  {
    name: "Không tìm thấy (test fallback)",
    query: "Quy định về thủ tục cấp visa du lịch quốc tế",
    expectMinCitations: 0,
  },
];

async function main() {
  for (const t of QUERIES) {
    console.log("\n" + "═".repeat(70));
    console.log(`📋 ${t.name}`);
    console.log(`Query: "${t.query}"`);
    console.log("─".repeat(70));
    const start = Date.now();
    const result = await answerLegalQuery(t.query);
    const dur = Date.now() - start;

    console.log(`⏱  Latency: ${dur}ms`);
    console.log(`🎯 Sub-queries (${result.subQueries.length}):`);
    result.subQueries.forEach((sq, i) => console.log(`   ${i + 1}. ${sq}`));

    console.log(`\n📊 Confidence: ${result.confidence}`);
    if (result.warnings.length > 0) {
      console.log(`⚠️  Warnings:`);
      result.warnings.forEach((w) => console.log(`   - ${w}`));
    }

    console.log(`\n💬 Answer (${result.answer.length} chars):`);
    console.log(result.answer.split("\n").map((l) => "   " + l).join("\n"));

    console.log(`\n📚 Citations (${result.citations.length}):`);
    result.citations.forEach((c, i) => {
      console.log(`   [${i + 1}] ${c.docNumber}${c.article ? " " + c.article : ""} - ${c.docTitle.slice(0, 60)}`);
      console.log(`       "${c.excerpt.slice(0, 100)}..."`);
    });

    // Validate
    const pass = result.citations.length >= t.expectMinCitations;
    console.log(`\n${pass ? "✓" : "✗"} Expect ≥${t.expectMinCitations} citations, got ${result.citations.length}`);
  }
  console.log("\n" + "═".repeat(70));
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
