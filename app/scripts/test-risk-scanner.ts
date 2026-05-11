// Test risk scanner - tạo seed data + chạy scan + verify notification.
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
import { runRiskScan, RISK_TYPES } from "../lib/ai-monitor/scanner";

function divider(label: string) {
  console.log("\n" + "=".repeat(70));
  console.log(label);
  console.log("=".repeat(70));
}

async function main() {
  divider("SETUP - tạo seed data với 4 loại risk");

  const tp = await db.user.findFirst({
    where: { role: "TRUONG_PHONG", isActive: true },
    select: { id: true, name: true },
  });
  const target = await db.user.findFirst({
    where: {
      id: { not: tp?.id },
      isActive: true,
      role: { in: ["CHUYEN_VIEN", "NHAN_VIEN"] },
    },
    select: { id: true, name: true, teamGroupCode: true },
  });
  if (!tp || !target) {
    console.error("Cần ít nhất 1 TP + 1 cán bộ khác");
    process.exit(1);
  }
  console.log(`TP: ${tp.name}, target: ${target.name}`);

  const now = new Date();
  // Cleanup data cũ test trước
  await db.task.deleteMany({ where: { title: { contains: "(RISK-TEST)" } } });
  await db.notification.deleteMany({
    where: { message: { contains: "(RISK-TEST)" } },
  });

  // 1. OVERDUE task (deadline 3 ngày trước, status PENDING)
  const overdueDate = new Date(now.getTime() - 3 * 86400_000);
  const overdueTask = await db.task.create({
    data: {
      title: "Task OVERDUE (RISK-TEST)",
      description: "(RISK-TEST)",
      status: "PENDING",
      priority: "CAO",
      deadline: overdueDate,
      assigneeId: target.id,
      creatorId: tp.id,
      sourceType: "INTERNAL",
    },
  });
  console.log(`✓ Created OVERDUE task: ${overdueTask.id}`);

  // 2. DEADLINE_SOON task (deadline 12h tới)
  const soonDate = new Date(now.getTime() + 12 * 3600_000);
  const soonTask = await db.task.create({
    data: {
      title: "Task DEADLINE_SOON (RISK-TEST)",
      description: "(RISK-TEST)",
      status: "PENDING",
      priority: "CAO",
      deadline: soonDate,
      assigneeId: target.id,
      creatorId: tp.id,
      sourceType: "INTERNAL",
    },
  });
  console.log(`✓ Created DEADLINE_SOON task: ${soonTask.id}`);

  // 3. STALE_PENDING task (created 10 ngày trước, vẫn PENDING)
  const staleDate = new Date(now.getTime() - 10 * 86400_000);
  const staleTask = await db.task.create({
    data: {
      title: "Task STALE_PENDING (RISK-TEST)",
      description: "(RISK-TEST)",
      status: "PENDING",
      priority: "THUONG",
      deadline: new Date(now.getTime() + 30 * 86400_000),
      assigneeId: target.id,
      creatorId: tp.id,
      sourceType: "INTERNAL",
      createdAt: staleDate,
    },
  });
  console.log(`✓ Created STALE_PENDING task: ${staleTask.id}`);

  // 4. NO_REPORT task (IN_PROGRESS 20 ngày, không report)
  const noReportStart = new Date(now.getTime() - 20 * 86400_000);
  const noReportTask = await db.task.create({
    data: {
      title: "Task NO_REPORT (RISK-TEST)",
      description: "(RISK-TEST)",
      status: "IN_PROGRESS",
      priority: "THUONG",
      deadline: new Date(now.getTime() + 10 * 86400_000),
      assigneeId: target.id,
      creatorId: tp.id,
      sourceType: "INTERNAL",
      startedAt: noReportStart,
    },
  });
  console.log(`✓ Created NO_REPORT task: ${noReportTask.id}`);

  divider("RUN 1 - scanner lần đầu, expect notifications được tạo");
  const r1 = await runRiskScan();
  console.log(JSON.stringify(r1, null, 2));

  // Verify notifications
  divider("VERIFY notifications cho target");
  const targetNotifs = await db.notification.findMany({
    where: {
      userId: target.id,
      message: { contains: "(RISK-TEST)" },
    },
    select: { type: true, title: true, message: true },
  });
  console.log(`Target ${target.name} có ${targetNotifs.length} notification:`);
  for (const n of targetNotifs) {
    console.log(`  [${n.type}] ${n.title}`);
  }

  const tpNotifs = await db.notification.findMany({
    where: {
      userId: tp.id,
      message: { contains: "(RISK-TEST)" },
    },
    select: { type: true, title: true },
  });
  console.log(`TP ${tp.name} có ${tpNotifs.length} notification:`);
  for (const n of tpNotifs) {
    console.log(`  [${n.type}] ${n.title}`);
  }

  divider("RUN 2 - scanner chạy lại ngay, expect dedup (0 created)");
  const r2 = await runRiskScan();
  console.log("Created:", r2.notificationsCreated);
  console.log("Skipped (dedup):", r2.notificationsSkippedDedup);

  if (r2.notificationsCreated === 0) {
    console.log("✓ Dedup hoạt động đúng");
  } else {
    console.log("✗ Dedup KHÔNG hoạt động!");
  }

  divider("AUTO-MARK OVERDUE check");
  const stillPending = await db.task.findUnique({
    where: { id: overdueTask.id },
    select: { status: true },
  });
  console.log(`OVERDUE task status sau scan: ${stillPending?.status}`);
  if (stillPending?.status === "OVERDUE") {
    console.log("✓ Auto-mark OVERDUE hoạt động");
  } else {
    console.log("✗ Auto-mark KHÔNG hoạt động");
  }

  divider("CLEANUP test data");
  await db.notification.deleteMany({
    where: { message: { contains: "(RISK-TEST)" } },
  });
  await db.task.deleteMany({ where: { title: { contains: "(RISK-TEST)" } } });
  console.log("Cleaned up");

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
