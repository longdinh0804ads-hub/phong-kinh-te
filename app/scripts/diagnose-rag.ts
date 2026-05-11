// Diagnose RAG retrieval cho query "chức năng của sở là gì"
import * as fs from "fs";
import * as path from "path";

// Load .env.local
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

import { db } from "../lib/db";
import { tokenizeKeywords } from "../lib/legal-parser";

async function main() {
  const docs = await db.legalDocument.findMany({
    where: { docNumber: { contains: "150" } },
    select: { id: true, title: true, docNumber: true, status: true },
  });
  console.log("=== Documents matching '150' ===");
  for (const d of docs) {
    console.log(`- ${d.docNumber} | ${d.title.slice(0, 80)} | ${d.status}`);
  }

  for (const d of docs) {
    if (d.status !== "active") continue;
    const chunks = await db.legalChunk.findMany({
      where: { documentId: d.id },
      orderBy: { chunkIndex: "asc" },
      select: { article: true, section: true, content: true, chunkIndex: true },
    });
    console.log(`\n=== ${d.docNumber}: ${chunks.length} chunks ===`);

    const query = "chức năng của sở là gì";
    const keywords = tokenizeKeywords(query);
    console.log(`Query: "${query}"`);
    console.log(`Tokenized keywords: ${JSON.stringify(keywords)}`);

    const matches = chunks.map((c) => {
      const tokens = tokenizeKeywords(c.content);
      const tf: Record<string, number> = {};
      for (const t of tokens) tf[t] = (tf[t] || 0) + 1;
      const matched = keywords.filter((k) => tf[k] > 0);
      const totalTF = matched.reduce((s, k) => s + tf[k], 0);
      let score = 0;
      for (const k of matched) score += 1 + Math.log(tf[k]);
      const coverage = matched.length / keywords.length;
      const finalScore = score * (0.5 + coverage * 0.5);
      return {
        i: c.chunkIndex,
        article: c.article,
        section: c.section,
        matched,
        totalTF,
        score,
        finalScore,
        len: c.content.length,
        preview: c.content.slice(0, 140).replace(/\n/g, " "),
      };
    });
    matches.sort((a, b) => b.finalScore - a.finalScore);
    console.log("\nTop 10 chunks (sorted by current scoring algorithm):");
    for (const m of matches.slice(0, 10)) {
      console.log(
        `  ${(m.article || "?").padEnd(10)} ${(m.section || "").padEnd(10)} | ` +
          `matched=[${m.matched.join(",")}] totalTF=${m.totalTF} score=${m.finalScore.toFixed(2)} len=${m.len}`
      );
      console.log(`    ${m.preview}`);
    }

    // Tìm chunk Điều 3 cụ thể
    const article3 = matches.find((m) => m.article === "Điều 3");
    if (article3) {
      console.log(
        `\n>>> Điều 3 rank: #${matches.indexOf(article3) + 1}, score=${article3.finalScore.toFixed(2)}`
      );
      console.log(`    Full content preview: ${article3.preview}`);
    } else {
      console.log("\n>>> Điều 3 KHÔNG có trong chunks (chưa được parse hoặc tài liệu khác)");
    }
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
