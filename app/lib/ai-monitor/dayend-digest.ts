/**
 * Day-End Digest - 16h chiều VN.
 *
 * Tổng hợp gửi cho TP + PTP:
 *   - Số task hoàn thành hôm nay (+ tên người làm)
 *   - Số task mới được tạo hôm nay
 *   - Số progress report nộp hôm nay
 *   - Số task chuyển trạng thái IN_PROGRESS (cán bộ bắt đầu việc)
 *   - Số task IN_PROGRESS quá 1 ngày không có activity (idle)
 *
 * Output: 1 in-app notification per TP/PTP, dedup 1/ngày.
 */
import { db } from "@/lib/db";
import type { Role } from "@prisma/client";

export interface DayEndDigestResult {
  recipientCount: number;
  completedToday: number;
  newToday: number;
  reportsToday: number;
  startedToday: number;
  idleInProgress: number;
  notificationsCreated: number;
  notificationsSkippedDedup: number;
  errors: string[];
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function runDayEndDigest(): Promise<DayEndDigestResult> {
  const result: DayEndDigestResult = {
    recipientCount: 0,
    completedToday: 0,
    newToday: 0,
    reportsToday: 0,
    startedToday: 0,
    idleInProgress: 0,
    notificationsCreated: 0,
    notificationsSkippedDedup: 0,
    errors: [],
  };

  const now = new Date();
  const todayStart = utcMidnight(now);
  const todayEnd = new Date(todayStart.getTime() + 86400_000);
  const idleCutoff = new Date(todayStart.getTime() - 86400_000); // 1 ngày trước

  try {
    // 1. Tổng hợp activity hôm nay
    const [completed, newTasks, reports, started, idle] = await Promise.all([
      db.task.findMany({
        where: {
          status: "COMPLETED",
          completedAt: { gte: todayStart, lt: todayEnd },
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          assignee: { select: { name: true } },
        },
        take: 50,
      }),
      db.task.findMany({
        where: {
          createdAt: { gte: todayStart, lt: todayEnd },
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          priority: true,
          assignee: { select: { name: true } },
          creator: { select: { name: true } },
        },
        take: 50,
      }),
      db.progressReport.findMany({
        where: {
          createdAt: { gte: todayStart, lt: todayEnd },
        },
        select: {
          id: true,
          taskId: true,
          percentComplete: true,
          reporter: { select: { name: true } },
          task: { select: { title: true } },
        },
        take: 50,
      }),
      db.task.findMany({
        where: {
          status: "IN_PROGRESS",
          startedAt: { gte: todayStart, lt: todayEnd },
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          assignee: { select: { name: true } },
        },
        take: 50,
      }),
      db.task.findMany({
        where: {
          status: "IN_PROGRESS",
          updatedAt: { lt: idleCutoff },
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          updatedAt: true,
          assignee: { select: { name: true } },
        },
        take: 50,
      }),
    ]);

    result.completedToday = completed.length;
    result.newToday = newTasks.length;
    result.reportsToday = reports.length;
    result.startedToday = started.length;
    result.idleInProgress = idle.length;

    // 2. Build message
    const dateStr = now.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const title = `Báo cáo cuối ngày ${dateStr}`;

    const lines: string[] = [];

    // Section 1: Hoàn thành
    if (completed.length > 0) {
      lines.push(`✅ HOÀN THÀNH (${completed.length}):`);
      for (const t of completed.slice(0, 5)) {
        lines.push(`  • "${t.title}" - ${t.assignee?.name || "(chưa giao)"}`);
      }
      if (completed.length > 5) lines.push(`  ... và ${completed.length - 5} nhiệm vụ khác`);
    } else {
      lines.push(`✅ HOÀN THÀNH: chưa có nhiệm vụ nào hoàn thành hôm nay`);
    }

    // Section 2: Mới tạo
    if (newTasks.length > 0) {
      lines.push(`\n📥 NHIỆM VỤ MỚI (${newTasks.length}):`);
      for (const t of newTasks.slice(0, 5)) {
        lines.push(
          `  • "${t.title}" - ${t.assignee?.name || "(chưa giao)"} (giao bởi ${t.creator.name})`
        );
      }
      if (newTasks.length > 5) lines.push(`  ... và ${newTasks.length - 5} nhiệm vụ khác`);
    }

    // Section 3: Báo cáo tiến độ
    if (reports.length > 0) {
      lines.push(`\n📝 BÁO CÁO TIẾN ĐỘ (${reports.length}):`);
      // Group by reporter
      const byReporter = new Map<string, typeof reports>();
      for (const r of reports) {
        const name = r.reporter.name;
        if (!byReporter.has(name)) byReporter.set(name, []);
        byReporter.get(name)!.push(r);
      }
      for (const [name, list] of Array.from(byReporter.entries()).slice(0, 5)) {
        lines.push(`  • ${name}: ${list.length} báo cáo`);
      }
    }

    // Section 4: Đôn đốc IDLE
    if (idle.length > 0) {
      lines.push(`\n⚠️ NHIỆM VỤ KHÔNG CÓ HOẠT ĐỘNG >24H (${idle.length}):`);
      for (const t of idle.slice(0, 5)) {
        lines.push(`  • "${t.title}" - ${t.assignee?.name || "(chưa giao)"}`);
      }
      if (idle.length > 5) lines.push(`  ... và ${idle.length - 5} nhiệm vụ khác`);
    }

    const message = lines.join("\n") || "Phòng không có hoạt động nổi bật hôm nay.";

    // 3. Gửi TP + PTP
    const recipients = await db.user.findMany({
      where: {
        isActive: true,
        role: { in: ["TRUONG_PHONG", "PHO_TP"] as Role[] },
      },
      select: { id: true, name: true },
    });
    result.recipientCount = recipients.length;

    const link = `/reports/tasks?range=today`;

    for (const r of recipients) {
      try {
        const existing = await db.notification.findFirst({
          where: {
            userId: r.id,
            type: "DIGEST_DAYEND",
            createdAt: { gte: todayStart, lt: todayEnd },
          },
        });
        if (existing) {
          result.notificationsSkippedDedup++;
          continue;
        }

        await db.notification.create({
          data: {
            userId: r.id,
            type: "DIGEST_DAYEND",
            title,
            message: `[${completed.length} hoàn thành / ${newTasks.length} mới / ${reports.length} báo cáo]\n\n${message}`,
            link,
          },
        });
        result.notificationsCreated++;
      } catch (e: any) {
        result.errors.push(`recipient ${r.id}: ${e?.message}`);
      }
    }
  } catch (e: any) {
    result.errors.push(`dayend-digest main: ${e?.message}`);
  }

  return result;
}
