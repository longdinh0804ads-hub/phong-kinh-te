/**
 * Leaderboard scoring - tính điểm thi đua cho cán bộ.
 *
 * Công thức điểm cho mỗi task được giao trong period:
 *   - Hoàn thành SỚM (completedAt < deadline - 1 ngày):  +5 điểm
 *   - Hoàn thành ĐÚNG HẠN (completedAt ≤ deadline):       +3 điểm
 *   - Hoàn thành TRỄ (completedAt > deadline):            +1 điểm
 *   - Đang xử lý, còn deadline:                           0 điểm (chưa tính)
 *   - QUÁ HẠN chưa hoàn thành:                            -3 điểm
 *
 * Bonus:
 *   - Task ưu tiên KHẨN CẤP: ×1.5
 *   - Task ưu tiên CAO:      ×1.2
 *   - Task THƯỜNG/THẤP:      ×1.0
 *
 * Metrics phụ hiển thị:
 *   - completionRate = completed / (completed + overdue)
 *   - onTimeRate = (early + onTime) / completed
 *   - avgEarlyDays = trung bình số ngày hoàn thành trước deadline
 */
import { db } from "./db";
import type { Role } from "@prisma/client";

export type Period = "this-week" | "this-month" | "this-quarter" | "this-year";

const POINTS = {
  EARLY: 5,
  ON_TIME: 3,
  LATE: 1,
  OVERDUE_OPEN: -3,
};

const PRIORITY_MULTIPLIER: Record<string, number> = {
  KHAN_CAP: 1.5,
  CAO: 1.2,
  THUONG: 1.0,
  THAP: 0.8,
};

/** Lấy thời gian start/end của period (UTC). */
export function getPeriodRange(period: Period, now: Date = new Date()): { from: Date; to: Date; label: string } {
  const utcNow = new Date(now.getTime());
  const utcMidnight = (d: Date) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

  switch (period) {
    case "this-week": {
      // Monday = start of week
      const day = (utcNow.getUTCDay() + 6) % 7; // 0=Mon, 6=Sun
      const monday = new Date(utcMidnight(utcNow).getTime() - day * 86400_000);
      const sunday = new Date(monday.getTime() + 7 * 86400_000);
      return { from: monday, to: sunday, label: "Tuần này" };
    }
    case "this-month": {
      const from = new Date(Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth(), 1));
      const to = new Date(Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth() + 1, 1));
      return { from, to, label: "Tháng này" };
    }
    case "this-quarter": {
      const q = Math.floor(utcNow.getUTCMonth() / 3);
      const from = new Date(Date.UTC(utcNow.getUTCFullYear(), q * 3, 1));
      const to = new Date(Date.UTC(utcNow.getUTCFullYear(), q * 3 + 3, 1));
      return { from, to, label: `Quý ${q + 1}/${utcNow.getUTCFullYear()}` };
    }
    case "this-year": {
      const from = new Date(Date.UTC(utcNow.getUTCFullYear(), 0, 1));
      const to = new Date(Date.UTC(utcNow.getUTCFullYear() + 1, 0, 1));
      return { from, to, label: `Năm ${utcNow.getUTCFullYear()}` };
    }
  }
}

export interface UserScore {
  userId: string;
  name: string;
  position: string;
  department: string;
  role: Role;
  avatar: string | null;
  // Counts
  totalAssigned: number;
  completedEarly: number;
  completedOnTime: number;
  completedLate: number;
  overdueOpen: number;
  inProgress: number;
  // Scores
  points: number;
  pointsBreakdown: {
    early: number;
    onTime: number;
    late: number;
    overduePenalty: number;
  };
  // Rates
  completionRate: number; // completed / (completed + overdueOpen)
  onTimeRate: number;     // (early + onTime) / completed
  avgEarlyDays: number;   // số ngày trung bình hoàn thành sớm trước deadline
  // Rank
  rank: number;
  /** Badge tự động: GOLD / SILVER / BRONZE / TOP_10 / null */
  badge: "GOLD" | "SILVER" | "BRONZE" | "TOP_10" | "AT_RISK" | null;
}

interface Options {
  period: Period;
  /** Scope: restrict to specific dept(s). Empty = all */
  departments?: string[];
  /** Có loại bỏ user cụ thể không (vd SUPER_ADMIN) */
  excludeUserIds?: string[];
}

/**
 * Tính bảng xếp hạng toàn phòng (hoặc theo scope).
 */
