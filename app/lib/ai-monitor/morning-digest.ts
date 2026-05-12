/**
 * Morning Digest - 8h sáng VN.
 *
 * Tổng hợp gửi cho TP + PTP:
 *   - Task QUÁ HẠN chưa hoàn thành
 *   - Task ĐẾN HẠN HÔM NAY
 *   - Task SẮP ĐẾN HẠN (3 ngày tới)
 *
 * Output: 1 in-app notification dạng tóm tắt + link đến /reports/tasks (filter overdue/today).
 * Dedup: 1 digest/TP/ngày (key = today's date).
 */
import { db } from "@/lib/db";
import type { Role } from "@prisma/client";

export interface MorningDigestResult {
  recipientCount: number;
  overdueCount: number;
  dueTodayCount: number;
  upcomingCount: number;
  notificationsCreated: number;
  notificationsSkippedDedup: number;
  errors: string[];
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Cần thực hiện",
  IN_PROGRESS: "Đang xử lý",
  AWAITING_REVIEW: "Chờ TP xác nhận",
  OVERDUE: "Quá hạn",
};

function formatDeadline(d: Date): string {
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export async function runMorningDigest(): Promise<MorningDigestResult> {
  const result: MorningDigestResult = {
    recipientCount: 0,
    overdueCount: 0,
    dueTodayCount: 0,
    upcomingCount: 0,
    notificationsCreated: 0,
    notificationsSkippedDedup: 0,
    errors: [],
  };

  const now = new Date();
  const todayStart = utcMidnight(now);
  const todayEnd = new Date(todayStart.getTime() + 86400_000);
  const upcomingEnd = new Date(todayStart.getTime() + 4 * 86400_000); // hôm nay+3 ngày exclusive

  try {
    // 1. Lấy 3 nhóm task
    const [overdue, dueToday, upcoming] = await Promise.all([
      db.task.findMany({
        where: {
          status: { in: ["PENDING", "IN_PROGRESS", "OVERDUE", "AWAITING_REVIEW"] },
          deadline: { lt: todayStart },
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          deadline: true,
          status: true,
          priority: true,
          assignee: { select: { name: true } },
        },
        orderBy: { deadline: "asc" },
        take: 50,
      }),
      db.task.findMany({
        where: {
          status: { in: ["PENDING", "IN_PROGRESS", "AWAITING_REVIEW"] },
          deadline: { gte: todayStart, lt: todayEnd },
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          deadline: true,
          status: true,
          priority: true,
          assignee: { select: { name: true } },
        },
        orderBy: { priority: "asc" },
        take: 50,
      }),
      db.task.findMany({
        where: {
          status: { in: ["PENDING", "IN_PROGRESS"] },
          deadline: { gte: todayEnd, lt: upcomingEnd },
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          deadline: true,
          status: true,
          priority: true,
          assignee: { select: { name: true } },
        },
        orderBy: { deadline: "asc" },
        take: 50,
      }),
    ]);

    result.overdueCount = overdue.length;
    result.dueTodayCount = dueToday.length;
    result.upcomingCount = upcoming.length;

    // Không có gì → vẫn gửi (TP biết phòng ổn) nhưng message khác
    const totalPending = overdue.length + dueToday.length + upcoming.length;

    // 2. Build message
    const dateStr = now.toLocaleDateString("vi-VN", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const title = `Bản tin sáng ${dateStr}`;

    const lines: string[] = [];
    if (overdue.length > 0) {
      lines.push(`🔴 ${overdue.length} nhiệm vụ QUÁ HẠN:`);
      for (const t of overdue.slice(0, 5)) {
        const days = Math.floor((todayStart.getTime() - utcMidnight(t.deadline).getTime()) / 86400_000);
        lines.push(`  • "${t.title}" - ${t.assignee?.name || "(chưa giao)"} - quá ${days} ngày`);
      }
      if (overdue.length > 5) lines.push(`  ... và ${overdue.length - 5} nhiệm vụ khác`);
    }
    if (dueToday.length > 0) {
      lines.push(`🟡 ${dueToday.length} nhiệm vụ ĐẾN HẠN HÔM NAY:`);
      for (const t of dueToday.slice(0, 5)) {
        lines.push(`  • "${t.title}" - ${t.assignee?.name || "(chưa giao)"}`);
      }
      if (dueToday.length > 5) lines.push(`  ... và ${dueToday.length - 5} nhiệm vụ khác`);
    }
    if (upcoming.length > 0) {
      lines.push(`🟢 ${upcoming.length} nhiệm vụ SẮP ĐẾN HẠN (3 ngày tới):`);
      for (const t of upcoming.slice(0, 5)) {
        lines.push(`  • "${t.title}" - ${t.assignee?.name || "(chưa giao)"} - hạn ${formatDeadline(t.deadline)}`);
      }
      if (upcoming.length > 5) lines.push(`  ... và ${upcoming.length - 5} nhiệm vụ khác`);
    }

    if (lines.length === 0) {
      lines.push("✓ Không có nhiệm vụ quá hạn hoặc sắp đến hạn. Phòng đang vận hành tốt.");
    }

    const message = lines.join("\n");

    // 3. Gửi cho TP + PTP
    const recipients = await db.user.findMany({
      where: {
        isActive: true,
        role: { in: ["TRUONG_PHONG", "PHO_TP"] as Role[] },
      },
      select: { id: true, name: true },
    });
    result.recipientCount = recipients.length;

    // Dedup: 1 digest/ngày
    const link = `/reports/tasks?range=this-week`;
    const dedupKey = `morning-${todayStart.toISOString().slice(0, 10)}`;

    for (const r of recipients) {
      try {
        // Check existing digest hôm nay
        const existing = await db.notification.findFirst({
          where: {
            userId: r.id,
            type: "DIGEST_MORNING",
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
            type: "DIGEST_MORNING",
            title,
            message: `[${totalPending} nhiệm vụ cần lưu ý]\n\n${message}`,
            link,
          },
        });
        result.notificationsCreated++;
      } catch (e: any) {
        result.errors.push(`recipient ${r.id}: ${e?.message}`);
      }
    }
  } catch (e: any) {
    result.errors.push(`morning-digest main: ${e?.message}`);
  }

  return result;
}
