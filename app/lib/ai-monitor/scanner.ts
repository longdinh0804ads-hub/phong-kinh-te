// AI Risk Scanner - quét DB định kỳ, phát hiện rủi ro và tạo notification.
// Chạy bởi cron mỗi 30 phút qua /api/cron/risk-scan.

import { db } from "@/lib/db";
import type { Role } from "@prisma/client";

// =====================================================
// Risk types
// =====================================================
export const RISK_TYPES = {
  OVERDUE: "RISK_OVERDUE",
  DEADLINE_SOON: "RISK_DEADLINE_SOON",
  STALE_PENDING: "RISK_STALE_PENDING",
  UBND_DEADLINE: "RISK_UBND_DEADLINE",
  OVERLOAD: "RISK_OVERLOAD",
  NO_REPORT: "RISK_NO_REPORT",
  /** AWAITING_REVIEW > 3 ngày chưa được TP duyệt */
  AWAITING_REVIEW_STALE: "RISK_AWAITING_REVIEW",
} as const;

export type RiskType = (typeof RISK_TYPES)[keyof typeof RISK_TYPES];

// =====================================================
// Config thresholds
// =====================================================
const THRESHOLDS = {
  DEADLINE_SOON_HOURS: 24, // task tới hạn trong 24h
  UBND_DEADLINE_HOURS: 48, // UBND tới hạn trong 48h
  STALE_PENDING_DAYS: 7, // task PENDING > 7 ngày
  NO_REPORT_DAYS: 14, // task IN_PROGRESS > 14 ngày không báo cáo
  OVERLOAD_TASKS: 10, // > 10 task active+overdue = quá tải
  AWAITING_REVIEW_DAYS: 3, // task AWAITING_REVIEW > 3 ngày chưa duyệt
  DEDUP_WINDOW_HOURS: 24, // không gửi lại cùng 1 notif trong 24h
};

// =====================================================
// Scanner result
// =====================================================
export interface ScanResult {
  startedAt: string;
  durationMs: number;
  risks: {
    overdueCount: number;
    deadlineSoonCount: number;
    stalePendingCount: number;
    ubndDeadlineCount: number;
    overloadCount: number;
    noReportCount: number;
    awaitingReviewCount: number;
  };
  notificationsCreated: number;
  notificationsSkippedDedup: number;
  autoMarkedOverdue: number;
  errors: string[];
}

// =====================================================
// Helper: lấy leader IDs (TRUONG_PHONG + PHO_TP + tổ trưởng của assignee)
// =====================================================
async function getLeaderIdsFor(opts: {
  assigneeTeamGroupCode?: string | null;
  includeTopLeaders?: boolean;
}): Promise<string[]> {
  const conditions: any[] = [];
  if (opts.includeTopLeaders !== false) {
    conditions.push({ role: { in: ["TRUONG_PHONG", "PHO_TP"] as Role[] } });
  }
  if (opts.assigneeTeamGroupCode) {
    conditions.push({
      role: "TRUONG_BO_PHAN" as Role,
      teamGroupCode: opts.assigneeTeamGroupCode,
    });
  }
  if (conditions.length === 0) return [];
  const leaders = await db.user.findMany({
    where: { isActive: true, OR: conditions },
    select: { id: true },
  });
  return leaders.map((u) => u.id);
}

