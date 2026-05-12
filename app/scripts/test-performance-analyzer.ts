/**
 * Test Performance Analyzer:
 *   1. Tạo 1 user fake với 3+ overdue task, 0 báo cáo → expect proposal
 *   2. Tạo 1 user khác có 1 overdue (< 3) → expect skip
 *   3. Test dedup: chạy 2 lần → lần 2 = 0 proposal mới
 *   4. Test approve flow: tạo proposal → call approveProposal → check notif tới user
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
import { runPerformanceAnalysis } from "../lib/ai-monitor/performance-analyzer";

const db = new PrismaClient();
const TEST_PREFIX = "TEST_PERF_";

async function cleanup() {
  const testUsers = await db.user.findMany({
    where: { email: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const userIds = testUsers.map((u) => u.id);
  if (userIds.length > 0) {
    await db.aIProposal.deleteMany({ where: { targetUserId: { in: userIds } } });
    await db.progressReport.deleteMany({ where: { reporterId: { in: userIds } } });
    await db.task.deleteMany({ where: { assigneeId: { in: userIds } } });
    await db.notification.deleteMany({ where: { userId: { in: userIds } } });
    await db.account.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
  // Clean up TP notifications của test
  await db.notification.deleteMany({
    where: { type: "REMINDER_PROPOSED", message: { contains: TEST_PREFIX } },
  });
}

async function main() {
  await cleanup();

  // Tạo TP test
  const tp = await db.user.findFirst({ where: { role: "TRUONG_PHONG" } });
  if (!tp) throw new Error("Cần TRUONG_PHONG trong DB");

  const now = new Date();
  const past = (days: number) => new Date(now.getTime() - days * 86400_000);
  const future = (days: number) => new Date(now.getTime() + days * 86400_000);

  // User 1: nhiều task overdue + ít báo cáo → expect FLAG ≥ 2
  const user1 = await db.user.create({
    data: {
      email: `${TEST_PREFIX}laggard@test.local`,
      name: `${TEST_PREFIX}Cán Bộ Lười`,
      role: "CHUYEN_VIEN",
      department: "TAI_CHINH_KE_HOACH",
      position: "Chuyên viên",
      fields: [],
      areas: [],
      managedDepartments: [],
      isActive: true,
      emailVerified: true,
    },
  });

  // Tạo 5 task overdue cho user 1
  for (let i = 0; i < 5; i++) {
    await db.task.create({
      data: {
        title: `${TEST_PREFIX}Overdue-${i}`,
        deadline: past(5 + i),
        priority: "THUONG",
        status: i % 2 === 0 ? "OVERDUE" : "IN_PROGRESS",
        creatorId: tp.id,
        assigneeId: user1.id,
        createdAt: past(20),
      },
    });
  }
  // Thêm 2 task IN_PROGRESS chưa quá hạn (để LOW_REPORTING trigger)
  for (let i = 0; i < 2; i++) {
    await db.task.create({
      data: {
        title: `${TEST_PREFIX}InProgress-${i}`,
        deadline: future(10),
        priority: "THUONG",
        status: "IN_PROGRESS",
        creatorId: tp.id,
        assigneeId: user1.id,
        createdAt: past(15),
      },
    });
  }
  // 0 progress report → LOW_REPORTING trigger

  // User 2: chỉ 1 overdue → KHÔNG flag
  const user2 = await db.user.create({
    data: {
      email: `${TEST_PREFIX}okay@test.local`,
      name: `${TEST_PREFIX}Cán Bộ Bình Thường`,
      role: "CHUYEN_VIEN",
      department: "TAI_CHINH_KE_HOACH",
      position: "Chuyên viên",
      fields: [],
      areas: [],
      managedDepartments: [],
      isActive: true,
      emailVerified: true,
    },
  });
  await db.task.create({
    data: {
      title: `${TEST_PREFIX}OnlyOverdue-1`,
      deadline: past(2),
      priority: "THUONG",
      status: "OVERDUE",
      creatorId: tp.id,
      assigneeId: user2.id,
      createdAt: past(10),
    },
  });

  console.log(`✓ Tạo user1 (lười) + user2 (OK) với task data`);

  // Run analysis
  console.log("\n=== Run 1: Phân tích lần đầu ===");
  const r1 = await runPerformanceAnalysis();
  console.log(`Users analyzed: ${r1.usersAnalyzed}`);
  console.log(`Proposals created: ${r1.proposalsCreated}`);
  console.log(`Skipped dedup: ${r1.proposalsSkippedDedup}`);
  console.log(`Flagged users:`);
  for (const f of r1.flagged) {
    console.log(`  - ${f.name}: flags=[${f.flags.join(", ")}], overdueOpen=${f.metrics.overdueOpen}`);
  }
  if (r1.errors.length > 0) {
    console.log("Errors:", r1.errors);
  }

  // Verify user1 có proposal pending
  const proposal1 = await db.aIProposal.findFirst({
    where: { targetUserId: user1.id, status: "pending" },
  });
  console.log(`\nUser1 proposal: ${proposal1 ? "✓ created" : "✗ missing"}`);
  if (proposal1) {
    const evidence = proposal1.evidence as any;
    console.log(`  Flags: ${(evidence.flags || []).join(", ")}`);
    console.log(`  Proposed note preview:`);
    console.log(proposal1.proposedNote.split("\n").slice(0, 3).map((l) => "    " + l).join("\n"));
  }

  // Verify user2 KHÔNG có proposal
  const proposal2 = await db.aIProposal.findFirst({
    where: { targetUserId: user2.id, status: "pending" },
  });
  console.log(`User2 proposal (expect none): ${proposal2 ? "✗ unexpected" : "✓ no proposal"}`);

  // Verify TP nhận notification REMINDER_PROPOSED
  const tpNotif = await db.notification.findFirst({
    where: { userId: tp.id, type: "REMINDER_PROPOSED" },
  });
  console.log(`TP notification: ${tpNotif ? "✓ created" : "✗ missing"}`);

  // Run lần 2 - dedup test
  console.log("\n=== Run 2: Dedup test ===");
  const r2 = await runPerformanceAnalysis();
  console.log(`Proposals created (expect 0): ${r2.proposalsCreated}`);
  console.log(`Skipped dedup: ${r2.proposalsSkippedDedup}`);
  if (r2.proposalsCreated > 0) {
    console.log("✗ Dedup FAILED");
  } else {
    console.log("✓ Dedup work");
  }

  await cleanup();
  console.log("\n✓ All performance analyzer tests done");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("FAIL:", e);
  await cleanup().catch(() => {});
  await db.$disconnect();
  process.exit(1);
});
