/**
 * Test runDeadlineAlerts: tạo 4 task với deadline D+3, D+1, D+0, D-2 (quá hạn)
 * → expect 3 task có alert, mỗi alert gửi cho cả assignee + TP/PTP.
 * → dedup test: chạy lần 2 → 0 notification mới.
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
import { runDeadlineAlerts, DEADLINE_TYPES } from "../lib/ai-monitor/deadline-alerts";

const db = new PrismaClient();
const TEST_PREFIX = "TEST_DEADLINE_";

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function cleanup() {
  // Xóa test tasks + notifications
  const testTasks = await db.task.findMany({
    where: { title: { startsWith: TEST_PREFIX } },
    select: { id: true },
  });
  const ids = testTasks.map((t) => t.id);
  if (ids.length > 0) {
    await db.notification.deleteMany({ where: { link: { in: ids.map((id) => `/tasks/${id}`) } } });
    await db.task.deleteMany({ where: { id: { in: ids } } });
  }
}

async function main() {
  await cleanup();

  // Lấy TP + PTP + 1 CV làm assignee
  const tp = await db.user.findFirst({ where: { role: "TRUONG_PHONG", isActive: true } });
  const ptp = await db.user.findFirst({ where: { role: "PHO_TP", isActive: true } });
  const cv = await db.user.findFirst({ where: { role: "CHUYEN_VIEN", isActive: true } });

  if (!tp || !cv) throw new Error("Cần ít nhất 1 TP và 1 CHUYEN_VIEN trong DB để test");

  console.log("Test users:");
  console.log(`  TP: ${tp.name}`);
  console.log(`  PTP: ${ptp?.name || "(none)"}`);
  console.log(`  CV: ${cv.name}`);

  // Tạo 4 test task với deadline khác nhau
  const todayMidnight = utcMidnight(new Date());
  // Set time to 12:00 to avoid timezone edge cases
  const noon = (offsetDays: number) =>
    new Date(todayMidnight.getTime() + offsetDays * 86400000 + 12 * 3600_000);

  const tasks = await Promise.all([
    db.task.create({
      data: {
        title: `${TEST_PREFIX}D+3`,
        priority: "THUONG",
        status: "PENDING",
        deadline: noon(3),
        creatorId: tp.id,
        assigneeId: cv.id,
      },
    }),
    db.task.create({
      data: {
        title: `${TEST_PREFIX}D+1`,
        priority: "CAO",
        status: "IN_PROGRESS",
        deadline: noon(1),
        creatorId: tp.id,
        assigneeId: cv.id,
      },
    }),
    db.task.create({
      data: {
        title: `${TEST_PREFIX}D+0`,
        priority: "KHAN_CAP",
        status: "PENDING",
        deadline: noon(0),
        creatorId: tp.id,
        assigneeId: cv.id,
      },
    }),
    db.task.create({
      data: {
        title: `${TEST_PREFIX}D-2`,
        priority: "THUONG",
        status: "OVERDUE",
        deadline: noon(-2),
        creatorId: tp.id,
        assigneeId: cv.id,
      },
    }),
  ]);
  console.log(`\n✓ Created ${tasks.length} test tasks (D+3, D+1, D+0, D-2 overdue)`);

  // ============ Run 1: expect 3 alerts × N recipients ============
  console.log("\n=== Run 1 ===");
  const r1 = await runDeadlineAlerts();
  console.log("scanned:", r1.scanned, "(expect 3 - D-2 quá hạn không nằm trong window)");
  console.log("notificationsCreated:", r1.notificationsCreated);
  console.log("byType:", r1.byType);
  console.log("errors:", r1.errors);

  // Expected: 3 task × (TP + PTP + CV) = 9 notif (nếu có PTP), 6 (nếu không)
  const expectedRecipientsPerTask = (ptp ? 2 : 1) + 1; // (TP+PTP) + CV
  const expectedCreated = 3 * expectedRecipientsPerTask;
  console.log(`Expected created: ${expectedCreated} (3 tasks × ${expectedRecipientsPerTask} recipients)`);
  if (r1.notificationsCreated !== expectedCreated) {
    console.log("⚠️  Mismatch - kiểm tra lại logic");
  }

  // Verify từng type có ≥1 record
  for (const type of Object.values(DEADLINE_TYPES)) {
    const count = await db.notification.count({
      where: { type, link: { in: tasks.map((t) => `/tasks/${t.id}`) } },
    });
    console.log(`  ${type}: ${count} notif`);
  }

  // Verify assignee CV nhận đủ 3 notif (D-3, D-1, D-0)
  const cvNotifs = await db.notification.findMany({
    where: {
      userId: cv.id,
      link: { in: tasks.map((t) => `/tasks/${t.id}`) },
    },
    select: { type: true, title: true },
  });
  console.log(`\n  CV ${cv.name} nhận ${cvNotifs.length} notif:`);
  cvNotifs.forEach((n) => console.log(`    - [${n.type}] ${n.title}`));

  // ============ Run 2: dedup → 0 mới ============
  console.log("\n=== Run 2 (dedup test) ===");
  const r2 = await runDeadlineAlerts();
  console.log("notificationsCreated:", r2.notificationsCreated, "(expect 0)");
  console.log("notificationsSkippedDedup:", r2.notificationsSkippedDedup);

  if (r2.notificationsCreated > 0) {
    console.log("✗ Dedup FAILED - đã tạo duplicate");
  } else {
    console.log("✓ Dedup work correctly");
  }

  // Cleanup
  await cleanup();
  console.log("\n✓ All deadline alerts tests done");
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("FAIL:", e);
  await cleanup().catch(() => {});
  await db.$disconnect();
  process.exit(1);
});
