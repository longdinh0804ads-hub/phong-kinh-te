/**
 * Deadline alerts module - chạy trong risk scanner daily.
 *
 * Quy tắc (theo user yêu cầu):
 *   - Cảnh báo cho CẢ Trưởng phòng/PTP VÀ cán bộ đảm nhận
 *   - 3 mốc:
 *     · D-3: cách hạn 3 ngày  → type DEADLINE_D3
 *     · D-1: cách hạn 1 ngày  → type DEADLINE_D1
 *     · D-0: đến hạn hôm nay  → type DEADLINE_TODAY
 *   - Mỗi mốc dedup riêng (1 lần/task/mốc trong 24h - thực tế chỉ 1 lần vì task không thể "lại" về mốc cũ)
 *   - CHỈ in-app notification (user nói không cần email cho rule này)
 *
 * Tính daysToDeadline:
 *   - Dựa trên UTC midnight để consistent (không phụ thuộc giờ scanner chạy)
 *   - daysDiff = floor((deadlineMidnight - todayMidnight) / 86400)
 *   - daysDiff == 3 → D-3
 *   - daysDiff == 1 → D-1
 *   - daysDiff == 0 → D-0 (đến hạn hôm nay)
 *   - daysDiff < 0 → quá hạn (xử lý ở module OVERDUE riêng)
 *   - daysDiff == 2, >=4 → skip
 */
import { db } from "@/lib/db";
import type { Role, TaskStatus } from "@prisma/client";

export const DEADLINE_TYPES = {
  D3: "RISK_DEADLINE_D3",
  D1: "RISK_DEADLINE_D1",
  TODAY: "RISK_DEADLINE_TODAY",
} as const;

export type DeadlineType = (typeof DEADLINE_TYPES)[keyof typeof DEADLINE_TYPES];

export interface DeadlineAlertsResult {
  scanned: number;
  notificationsCreated: number;
  notificationsSkippedDedup: number;
  byType: Record<DeadlineType, number>;
  errors: string[];
}

const DEDUP_HOURS = 24;

/**
 * Trả về date với giờ 00:00:00 UTC.
 */
function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Tính số ngày từ now đến deadline (làm tròn theo UTC midnight).
 */
function daysToDeadline(deadline: Date, now: Date): number {
  const dDay = utcMidnight(deadline).getTime();
  const today = utcMidnight(now).getTime();
  return Math.floor((dDay - today) / 86_400_000);
}

/**
 * Lấy IDs của TP + PTP active (không gồm SUPER_ADMIN).
 */
async function getTopLeaderIds(): Promise<string[]> {
  const leaders = await db.user.findMany({
    where: {
      isActive: true,
      role: { in: ["TRUONG_PHONG", "PHO_TP"] as Role[] },
    },
    select: { id: true },
  });
  return leaders.map((u) => u.id);
}

/**
 * Tạo notification dedup: cùng (userId, type, link) trong window không tạo lại.
 */
async function upsertNotification(opts: {
  userId: string;
  type: DeadlineType;
  title: string;
  message: string;
  link: string;
}): Promise<"created" | "skipped"> {
  const cutoff = new Date(Date.now() - DEDUP_HOURS * 3600_000);
  const existing = await db.notification.findFirst({
    where: {
      userId: opts.userId,
      type: opts.type,
      link: opts.link,
      createdAt: { gte: cutoff },
    },
  });
  if (existing) return "skipped";

  await db.notification.create({
    data: {
      userId: opts.userId,
      type: opts.type,
      title: opts.title,
      message: opts.message,
      link: opts.link,
    },
  });
  return "created";
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Cần thực hiện",
  IN_PROGRESS: "Đang xử lý",
  AWAITING_REVIEW: "Chờ TP xác nhận",
  COMPLETED: "Hoàn thành",
  OVERDUE: "Quá hạn",
  CANCELLED: "Đã hủy",
};

function buildAlert(
  daysDiff: number,
  task: { title: string; status: TaskStatus; assigneeName: string | null }
): { type: DeadlineType; title: string; message: string } {
  const personLabel = task.assigneeName || "(chưa giao)";
  if (daysDiff === 3) {
    return {
      type: DEADLINE_TYPES.D3,
      title: "Cách hạn 3 ngày",
      message: `Nhiệm vụ "${task.title}" (${personLabel}) còn 3 ngày tới hạn, trạng thái: ${STATUS_LABELS[task.status] || task.status}.`,
    };
  }
  if (daysDiff === 1) {
    return {
      type: DEADLINE_TYPES.D1,
      title: "Cách hạn 1 ngày",
      message: `Nhiệm vụ "${task.title}" (${personLabel}) còn 1 ngày tới hạn, trạng thái: ${STATUS_LABELS[task.status] || task.status}.`,
    };
  }
  // D-0
  return {
    type: DEADLINE_TYPES.TODAY,
    title: "Đến hạn hôm nay",
    message: `Nhiệm vụ "${task.title}" (${personLabel}) đến hạn hôm nay, trạng thái: ${STATUS_LABELS[task.status] || task.status}.`,
  };
}

/**
 * Chạy quét deadline alerts. Gọi từ risk scanner daily.
 */
export async function runDeadlineAlerts(): Promise<DeadlineAlertsResult> {
  const result: DeadlineAlertsResult = {
    scanned: 0,
    notificationsCreated: 0,
    notificationsSkippedDedup: 0,
    byType: {
      [DEADLINE_TYPES.D3]: 0,
      [DEADLINE_TYPES.D1]: 0,
      [DEADLINE_TYPES.TODAY]: 0,
    },
    errors: [],
  };

  const now = new Date();
  // Window: từ today đến today+3 ngày (UTC)
  const todayStart = utcMidnight(now);
  const cutoff = new Date(todayStart.getTime() + 4 * 86_400_000); // exclusive

  try {
    const tasks = await db.task.findMany({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS", "AWAITING_REVIEW"] },
        deadline: { gte: todayStart, lt: cutoff },
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        status: true,
        deadline: true,
        assigneeId: true,
        assignee: { select: { name: true } },
      },
      take: 500,
    });
    result.scanned = tasks.length;

    const topLeaderIds = await getTopLeaderIds();

    for (const t of tasks) {
      const diff = daysToDeadline(t.deadline, now);
      // Chỉ alert ở 3 mốc: 3, 1, 0
      if (diff !== 3 && diff !== 1 && diff !== 0) continue;

      const alert = buildAlert(diff, {
        title: t.title,
        status: t.status,
        assigneeName: t.assignee?.name || null,
      });
      const link = `/tasks/${t.id}`;

      // Recipients: TP + PTP + assignee (nếu có)
      const recipientIds = new Set<string>(topLeaderIds);
      if (t.assigneeId) recipientIds.add(t.assigneeId);

      for (const userId of recipientIds) {
        try {
          const r = await upsertNotification({
            userId,
            type: alert.type,
            title: alert.title,
            message: alert.message,
            link,
          });
          if (r === "created") {
            result.notificationsCreated++;
            result.byType[alert.type]++;
          } else {
            result.notificationsSkippedDedup++;
          }
        } catch (e: any) {
          result.errors.push(`task ${t.id} user ${userId}: ${e?.message}`);
        }
      }
    }
  } catch (e: any) {
    result.errors.push(`deadline-alerts main: ${e?.message}`);
  }

  return result;
}
