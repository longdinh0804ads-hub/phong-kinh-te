// Verify hybrid retrieval cải thiện vs BM25 cũ trên nhiều query.
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

import { retrieveRelevantChunks } from "../lib/rag";
import { retrieveHybrid } from "../lib/rag-hybrid";

const QUERIES: Array<{ q: string; expectArticle: string; expectDoc: string }> = [
  {
    q: "chức năng của sở là gì",
    expectArticle: "Điều 3",
    expectDoc: "150",
  },
  {
    q: "vị trí của sở",
    expectArticle: "Điều 3",
    expectDoc: "150",
  },
  {
    q: "cơ cấu tổ chức của sở gồm những gì",
    expectArticle: "Điều 5",
    expectDoc: "150",
  },
  {
    q: "Sở Nội vụ làm những việc gì",
    expectArticle: "Điều 8",
    expectDoc: "150",
  },
  {
    q: "thẩm quyền giao đất của Ủy ban nhân dân cấp xã",
    expectArticle: "Điều 5",
    expectDoc: "151",
  },
];

interface RankInfo {
  position: number; // 1-based, 0 nếu không thấy trong top
  doc: string;
  article: string | null;
  score: number;
}

function findRank(
  chunks: Array<{ documentNumber: string; article: string | null; score: number }>,
  expectArticle: string,
  expectDoc: string
): RankInfo {
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    if (c.article === expectArticle && c.documentNumber.includes(expectDoc)) {
      return {
        position: i + 1,
        doc: c.documentNumber,
        article: c.article,
        score: c.score,
      };
    }
  }
  return { position: 0, doc: "", article: null, score: 0 };
}

async function main() {
  console.log("=".repeat(80));
  console.log("BENCHMARK: BM25 cũ vs Hybrid mới");
  console.log("=".repeat(80));

  let oldWins = 0;
  let newWins = 0;
  let ties = 0;

  for (const test of QUERIES) {
    console.log(`\nQuery: "${test.q}"`);
    console.log(`Expected: ${test.expectArticle} trong văn bản ${test.expectDoc}`);

    const t1 = Date.now();
    const oldResults = await retrieveRelevantChunks(test.q, 8);
    const oldMs = Date.now() - t1;

    const t2 = Date.now();
    const newResults = await retrieveHybrid(test.q, 8);
    const newMs = Date.now() - t2;

    const oldRank = findRank(
      oldResults.map((c) => ({ documentNumber: c.documentNumber, article: c.article, score: c.score })),
      test.expectArticle,
      test.expectDoc
    );
    const newRank = findRank(
      newResults.map((c) => ({ documentNumber: c.documentNumber, article: c.article, score: c.score })),
      test.expectArticle,
      test.expectDoc
    );

    const fmt = (r: RankInfo) =>
      r.position === 0 ? "❌ KHÔNG TRONG TOP-8" : `#${r.position} (score=${r.score.toFixed(3)})`;

    console.log(`  BM25 cũ:  ${fmt(oldRank)}  [${oldMs}ms]`);
    console.log(`  Hybrid:   ${fmt(newRank)}  [${newMs}ms]`);

    // Show top 3 of each for context
    console.log("  Top 3 BM25 cũ:");
    for (const c of oldResults.slice(0, 3)) {
      console.log(`    - ${c.article || "?"} ${c.section || ""} | ${c.documentNumber} | score=${c.score.toFixed(2)}`);
    }
    console.log("  Top 3 Hybrid:");
    for (const c of newResults.slice(0, 3)) {
      console.log(`    - ${c.article || "?"} ${c.section || ""} | ${c.documentNumber} | score=${c.score.toFixed(2)}`);
    }

    if (newRank.position === 0 && oldRank.position === 0) {
      ties++;
    } else if (newRank.position === 0) {
      oldWins++;
    } else if (oldRank.position === 0) {
      newWins++;
    } else if (newRank.position < oldRank.position) {
      newWins++;
    } else if (newRank.position > oldRank.position) {
      oldWins++;
    } else {
      ties++;
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log(`TỔNG KẾT: Hybrid thắng ${newWins} | BM25 cũ thắng ${oldWins} | Hòa ${ties}`);
  console.log("=".repeat(80));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
