// Smoke test: embedding 1 câu rồi 1 đoạn dài
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

import { embedText, embedBatch, isEmbeddingAvailable } from "../lib/embeddings";

async function cosine(a: number[], b: number[]): Promise<number> {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function main() {
  console.log("Embedding available:", isEmbeddingAvailable());

  // Test 1: Single embed
  const t1 = Date.now();
  const v1 = await embedText("chức năng của sở là gì");
  console.log(`\nTest 1: Single embed (${Date.now() - t1}ms)`);
  console.log(`  Vector dim: ${v1?.length}`);
  console.log(`  Sample: [${v1?.slice(0, 5).map((x) => x.toFixed(4)).join(", ")}, ...]`);

  // Test 2: Semantic similarity test
  console.log("\nTest 2: Semantic similarity");
  const queries = [
    "chức năng của sở là gì",
    "Sở là cơ quan chuyên môn thuộc Ủy ban nhân dân cấp tỉnh, thực hiện chức năng tham mưu",
    "Cơ cấu tổ chức của sở gồm Phòng chuyên môn nghiệp vụ, Văn phòng, Thanh tra",
    "Hôm nay trời đẹp, anh chàng đi câu cá ở hồ Tây",
  ];
  const t2 = Date.now();
  const vecs = await embedBatch(queries);
  console.log(`  Batch ${queries.length} (${Date.now() - t2}ms)`);
  for (const v of vecs) {
    if (!v) {
      console.log("  ✗ FAIL on one item");
      process.exit(1);
    }
  }

  console.log("  Cosine similarity với câu hỏi:");
  for (let i = 1; i < queries.length; i++) {
    const sim = await cosine(vecs[0]!, vecs[i]!);
    const label = i === 1 ? "[Đáp án Điều 3]" : i === 2 ? "[Điều 5 cơ cấu]" : "[Câu noise]";
    console.log(`    ${label}  sim=${sim.toFixed(4)}`);
  }

  console.log("\n✓ All tests passed");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
