import { PrismaClient } from "@prisma/client";

async function main() {
  const PW = "Mnbvcxz0804%23%40%212k";
  const POOLER = `postgresql://postgres.pihmirhawfwpbjzprylc:${PW}@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true`;
  const DIRECT = `postgresql://postgres.pihmirhawfwpbjzprylc:${PW}@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres`;

  console.log("=== Test Pooler (6543) ===");
  const p1 = new PrismaClient({ datasources: { db: { url: POOLER } } });
  try {
    const r = await p1.$queryRawUnsafe<any[]>(`SELECT version() AS v`);
    console.log("✓ OK:", r[0].v.slice(0, 70));
  } catch (e: any) {
    console.error("✗ FAIL:", e.message.slice(0, 300));
  }
  await p1.$disconnect();

  console.log("\n=== Test Direct (5432) ===");
  const p2 = new PrismaClient({ datasources: { db: { url: DIRECT } } });
  try {
    const r = await p2.$queryRawUnsafe<any[]>(`SELECT version() AS v`);
    console.log("✓ OK:", r[0].v.slice(0, 70));
    const ext = await p2.$queryRawUnsafe<any[]>(
      `SELECT extname FROM pg_extension WHERE extname='vector'`
    );
    console.log("pgvector:", ext.length > 0 ? "✓ ENABLED" : "✗ NOT ENABLED — cần bật");
  } catch (e: any) {
    console.error("✗ FAIL:", e.message.slice(0, 300));
  }
  await p2.$disconnect();
}
main();
