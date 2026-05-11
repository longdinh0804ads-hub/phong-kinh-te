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
import { retrieveWithArticleExpansion, buildArticleGroupedMessage } from "../lib/rag-article-expansion";

async function main() {
  const articles = await retrieveWithArticleExpansion("chức năng của sở là gì", 3);
  const dieu3 = articles.find(a => a.article === "Điều 3");
  console.log("Điều 3 found:", !!dieu3);
  if (dieu3) {
    console.log("Số chunks:", dieu3.chunks.length);
    for (const c of dieu3.chunks) {
      console.log(`  Section: ${c.section || "(header)"} | Length: ${c.content.length}`);
      console.log(`  Full: ${c.content}`);
    }
  }
  const msg = buildArticleGroupedMessage("chức năng của sở là gì", articles);
  console.log("\n=== MESSAGE (first 2500 chars) ===");
  console.log(msg.slice(0, 2500));
  console.log(`\n[...total ${msg.length} chars]`);
  console.log("\nContains 'tư cách pháp nhân':", msg.includes("tư cách pháp nhân"));
  console.log("Contains 'Vị trí và chức năng':", msg.includes("Vị trí và chức năng"));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
