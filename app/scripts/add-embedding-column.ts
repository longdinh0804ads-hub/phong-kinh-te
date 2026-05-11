// One-time migration: thêm cột embedding vector(768) cho legal_chunks.
// Dùng pgvector. Idempotent - chạy nhiều lần không lỗi.
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

async function main() {
  console.log("Step 1: Ensure pgvector extension installed...");
  await db.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);

  console.log("Step 2: Check if embedding column exists...");
  const columns: Array<{ column_name: string }> = await db.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'legal_chunks' AND column_name = 'embedding'`
  );

  if (columns.length === 0) {
    console.log("Step 3: Adding embedding vector(768) column...");
    await db.$executeRawUnsafe(
      `ALTER TABLE legal_chunks ADD COLUMN embedding vector(768)`
    );
    console.log("✓ Column added");
  } else {
    console.log("✓ Column already exists, skip");
  }

  console.log("Step 4: Create IVFFlat index for cosine similarity...");
  // Index chỉ tạo nếu có ít nhất vài hàng — pgvector recommend 1000+ rows.
  // Không sao nếu skip lúc empty, sau backfill sẽ tạo lại.
  const count: Array<{ count: bigint }> = await db.$queryRawUnsafe(
    `SELECT COUNT(*) as count FROM legal_chunks WHERE embedding IS NOT NULL`
  );
  const nonNullCount = Number(count[0].count);
  console.log(`  Non-null embedding rows: ${nonNullCount}`);

  if (nonNullCount >= 100) {
    try {
      await db.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS legal_chunks_embedding_idx
         ON legal_chunks USING ivfflat (embedding vector_cosine_ops)
         WITH (lists = 50)`
      );
      console.log("✓ IVFFlat index created (or exists)");
    } catch (e: any) {
      console.log("  Index creation skipped:", e?.message);
    }
  } else {
    console.log("  Skipping index (< 100 rows). Run again after backfill.");
  }

  console.log("\n✓ Migration complete");
  process.exit(0);
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
