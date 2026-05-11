// Investigate chunks of Điều 4 in NĐ 150 to understand why AI miss content
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

import { db } from "../lib/db";
import { retrieveHybrid } from "../lib/rag-hybrid";

async function main() {
  const doc = await db.legalDocument.findFirst({
    where: { docNumber: { contains: "150" } },
    select: { id: true, title: true, docNumber: true },
  });
  if (!doc) {
    console.log("Doc 150 not found");
    process.exit(1);
  }

  // 1. List ALL chunks of Điều 4
  const article4 = await db.legalChunk.findMany({
    where: { documentId: doc.id, article: "Điều 4" },
    orderBy: { chunkIndex: "asc" },
    select: { id: true, chunkIndex: true, article: true, section: true, content: true },
  });
  console.log(`\n=== Tất cả chunks của Điều 4 (${article4.length}) ===`);
  for (const c of article4) {
    console.log(
      `\n--- chunkIndex=${c.chunkIndex} | ${c.article} | ${c.section || "(header)"} | len=${c.content.length} ---`
    );
    console.log(c.content.slice(0, 600));
    if (c.content.length > 600) console.log(`... [+${c.content.length - 600} chars]`);
  }

  // 2. Test retrieve "nhiệm vụ của sở là gì"
  console.log("\n\n" + "=".repeat(80));
  console.log("Retrieve: 'nhiệm vụ của sở là gì'");
  console.log("=".repeat(80));
  const chunks = await retrieveHybrid("nhiệm vụ của sở là gì", 8);
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    console.log(
      `[${i + 1}] ${c.article || "?"} ${c.section || ""} | score=${c.score.toFixed(3)} | len=${c.content.length}`
    );
    console.log(`    ${c.content.slice(0, 200).replace(/\n/g, " ")}`);
  }

  // 3. Đếm tỷ lệ Điều 4 trong top-8
  const elc4InTop = chunks.filter((c) => c.article === "Điều 4");
  console.log(`\nĐiều 4 chunks trong top-8: ${elc4InTop.length}/${article4.length}`);

  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
