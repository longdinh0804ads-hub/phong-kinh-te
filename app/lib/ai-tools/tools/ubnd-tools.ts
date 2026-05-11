// AI tools cho module UBND Directives.

import { z } from "zod";
import { db } from "@/lib/db";
import type { ToolDefinition } from "../types";
import { isTopLeader, isDeptManager, getManagedDepartments } from "@/lib/permissions";

const ubndInput = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "OVERDUE", "ALL"]).optional(),
  scope: z.enum(["mine", "my-team", "all"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const ubndDirectivesTool: ToolDefinition = {
  name: "getUBNDDirectives",
  description:
    "Lấy danh sách nhiệm vụ từ UBND xã. Dùng khi user hỏi 'có nhiệm vụ UBND nào', 'UBND giao gì', 'văn bản UBND đang chờ xử lý'.",
  type: "read",
  inputSchema: ubndInput,
  jsonSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["PENDING", "IN_PROGRESS", "COMPLETED", "OVERDUE", "ALL"],
      },
      scope: { type: "string", enum: ["mine", "my-team", "all"] },
      limit: { type: "integer", minimum: 1, maximum: 50 },
    },
  },
  async execute(input, ctx) {
    const status = input.status || "ALL";
    const limit = input.limit || 10;
    const now = new Date();

    // Scope: TP/PTP=all, TRUONG_BO_PHAN=dept, CHUYEN_VIEN/NHAN_VIEN=mine
    const requestedScope = input.scope;
    const isTop = isTopLeader(ctx.user.role);
    const isDept = isDeptManager(ctx.user.role);
    const effectiveScope = requestedScope
      ? requestedScope
      : isTop
      ? "all"
      : isDept
      ? "my-team"
      : "mine";

    const where: any = { deletedAt: null };

    if (effectiveScope === "mine") {
      where.assigneeId = ctx.user.id;
    } else if (effectiveScope === "my-team") {
      // TRUONG_BO_PHAN: scope theo dept (managedDepartments).
      // ctx.user.department + managedDepartments được populate từ chat route.
      if (isDept) {
        const managed = getManagedDepartments(ctx.user);
        where.OR = [
          { assigneeId: ctx.user.id },
          { assignee: { department: { in: managed } } },
        ];
      } else if (ctx.user.teamGroupCode) {
        where.assignee = { teamGroupCode: ctx.user.teamGroupCode };
      } else {
        where.assigneeId = ctx.user.id;
      }
    } else if (effectiveScope === "all" && !isTop) {
      throw new Error("Không đủ quyền xem toàn phòng");
    }

    if (status === "OVERDUE") {
      where.AND = [
        { status: { notIn: ["COMPLETED", "CANCELLED"] } },
        { deadline: { lt: now } },
      ];
    } else if (status !== "ALL") {
      where.status = status;
    }

    const directives = await db.uBNDDirective.findMany({
      where,
      include: {
        assignee: { select: { name: true } },
      },
      orderBy: [{ status: "asc" }, { deadline: "asc" }],
      take: limit,
    });

    return {
      count: directives.length,
      directives: directives.map((d) => ({
        id: d.id,
        documentNo: d.documentNo,
        title: d.title,
        status: d.status,
        issuedDate: d.issuedDate.toISOString(),
        deadline: d.deadline.toISOString(),
        isOverdue:
          d.status !== "COMPLETED" &&
          d.status !== "CANCELLED" &&
          d.deadline < now,
        assignee: d.assignee?.name || "(chưa giao)",
      })),
    };
  },
};
