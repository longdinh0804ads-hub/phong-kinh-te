/**
 * Performance Analyzer - Phát hiện cán bộ làm việc kém hiệu quả.
 *
 * Cron: daily.
 *
 * Logic detection (window 30 ngày gần nhất):
 *   - HIGH_OVERDUE:   ≥3 task active đang quá hạn chưa hoàn thành
 *   - LOW_COMPLETION: completion rate < 50% trên task đã đến hạn
 *   - LOW_REPORTING:  IN_PROGRESS ≥3 task nhưng < 1 progress report/tuần
 *   - Trigger: ≥2/3 flag CÙNG LÚC → tạo AIProposal pending
 *
 * Dedup: nếu user đã có proposal pending hoặc approved trong 14 ngày → skip.
 */
import { db } from "@/lib/db";
import type { Role } from "@prisma/client";
import { getActiveProvider, streamChat } from "@/lib/ai";

export const PERFORMANCE_FLAGS = {
  HIGH_OVERDUE: "HIGH_OVERDUE",
  LOW_COMPLETION: "LOW_COMPLETION",
  LOW_REPORTING: "LOW_REPORTING",
} as const;

export type PerformanceFlag = keyof typeof PERFORMANCE_FLAGS;

const WINDOW_DAYS = 30;
const DEDUP_DAYS = 14;
const EXPIRE_DAYS = 7;

const ROLES_TO_ANALYZE: Role[] = ["CHUYEN_VIEN", "NHAN_VIEN", "TRUONG_BO_PHAN"];

interface UserMetrics {
  totalAssigned: number;
  completed: number;
  overdueOpen: number;
  inProgress: number;
  reportsLast30d: number;
  completedOnTime: number;
  completionRate: number; // 0..1
  onTimeRate: number; // 0..1
  reportsPerWeek: number;
  recentMissedTaskIds: string[];
}

export interface AnalysisResult {
  usersAnalyzed: number;
  proposalsCreated: number;
  proposalsSkippedDedup: number;
  flagged: Array<{
    userId: string;
    name: string;
    flags: PerformanceFlag[];
    metrics: UserMetrics;
  }>;
  errors: string[];
}

async function computeMetrics(userId: string, now: Date): Promise<UserMetrics> {
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 86400_000);
  const weekMs = 7 * 86400_000;

  const [tasks, reports] = await Promise.all([
    db.task.findMany({
      where: {
        assigneeId: userId,
        deletedAt: null,
        OR: [
          // Tasks assigned trong window
          { createdAt: { gte: windowStart } },
          // Hoặc đang active (chưa COMPLETED/CANCELLED)
          { status: { in: ["PENDING", "IN_PROGRESS", "AWAITING_REVIEW", "OVERDUE"] } },
        ],
      },
      select: {
        id: true,
        title: true,
        status: true,
        deadline: true,
        completedAt: true,
        createdAt: true,
      },
    }),
    db.progressReport.count({
      where: {
        reporterId: userId,
        createdAt: { gte: windowStart },
      },
    }),
  ]);

  let completed = 0;
  let completedOnTime = 0;
  let overdueOpen = 0;
  let inProgress = 0;
  const recentMissedTaskIds: string[] = [];
  const recentTasksInWindow = tasks.filter((t) => t.createdAt >= windowStart);

  for (const t of tasks) {
    if (t.status === "COMPLETED") {
      completed++;
      if (t.completedAt && t.completedAt <= t.deadline) completedOnTime++;
    } else if (t.status === "OVERDUE") {
      overdueOpen++;
      recentMissedTaskIds.push(t.id);
    } else if (t.status === "IN_PROGRESS") {
      inProgress++;
      // Active task quá hạn nhưng chưa được tự đánh OVERDUE
      if (t.deadline < now) {
        overdueOpen++;
        recentMissedTaskIds.push(t.id);
      }
    } else if (t.status === "PENDING" && t.deadline < now) {
      overdueOpen++;
      recentMissedTaskIds.push(t.id);
    }
  }

  const totalAssigned = recentTasksInWindow.length;
  const tasksWithDeadlinePassed = tasks.filter(
    (t) => t.deadline < now && t.status !== "CANCELLED"
  ).length;

  // Completion rate trên task đã đến hạn (chứ không phải toàn bộ)
  const completionRate =
    tasksWithDeadlinePassed > 0 ? completed / tasksWithDeadlinePassed : 1;
  const onTimeRate = completed > 0 ? completedOnTime / completed : 1;
  const reportsPerWeek = reports / (WINDOW_DAYS / 7);

  return {
    totalAssigned,
    completed,
    overdueOpen,
    inProgress,
    reportsLast30d: reports,
    completedOnTime,
    completionRate,
    onTimeRate,
    reportsPerWeek,
    recentMissedTaskIds: recentMissedTaskIds.slice(0, 5),
  };
}

