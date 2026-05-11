// AI tools cho module Task.

import { z } from "zod";
import { db } from "@/lib/db";
import type { ToolDefinition, ToolContext } from "../types";
import {
  isTopLeader,
  isDeptManager,
  getManagedDepartments,
} from "@/lib/permissions";

/**
 * Build where filter cho Task query theo role:
 * - TP/PTP: {} (all)
 * - TRUONG_BO_PHAN: scope theo dept (assignee/creator.department in managed)
 * - CHUYEN_VIEN/NHAN_VIEN: chỉ task của mình (assignee/creator = user.id)
 *
 * Hỗ trợ scope override khi user request rõ ràng:
 * - scope="mine": ALWAYS chỉ task của user (kể cả TP)
 * - scope="my-team": dept của user (cho TP/PTP) hoặc managed dept (TRUONG_BO_PHAN)
 *                    hoặc team (CHUYEN_VIEN/NHAN_VIEN nếu có teamGroupCode)
 * - scope="all": chỉ TP/PTP dùng được
 */
export function buildTaskScopeWhere(
  ctx: ToolContext,
  scope?: "mine" | "my-team" | "all"
): any {
  // Default scope theo role
  const effective = scope
    ? scope
    : isTopLeader(ctx.user.role)
    ? "all"
    : isDeptManager(ctx.user.role)
    ? "my-team"
    : "mine";

  if (effective === "all") {
    if (!isTopLeader(ctx.user.role)) {
      throw new Error("Chỉ Trưởng phòng / Phó TP được xem toàn phòng");
    }
    return {};
  }

  if (effective === "mine") {
    return { assigneeId: ctx.user.id };
  }

  // my-team
  if (isDeptManager(ctx.user.role) || isTopLeader(ctx.user.role)) {
    // TRUONG_BO_PHAN: scope theo managed depts
    const managed = getManagedDepartments(ctx.user);
    if (managed.length > 0) {
      return {
        OR: [
          { assigneeId: ctx.user.id },
          { assignee: { department: { in: managed } } },
          { creator: { department: { in: managed } } },
        ],
      };
    }
    // TP/PTP gọi my-team không rõ nghĩa → fallback all
    return {};
  }
  // CHUYEN_VIEN/NHAN_VIEN gọi my-team: nếu có tổ thì tổ, không thì assignee
  if (ctx.user.teamGroupCode) {
    return {
      OR: [
        { assigneeId: ctx.user.id },
        { assignee: { teamGroupCode: ctx.user.teamGroupCode } },
        { taskGroup: { code: ctx.user.teamGroupCode } },
      ],
    };
  }
  return { assigneeId: ctx.user.id };
}

// =====================================================
// getTaskStats - Thống kê tổng quan task
// =====================================================
const taskStatsInput = z.object({
  scope: z
    .enum(["mine", "my-team", "all"])
    .optional()
    .describe("mine = chỉ của tôi, my-team = tổ/bộ phận của tôi, all = toàn phòng (chỉ TP/PTP)"),
});

