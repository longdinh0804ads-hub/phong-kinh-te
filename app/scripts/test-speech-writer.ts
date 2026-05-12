/**
 * Test Speech Writer Agent với 3 use case khác nhau.
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

import { generateSpeech, type SpeechInput } from "../lib/ai-agents/speech-writer";

const TESTS: { name: string; input: SpeechInput; expectMinWords: number; expectMaxWords: number }[] = [
  {
    name: "Test 1: Sơ kết bảo vệ môi trường Quý I/2026, đối tượng UBND, ngắn",
    input: {
      occasion: "so_ket",
      audience: "ubnd",
      length: "ngan",
      topic: "Sơ kết công tác bảo vệ môi trường Quý I/2026 của Phòng Kinh Tế",
      context:
        "Quý I/2026 đã kiểm tra 25 cơ sở sản xuất nhỏ, phát hiện 3 cơ sở vi phạm quy định về chất thải. Đã phối hợp với Tổ liên ngành ATTP kiểm tra 12 cơ sở chế biến nông sản.",
      autoLegalSearch: true,
    },
    expectMinWords: 200,
    expectMaxWords: 500,
  },
  {
    name: "Test 2: Khai mạc hội nghị triển khai văn bản, đối tượng Phòng, vừa",
    input: {
      occasion: "khai_mac",
      audience: "phong",
      length: "vua",
      topic: "Khai mạc hội nghị triển khai Công văn 245/UBND-KT về bảo vệ môi trường năm 2026",
      autoLegalSearch: true,
    },
    expectMinWords: 500,
    expectMaxWords: 900,
  },
  {
    name: "Test 3: Triển khai CCHC, đối tượng cán bộ phòng, vừa",
    input: {
      occasion: "trien_khai",
      audience: "phong",
      length: "vua",
      topic: "Triển khai chương trình chuyển đổi số quốc gia tại Phòng Kinh Tế",
      context: "Phòng có 21 cán bộ. Đã hoàn thành 60% dịch vụ công trực tuyến.",
      autoLegalSearch: true,
    },
    expectMinWords: 500,
    expectMaxWords: 900,
  },
];

async function main() {
  for (const t of TESTS) {
    console.log("\n" + "═".repeat(70));
    console.log(`📋 ${t.name}`);
    console.log("─".repeat(70));
    const start = Date.now();
    const r = await generateSpeech(t.input);
    const dur = Date.now() - start;

    console.log(`⏱  Latency: ${(dur / 1000).toFixed(1)}s`);
    console.log(`📊 Word count: ${r.wordCount} (expect ${t.expectMinWords}-${t.expectMaxWords})`);
    console.log(`📚 Citations: ${r.citations.length}`);
    console.log(`📐 Outline (${r.outline.length}):`);
    r.outline.forEach((o, i) => console.log(`   ${i + 1}. ${o}`));

    if (r.warnings.length > 0) {
      console.log(`⚠️  Warnings:`);
      r.warnings.forEach((w) => console.log(`   - ${w}`));
    }
    if (r.suggestedEdits.length > 0) {
      console.log(`💡 Suggested edits:`);
      r.suggestedEdits.forEach((s) => console.log(`   - ${s}`));
    }

    console.log(`\n💬 Speech preview (300 chars):`);
    console.log("   " + r.speech.slice(0, 300).replace(/\n/g, "\n   ") + "...");

    console.log(`\n📚 Citations used:`);
    r.citations.forEach((c, i) => {
      console.log(`   [${i + 1}] ${c.docNumber}${c.article ? " " + c.article : ""}`);
    });

    // Validate
    const wordOk = r.wordCount >= t.expectMinWords && r.wordCount <= t.expectMaxWords * 1.5;
    const speechOk = r.speech.length > 200;
    console.log(`\n${wordOk && speechOk ? "✓" : "✗"} word_in_range=${wordOk}, speech_present=${speechOk}`);
  }
  console.log("\n" + "═".repeat(70));
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
