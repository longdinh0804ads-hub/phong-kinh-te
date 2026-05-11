// Backfill embedding cho các chunks chưa có embedding.
// Chạy 1 lần sau khi migrate column. Idempotent: skip chunks đã có.
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
import { embedBatch, vectorToSql, EMBEDDING_DIM } from "../lib/embeddings";

interface ChunkRow {
  id: string;
  content: string;
}

async function main() {
  const startTime = Date.now();

  // Lấy tất cả chunks chưa có embedding
  const rows: ChunkRow[] = await db.$queryRawUnsafe(
    `SELECT id, content FROM legal_chunks WHERE embedding IS NULL ORDER BY "createdAt" ASC`
  );

  console.log(`Total chunks cần backfill: ${rows.length}`);
  if (rows.length === 0) {
    console.log("✓ Không có gì để backfill");
    process.exit(0);
  }

  // Embed theo batch để giảm overhead
  const BATCH = 20;
  let done = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const texts = batch.map((r) => r.content);

    const t0 = Date.now();
    const vecs = await embedBatch(texts, "RETRIEVAL_DOCUMENT", 4);
    const dt = Date.now() - t0;

    // Lưu từng cái (raw SQL vì Prisma chưa support vector)
    for (let j = 0; j < batch.length; j++) {
      const vec = vecs[j];
      if (!vec) {
        failed++;
        console.log(`  ✗ Fail chunk ${batch[j].id} (${batch[j].content.slice(0, 60)})`);
        continue;
      }
      if (vec.length !== EMBEDDING_DIM) {
        failed++;
        console.log(`  ✗ Wrong dim ${vec.length} for chunk ${batch[j].id}`);
        continue;
      }
      const literal = vectorToSql(vec);
      await db.$executeRawUnsafe(
        `UPDATE legal_chunks SET embedding = $1::vector WHERE id = $2`,
        literal,
        batch[j].id
      );
      done++;
    }

    console.log(
      `  Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(rows.length / BATCH)}: ` +
        `${done}/${rows.length} done, ${failed} fail (${dt}ms)`
    );
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✓ Hoàn tất: ${done} done, ${failed} fail trong ${elapsed}s`);

  // Tạo IVFFlat index nếu đã đủ rows (optional, dataset nhỏ thì sequential scan vẫn nhanh)
  const count: Array<{ count: bigint }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*) as count FROM legal_chunks WHERE embedding IS NOT NULL`
  );
  const total = Number(count[0].count);
  console.log(`Total embeddings in DB: ${total}`);

  if (total >= 100) {
    try {
      await db.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS legal_chunks_embedding_idx
         ON legal_chunks USING ivfflat (embedding vector_cosine_ops)
         WITH (lists = ${Math.max(10, Math.floor(Math.sqrt(total)))})`
      );
      console.log("✓ IVFFlat index ensured");
    } catch (e: any) {
      console.log("Index creation skipped:", e?.message);
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