function detectFlags(m: UserMetrics): PerformanceFlag[] {
  const flags: PerformanceFlag[] = [];
  if (m.overdueOpen >= 3) flags.push("HIGH_OVERDUE");
  // LOW_COMPLETION: chỉ áp dụng khi user có >= 5 task đã đến hạn (đủ sample)
  if (m.totalAssigned >= 5 && m.completionRate < 0.5) flags.push("LOW_COMPLETION");
  // LOW_REPORTING: in-progress ≥3 task nhưng < 0.5 report/tuần
  if (m.inProgress >= 3 && m.reportsPerWeek < 0.5) flags.push("LOW_REPORTING");
  return flags;
}

async function buildProposedNote(
  user: { name: string; position: string },
  metrics: UserMetrics,
  flags: PerformanceFlag[]
): Promise<string> {
  const provider = getActiveProvider();
  // Fallback rule-based nếu không có AI
  if (!provider) return buildFallbackNote(user, metrics, flags);

  const flagDescriptions = flags
    .map((f) => {
      switch (f) {
        case "HIGH_OVERDUE":
          return `${metrics.overdueOpen} nhiệm vụ đang quá hạn chưa hoàn thành`;
        case "LOW_COMPLETION":
          return `Tỷ lệ hoàn thành chỉ ${Math.round(metrics.completionRate * 100)}% (cần ≥50%)`;
        case "LOW_REPORTING":
          return `Trung bình ${metrics.reportsPerWeek.toFixed(1)} báo cáo/tuần (cần ≥0.5)`;
      }
    })
    .filter(Boolean)
    .join("; ");

  const systemPrompt = `Bạn là trợ lý nhân sự của Trưởng phòng Kinh Tế xã. Soạn thư nhắc nhở ngắn (5-8 câu) cho cán bộ về hiệu quả công việc.

Văn phong:
- Trang trọng nhưng KHÔNG hà khắc
- Nêu rõ tình hình cụ thể (số liệu)
- Khuyến khích cải thiện
- Đề xuất cuộc trao đổi/họp 1-1 nếu cần

QUAN TRỌNG:
- Mở đầu: "Đồng chí [tên]," KHÔNG dùng "Kính gửi" (đây là TP nhắc nhở cán bộ cấp dưới)
- KHÔNG đe dọa kỷ luật ngay - đây là nhắc nhở lần đầu
- Trả về TEXT thuần, KHÔNG markdown, KHÔNG JSON`;

  let response = "";
  try {
    await streamChat({
      provider,
      systemPrompt,
      userMessage: `Cán bộ: ${user.name} (${user.position})
Phát hiện:
${flagDescriptions}

Soạn thư nhắc nhở.`,
      maxTokens: 600,
      onChunk: (t) => (response += t),
    });
    return response.trim() || buildFallbackNote(user, metrics, flags);
  } catch {
    return buildFallbackNote(user, metrics, flags);
  }
}

