// Tính count cho sidebar/bottom-nav badge.
// Chỉ count "của tôi" (action item) - không count toàn phòng kể cả với leader,
// vì leader đã có Dashboard tổng quan với stats riêng.

import { db } from "./db";
import type { Role } from "@prisma/client";

export interface SidebarBadges {
  /** Số task cần làm của user (PENDING + OVERDUE assigned/scoped to me) */
  tasks: number;
  /** Có ít nhất 1 task OVERDUE → hiện badge màu đỏ thay vì vàng */
  tasksHasOverdue: boolean;
  /** Số UBND directive cần xử lý */
  ubnd: number;
  /** Số iHanoi complaint chưa xử lý */
  ihanoi: number;
  /** Số TTHC record cần xử lý */
  tthc: number;
}

interface SidebarUser {
  id: string;
  role: Role;
  teamGroupCode: string | null;
}

/**
 * Lấy badge counts theo scope "của tôi":
 * - task: assigned to me OR group of me
 * - ubnd/ihanoi/tthc: assigned to me
 */
export async function getSidebarBadges(user: SidebarUser): Promise<SidebarBadges> {
  const now = new Date();

  // Scope task: assigned to me HOẶC trong tổ của tôi
  const taskScope: any = {
    deletedAt: null,
    OR: [
      { assigneeId: user.id },
      ...(user.teamGroupCode
        ? [{ taskGroup: { code: user.teamGroupCode } }]
        : []),
    ],
  };

  const [pendingCount, overdueCount, ubndCount, ihanoiCount, tthcCount] =
    await Promise.all([
      // Tasks PENDING/IN_PROGRESS chưa quá hạn
      db.task.count({
        where: {
          ...taskScope,
          status: { in: ["PENDING", "IN_PROGRESS"] },
          deadline: { gte: now },
        },
      }),
      // Tasks OVERDUE hoặc PENDING/IN_PROGRESS đã quá hạn
      db.task.count({
        where: {
          ...taskScope,
          OR: [
            { status: "OVERDUE" },
            {
              AND: [
                { status: { in: ["PENDING", "IN_PROGRESS"] } },
                { deadline: { lt: now } },
              ],
            },
          ],
        },
      }),
      // UBND directives assigned to me, chưa hoàn thành
      db.uBNDDirective.count({
        where: {
          deletedAt: null,
          assigneeId: user.id,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      }),
      // iHanoi complaints assigned to me, chưa xử lý xong
      db.iHanoiComplaint.count({
        where: {
          deletedAt: null,
          assigneeId: user.id,
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      }),
      // TTHC records handled by me, đang xử lý (field tên là handlerId không phải assigneeId)
      db.tTHCRecord.count({
        where: {
          deletedAt: null,
          handlerId: user.id,
          status: { in: ["RECEIVED", "PROCESSING"] },
        },
      }),
    ]);

  return {
    tasks: pendingCount + overdueCount,
    tasksHasOverdue: overdueCount > 0,
    ubnd: ubndCount,
    ihanoi: ihanoiCount,
    tthc: tthcCount,
  };
}

/** Format số hiển thị: > 99 → "99+" */
export function formatBadgeNumber(n: number): string {
  if (n <= 0) return "";
  if (n > 99) return "99+";
  return String(n);
}