// =====================================================
// Helper: tạo notification có dedup
// =====================================================
async function createNotificationIfNew(opts: {
  userId: string;
  type: RiskType;
  entityId: string; // task ID hoặc user ID dùng làm dedup key
  title: string;
  message: string;
  link: string;
}): Promise<"created" | "skipped"> {
  const cutoff = new Date(Date.now() - THRESHOLDS.DEDUP_WINDOW_HOURS * 3600_000);
  // Dedup: nếu trong 24h đã có notification cùng type + cùng link (entity) → skip
  const existing = await db.notification.findFirst({
    where: {
      userId: opts.userId,
      type: opts.type,
      link: opts.link,
      createdAt: { gte: cutoff },
    },
    select: { id: true },
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

// =====================================================
// Main scan function
// =====================================================
export async function runRiskScan(): Promise<ScanResult> {
  const startedAt = new Date();
  const result: ScanResult = {
    startedAt: startedAt.toISOString(),
    durationMs: 0,
    risks: {
      overdueCount: 0,
      deadlineSoonCount: 0,
      stalePendingCount: 0,
      ubndDeadlineCount: 0,
      overloadCount: 0,
      noReportCount: 0,
      awaitingReviewCount: 0,
    },
    notificationsCreated: 0,
    notificationsSkippedDedup: 0,
    autoMarkedOverdue: 0,
    errors: [],
  };

  // ====== STEP 0: Auto-mark OVERDUE task ======
  // Lưu ý: KHÔNG mark AWAITING_REVIEW thành OVERDUE (assignee đã làm xong, chờ TP duyệt).
  try {
    const markRes = await db.task.updateMany({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS"] },
        deadline: { lt: new Date() },
        deletedAt: null,
      },
      data: { status: "OVERDUE" },
    });
    result.autoMarkedOverdue = markRes.count;
  } catch (e: any) {
    result.errors.push(`auto-mark-overdue: ${e.message}`);
  }

  const now = new Date();

  // ====== STEP 1: OVERDUE tasks ======
  try {
    const overdueTasks = await db.task.findMany({
      where: { status: "OVERDUE", deletedAt: null },
      select: {
        id: true,
        title: true,
        deadline: true,
        assigneeId: true,
        assignee: { select: { name: true, teamGroupCode: true } },
        taskGroup: { select: { code: true, name: true } },
      },
      take: 200,
    });
    result.risks.overdueCount = overdueTasks.length;

    for (const t of overdueTasks) {
      const days = Math.floor((now.getTime() - t.deadline.getTime()) / 86400_000);
      const recipientIds = new Set<string>();
      if (t.assigneeId) recipientIds.add(t.assigneeId);
      const leaders = await getLeaderIdsFor({
        assigneeTeamGroupCode: t.assignee?.teamGroupCode || t.taskGroup?.code,
      });
      leaders.forEach((id) => recipientIds.add(id));

      const personLabel = t.assignee?.name || t.taskGroup?.name || "(chưa giao)";
      const msg = `Nhiệm vụ "${t.title}" (${personLabel}) đã quá hạn ${days} ngày.`;
      const link = `/tasks/${t.id}`;

      for (const userId of recipientIds) {
        const r = await createNotificationIfNew({
          userId,
          type: RISK_TYPES.OVERDUE,
          entityId: t.id,
          title: `⚠️ Nhiệm vụ quá hạn ${days} ngày`,
          message: msg,
          link,
        });
        if (r === "created") result.notificationsCreated++;
        else result.notificationsSkippedDedup++;
      }
    }
  } catch (e: any) {
    result.errors.push(`overdue-scan: ${e.message}`);
  }

  // ====== STEP 2: DEADLINE_SOON (task < 24h) ======
  try {
    const soonCutoff = new Date(now.getTime() + THRESHOLDS.DEADLINE_SOON_HOURS * 3600_000);
    const soonTasks = await db.task.findMany({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS"] },
        deadline: { gte: now, lte: soonCutoff },
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        deadline: true,
        assigneeId: true,
        assignee: { select: { name: true, teamGroupCode: true } },
        taskGroup: { select: { code: true, name: true } },
      },
      take: 200,
    });
    result.risks.deadlineSoonCount = soonTasks.length;

    for (const t of soonTasks) {
      const hours = Math.max(
        0,
        Math.floor((t.deadline.getTime() - now.getTime()) / 3600_000)
      );
      const recipientIds = new Set<string>();
      if (t.assigneeId) recipientIds.add(t.assigneeId);
      const leaders = await getLeaderIdsFor({
        assigneeTeamGroupCode: t.assignee?.teamGroupCode || t.taskGroup?.code,
      });
      leaders.forEach((id) => recipientIds.add(id));

      const personLabel = t.assignee?.name || t.taskGroup?.name || "(chưa giao)";
      const msg = `Nhiệm vụ "${t.title}" (${personLabel}) còn ${hours} giờ tới hạn.`;
      const link = `/tasks/${t.id}`;

      for (const userId of recipientIds) {
        const r = await createNotificationIfNew({
          userId,
          type: RISK_TYPES.DEADLINE_SOON,
          entityId: t.id,
          title: `⏰ Còn ${hours}h tới hạn`,
          message: msg,
          link,
        });
        if (r === "created") result.notificationsCreated++;
        else result.notificationsSkippedDedup++;
      }
    }
  } catch (e: any) {
    result.errors.push(`deadline-soon: ${e.message}`);
  }

  // ====== STEP 3: STALE_PENDING (task PENDING > 7 ngày) ======
  try {
    const staleCutoff = new Date(
      now.getTime() - THRESHOLDS.STALE_PENDING_DAYS * 86400_000
    );
    const stalePending = await db.task.findMany({
      where: {
        status: "PENDING",
        createdAt: { lt: staleCutoff },
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        assigneeId: true,
        assignee: { select: { name: true, teamGroupCode: true } },
        taskGroup: { select: { code: true, name: true } },
      },
      take: 100,
    });
    result.risks.stalePendingCount = stalePending.length;

    for (const t of stalePending) {
      const days = Math.floor((now.getTime() - t.createdAt.getTime()) / 86400_000);
      const recipientIds = new Set<string>();
      if (t.assigneeId) recipientIds.add(t.assigneeId);
      const leaders = await getLeaderIdsFor({
        assigneeTeamGroupCode: t.assignee?.teamGroupCode || t.taskGroup?.code,
      });
      leaders.forEach((id) => recipientIds.add(id));

      const personLabel = t.assignee?.name || t.taskGroup?.name || "(chưa giao)";
      const msg = `Nhiệm vụ "${t.title}" (${personLabel}) chờ ${days} ngày chưa bắt đầu.`;
      const link = `/tasks/${t.id}`;

      for (const userId of recipientIds) {
        const r = await createNotificationIfNew({
          userId,
          type: RISK_TYPES.STALE_PENDING,
          entityId: t.id,
          title: `🐢 Nhiệm vụ chờ quá lâu`,
          message: msg,
          link,
        });
        if (r === "created") result.notificationsCreated++;
        else result.notificationsSkippedDedup++;
      }
    }
  } catch (e: any) {
    result.errors.push(`stale-pending: ${e.message}`);
  }

  // ====== STEP 4: UBND_DEADLINE (< 48h) ======
  try {
    const ubndCutoff = new Date(now.getTime() + THRESHOLDS.UBND_DEADLINE_HOURS * 3600_000);
    const ubndSoon = await db.uBNDDirective.findMany({
      where: {
        status: { in: ["PENDING", "IN_PROGRESS"] },
        deadline: { gte: now, lte: ubndCutoff },
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        deadline: true,
        assigneeId: true,
        assignee: { select: { name: true, teamGroupCode: true } },
      },
      take: 100,
    });
    result.risks.ubndDeadlineCount = ubndSoon.length;

    for (const u of ubndSoon) {
      const hours = Math.max(
        0,
        Math.floor((u.deadline.getTime() - now.getTime()) / 3600_000)
      );
      const recipientIds = new Set<string>();
      if (u.assigneeId) recipientIds.add(u.assigneeId);
      const leaders = await getLeaderIdsFor({
        assigneeTeamGroupCode: u.assignee?.teamGroupCode || null,
        includeTopLeaders: true,
      });
      leaders.forEach((id) => recipientIds.add(id));

      const msg = `Nhiệm vụ UBND "${u.title}" còn ${hours} giờ tới hạn phản hồi.`;
      const link = `/ubnd/${u.id}`;

      for (const userId of recipientIds) {
        const r = await createNotificationIfNew({
          userId,
          type: RISK_TYPES.UBND_DEADLINE,
          entityId: u.id,
          title: `🏛️ UBND chỉ đạo - còn ${hours}h`,
          message: msg,
          link,
        });
        if (r === "created") result.notificationsCreated++;
        else result.notificationsSkippedDedup++;
      }
    }
  } catch (e: any) {
    result.errors.push(`ubnd-deadline: ${e.message}`);
  }

  // ====== STEP 5: OVERLOAD - cán bộ > 10 task ======
  try {
    const users = await db.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        teamGroupCode: true,
        assignedTasks: {
          where: { deletedAt: null, status: { in: ["PENDING", "IN_PROGRESS", "OVERDUE"] } },
          select: { id: true },
        },
      },
    });
    const overloaded = users.filter(
      (u) => u.assignedTasks.length > THRESHOLDS.OVERLOAD_TASKS
    );
    result.risks.overloadCount = overloaded.length;

    const topLeaders = await getLeaderIdsFor({ includeTopLeaders: true });
    for (const u of overloaded) {
      const count = u.assignedTasks.length;
      const teamLeaders = u.teamGroupCode
        ? await getLeaderIdsFor({
            assigneeTeamGroupCode: u.teamGroupCode,
            includeTopLeaders: false,
          })
        : [];
      const recipients = new Set([...topLeaders, ...teamLeaders]);

      const msg = `Cán bộ ${u.name} đang có ${count} nhiệm vụ chưa hoàn thành. Cân nhắc tái phân công.`;
      const link = `/users/${u.id}`;

      for (const userId of recipients) {
        const r = await createNotificationIfNew({
          userId,
          type: RISK_TYPES.OVERLOAD,
          entityId: u.id,
          title: `📊 ${u.name} quá tải`,
          message: msg,
          link,
        });
        if (r === "created") result.notificationsCreated++;
        else result.notificationsSkippedDedup++;
      }
    }
  } catch (e: any) {
    result.errors.push(`overload: ${e.message}`);
  }

  // ====== STEP 6: NO_REPORT - task IN_PROGRESS > 14 ngày không báo cáo ======
  try {
    const reportCutoff = new Date(
      now.getTime() - THRESHOLDS.NO_REPORT_DAYS * 86400_000
    );
    const noReportTasks = await db.task.findMany({
      where: {
        status: "IN_PROGRESS",
        startedAt: { lt: reportCutoff },
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        startedAt: true,
        assigneeId: true,
        assignee: { select: { name: true, teamGroupCode: true } },
        taskGroup: { select: { code: true, name: true } },
        progressReports: {
          where: { createdAt: { gte: reportCutoff } },
          select: { id: true },
          take: 1,
        },
      },
      take: 100,
    });
    const truly = noReportTasks.filter((t) => t.progressReports.length === 0);
    result.risks.noReportCount = truly.length;

    for (const t of truly) {
      const days = t.startedAt
        ? Math.floor((now.getTime() - t.startedAt.getTime()) / 86400_000)
        : 0;
      const recipientIds = new Set<string>();
      if (t.assigneeId) recipientIds.add(t.assigneeId);
      const leaders = await getLeaderIdsFor({
        assigneeTeamGroupCode: t.assignee?.teamGroupCode || t.taskGroup?.code,
      });
      leaders.forEach((id) => recipientIds.add(id));

      const personLabel = t.assignee?.name || t.taskGroup?.name || "(chưa giao)";
      const msg = `Nhiệm vụ "${t.title}" (${personLabel}) đã làm ${days} ngày chưa có báo cáo tiến độ.`;
      const link = `/tasks/${t.id}`;

      for (const userId of recipientIds) {
        const r = await createNotificationIfNew({
          userId,
          type: RISK_TYPES.NO_REPORT,
          entityId: t.id,
          title: `📝 Cần báo cáo tiến độ`,
          message: msg,
          link,
        });
        if (r === "created") result.notificationsCreated++;
        else result.notificationsSkippedDedup++;
      }
    }
  } catch (e: any) {
    result.errors.push(`no-report: ${e.message}`);
  }

  // ====== STEP 7: AWAITING_REVIEW > 3 ngày ======
  try {
    const arCutoff = new Date(
      now.getTime() - THRESHOLDS.AWAITING_REVIEW_DAYS * 86400_000
    );
    const stale = await db.task.findMany({
      where: {
        status: "AWAITING_REVIEW",
        submittedAt: { lt: arCutoff },
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        submittedAt: true,
        assignee: { select: { name: true } },
        taskGroup: { select: { name: true } },
      },
      take: 100,
    });
    result.risks.awaitingReviewCount = stale.length;

    // Chỉ thông báo cho TRUONG_PHONG / PHO_TP (người có quyền xác nhận)
    const topLeaders = await getLeaderIdsFor({ includeTopLeaders: true });
    for (const t of stale) {
      const days = t.submittedAt
        ? Math.floor((now.getTime() - t.submittedAt.getTime()) / 86400_000)
        : 0;
      const personLabel = t.assignee?.name || t.taskGroup?.name || "(chưa giao)";
      const msg = `Nhiệm vụ "${t.title}" (${personLabel}) đã gửi xét duyệt ${days} ngày, chưa được TP xác nhận.`;
      const link = `/tasks/${t.id}`;

      for (const userId of topLeaders) {
        const r = await createNotificationIfNew({
          userId,
          type: RISK_TYPES.AWAITING_REVIEW_STALE,
          entityId: t.id,
          title: `⏳ Chờ xác nhận ${days} ngày`,
          message: msg,
          link,
        });
        if (r === "created") result.notificationsCreated++;
        else result.notificationsSkippedDedup++;
      }
    }
  } catch (e: any) {
    result.errors.push(`awaiting-review: ${e.message}`);
  }

  // ====== STEP 8: Health check API keys (gộp vào cron để khỏi cần cron riêng) ======
  // Lưu ý: KHÔNG notify TP/PTP/TBP về vấn đề API key - đây là thông tin
  // CHỈ super admin được biết. Chỉ chạy health check để admin có data xem.
  // Super admin tự kiểm tra qua /admin dashboard.
  try {
    const { checkAllProviders } = await import("@/lib/api-key-health");
    const health = await checkAllProviders();
    // Chỉ notify SUPER_ADMIN nếu có key invalid
    if (health.failedKeys > 0) {
      const invalidProviders: string[] = [];
      for (const p of ["gemini", "deepseek", "anthropic"] as const) {
        const failed = health[p].filter((k) => k.status === "invalid");
        if (failed.length > 0) invalidProviders.push(p);
      }
      if (invalidProviders.length > 0) {
        const admins = await db.user.findMany({
          where: { role: "SUPER_ADMIN", isActive: true },
          select: { id: true },
        });
        for (const a of admins) {
          const r = await createNotificationIfNew({
            userId: a.id,
            type: "TASK_NOTE" as any, // reuse type, super admin will see custom message
            entityId: `api-key-${invalidProviders.join("-")}`,
            title: "🔑 API key cần update",
            message: `Phát hiện key invalid: ${invalidProviders.join(", ")}. Mở /admin/api-keys để xem chi tiết.`,
            link: "/admin/api-keys",
          });
          if (r === "created") result.notificationsCreated++;
          else result.notificationsSkippedDedup++;
        }
      }
    }
  } catch (e: any) {
    result.errors.push(`api-key-health: ${e.message}`);
  }

  // ====== Log to AIAuditLog ======
  result.durationMs = Date.now() - startedAt.getTime();
  try {
    // Log scan summary (chọn user TRUONG_PHONG đầu tiên làm "system actor")
    const sysUser = await db.user.findFirst({
      where: { role: "TRUONG_PHONG", isActive: true },
      select: { id: true },
    });
    if (sysUser) {
      await db.aIAuditLog.create({
        data: {
          userId: sysUser.id,
          action: "monitor:risk-scan",
          output: result as any,
          success: result.errors.length === 0,
          errorMsg: result.errors.length > 0 ? result.errors.join("; ") : undefined,
          duration: result.durationMs,
        },
      });
    }
  } catch (e: any) {
    // Log fail - không fail scan
    console.error("[risk-scan] audit log failed:", e?.message);
  }

  return result;
}