function buildFallbackNote(
  user: { name: string; position: string },
  metrics: UserMetrics,
  flags: PerformanceFlag[]
): string {
  const issues: string[] = [];
  if (flags.includes("HIGH_OVERDUE"))
    issues.push(`hiện có ${metrics.overdueOpen} nhiệm vụ quá hạn chưa hoàn thành`);
  if (flags.includes("LOW_COMPLETION"))
    issues.push(`tỷ lệ hoàn thành đúng hạn chỉ đạt ${Math.round(metrics.completionRate * 100)}%`);
  if (flags.includes("LOW_REPORTING"))
    issues.push(
      `tần suất báo cáo tiến độ thấp (${metrics.reportsPerWeek.toFixed(1)} báo cáo/tuần)`
    );

  return `Đồng chí ${user.name},

Qua theo dõi hoạt động trong 30 ngày gần đây, lãnh đạo phòng ghi nhận một số điểm cần cải thiện:
- ${issues.join("\n- ")}

Đề nghị đồng chí rà soát lại các nhiệm vụ đang phụ trách, ưu tiên hoàn thành các việc quá hạn và cập nhật tiến độ định kỳ. Nếu có vướng mắc, hãy chủ động trao đổi với lãnh đạo trực tiếp để được hỗ trợ.

Mong đồng chí khắc phục trong thời gian tới.`;
}

export async function runPerformanceAnalysis(): Promise<AnalysisResult> {
  const result: AnalysisResult = {
    usersAnalyzed: 0,
    proposalsCreated: 0,
    proposalsSkippedDedup: 0,
    flagged: [],
    errors: [],
  };

  const now = new Date();
  const dedupCutoff = new Date(now.getTime() - DEDUP_DAYS * 86400_000);
  const expiresAt = new Date(now.getTime() + EXPIRE_DAYS * 86400_000);

  try {
    const users = await db.user.findMany({
      where: {
        isActive: true,
        role: { in: ROLES_TO_ANALYZE },
      },
      select: { id: true, name: true, position: true },
    });
    result.usersAnalyzed = users.length;

    for (const u of users) {
      try {
        const metrics = await computeMetrics(u.id, now);
        const flags = detectFlags(metrics);

        // Trigger ≥ 2 flag
        if (flags.length < 2) continue;

        // Dedup: đã có proposal pending hoặc approved trong DEDUP_DAYS ngày?
        const existing = await db.aIProposal.findFirst({
          where: {
            targetUserId: u.id,
            type: "PERFORMANCE_REMINDER",
            status: { in: ["pending", "approved"] },
            createdAt: { gte: dedupCutoff },
          },
        });
        if (existing) {
          result.proposalsSkippedDedup++;
          result.flagged.push({ userId: u.id, name: u.name, flags, metrics });
          continue;
        }

        const proposedNote = await buildProposedNote(u, metrics, flags);

        await db.aIProposal.create({
          data: {
            type: "PERFORMANCE_REMINDER",
            targetUserId: u.id,
            evidence: {
              metrics: {
                totalAssigned: metrics.totalAssigned,
                completed: metrics.completed,
                overdueOpen: metrics.overdueOpen,
                inProgress: metrics.inProgress,
                completionRate: Math.round(metrics.completionRate * 100) / 100,
                reportsPerWeek: Math.round(metrics.reportsPerWeek * 10) / 10,
              },
              flags,
              missedTaskIds: metrics.recentMissedTaskIds,
            },
            proposedNote,
            status: "pending",
            expiresAt,
          },
        });
        result.proposalsCreated++;
        result.flagged.push({ userId: u.id, name: u.name, flags, metrics });

        // Notify TP/PTP
        const tps = await db.user.findMany({
          where: { isActive: true, role: { in: ["TRUONG_PHONG", "PHO_TP"] as Role[] } },
          select: { id: true },
        });
        for (const tp of tps) {
          await db.notification.create({
            data: {
              userId: tp.id,
              type: "REMINDER_PROPOSED",
              title: `AI đề xuất nhắc nhở cán bộ: ${u.name}`,
              message: `${u.name} (${u.position}) bị flag ${flags.length}/3 dấu hiệu kém hiệu quả. Vui lòng xem chi tiết và duyệt nhắc nhở.`,
              link: `/reports/proposals`,
            },
          });
        }
      } catch (e: any) {
        result.errors.push(`user ${u.id}: ${e?.message}`);
      }
    }

    // Auto-expire proposals quá 7 ngày chưa duyệt
    await db.aIProposal.updateMany({
      where: {
        status: "pending",
        expiresAt: { lt: now },
      },
      data: { status: "expired" },
    });
  } catch (e: any) {
    result.errors.push(`performance main: ${e?.message}`);
  }

  return result;
}
