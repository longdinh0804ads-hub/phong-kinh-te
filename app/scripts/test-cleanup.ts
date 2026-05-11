import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  console.log("Cutoff date (older than this will be deleted):", cutoff.toISOString());
  console.log();

  const before = await db.conversation.findMany({
    select: { id: true, title: true, isPinned: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  console.log("BEFORE cleanup:");
  for (const c of before) {
    const days = Math.floor((Date.now() - c.updatedAt.getTime()) / 86400000);
    console.log(`  - ${days}d ago | ${c.isPinned ? "📌" : "  "} | ${c.title}`);
  }

  const result = await db.conversation.deleteMany({
    where: {
      updatedAt: { lt: cutoff },
      isPinned: false,
    },
  });
  console.log("\nDeleted:", result.count, "old conversations");

  const after = await db.conversation.findMany({
    select: { id: true, title: true, isPinned: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  console.log("\nAFTER cleanup:");
  for (const c of after) {
    const days = Math.floor((Date.now() - c.updatedAt.getTime()) / 86400000);
    console.log(`  - ${days}d ago | ${c.isPinned ? "📌" : "  "} | ${c.title}`);
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