export const taskStatsTool: ToolDefinition = {
  name: "getTaskStats",
  description:
    "Lấy thống kê tổng quan công việc (số task theo trạng thái: chờ thực hiện, đang xử lý, hoàn thành, quá hạn). Dùng khi user hỏi 'tổng quan công việc', 'thống kê task', 'có bao nhiêu việc'.",
  type: "read",
  inputSchema: taskStatsInput,
  jsonSchema: {
    type: "object",
    properties: {
      scope: {
        type: "string",
        enum: ["mine", "my-team", "all"],
        description: "Phạm vi: mine = của tôi, my-team = tổ/bộ phận tôi, all = toàn phòng",
      },
    },
  },
  async execute(input, ctx) {
    const now = new Date();
    const scopeWhere = buildTaskScopeWhere(ctx, input.scope);
    const where: any = { ...scopeWhere, deletedAt: null };

    const [total, pending, inProgress, awaitingReview, completed, overdue] =
      await Promise.all([
        db.task.count({ where }),
        db.task.count({
          where: { ...where, status: "PENDING", deadline: { gte: now } },
        }),
        db.task.count({
          where: { ...where, status: "IN_PROGRESS", deadline: { gte: now } },
        }),
        db.task.count({ where: { ...where, status: "AWAITING_REVIEW" } }),
        db.task.count({ where: { ...where, status: "COMPLETED" } }),
        db.task.count({
          where: {
            ...where,
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
      ]);

    const scopeLabel = isTopLeader(ctx.user.role)
      ? input.scope === "mine"
        ? "của tôi"
        : "toàn phòng"
      : isDeptManager(ctx.user.role)
      ? input.scope === "mine"
        ? "của tôi"
        : "bộ phận của tôi"
      : "của tôi";

    return {
      scope: input.scope || "default",
      scopeLabel,
      total,
      pending,
      inProgress,
      awaitingReview,
      completed,
      overdue,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  },
};

// =====================================================
// getOverdueTasks - List task quá hạn
// =====================================================
const overdueInput = z.object({
  scope: z.enum(["mine", "my-team", "all"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const overdueTasksTool: ToolDefinition = {
  name: "getOverdueTasks",
  description:
    "Lấy danh sách công việc đã quá hạn nhưng chưa hoàn thành. Dùng khi user hỏi 'task nào quá hạn', 'có việc nào trễ không', 'cần đôn đốc'.",
  type: "read",
  inputSchema: overdueInput,
  jsonSchema: {
    type: "object",
    properties: {
      scope: { type: "string", enum: ["mine", "my-team", "all"] },
      limit: { type: "integer", minimum: 1, maximum: 50 },
    },
  },
  async execute(input, ctx) {
    const limit = input.limit || 10;
    const now = new Date();
    const scopeWhere = buildTaskScopeWhere(ctx, input.scope);

    const where: any = {
      AND: [
        scopeWhere,
        { deletedAt: null },
        {
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
      ],
    };

    const tasks = await db.task.findMany({
      where,
      include: {
        assignee: { select: { name: true } },
        taskGroup: { select: { name: true } },
      },
      orderBy: { deadline: "asc" },
      take: limit,
    });

    return {
      count: tasks.length,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        deadline: t.deadline.toISOString(),
        daysOverdue: Math.floor((now.getTime() - t.deadline.getTime()) / 86400000),
        assignee: t.assignee?.name || t.taskGroup?.name || "(chưa giao)",
        priority: t.priority,
      })),
    };
  },
};

// =====================================================
// getMyTasks - Task của user hiện tại
// =====================================================
const myTasksInput = z.object({
  status: z
    .enum([
      "PENDING",
      "IN_PROGRESS",
      "AWAITING_REVIEW",
      "COMPLETED",
      "OVERDUE",
      "ALL",
    ])
    .optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const myTasksTool: ToolDefinition = {
  name: "getMyTasks",
  description:
    "Lấy danh sách công việc của chính người dùng (assigned trực tiếp). Dùng khi user hỏi 'tôi có việc gì', 'việc của tôi', 'hôm nay làm gì'.",
  type: "read",
  inputSchema: myTasksInput,
  jsonSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: [
          "PENDING",
          "IN_PROGRESS",
          "AWAITING_REVIEW",
          "COMPLETED",
          "OVERDUE",
          "ALL",
        ],
        description: "Lọc theo trạng thái, mặc định ALL",
      },
      limit: { type: "integer", minimum: 1, maximum: 50 },
    },
  },
  async execute(input, ctx) {
    const status = input.status || "ALL";
    const limit = input.limit || 15;
    const now = new Date();

    // myTasks: LUÔN chỉ task được giao trực tiếp (không scope dept)
    const baseScope: any = { assigneeId: ctx.user.id, deletedAt: null };

    let where: any = baseScope;
    if (status === "OVERDUE") {
      where = {
        AND: [
          baseScope,
          {
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
        ],
      };
    } else if (status === "PENDING" || status === "IN_PROGRESS") {
      where = { AND: [baseScope, { status, deadline: { gte: now } }] };
    } else if (status !== "ALL") {
      where = { AND: [baseScope, { status }] };
    }

    const tasks = await db.task.findMany({
      where,
      include: {
        assignee: { select: { name: true } },
        taskGroup: { select: { name: true } },
      },
      orderBy: [{ priority: "asc" }, { deadline: "asc" }],
      take: limit,
    });

    return {
      count: tasks.length,
      filter: status,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        deadline: t.deadline.toISOString(),
        isOverdue:
          t.status !== "COMPLETED" &&
          t.status !== "CANCELLED" &&
          t.deadline < now,
        assignee: t.assignee?.name,
        taskGroup: t.taskGroup?.name,
      })),
    };
  },
};

// =====================================================
// getUserWorkload - Workload của cán bộ
// Quyền: TP/PTP (toàn phòng) / TRUONG_BO_PHAN (dept của mình)
// =====================================================
const workloadInput = z.object({
  userId: z.string().optional(),
  teamGroupCode: z.enum(["to-1", "to-2"]).optional(),
});

export const userWorkloadTool: ToolDefinition = {
  name: "getUserWorkload",
  description:
    "Lấy workload (số task đang làm + quá hạn + đã hoàn thành) của cán bộ. " +
    "QUAN TRỌNG: nếu KHÔNG truyền userId và teamGroupCode → trả về DANH SÁCH TẤT CẢ cán bộ TRONG QUYỀN của user gọi " +
    "(TP/PTP = toàn phòng; Trưởng BP = bộ phận mình). " +
    "Hãy gọi tool này (không truyền tham số) khi user hỏi câu tổng quát như: " +
    "'ai chưa có việc gì làm', 'cán bộ nào rảnh', 'cán bộ nào quá tải nhất', 'workload toàn phòng', 'phân công công việc thế nào'. " +
    "Chỉ truyền userId khi user hỏi về 1 người cụ thể. " +
    "Chỉ TP / Phó TP / Trưởng bộ phận dùng được.",
  type: "read",
  requiresRole: ["TRUONG_PHONG", "PHO_TP", "TRUONG_BO_PHAN"],
  inputSchema: workloadInput,
  jsonSchema: {
    type: "object",
    properties: {
      userId: {
        type: "string",
        description:
          "(Tùy chọn) ID cán bộ cụ thể. BỎ TRỐNG để lấy danh sách cán bộ trong quyền.",
      },
      teamGroupCode: {
        type: "string",
        enum: ["to-1", "to-2"],
        description:
          "(Tùy chọn) Lọc theo tổ kiểm tra. BỎ TRỐNG để lấy toàn phòng/bộ phận.",
      },
    },
  },
  async execute(input, ctx) {
    const userWhere: any = { isActive: true };

    if (input.userId) {
      userWhere.id = input.userId;
    } else if (input.teamGroupCode) {
      userWhere.teamGroupCode = input.teamGroupCode;
    } else if (isDeptManager(ctx.user.role)) {
      // TRUONG_BO_PHAN: chỉ user trong dept mình
      const managed = getManagedDepartments(ctx.user);
      userWhere.department = { in: managed };
    }
    // TP/PTP và không truyền filter: lấy all (userWhere chỉ isActive)

    const now = new Date();
    const users = await db.user.findMany({
      where: userWhere,
      select: {
        id: true,
        name: true,
        position: true,
        department: true,
        teamGroupCode: true,
        assignedTasks: {
          where: { deletedAt: null },
          select: { id: true, status: true, deadline: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const workload = users.map((u) => {
      const tasks = u.assignedTasks;
      const active = tasks.filter(
        (t) =>
          (t.status === "PENDING" || t.status === "IN_PROGRESS") &&
          t.deadline >= now
      ).length;
      const overdue = tasks.filter(
        (t) =>
          t.status === "OVERDUE" ||
          (t.status !== "COMPLETED" &&
            t.status !== "CANCELLED" &&
            t.status !== "AWAITING_REVIEW" &&
            t.deadline < now)
      ).length;
      const completed = tasks.filter((t) => t.status === "COMPLETED").length;
      const awaitingReview = tasks.filter((t) => t.status === "AWAITING_REVIEW").length;

      return {
        userId: u.id,
        name: u.name,
        position: u.position,
        department: u.department,
        tổ:
          u.teamGroupCode === "to-1"
            ? "Tổ 1"
            : u.teamGroupCode === "to-2"
            ? "Tổ 2"
            : null,
        activeTasks: active,
        overdueTasks: overdue,
        awaitingReview,
        completedTasks: completed,
        totalLoad: active + overdue,
        isOverloaded: active + overdue > 10,
      };
    });

    workload.sort((a, b) => b.totalLoad - a.totalLoad);

    const noWork = workload.filter(
      (w) => w.activeTasks === 0 && w.overdueTasks === 0
    );
    const overloaded = workload.filter((w) => w.isOverloaded);
    const lightLoad = workload.filter(
      (w) => w.totalLoad >= 1 && w.totalLoad <= 3
    );
    const heavyLoad = workload.filter(
      (w) => w.totalLoad >= 7 && w.totalLoad <= 10
    );

    return {
      count: workload.length,
      users: workload,
      summary: {
        totalUsers: workload.length,
        noWorkCount: noWork.length,
        noWorkUsers: noWork.map((w) => ({
          name: w.name,
          position: w.position,
          tổ: w.tổ,
        })),
        overloadedCount: overloaded.length,
        overloadedUsers: overloaded.map((w) => ({
          name: w.name,
          totalLoad: w.totalLoad,
          activeTasks: w.activeTasks,
          overdueTasks: w.overdueTasks,
        })),
        lightLoadCount: lightLoad.length,
        heavyLoadCount: heavyLoad.length,
        avgActive:
          workload.length > 0
            ? Math.round(
                workload.reduce((s, w) => s + w.activeTasks, 0) / workload.length
              )
            : 0,
      },
    };
  },
};