export async function calculateLeaderboard(opts: Options): Promise<{
  scores: UserScore[];
  period: { from: Date; to: Date; label: string };
}> {
  const period = getPeriodRange(opts.period);
  const now = new Date();

  // Lấy danh sách user
  const users = await db.user.findMany({
    where: {
      isActive: true,
      role: { not: "SUPER_ADMIN" },
      ...(opts.departments && opts.departments.length > 0
        ? { department: { in: opts.departments as any[] } }
        : {}),
      ...(opts.excludeUserIds && opts.excludeUserIds.length > 0
        ? { id: { notIn: opts.excludeUserIds } }
        : {}),
    },
    select: {
      id: true,
      name: true,
      position: true,
      department: true,
      role: true,
      image: true,
    },
  });

  // Tính điểm từng user
  const scores: UserScore[] = await Promise.all(
    users.map(async (u) => {
      // Task được giao trong period (dùng createdAt - nhiệm vụ phát sinh trong kỳ)
      // HOẶC task active vẫn đang trong kỳ này → loại bỏ task đã xong từ kỳ trước
      const tasks = await db.task.findMany({
        where: {
          assigneeId: u.id,
          deletedAt: null,
          // Task có ảnh hưởng trong period: created OR completed OR deadline thuộc period
          OR: [
            { createdAt: { gte: period.from, lt: period.to } },
            { completedAt: { gte: period.from, lt: period.to } },
            { deadline: { gte: period.from, lt: period.to } },
          ],
        },
        select: {
          id: true,
          status: true,
          priority: true,
          deadline: true,
          completedAt: true,
        },
      });

      let totalAssigned = tasks.length;
      let completedEarly = 0;
      let completedOnTime = 0;
      let completedLate = 0;
      let overdueOpen = 0;
      let inProgress = 0;
      const pointsBreakdown = { early: 0, onTime: 0, late: 0, overduePenalty: 0 };
      const earlyDays: number[] = [];

      for (const t of tasks) {
        const mult = PRIORITY_MULTIPLIER[t.priority] ?? 1;

        if (t.status === "COMPLETED" && t.completedAt) {
          const diffDays = (t.deadline.getTime() - t.completedAt.getTime()) / 86400_000;
          if (diffDays > 1) {
            // Sớm > 1 ngày
            completedEarly++;
            pointsBreakdown.early += POINTS.EARLY * mult;
            earlyDays.push(diffDays);
          } else if (diffDays >= 0) {
            // Đúng hạn (gồm trong ngày deadline)
            completedOnTime++;
            pointsBreakdown.onTime += POINTS.ON_TIME * mult;
          } else {
            // Trễ
            completedLate++;
            pointsBreakdown.late += POINTS.LATE * mult;
          }
        } else if (t.status === "OVERDUE") {
          overdueOpen++;
          pointsBreakdown.overduePenalty += POINTS.OVERDUE_OPEN * mult;
        } else if (t.status === "PENDING" || t.status === "IN_PROGRESS") {
          if (t.deadline < now) {
            // Quá hạn nhưng chưa được scanner mark OVERDUE
            overdueOpen++;
            pointsBreakdown.overduePenalty += POINTS.OVERDUE_OPEN * mult;
          } else {
            inProgress++;
          }
        }
      }

      const points = Math.round(
        (pointsBreakdown.early +
          pointsBreakdown.onTime +
          pointsBreakdown.late +
          pointsBreakdown.overduePenalty) *
          10
      ) / 10;

      const completed = completedEarly + completedOnTime + completedLate;
      const completionRate =
        completed + overdueOpen > 0 ? completed / (completed + overdueOpen) : 0;
      const onTimeRate = completed > 0 ? (completedEarly + completedOnTime) / completed : 0;
      const avgEarlyDays =
        earlyDays.length > 0
          ? earlyDays.reduce((s, n) => s + n, 0) / earlyDays.length
          : 0;

      return {
        userId: u.id,
        name: u.name,
        position: u.position,
        department: u.department,
        role: u.role,
        avatar: u.image,
        totalAssigned,
        completedEarly,
        completedOnTime,
        completedLate,
        overdueOpen,
        inProgress,
        points,
        pointsBreakdown: {
          early: Math.round(pointsBreakdown.early * 10) / 10,
          onTime: Math.round(pointsBreakdown.onTime * 10) / 10,
          late: Math.round(pointsBreakdown.late * 10) / 10,
          overduePenalty: Math.round(pointsBreakdown.overduePenalty * 10) / 10,
        },
        completionRate,
        onTimeRate,
        avgEarlyDays,
        rank: 0, // set sau
        badge: null,
      };
    })
  );

  // Sort: user có task trước user chưa có task; trong cùng nhóm dùng (points DESC, onTimeRate, completed, overdueOpen ASC)
  scores.sort((a, b) => {
    // User chưa có task xuống cuối
    const aHas = a.totalAssigned > 0 ? 1 : 0;
    const bHas = b.totalAssigned > 0 ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;

    if (b.points !== a.points) return b.points - a.points;
    if (b.onTimeRate !== a.onTimeRate) return b.onTimeRate - a.onTimeRate;
    const completedA = a.completedEarly + a.completedOnTime + a.completedLate;
    const completedB = b.completedEarly + b.completedOnTime + b.completedLate;
    if (completedB !== completedA) return completedB - completedA;
    return a.overdueOpen - b.overdueOpen;
  });

  // Assign rank + badge
  scores.forEach((s, i) => {
    s.rank = i + 1;
    if (s.totalAssigned === 0) {
      s.badge = null; // user chưa có task trong period
      return;
    }
    if (i === 0) s.badge = "GOLD";
    else if (i === 1) s.badge = "SILVER";
    else if (i === 2) s.badge = "BRONZE";
    else if (i < 10) s.badge = "TOP_10";
    // AT_RISK: điểm âm và có >=3 overdue
    if (s.points < 0 && s.overdueOpen >= 3) s.badge = "AT_RISK";
  });

  return { scores, period };
}
