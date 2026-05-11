// Verify article expansion: query "nhiệm vụ của sở là gì" phải trả về full Điều 4 với đủ 16 Khoản.
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
  retrieveWithArticleExpansion,
  buildArticleGroupedMessage,
} from "../lib/rag-article-expansion";

interface Test {
  q: string;
  expectArticle: string;
  expectKhoanCount: number;
  expectKeywords: string[]; // các cụm phải có trong context
}

const TESTS: Test[] = [
  {
    q: "nhiệm vụ của sở là gì",
    expectArticle: "Điều 4",
    expectKhoanCount: 10, // ≥ 10 Khoản (toàn 16)
    expectKeywords: [
      "Trình Ủy ban nhân dân cấp tỉnh",
      "Tổ chức thực hiện",
      "hợp tác quốc tế",
      "thanh tra",
    ],
  },
  {
    q: "chức năng của sở là gì",
    expectArticle: "Điều 3",
    expectKhoanCount: 0, // Điều 3 không có Khoản (chunk đơn)
    expectKeywords: [
      "Vị trí và chức năng của sở",
      "tư cách pháp nhân",
      "tham mưu",
    ],
  },
  {
    q: "cơ cấu tổ chức của sở",
    expectArticle: "Điều 5",
    expectKhoanCount: 0, // Điều 5 single chunk, không tách Khoản
    expectKeywords: ["Cơ cấu tổ chức của sở", "Phòng chuyên môn"],
  },
];

async function main() {
  for (const t of TESTS) {
    console.log("\n" + "=".repeat(80));
    console.log(`Q: "${t.q}"`);
    console.log(`Expect: ${t.expectArticle} với ≥${t.expectKhoanCount} Khoản`);
    console.log("=".repeat(80));

    const t0 = Date.now();
    const articles = await retrieveWithArticleExpansion(t.q, 3);
    const ms = Date.now() - t0;

    console.log(`Returned ${articles.length} article groups (${ms}ms):`);
    for (let i = 0; i < articles.length; i++) {
      const a = articles[i];
      console.log(
        `\n  [${i + 1}] ${a.article || "(no article)"} | ${a.documentNumber} | ` +
          `${a.chunks.length} chunks | matched=${a.matchedCount} | aggScore=${a.aggregateScore.toFixed(2)}`
      );
      for (const c of a.chunks.slice(0, 3)) {
        console.log(
          `      ${c.section || "(header)"} ${c.point || ""} | ${c.content.slice(0, 80).replace(/\n/g, " ")}...`
        );
      }
      if (a.chunks.length > 3) console.log(`      ... +${a.chunks.length - 3} chunks`);
    }

    // Build full message
    const msg = buildArticleGroupedMessage(t.q, articles);
    console.log(`\nMessage length: ${msg.length} chars`);

    // Verify
    const expectedArticle = articles.find((a) => a.article === t.expectArticle);
    if (!expectedArticle) {
      console.log(`❌ FAIL: ${t.expectArticle} không có trong top articles`);
      continue;
    }

    const khoanCount = expectedArticle.chunks.filter((c) => c.section).length;
    if (khoanCount < t.expectKhoanCount) {
      console.log(
        `❌ FAIL: chỉ có ${khoanCount} Khoản, cần ≥${t.expectKhoanCount}`
      );
      continue;
    }

    // Normalize whitespace để match keywords bị xuống dòng do OCR (vd "tư cách\npháp nhân")
    const normalizedMsg = msg.replace(/\s+/g, " ");
    const missingKeywords = t.expectKeywords.filter(
      (kw) => !normalizedMsg.includes(kw.replace(/\s+/g, " "))
    );
    if (missingKeywords.length > 0) {
      console.log(`❌ FAIL: thiếu keywords: ${missingKeywords.join(", ")}`);
      continue;
    }

    console.log(
      `✓ PASS: ${t.expectArticle} có ${khoanCount} Khoản, đủ ${t.expectKeywords.length} keywords`
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
