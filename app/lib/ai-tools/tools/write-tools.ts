// AI write tools - tất cả CHỈ thực sự ghi DB khi ctx.confirmed === true.
// Khi confirmed=false (mặc định), trả về dry-run preview kèm __pendingAction.

import { z } from "zod";
import { db } from "@/lib/db";
import {
  hasPermission,
  isLeader,
  isTopLeader,
  isDeptManager,
  getManagedDepartments,
} from "@/lib/permissions";
import { getWeekNumber } from "@/lib/utils";
import {
  type ToolDefinition,
  type ToolContext,
  type DryRunResult,
  PENDING_ACTION_KEY,
} from "../types";

function uuid(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}

function formatVN(d: Date): string {
  return d.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateVN(d: Date): string {
  return d.toLocaleDateString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const PRIORITY_LABEL: Record<string, string> = {
  KHAN_CAP: "Khẩn cấp",
  CAO: "Cao",
  THUONG: "Thường",
  THAP: "Thấp",
};

// =====================================================
// 5. addTaskNote - Gửi lời nhắn / nhắc nhở cho 1 task
// =====================================================
const taskNoteInput = z.object({
  taskQuery: z
    .string()
    .describe("Task ID hoặc keyword trong tiêu đề (để tìm task)"),
  content: z
    .string()
    .min(2)
    .max(2000)
    .describe("Nội dung lời nhắn / nhắc nhở"),
  isPinned: z
    .boolean()
    .optional()
    .describe("Ghim lời nhắn lên đầu (chỉ TP mới có quyền)"),
});

export const addTaskNoteTool: ToolDefinition = {
  name: "addTaskNote",
  description:
    "Gửi lời nhắn / nhắc nhở cho cán bộ thực hiện 1 nhiệm vụ. " +
    "Dùng khi user (lãnh đạo) nói 'nhắn anh X cần làm thêm Y', 'gửi nhắc nhở task Z về việc...', " +
    "'lưu ý task A phải lưu hồ sơ kỹ'. " +
    "Chỉ Trưởng phòng / Phó TP / Trưởng bộ phận được dùng. " +
    "Trưởng bộ phận chỉ gửi cho nhiệm vụ trong bộ phận mình. " +
    "Trả về preview để xác nhận.",
  type: "write",
  requiresRole: ["TRUONG_PHONG", "PHO_TP", "TRUONG_BO_PHAN"],
  inputSchema: taskNoteInput,
  jsonSchema: {
    type: "object",
    properties: {
      taskQuery: { type: "string", description: "Task ID hoặc keyword trong tiêu đề" },
      content: { type: "string", description: "Nội dung lời nhắn (2-2000 ký tự)" },
      isPinned: {
        type: "boolean",
        description: "Ghim note lên đầu (chỉ TP có hiệu lực)",
      },
    },
    required: ["taskQuery", "content"],
  },
  async execute(input, ctx) {
    // Tìm task
    let task = await db.task.findFirst({
      where: { id: input.taskQuery, deletedAt: null },
      include: {
        assignee: { select: { name: true, department: true } },
        taskGroup: { select: { name: true } },
      },
    });
    if (!task) {
      // Search theo title trong scope
      let baseScope: any = {};
      if (isTopLeader(ctx.user.role)) {
        baseScope = {};
      } else if (isDeptManager(ctx.user.role)) {
        const managed = getManagedDepartments(ctx.user);
        baseScope = {
          OR: [
            { assigneeId: ctx.user.id },
            { creatorId: ctx.user.id },
            { assignee: { department: { in: managed } } },
          ],
        };
      }
      task = await db.task.findFirst({
        where: {
          deletedAt: null,
          title: { contains: input.taskQuery, mode: "insensitive" },
          ...(Object.keys(baseScope).length > 0 ? baseScope : {}),
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        include: {
          assignee: { select: { name: true, department: true } },
          taskGroup: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }
    if (!task) throw new Error(`Không tìm thấy nhiệm vụ "${input.taskQuery}"`);

    // Task đã đóng
    if (task.status === "COMPLETED" || task.status === "CANCELLED") {
      throw new Error(
        `Nhiệm vụ đã ${task.status === "COMPLETED" ? "hoàn thành" : "hủy"}, không thể gửi lời nhắn`
      );
    }

    // Permission scope cho TBP
    if (isDeptManager(ctx.user.role)) {
      if (!task.assignee) {
        throw new Error("Nhiệm vụ chưa có người nhận, không gửi lời nhắn được");
      }
      const managed = getManagedDepartments(ctx.user);
      if (!managed.includes(task.assignee.department)) {
        throw new Error("Trưởng bộ phận chỉ gửi lời nhắn cho nhiệm vụ trong bộ phận mình");
      }
    }

    const isPinned = ctx.user.role === "TRUONG_PHONG" ? !!input.isPinned : false;

    if (!ctx.confirmed) {
      const result: DryRunResult = {
        [PENDING_ACTION_KEY]: {
          id: uuid(),
          tool: "addTaskNote",
          kind: "add-note",
          input: { taskQuery: task.id, content: input.content, isPinned },
          preview: `Gửi lời nhắn cho "${task.title}".`,
          details: [
            { label: "Nhiệm vụ", value: task.title },
            { label: "Người nhận", value: task.assignee?.name || task.taskGroup?.name || "(chưa giao)" },
            { label: "Nội dung", value: input.content },
            ...(isPinned ? [{ label: "Đặc biệt", value: "Sẽ ghim lên đầu" }] : []),
          ],
        },
        message: `Đã chuẩn bị lời nhắn cho "${task.title}". Đang chờ xác nhận.`,
      };
      return result;
    }

    // Confirmed → tạo note thật
    const note = await db.taskNote.create({
      data: {
        taskId: task.id,
        authorId: ctx.user.id,
        content: input.content,
        authorName: ctx.user.name,
        authorPosition: (await db.user.findUnique({ where: { id: ctx.user.id }, select: { position: true } }))?.position || "",
        authorRole: ctx.user.role,
        isPinned,
      },
    });

    // Notify assignee
    if (task.assigneeId && task.assigneeId !== ctx.user.id) {
      await db.notification.create({
        data: {
          userId: task.assigneeId,
          type: "TASK_NOTE",
          title: "Lời nhắn mới",
          message: `${ctx.user.name} đã gửi lời nhắn về "${task.title}": ${input.content.slice(0, 100)}${input.content.length > 100 ? "..." : ""}`,
          link: `/tasks/${task.id}`,
        },
      });
    }

    return {
      success: true,
      noteId: note.id,
      message: `Đã gửi lời nhắn cho "${task.title}".`,
    };
  },
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ thực hiện",
  IN_PROGRESS: "Đang xử lý",
  AWAITING_REVIEW: "Chờ TP xác nhận",
  COMPLETED: "Hoàn thành",
  OVERDUE: "Quá hạn",
  CANCELLED: "Đã hủy",
};

// =====================================================
// Helper: resolve assignee (theo tên hoặc id)
// =====================================================
async function resolveUser(query: string): Promise<{
  id: string;
  name: string;
  teamGroupCode: string | null;
  department: any;
} | null> {
  // Thử match id trước
  let u = await db.user.findFirst({
    where: { id: query, isActive: true },
    select: { id: true, name: true, teamGroupCode: true, department: true },
  });
  if (u) return u;
  // Match theo tên (contains, case insensitive)
  u = await db.user.findFirst({
    where: { name: { contains: query, mode: "insensitive" }, isActive: true },
    select: { id: true, name: true, teamGroupCode: true, department: true },
  });
  return u;
}

// =====================================================
// 1. createTask - Tạo nhiệm vụ
// =====================================================
const createTaskInput = z.object({
  title: z.string().min(3).max(200).describe("Tiêu đề nhiệm vụ"),
  description: z.string().max(5000).optional().describe("Mô tả chi tiết (tùy chọn)"),
  assigneeQuery: z
    .string()
    .optional()
    .describe(
      "Người được giao - có thể là tên (vd: 'Long', 'Nguyễn Văn A') hoặc user ID. Bỏ trống nếu giao cho cả tổ."
    ),
  teamGroupCode: z
    .enum(["to-1", "to-2"])
    .optional()
    .describe("Giao cho cả tổ. Bỏ trống nếu giao cho cá nhân."),
  deadline: z
    .string()
    .describe("Hạn hoàn thành (ISO 8601, vd: '2026-05-15T17:00:00+07:00'). Tự suy ra từ câu user."),
  priority: z
    .enum(["KHAN_CAP", "CAO", "THUONG", "THAP"])
    .default("THUONG")
    .describe("Mức ưu tiên"),
});

export const createTaskTool: ToolDefinition = {
  name: "createTask",
  description:
    "Tạo nhiệm vụ mới giao cho một cán bộ hoặc cả tổ. " +
    "Dùng khi user nói 'giao việc cho X', 'tạo nhiệm vụ ...', 'phân công ...'. " +
    "PHẢI parse được deadline từ câu user (vd: 'trước thứ 6' → ngày thứ 6 gần nhất 17:00). " +
    "Chỉ dùng cho leader / chuyên viên (CHUYEN_VIEN chỉ giao trong tổ mình). " +
    "Tool sẽ trả về preview để user xác nhận trước khi thực sự ghi DB.",
  type: "write",
  // CHUYEN_VIEN/NHAN_VIEN KHÔNG được tạo task qua AI
  requiresRole: ["TRUONG_PHONG", "PHO_TP", "TRUONG_BO_PHAN"],
  inputSchema: createTaskInput,
  jsonSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Tiêu đề nhiệm vụ (3-200 ký tự)" },
      description: { type: "string", description: "Mô tả chi tiết, có thể bỏ trống" },
      assigneeQuery: {
        type: "string",
        description:
          "Tên hoặc ID người được giao. Vd: 'Long', 'Nguyễn Văn A'. Bỏ trống nếu giao cho tổ.",
      },
      teamGroupCode: {
        type: "string",
        enum: ["to-1", "to-2"],
        description: "Tổ thực hiện. Chỉ dùng khi giao cho cả tổ, không truyền cùng assigneeQuery.",
      },
      deadline: {
        type: "string",
        description:
          "Hạn (ISO 8601 với timezone, vd '2026-05-15T17:00:00+07:00'). BẮT BUỘC.",
      },
      priority: {
        type: "string",
        enum: ["KHAN_CAP", "CAO", "THUONG", "THAP"],
        description: "Mức ưu tiên (mặc định THUONG)",
      },
    },
    required: ["title", "deadline"],
  },
  async execute(input, ctx) {
    // 1. Validate có assignee hoặc group
    if (!input.assigneeQuery && !input.teamGroupCode) {
      throw new Error("Phải có người nhận (assigneeQuery) hoặc tổ thực hiện (teamGroupCode)");
    }
    if (input.assigneeQuery && input.teamGroupCode) {
      throw new Error("Chỉ chọn 1 trong 2: assigneeQuery hoặc teamGroupCode");
    }

    // 2. Validate deadline
    const deadline = new Date(input.deadline);
    if (isNaN(deadline.getTime())) {
      throw new Error("Hạn không hợp lệ - phải là ISO 8601");
    }
    if (deadline.getTime() < Date.now() - 60000) {
      throw new Error("Hạn đã trôi qua - vui lòng chọn ngày trong tương lai");
    }

    // 3. Resolve assignee/group
    let assigneeId: string | null = null;
    let assigneeName: string | null = null;
    let taskGroupId: string | null = null;
    let taskGroupName: string | null = null;

    if (input.assigneeQuery) {
      const u = await resolveUser(input.assigneeQuery);
      if (!u) {
        throw new Error(`Không tìm thấy cán bộ "${input.assigneeQuery}"`);
      }
      assigneeId = u.id;
      assigneeName = u.name;

      // TRUONG_BO_PHAN: chỉ giao cho người trong bộ phận mình quản (kể cả managedDepartments)
      if (isDeptManager(ctx.user.role)) {
        const managed = getManagedDepartments(ctx.user);
        if (!managed.includes(u.department)) {
          throw new Error(
            "Trưởng bộ phận chỉ được giao việc trong bộ phận của mình"
          );
        }
      }
    } else if (input.teamGroupCode) {
      const g = await db.taskGroup.findUnique({
        where: { code: input.teamGroupCode },
      });
      if (!g) throw new Error(`Không tìm thấy tổ "${input.teamGroupCode}"`);
      taskGroupId = g.id;
      taskGroupName = g.name;

      // TRUONG_BO_PHAN: chỉ giao cho tổ thuộc dept mình
      if (isDeptManager(ctx.user.role)) {
        const member = await db.user.findFirst({
          where: { teamGroupCode: input.teamGroupCode, isActive: true },
          select: { department: true },
        });
        const managed = getManagedDepartments(ctx.user);
        if (member && !managed.includes(member.department)) {
          throw new Error(
            "Trưởng bộ phận chỉ được giao việc cho tổ thuộc bộ phận của mình"
          );
        }
      }
    }

    // 4. Nếu CHƯA confirm → return dry-run preview
    if (!ctx.confirmed) {
      const result: DryRunResult = {
        [PENDING_ACTION_KEY]: {
          id: uuid(),
          tool: "createTask",
          kind: "create-task",
          input, // chính xác input từ LLM để re-submit
          preview: `Tạo nhiệm vụ "${input.title}" giao cho ${
            assigneeName || taskGroupName
          }, hạn ${formatVN(deadline)}.`,
          details: [
            { label: "Tiêu đề", value: input.title },
            ...(input.description ? [{ label: "Mô tả", value: input.description }] : []),
            { label: "Người nhận", value: assigneeName || taskGroupName! },
            { label: "Hạn", value: formatVN(deadline) },
            { label: "Ưu tiên", value: PRIORITY_LABEL[input.priority] },
          ],
        },
        message: `Đã chuẩn bị nhiệm vụ "${input.title}" giao cho ${
          assigneeName || taskGroupName
        }, hạn ${formatDateVN(deadline)}. Đang chờ xác nhận.`,
      };
      return result;
    }

    // 5. Confirmed → thực sự tạo
    const task = await db.task.create({
      data: {
        title: input.title,
        description: input.description || null,
        priority: input.priority,
        deadline,
        assigneeId,
        taskGroupId,
        sourceType: "INTERNAL",
        creatorId: ctx.user.id,
      },
    });

    // Notification
    if (assigneeId && assigneeId !== ctx.user.id) {
      await db.notification.create({
        data: {
          userId: assigneeId,
          type: "TASK_ASSIGNED",
          title: "Bạn có nhiệm vụ mới",
          message: `${ctx.user.name} đã giao cho bạn: "${input.title}"`,
          link: `/tasks/${task.id}`,
        },
      });
    }
    if (taskGroupId) {
      const members = await db.user.findMany({
        where: {
          teamGroupCode: input.teamGroupCode,
          isActive: true,
          id: { not: ctx.user.id },
        },
        select: { id: true },
      });
      if (members.length > 0) {
        await db.notification.createMany({
          data: members.map((m) => ({
            userId: m.id,
            type: "TASK_ASSIGNED",
            title: `Nhiệm vụ mới cho ${taskGroupName}`,
            message: `${ctx.user.name} đã giao cho ${taskGroupName}: "${input.title}"`,
            link: `/tasks/${task.id}`,
          })),
        });
      }
    }

    return {
      success: true,
      taskId: task.id,
      message: `Đã tạo nhiệm vụ "${input.title}" giao cho ${
        assigneeName || taskGroupName
      }, hạn ${formatDateVN(deadline)}.`,
    };
  },
};

// =====================================================
// 2. updateTaskStatus - Cập nhật trạng thái task (theo workflow mới)
// =====================================================
// Action mapping (LLM dễ hiểu hơn raw status):
//   start    → PENDING → IN_PROGRESS  (chỉ assignee)
//   submit   → IN_PROGRESS/OVERDUE → AWAITING_REVIEW  (chỉ assignee)
//   confirm  → AWAITING_REVIEW → COMPLETED  (chỉ TP/PTP)
//   reject   → AWAITING_REVIEW → IN_PROGRESS  (chỉ TP/PTP, "yêu cầu làm lại")
//   cancel   → * → CANCELLED  (creator hoặc TP/PTP)
const updateStatusInput = z.object({
  taskQuery: z
    .string()
    .describe("Task ID hoặc keyword trong tiêu đề"),
  action: z
    .enum(["start", "submit", "confirm", "reject", "cancel"])
    .describe(
      "Hành động: start=bắt đầu (assignee), submit=gửi hoàn thành (assignee), " +
        "confirm=TP xác nhận hoàn thành, reject=TP yêu cầu làm lại, cancel=hủy"
    ),
  reason: z
    .string()
    .max(1000)
    .optional()
    .describe("Lý do (bắt buộc cho action=reject hoặc cancel)"),
});

const ACTION_DESCRIPTION: Record<string, string> = {
  start: "Bắt đầu thực hiện",
  submit: "Gửi hoàn thành (chờ TP xác nhận)",
  confirm: "Trưởng phòng xác nhận hoàn thành",
  reject: "Yêu cầu làm lại",
  cancel: "Hủy nhiệm vụ",
};

export const updateTaskStatusTool: ToolDefinition = {
  name: "updateTaskStatus",
  description:
    "Cập nhật trạng thái 1 nhiệm vụ theo workflow phòng. Các action: " +
    "'start' (assignee bắt đầu), 'submit' (assignee gửi hoàn thành), " +
    "'confirm' (TP xác nhận hoàn thành), 'reject' (TP yêu cầu làm lại), 'cancel' (hủy). " +
    "Ví dụ user nói: 'tôi bắt đầu task X' → start; 'tôi hoàn thành task Y' → submit; " +
    "'xác nhận task Z đã xong' (TP) → confirm; 'task W cần làm lại' (TP) → reject. " +
    "Trả về preview để xác nhận.",
  type: "write",
  inputSchema: updateStatusInput,
  jsonSchema: {
    type: "object",
    properties: {
      taskQuery: { type: "string", description: "Task ID hoặc keyword trong tiêu đề" },
      action: {
        type: "string",
        enum: ["start", "submit", "confirm", "reject", "cancel"],
        description:
          "start = bắt đầu (assignee); submit = gửi hoàn thành (assignee); " +
          "confirm = TP xác nhận; reject = TP yêu cầu làm lại; cancel = hủy",
      },
      reason: {
        type: "string",
        description: "Lý do (cần cho action=reject, cancel)",
      },
    },
    required: ["taskQuery", "action"],
  },
  async execute(input, ctx) {
    // Tìm task theo scope của user
    let task = await db.task.findFirst({
      where: { id: input.taskQuery, deletedAt: null },
      include: {
        assignee: { select: { name: true, department: true } },
        taskGroup: { select: { name: true, code: true } },
      },
    });
    if (!task) {
      // Build scope filter theo role mới
      let baseScope: any = {};
      if (isTopLeader(ctx.user.role)) {
        baseScope = {};
      } else if (isDeptManager(ctx.user.role)) {
        const managed = getManagedDepartments(ctx.user);
        baseScope = {
          OR: [
            { assigneeId: ctx.user.id },
            { creatorId: ctx.user.id },
            { assignee: { department: { in: managed } } },
            { creator: { department: { in: managed } } },
          ],
        };
      } else {
        baseScope = {
          OR: [{ assigneeId: ctx.user.id }, { creatorId: ctx.user.id }],
        };
      }
      task = await db.task.findFirst({
        where: {
          deletedAt: null,
          title: { contains: input.taskQuery, mode: "insensitive" },
          ...(Object.keys(baseScope).length > 0 ? baseScope : {}),
          status: { in: ["PENDING", "IN_PROGRESS", "OVERDUE", "AWAITING_REVIEW"] },
        },
        include: {
          assignee: { select: { name: true, department: true } },
          taskGroup: { select: { name: true, code: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }
    if (!task) throw new Error(`Không tìm thấy nhiệm vụ "${input.taskQuery}"`);

    const isAssignee = task.assigneeId === ctx.user.id;
    const isTop = isTopLeader(ctx.user.role);
    const isCreator = task.creatorId === ctx.user.id;

    // Resolve action → target status + permission check
    let targetStatus: string;
    switch (input.action) {
      case "start":
        if (!isAssignee) throw new Error("Chỉ người được giao mới được bắt đầu nhiệm vụ");
        if (task.status !== "PENDING")
          throw new Error(`Không thể bắt đầu từ trạng thái ${STATUS_LABEL[task.status]}`);
        targetStatus = "IN_PROGRESS";
        break;
      case "submit":
        if (!isAssignee) throw new Error("Chỉ người được giao mới được gửi hoàn thành");
        if (task.status !== "IN_PROGRESS" && task.status !== "OVERDUE")
          throw new Error(
            `Không thể gửi hoàn thành từ trạng thái ${STATUS_LABEL[task.status]}`
          );
        targetStatus = "AWAITING_REVIEW";
        break;
      case "confirm":
        if (!isTop)
          throw new Error("Chỉ Trưởng phòng / Phó TP được xác nhận hoàn thành");
        if (task.status !== "AWAITING_REVIEW")
          throw new Error("Nhiệm vụ chưa được gửi xét duyệt");
        targetStatus = "COMPLETED";
        break;
      case "reject":
        if (!isTop)
          throw new Error("Chỉ Trưởng phòng / Phó TP được yêu cầu làm lại");
        if (task.status !== "AWAITING_REVIEW")
          throw new Error("Nhiệm vụ không đang chờ xét duyệt");
        targetStatus = "IN_PROGRESS";
        break;
      case "cancel":
        // Creator hoặc TP/PTP hủy được. TRUONG_BO_PHAN hủy được nếu task thuộc dept mình.
        const isDeptScope =
          isDeptManager(ctx.user.role) &&
          task.assignee?.department &&
          getManagedDepartments(ctx.user).includes(task.assignee.department);
        if (!isCreator && !isTop && !isDeptScope)
          throw new Error("Chỉ người tạo hoặc lãnh đạo được hủy nhiệm vụ");
        if (task.status === "COMPLETED" || task.status === "CANCELLED")
          throw new Error(`Nhiệm vụ đã ${STATUS_LABEL[task.status]}, không hủy được`);
        targetStatus = "CANCELLED";
        break;
      default:
        throw new Error(`Action không hợp lệ: ${input.action}`);
    }

    if (!ctx.confirmed) {
      const result: DryRunResult = {
        [PENDING_ACTION_KEY]: {
          id: uuid(),
          tool: "updateTaskStatus",
          kind: "update-status",
          input: { taskQuery: task.id, action: input.action, reason: input.reason },
          preview: `${ACTION_DESCRIPTION[input.action]} cho nhiệm vụ "${task.title}".`,
          details: [
            { label: "Nhiệm vụ", value: task.title },
            {
              label: "Người làm",
              value: task.assignee?.name || task.taskGroup?.name || "(chưa giao)",
            },
            { label: "Hành động", value: ACTION_DESCRIPTION[input.action] },
            { label: "Trạng thái cũ", value: STATUS_LABEL[task.status] },
            { label: "Trạng thái mới", value: STATUS_LABEL[targetStatus] },
            ...(input.reason ? [{ label: "Lý do", value: input.reason }] : []),
            { label: "Hạn", value: formatDateVN(task.deadline) },
          ],
        },
        message: `Đã chuẩn bị "${ACTION_DESCRIPTION[input.action]}" cho "${task.title}". Đang chờ xác nhận.`,
      };
      return result;
    }

    // Confirmed → execute
    const now = new Date();
    await db.task.update({
      where: { id: task.id },
      data: {
        status: targetStatus as any,
        ...(targetStatus === "IN_PROGRESS" && !task.startedAt && { startedAt: now }),
        ...(targetStatus === "AWAITING_REVIEW" && { submittedAt: now }),
        ...(targetStatus === "COMPLETED" && {
          completedAt: now,
          confirmedById: ctx.user.id,
          confirmedAt: now,
        }),
        ...(task.status === "AWAITING_REVIEW" &&
          targetStatus === "IN_PROGRESS" && { submittedAt: null }),
      },
    });

    // Notifications cho các action quan trọng
    if (targetStatus === "AWAITING_REVIEW") {
      const leaders = await db.user.findMany({
        where: { isActive: true, role: { in: ["TRUONG_PHONG", "PHO_TP"] } },
        select: { id: true },
      });
      if (leaders.length > 0) {
        await db.notification.createMany({
          data: leaders.map((l) => ({
            userId: l.id,
            type: "REPORT_DUE",
            title: "Nhiệm vụ chờ xác nhận hoàn thành",
            message: `${ctx.user.name} đã hoàn thành "${task.title}", chờ TP xác nhận.`,
            link: `/tasks/${task.id}`,
          })),
        });
      }
    } else if (
      (targetStatus === "COMPLETED" || (input.action === "reject" && targetStatus === "IN_PROGRESS")) &&
      task.assigneeId &&
      task.assigneeId !== ctx.user.id
    ) {
      await db.notification.create({
        data: {
          userId: task.assigneeId,
          type: targetStatus === "COMPLETED" ? "TASK_ASSIGNED" : "TASK_OVERDUE",
          title:
            targetStatus === "COMPLETED"
              ? "Nhiệm vụ đã được xác nhận hoàn thành"
              : "Nhiệm vụ cần làm lại",
          message:
            targetStatus === "COMPLETED"
              ? `${ctx.user.name} đã xác nhận "${task.title}" hoàn thành.`
              : `${ctx.user.name} yêu cầu sửa "${task.title}"${input.reason ? `: ${input.reason}` : ""}.`,
          link: `/tasks/${task.id}`,
        },
      });
    }

    return {
      success: true,
      taskId: task.id,
      message: `Đã ${ACTION_DESCRIPTION[input.action].toLowerCase()} cho "${task.title}".`,
    };
  },
};

// =====================================================
// 3. addProgressReport - Báo cáo tiến độ
// =====================================================
const reportInput = z.object({
  taskQuery: z.string().describe("Task ID hoặc keyword trong tiêu đề"),
  percentComplete: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Phần trăm hoàn thành (0-100)"),
  notes: z.string().max(2000).optional().describe("Ghi chú tiến độ"),
  blockers: z.string().max(1000).optional().describe("Vướng mắc (nếu có)"),
});

export const addProgressReportTool: ToolDefinition = {
  name: "addProgressReport",
  description:
    "Thêm báo cáo tiến độ cho 1 nhiệm vụ. " +
    "Dùng khi user nói 'cập nhật tiến độ task X 50%', 'báo cáo việc Y đã làm xong 70%', " +
    "'task Z gặp vướng mắc về ...'. " +
    "Trả về preview để xác nhận.",
  type: "write",
  inputSchema: reportInput,
  jsonSchema: {
    type: "object",
    properties: {
      taskQuery: { type: "string", description: "Task ID hoặc keyword trong tiêu đề" },
      percentComplete: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "% hoàn thành (0-100)",
      },
      notes: { type: "string", description: "Ghi chú tiến độ (tùy chọn)" },
      blockers: { type: "string", description: "Vướng mắc đang gặp (tùy chọn)" },
    },
    required: ["taskQuery", "percentComplete"],
  },
  async execute(input, ctx) {
    // Tìm task (giống updateTaskStatus)
    let task = await db.task.findFirst({
      where: { id: input.taskQuery, deletedAt: null },
      include: { assignee: { select: { name: true } }, taskGroup: { select: { name: true, code: true } } },
    });
    if (!task) {
      // CHỈ assignee mới được report → search trong task của user
      task = await db.task.findFirst({
        where: {
          deletedAt: null,
          title: { contains: input.taskQuery, mode: "insensitive" },
          assigneeId: ctx.user.id,
        },
        include: {
          assignee: { select: { name: true } },
          taskGroup: { select: { name: true, code: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }
    if (!task) throw new Error(`Không tìm thấy nhiệm vụ "${input.taskQuery}"`);

    // RULE MỚI: CHỈ assignee được báo cáo tiến độ. Lãnh đạo chỉ review.
    if (task.assigneeId !== ctx.user.id) {
      throw new Error("Chỉ người được giao mới được cập nhật tiến độ");
    }
    if (task.status === "COMPLETED" || task.status === "CANCELLED") {
      throw new Error(`Nhiệm vụ đã ${STATUS_LABEL[task.status]}, không cập nhật được`);
    }
    if (task.status === "AWAITING_REVIEW") {
      throw new Error(
        "Nhiệm vụ đang chờ Trưởng phòng xác nhận. Cần TP yêu cầu làm lại trước."
      );
    }

    if (!ctx.confirmed) {
      const result: DryRunResult = {
        [PENDING_ACTION_KEY]: {
          id: uuid(),
          tool: "addProgressReport",
          kind: "report-progress",
          input: { ...input, taskQuery: task.id },
          preview: `Báo cáo tiến độ nhiệm vụ "${task.title}": ${input.percentComplete}% hoàn thành.`,
          details: [
            { label: "Nhiệm vụ", value: task.title },
            { label: "% hoàn thành", value: `${input.percentComplete}%` },
            ...(input.notes ? [{ label: "Ghi chú", value: input.notes }] : []),
            ...(input.blockers ? [{ label: "Vướng mắc", value: input.blockers }] : []),
            ...(input.percentComplete === 100
              ? [
                  {
                    label: "Lưu ý",
                    value: "Tiến độ 100% → tự động gửi xét duyệt, chờ TP xác nhận",
                  },
                ]
              : []),
          ],
        },
        message: `Đã chuẩn bị báo cáo tiến độ ${input.percentComplete}% cho "${task.title}". Đang chờ xác nhận.`,
      };
      return result;
    }

    const now = new Date();
    await db.progressReport.create({
      data: {
        taskId: task.id,
        reporterId: ctx.user.id,
        percentComplete: input.percentComplete,
        notes: input.notes || null,
        blockers: input.blockers || null,
        year: now.getFullYear(),
        weekNumber: getWeekNumber(now),
        monthNumber: now.getMonth() + 1,
      },
    });

    // Auto update task status:
    // - 100% → AWAITING_REVIEW (chờ TP xác nhận, KHÔNG tự COMPLETED)
    // - > 0 + PENDING → IN_PROGRESS
    // (status đã narrow xuống PENDING/IN_PROGRESS/OVERDUE ở các check phía trên)
    if (input.percentComplete === 100) {
      await db.task.update({
        where: { id: task.id },
        data: {
          status: "AWAITING_REVIEW",
          submittedAt: now,
          startedAt: task.startedAt ?? now,
        },
      });
      // Notify leaders
      const leaders = await db.user.findMany({
        where: { isActive: true, role: { in: ["TRUONG_PHONG", "PHO_TP"] } },
        select: { id: true },
      });
      if (leaders.length > 0) {
        await db.notification.createMany({
          data: leaders.map((l) => ({
            userId: l.id,
            type: "REPORT_DUE",
            title: "Nhiệm vụ chờ xác nhận hoàn thành",
            message: `${ctx.user.name} đã hoàn thành "${task.title}", chờ TP xác nhận.`,
            link: `/tasks/${task.id}`,
          })),
        });
      }
    } else if (input.percentComplete > 0 && task.status === "PENDING") {
      await db.task.update({
        where: { id: task.id },
        data: { status: "IN_PROGRESS", startedAt: task.startedAt ?? now },
      });
    }

    return {
      success: true,
      taskId: task.id,
      message: `Đã ghi nhận tiến độ ${input.percentComplete}% cho "${task.title}".`,
    };
  },
};

// =====================================================
// 4. createReminder - Tạo lịch nhắc (WorkSchedule)
// =====================================================
const reminderInput = z.object({
  title: z.string().min(3).max(200).describe("Tiêu đề lịch (vd: 'Họp lãnh đạo huyện')"),
  scheduleDate: z
    .string()
    .describe("Thời điểm (ISO 8601, vd '2026-05-13T09:00:00+07:00')"),
  endDate: z.string().optional().describe("Thời điểm kết thúc (tùy chọn)"),
  location: z.string().max(300).optional().describe("Địa điểm"),
  description: z.string().max(2000).optional().describe("Mô tả/ghi chú"),
});

export const createReminderTool: ToolDefinition = {
  name: "createReminder",
  description:
    "Tạo lịch làm việc / lịch nhắc cá nhân cho chính user. " +
    "Dùng khi user nói 'nhắc tôi họp X lúc Y', 'thêm lịch ...', 'đặt nhắc nhở ...'. " +
    "Tự parse thời gian từ câu user. Trả về preview để xác nhận.",
  type: "write",
  inputSchema: reminderInput,
  jsonSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Tiêu đề lịch" },
      scheduleDate: {
        type: "string",
        description: "Thời điểm bắt đầu (ISO 8601 với timezone)",
      },
      endDate: { type: "string", description: "Thời điểm kết thúc (tùy chọn)" },
      location: { type: "string", description: "Địa điểm (tùy chọn)" },
      description: { type: "string", description: "Mô tả (tùy chọn)" },
    },
    required: ["title", "scheduleDate"],
  },
  async execute(input, ctx) {
    const startDate = new Date(input.scheduleDate);
    if (isNaN(startDate.getTime())) {
      throw new Error("Thời gian không hợp lệ");
    }
    const endDate = input.endDate ? new Date(input.endDate) : null;
    if (endDate && isNaN(endDate.getTime())) {
      throw new Error("Thời gian kết thúc không hợp lệ");
    }

    if (!ctx.confirmed) {
      const result: DryRunResult = {
        [PENDING_ACTION_KEY]: {
          id: uuid(),
          tool: "createReminder",
          kind: "create-reminder",
          input,
          preview: `Thêm lịch "${input.title}" vào ${formatVN(startDate)}.`,
          details: [
            { label: "Tiêu đề", value: input.title },
            { label: "Thời điểm", value: formatVN(startDate) },
            ...(endDate ? [{ label: "Đến", value: formatVN(endDate) }] : []),
            ...(input.location ? [{ label: "Địa điểm", value: input.location }] : []),
            ...(input.description ? [{ label: "Ghi chú", value: input.description }] : []),
          ],
        },
        message: `Đã chuẩn bị lịch "${input.title}" lúc ${formatVN(startDate)}. Đang chờ xác nhận.`,
      };
      return result;
    }

    const item = await db.workSchedule.create({
      data: {
        userId: ctx.user.id,
        title: input.title,
        description: input.description || null,
        scheduleDate: startDate,
        endDate,
        location: input.location || null,
        isAllDay: false,
        year: startDate.getFullYear(),
        monthNumber: startDate.getMonth() + 1,
        weekNumber: getWeekNumber(startDate),
      },
    });

    return {
      success: true,
      scheduleId: item.id,
      message: `Đã thêm lịch "${input.title}" lúc ${formatVN(startDate)}.`,
    };
  },
};
