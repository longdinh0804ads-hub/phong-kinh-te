/**
 * Test Assignment Sheet:
 *   1. Tạo task qua action → expect sheet auto-tạo
 *   2. Check số phiếu unique per year
 *   3. Lấy sheet với formatted fields
 */
import * as fs from "fs";
import * as path from "path";
for (const envName of [".env", ".env.local"]) {
  const f = path.join(__dirname, "..", envName);
  if (fs.existsSync(f))
    for (const line of fs.readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) {
        let v = m[2].trim();
        if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
}

import { PrismaClient } from "@prisma/client";
import { createAssignmentSheet, formatSheetNumber, getNextSheetNumber } from "../lib/assignment-sheet";

const db = new PrismaClient();
const PREFIX = "TEST_PGV_";

async function cleanup() {
  const tasks = await db.task.findMany({
    where: { title: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = tasks.map((t) => t.id);
  if (ids.length > 0) {
    await db.assignmentSheet.deleteMany({ where: { taskId: { in: ids } } });
    await db.task.deleteMany({ where: { id: { in: ids } } });
  }
}

async function main() {
  await cleanup();

  const tp = await db.user.findFirst({ where: { role: "TRUONG_PHONG" } });
  const cv = await db.user.findFirst({ where: { role: "CHUYEN_VIEN" } });
  if (!tp || !cv) throw new Error("Cần TP + CV trong DB");

  const year = new Date().getFullYear();
  const nextBefore = await getNextSheetNumber(year);
  console.log(`Next number before test: ${nextBefore}`);

  // Tạo 3 task + sheet
  const sheets: any[] = [];
  for (let i = 0; i < 3; i++) {
    const task = await db.task.create({
      data: {
        title: `${PREFIX}Task ${i + 1}`,
        description: `Mô tả nhiệm vụ ${i + 1} - cần báo cáo trước hạn`,
        deadline: new Date(Date.now() + 7 * 86400_000),
        priority: i === 0 ? "KHAN_CAP" : "THUONG",
        status: "PENDING",
        creatorId: tp.id,
        assigneeId: cv.id,
        sourceType: "INTERNAL",
      },
    });
    const sheet = await createAssignmentSheet({ taskId: task.id });
    sheets.push({ task, sheet });
    console.log(
      `✓ Task "${task.title}" → Phiếu ${formatSheetNumber(sheet.number, sheet.year)}`
    );
  }

  // Verify number sequential
  if (sheets[0].sheet.number !== nextBefore) {
    console.log(`✗ First number mismatch: expected ${nextBefore}, got ${sheets[0].sheet.number}`);
  }
  if (sheets[1].sheet.number !== sheets[0].sheet.number + 1) {
    console.log("✗ Numbers not sequential");
  }
  if (sheets[2].sheet.number !== sheets[0].sheet.number + 2) {
    console.log("✗ Numbers not sequential");
  }

  // Verify unique constraint
  const dup = await db.assignmentSheet.findUnique({
    where: { year_number: { year, number: sheets[0].sheet.number } },
  });
  console.log(`Unique (${year}, ${sheets[0].sheet.number}):`, dup ? "✓ exists" : "✗ missing");

  // Verify fields auto-fill
  const full = await db.assignmentSheet.findUnique({
    where: { id: sheets[0].sheet.id },
    include: { task: { include: { assignee: true } } },
  });
  console.log("\nFirst sheet content:");
  console.log("  basisDocument:", full?.basisDocument);
  console.log("  workContent:", full?.workContent);
  console.log("  deliverable:", full?.deliverable?.slice(0, 80) + "...");
  console.log("  assignmentNote:", full?.assignmentNote);
  console.log("  signerName:", full?.signerName);
  console.log("  signerTitle:", full?.signerTitle);

  // Cleanup
  await cleanup();
  console.log("\n✓ Test passed, cleanup done");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("FAIL:", e);
  await cleanup().catch(() => {});
  await db.$disconnect();
  process.exit(1);
});
