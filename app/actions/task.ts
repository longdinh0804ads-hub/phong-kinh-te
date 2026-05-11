"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import {
  hasPermission,
  isLeader,
  isTopLeader,
  isDeptManager,
  getManagedDepartments,
} from "@/lib/permissions";
import {
  taskCreateSchema,
  taskUpdateSchema,
  progressReportSchema,
  type TaskCreateInput,
  type TaskUpdateInput,
  type ProgressReportInput,
} from "@/lib/validations/task";
import { getWeekNumber } from "@/lib/utils";

// ===== CREATE TASK =====
export async function createTask(input: TaskCreateInput) {
  const user = await requireAuth();

  // RULE MỚI: Chỉ TP / PTP / TRUONG_BO_PHAN được tạo task. CHUYEN_VIEN / NHAN_VIEN: KHÔNG.
  if (!hasPermission(user.role, "task:create")) {
    return { error: "Bạn không có quyền tạo nhiệm vụ" };
  }

  const data = taskCreateSchema.parse(input);

  // Check assigneeId scope
  if (data.assigneeId && data.assigneeId !== user.id) {
    if (
      !hasPermission(user.role, "task:assign:all") &&
      !hasPermission(user.role, "task:assign:dept")
    ) {
      return { error: "Bạn không có quyền giao việc cho người khác" };
    }

    // TRUONG_BO_PHAN: chỉ giao trong bộ phận của mình (kể cả nhiều dept nếu có managedDepartments)
    if (isDeptManager(user.role)) {
      const target = await db.user.findUnique({
        where: { id: data.assigneeId },
        select: { department: true },
      });
      const managed = getManagedDepartments({
        role: user.role,
        department: user.department,
        managedDepartments: user.managedDepartments,
      });
      if (!target || !managed.includes(target.department)) {
        return { error: "Trưởng bộ phận chỉ được giao việc trong bộ phận của mình" };
      }
    }
  }

  // Check taskGroupId scope - TRUONG_BO_PHAN không được giao task cho tổ nếu tổ thuộc dept khác
  if (data.taskGroupId && isDeptManager(user.role)) {
    const group = await db.taskGroup.findUnique({
      where: { id: data.taskGroupId },
      include: {
        tasks: { take: 1 }, // dummy
      },
    });
    // Tổ to-1, to-2 thuộc NN-MT + XD-CT - kiểm tra members
    if (group) {
      const members = await db.user.findMany({
        where: { teamGroupCode: group.code, isActive: true },
        select: { department: true },
        take: 1,
      });
      const managed = getManagedDepartments({
        role: user.role,
        department: user.department,
        managedDepartments: user.managedDepartments,
      });
      if (members.length > 0 && !managed.includes(members[0].department)) {
        return { error: "Trưởng bộ phận chỉ được giao việc cho tổ thuộc bộ phận của mình" };
      }
    }
  }

  const task = await db.task.create({
    data: {
      title: data.title,
      description: data.description,
      priority: data.priority,
      deadline: data.deadline,
      assigneeId: data.assigneeId || null,
      taskGroupId: data.taskGroupId || null,
      parentTaskId: data.parentTaskId || null,
      sourceType: data.sourceType,
      sourceId: data.sourceId || null,
      attachments: data.attachments,
      legalReferences: data.legalReferences,
      creatorId: user.id,
    },
  });

  // Tạo notification cho assignee
  if (data.assigneeId && data.assigneeId !== user.id) {
    await db.notification.create({
      data: {
        userId: data.assigneeId,
        type: "TASK_ASSIGNED",
        title: "Bạn có nhiệm vụ mới",
        message: `${user.name} đã giao cho bạn: "${data.title}"`,
        link: `/tasks/${task.id}`,
      },
    });
  }

  // Notification cho thành viên nhóm — KHÔNG gửi cho người tạo, KHÔNG duplicate với assignee cá nhân
  if (data.taskGroupId) {
    const group = await db.taskGroup.findUnique({
      where: { id: data.taskGroupId },
      include: { _count: true },
    });
    if (group) {
      const excludeIds = new Set<string>([user.id]);
      if (data.assigneeId) excludeIds.add(data.assigneeId);
      const members = await db.user.findMany({
        where: {
          teamGroupCode: group.code,
          isActive: true,
          id: { notIn: Array.from(excludeIds) },
        },
      });
      if (members.length > 0) {
        await db.notification.createMany({
          data: members.map((m) => ({
            userId: m.id,
            type: "TASK_ASSIGNED",
            title: `Nhiệm vụ mới cho ${group.name}`,
            message: `${user.name} đã giao cho ${group.name}: "${data.title}"`,
            link: `/tasks/${task.id}`,
          })),
        });
      }
    }
  }

  revalidatePath("/tasks");
  revalidatePath("/");
  return { success: true, taskId: task.id };
}

// State machine cho task status để chặn transition không hợp lệ qua API.
// Workflow:
//   PENDING ─Bắt đầu(assignee)─→ IN_PROGRESS
//   IN_PROGRESS ─Hoàn thành(assignee)─→ AWAITING_REVIEW
//   OVERDUE ─Hoàn thành(assignee)─→ AWAITING_REVIEW
//   AWAITING_REVIEW ─TP xác nhận(TP/PTP)─→ COMPLETED
//   AWAITING_REVIEW ─Yêu cầu làm lại(TP/PTP)─→ IN_PROGRESS
//   * ─Hủy(creator/leader)─→ CANCELLED
// COMPLETED/CANCELLED là terminal states (immutable).
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["AWAITING_REVIEW", "PENDING", "CANCELLED"],
  OVERDUE: ["AWAITING_REVIEW", "IN_PROGRESS", "CANCELLED"],
  AWAITING_REVIEW: ["COMPLETED", "IN_PROGRESS", "CANCELLED"],
  COMPLETED: [], // immutable
  CANCELLED: [], // immutable
};

/**
 * Permission để chuyển status cụ thể. Trả về error string nếu không cho phép, null nếu OK.
 * Quy tắc:
 * - Bắt đầu (→ IN_PROGRESS từ PENDING): chỉ assignee
 * - Hoàn thành/Gửi xét duyệt (→ AWAITING_REVIEW): chỉ assignee
 * - TP xác nhận (AWAITING_REVIEW → COMPLETED): chỉ TRUONG_PHONG / PHO_TP
 * - Yêu cầu làm lại (AWAITING_REVIEW → IN_PROGRESS): chỉ TRUONG_PHONG / PHO_TP
 * - Hủy (→ CANCELLED): creator hoặc leader
 * - Rollback IN_PROGRESS → PENDING: assignee hoặc leader
 */
function checkStatusTransitionPermission(
  user: { id: string; role: any },
  task: { assigneeId: string | null; creatorId: string },
  fromStatus: string,
  toStatus: string
): string | null {
  const isAssignee = task.assigneeId === user.id;
  const isTopLeader = user.role === "TRUONG_PHONG" || user.role === "PHO_TP";
  const isCreator = task.creatorId === user.id;

  // → AWAITING_REVIEW: chỉ assignee
  if (toStatus === "AWAITING_REVIEW") {
    if (!isAssignee) return "Chỉ người được giao mới được gửi xét duyệt hoàn thành";
    return null;
  }

  // AWAITING_REVIEW → COMPLETED: chỉ TP/PTP
  if (fromStatus === "AWAITING_REVIEW" && toStatus === "COMPLETED") {
    if (!isTopLeader) return "Chỉ Trưởng phòng / Phó TP được xác nhận hoàn thành";
    return null;
  }

  // AWAITING_REVIEW → IN_PROGRESS: chỉ TP/PTP (yêu cầu làm lại)
  if (fromStatus === "AWAITING_REVIEW" && toStatus === "IN_PROGRESS") {
    if (!isTopLeader) return "Chỉ Trưởng phòng / Phó TP được yêu cầu làm lại";
    return null;
  }

  // PENDING → IN_PROGRESS (Bắt đầu): chỉ assignee
  if (fromStatus === "PENDING" && toStatus === "IN_PROGRESS") {
    if (!isAssignee) return "Chỉ người được giao mới được bắt đầu nhiệm vụ";
    return null;
  }

  // OVERDUE → IN_PROGRESS (tiếp tục): assignee
  if (fromStatus === "OVERDUE" && toStatus === "IN_PROGRESS") {
    if (!isAssignee) return "Chỉ người được giao mới được tiếp tục nhiệm vụ";
    return null;
  }

  // → CANCELLED: creator hoặc TP/PTP
  if (toStatus === "CANCELLED") {
    if (!isCreator && !isTopLeader) return "Chỉ người tạo hoặc lãnh đạo được hủy nhiệm vụ";
    return null;
  }

  // IN_PROGRESS → PENDING (rollback): assignee
  if (fromStatus === "IN_PROGRESS" && toStatus === "PENDING") {
    if (!isAssignee) return "Chỉ người được giao mới được tạm dừng nhiệm vụ";
    return null;
  }

  // Default: cấm
  return `Không có quyền chuyển trạng thái ${fromStatus} → ${toStatus}`;
}

// ===== UPDATE TASK =====
export async function updateTask(input: TaskUpdateInput) {
  const user = await requireAuth();
  const data = taskUpdateSchema.parse(input);

  const task = await db.task.findUnique({
    where: { id: data.id },
    include: { assignee: { select: { department: true } } },
  });
  if (!task || task.deletedAt) return { error: "Không tìm thấy nhiệm vụ" };

  // Quyền sửa task:
  // - TP/PTP: tất cả
  // - TRUONG_BO_PHAN: task trong dept mình HOẶC mình là assignee/creator
  // - CV/NV: chỉ task được giao trực tiếp hoặc mình tạo (workflow start/submit qua state machine)
  let canEdit = false;
  if (isTopLeader(user.role)) {
    canEdit = true;
  } else if (task.creatorId === user.id || task.assigneeId === user.id) {
    canEdit = true;
  } else if (isDeptManager(user.role) && task.assignee) {
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    if (managed.includes(task.assignee.department)) canEdit = true;
  }
  if (!canEdit) return { error: "Không có quyền sửa nhiệm vụ này" };

  // Validate status transition (BUG-4 fix)
  if (data.status !== undefined && data.status !== task.status) {
    const allowed = VALID_STATUS_TRANSITIONS[task.status] || [];
    if (!allowed.includes(data.status)) {
      return {
        error: `Không thể chuyển trạng thái từ ${task.status} sang ${data.status}`,
      };
    }
    // Check permission cho status transition (assignee-only / TP-only)
    const permErr = checkStatusTransitionPermission(
      user,
      task,
      task.status,
      data.status
    );
    if (permErr) return { error: permErr };
  }

  // Validate reassignment: chỉ TP/PTP (assign:all) hoặc TRUONG_BO_PHAN (assign:dept) mới reassign được.
  if (data.assigneeId !== undefined && data.assigneeId !== task.assigneeId) {
    const newAssigneeId = data.assigneeId; // có thể null (unassign) hoặc string
    if (newAssigneeId && newAssigneeId !== user.id) {
      const canAssignAll = hasPermission(user.role, "task:assign:all");
      const canAssignDept = hasPermission(user.role, "task:assign:dept");

      if (!canAssignAll && !canAssignDept) {
        return { error: "Không có quyền giao việc cho người khác" };
      }

      // TRUONG_BO_PHAN: target phải cùng dept
      if (!canAssignAll && canAssignDept && isDeptManager(user.role)) {
        const target = await db.user.findUnique({
          where: { id: newAssigneeId },
          select: { department: true },
        });
        const managed = getManagedDepartments({
          role: user.role,
          department: user.department,
          managedDepartments: user.managedDepartments,
        });
        if (!target || !managed.includes(target.department)) {
          return { error: "Trưởng bộ phận chỉ được giao việc trong bộ phận của mình" };
        }
      }
    }
  }

  // Validate group reassignment
  if (data.taskGroupId !== undefined && data.taskGroupId !== task.taskGroupId) {
    if (
      !hasPermission(user.role, "task:assign:all") &&
      !hasPermission(user.role, "task:assign:dept")
    ) {
      return { error: "Không có quyền giao việc cho nhóm khác" };
    }
  }

  const updated = await db.task.update({
    where: { id: data.id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.deadline !== undefined && { deadline: data.deadline }),
      ...(data.status !== undefined && {
        status: data.status,
        ...(data.status === "IN_PROGRESS" && !task.startedAt && { startedAt: new Date() }),
        // Khi assignee gửi xét duyệt → lưu submittedAt
        ...(data.status === "AWAITING_REVIEW" && { submittedAt: new Date() }),
        // Khi TP xác nhận hoàn thành → lưu confirmedBy, completedAt
        ...(data.status === "COMPLETED" && {
          completedAt: new Date(),
          confirmedById: user.id,
          confirmedAt: new Date(),
        }),
        // Yêu cầu làm lại: clear submittedAt để assignee gửi lại
        ...(task.status === "AWAITING_REVIEW" &&
          data.status === "IN_PROGRESS" && { submittedAt: null }),
      }),
      ...(data.assigneeId !== undefined && { assigneeId: data.assigneeId }),
      ...(data.taskGroupId !== undefined && { taskGroupId: data.taskGroupId }),
      ...(data.legalReferences !== undefined && { legalReferences: data.legalReferences }),
    },
  });

  revalidatePath("/tasks");
  revalidatePath(`/tasks/${data.id}`);
  revalidatePath("/");
  return { success: true, task: updated };
}

// ===== DELETE TASK (soft) =====
export async function deleteTask(id: string) {
  const user = await requireAuth();
  const task = await db.task.findUnique({
    where: { id },
    include: { assignee: { select: { department: true } } },
  });
  if (!task) return { error: "Không tìm thấy nhiệm vụ" };

  // TP/PTP xoá all, creator xoá task mình tạo, TRUONG_BO_PHAN xoá task trong dept mình
  let canDelete = false;
  if (isTopLeader(user.role)) canDelete = true;
  else if (task.creatorId === user.id) canDelete = true;
  else if (isDeptManager(user.role) && task.assignee) {
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    if (managed.includes(task.assignee.department)) canDelete = true;
  }
  if (!canDelete) {
    return { error: "Không có quyền xóa nhiệm vụ" };
  }

  await db.task.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/tasks");
  return { success: true };
}

// ===== ADD PROGRESS REPORT =====
export async function addProgressReport(input: ProgressReportInput) {
  const user = await requireAuth();
  const data = progressReportSchema.parse(input);

  const task = await db.task.findUnique({ where: { id: data.taskId } });
  if (!task || task.deletedAt) return { error: "Không tìm thấy nhiệm vụ" };

  // RULE MỚI: CHỈ assignee mới được cập nhật tiến độ.
  // Lãnh đạo / người trong tổ KHÔNG được update progress của người khác.
  if (task.assigneeId !== user.id) {
    return { error: "Chỉ người được giao mới được cập nhật tiến độ" };
  }
  // Task đã hoàn thành / hủy / đang chờ xét duyệt thì không cập nhật được nữa
  if (task.status === "COMPLETED" || task.status === "CANCELLED") {
    return { error: "Nhiệm vụ đã đóng, không cập nhật tiến độ được" };
  }
  if (task.status === "AWAITING_REVIEW") {
    return {
      error:
        "Nhiệm vụ đang chờ Trưởng phòng xác nhận. Nếu cần sửa, yêu cầu TP nhấn 'Yêu cầu làm lại'.",
    };
  }

  const now = new Date();
  const report = await db.progressReport.create({
    data: {
      taskId: data.taskId,
      reporterId: user.id,
      percentComplete: data.percentComplete,
      notes: data.notes,
      blockers: data.blockers,
      year: now.getFullYear(),
      weekNumber: getWeekNumber(now),
      monthNumber: now.getMonth() + 1,
    },
  });

  // Auto-transition:
  // - 100% → AWAITING_REVIEW (gửi cho TP xác nhận), KHÔNG tự COMPLETED
  // - > 0 + đang PENDING → IN_PROGRESS
  // (status đã được narrow xuống PENDING/IN_PROGRESS/OVERDUE ở các check phía trên)
  if (data.percentComplete === 100) {
    await db.task.update({
      where: { id: data.taskId },
      data: {
        status: "AWAITING_REVIEW",
        submittedAt: now,
        startedAt: task.startedAt ?? now,
      },
    });
    // Báo lãnh đạo
    await notifyLeadersAwaitingReview(task.id, task.title, user.name);
  } else if (data.percentComplete > 0 && task.status === "PENDING") {
    await db.task.update({
      where: { id: data.taskId },
      data: { status: "IN_PROGRESS", startedAt: task.startedAt ?? now },
    });
  }

  revalidatePath(`/tasks/${data.taskId}`);
  revalidatePath("/tasks");
  return { success: true, report };
}

// Helper: thông báo TP/PTP khi task chuyển sang AWAITING_REVIEW
async function notifyLeadersAwaitingReview(
  taskId: string,
  taskTitle: string,
  assigneeName: string
): Promise<void> {
  const leaders = await db.user.findMany({
    where: {
      isActive: true,
      role: { in: ["TRUONG_PHONG", "PHO_TP"] },
    },
    select: { id: true },
  });
  if (leaders.length === 0) return;
  await db.notification.createMany({
    data: leaders.map((l) => ({
      userId: l.id,
      type: "REPORT_DUE",
      title: "Nhiệm vụ chờ xác nhận hoàn thành",
      message: `${assigneeName} đã hoàn thành "${taskTitle}", chờ Trưởng phòng xác nhận.`,
      link: `/tasks/${taskId}`,
    })),
  });
}

// ===== SUBMIT TASK FOR REVIEW (assignee click "Hoàn thành") =====
export async function submitTaskForReview(taskId: string) {
  const user = await requireAuth();
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || task.deletedAt) return { error: "Không tìm thấy nhiệm vụ" };

  if (task.assigneeId !== user.id) {
    return { error: "Chỉ người được giao mới được gửi xét duyệt hoàn thành" };
  }
  if (task.status !== "IN_PROGRESS" && task.status !== "OVERDUE" && task.status !== "PENDING") {
    return { error: `Không thể gửi xét duyệt từ trạng thái ${task.status}` };
  }

  const now = new Date();
  await db.task.update({
    where: { id: taskId },
    data: {
      status: "AWAITING_REVIEW",
      submittedAt: now,
      startedAt: task.startedAt ?? now,
    },
  });
  await notifyLeadersAwaitingReview(taskId, task.title, user.name);

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  return { success: true };
}

// ===== CONFIRM TASK COMPLETION (TP/PTP click "Trưởng phòng xác nhận") =====
export async function confirmTaskCompletion(taskId: string) {
  const user = await requireAuth();
  if (user.role !== "TRUONG_PHONG" && user.role !== "PHO_TP") {
    return { error: "Chỉ Trưởng phòng / Phó TP được xác nhận hoàn thành" };
  }

  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || task.deletedAt) return { error: "Không tìm thấy nhiệm vụ" };
  if (task.status !== "AWAITING_REVIEW") {
    return { error: "Nhiệm vụ chưa được gửi xét duyệt" };
  }

  const now = new Date();
  await db.task.update({
    where: { id: taskId },
    data: {
      status: "COMPLETED",
      completedAt: now,
      confirmedById: user.id,
      confirmedAt: now,
    },
  });

  // Thông báo cho assignee
  if (task.assigneeId) {
    await db.notification.create({
      data: {
        userId: task.assigneeId,
        type: "TASK_ASSIGNED",
        title: "Nhiệm vụ đã được xác nhận hoàn thành",
        message: `${user.name} đã xác nhận "${task.title}" hoàn thành.`,
        link: `/tasks/${taskId}`,
      },
    });
  }

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  return { success: true };
}

// ===== REJECT TASK COMPLETION (TP/PTP "Yêu cầu làm lại") =====
export async function rejectTaskCompletion(taskId: string, reason?: string | null) {
  const user = await requireAuth();
  if (user.role !== "TRUONG_PHONG" && user.role !== "PHO_TP") {
    return { error: "Chỉ Trưởng phòng / Phó TP được yêu cầu làm lại" };
  }

  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task || task.deletedAt) return { error: "Không tìm thấy nhiệm vụ" };
  if (task.status !== "AWAITING_REVIEW") {
    return { error: "Nhiệm vụ không đang chờ xét duyệt" };
  }

  await db.task.update({
    where: { id: taskId },
    data: {
      status: "IN_PROGRESS",
      submittedAt: null,
    },
  });

  // Tạo progress report ghi nhận yêu cầu sửa
  if (reason && reason.trim()) {
    const now = new Date();
    await db.progressReport.create({
      data: {
        taskId,
        reporterId: user.id,
        percentComplete: 99, // chưa đạt 100, cần sửa
        notes: `[Yêu cầu làm lại từ ${user.name}] ${reason.trim()}`,
        year: now.getFullYear(),
        weekNumber: getWeekNumber(now),
        monthNumber: now.getMonth() + 1,
      },
    });
  }

  // Thông báo cho assignee
  if (task.assigneeId) {
    await db.notification.create({
      data: {
        userId: task.assigneeId,
        type: "TASK_OVERDUE",
        title: "Nhiệm vụ cần làm lại",
        message: `${user.name} yêu cầu sửa "${task.title}"${reason ? `: ${reason}` : ""}.`,
        link: `/tasks/${taskId}`,
      },
    });
  }

  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/tasks");
  return { success: true };
}

// ===== GET TASKS (filtered by role + time) =====
export type TaskSort = "default" | "deadline-asc" | "deadline-desc" | "newest" | "oldest";

export interface TaskListFilters {
  status?: string;
  priority?: string;
  assigneeId?: string;
  taskGroupId?: string;
  overdue?: boolean;
  search?: string;
  /** Lọc theo deadline trong khoảng [dateFrom, dateTo) */
  dateFrom?: Date;
  dateTo?: Date;
  /** Sort option (Q19) */
  sort?: TaskSort;
}

function buildScopeFilter(user: {
  id: string;
  role: any;
  department: any;
  managedDepartments?: any[];
  teamGroupCode: string | null;
}) {
  // TP / PTP: xem toàn phòng
  if (isTopLeader(user.role)) return {};

  // TRUONG_BO_PHAN: xem task trong bộ phận mình quản lý
  if (isDeptManager(user.role)) {
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    return {
      OR: [
        { assigneeId: user.id },
        { creatorId: user.id },
        { assignee: { department: { in: managed } } },
        { creator: { department: { in: managed } } },
      ],
    };
  }

  // CHUYEN_VIEN / NHAN_VIEN: chỉ task được giao trực tiếp (BỎ team scope cũ)
  return {
    OR: [{ assigneeId: user.id }, { creatorId: user.id }],
  };
}

function buildWhere(filters: TaskListFilters, scope: any) {
  const conditions: any[] = [{ deletedAt: null }];
  if (Object.keys(scope).length) conditions.push(scope);

  if (filters.status) {
    conditions.push({ status: filters.status });
    // BUG-3 fix: tab PENDING/IN_PROGRESS LOẠI TRỪ task đã quá deadline (đã thuộc tab OVERDUE)
    // → đảm bảo PENDING count + IN_PROGRESS count + OVERDUE count = ALL count
    if (filters.status === "PENDING" || filters.status === "IN_PROGRESS") {
      conditions.push({ deadline: { gte: new Date() } });
    }
  }
  if (filters.priority) conditions.push({ priority: filters.priority });
  if (filters.assigneeId) conditions.push({ assigneeId: filters.assigneeId });
  if (filters.taskGroupId) conditions.push({ taskGroupId: filters.taskGroupId });

  if (filters.overdue) {
    // Overdue = status="OVERDUE" HOẶC (active task + deadline đã qua)
    conditions.push({
      OR: [
        { status: "OVERDUE" },
        { AND: [{ status: { in: ["PENDING", "IN_PROGRESS"] } }, { deadline: { lt: new Date() } }] },
      ],
    });
  }

  if (filters.dateFrom || filters.dateTo) {
    conditions.push({
      deadline: {
        ...(filters.dateFrom && { gte: filters.dateFrom }),
        ...(filters.dateTo && { lt: filters.dateTo }),
      },
    });
  }

  if (filters.search) {
    conditions.push({
      OR: [
        { title: { contains: filters.search, mode: "insensitive" } },
        { description: { contains: filters.search, mode: "insensitive" } },
      ],
    });
  }

  return { AND: conditions };
}

export async function getTasks(filters: TaskListFilters = {}) {
  const user = await requireAuth();
  const where = buildWhere(filters, buildScopeFilter(user));

  // Q19: Sort options
  const orderBy = buildOrderBy(filters.sort);

  return db.task.findMany({
    where,
    orderBy,
    include: {
      assignee: { select: { id: true, name: true, position: true } },
      taskGroup: { select: { id: true, name: true, code: true } },
      creator: { select: { id: true, name: true } },
      _count: { select: { subTasks: true, progressReports: true } },
    },
    take: 200,
  });
}

function buildOrderBy(sort?: TaskSort) {
  switch (sort) {
    case "deadline-asc":
      return [{ deadline: "asc" as const }];
    case "deadline-desc":
      return [{ deadline: "desc" as const }];
    case "newest":
      return [{ createdAt: "desc" as const }];
    case "oldest":
      return [{ createdAt: "asc" as const }];
    case "default":
    default:
      return [{ priority: "asc" as const }, { deadline: "asc" as const }];
  }
}

// ===== TASK COUNTS (cho tab badges) =====
export interface TaskCounts {
  ALL: number;
  PENDING: number;
  IN_PROGRESS: number;
  AWAITING_REVIEW: number;
  OVERDUE: number;
  COMPLETED: number;
}

/**
 * Đếm số lượng task theo từng status, áp dụng cùng filter (search, dateRange)
 * nhưng KHÔNG áp dụng status filter (để mỗi tab có count riêng).
 */
export async function getTaskCounts(filters: Omit<TaskListFilters, "status" | "overdue"> = {}): Promise<TaskCounts> {
  const user = await requireAuth();
  const scope = buildScopeFilter(user);

  // BUG-3 fix: count mỗi tab dùng EXACT same where với tab list để đảm bảo
  // counts = list. Tránh double-count task PENDING quá hạn (vừa trong PENDING tab vừa OVERDUE tab).
  const [all, pending, inProgress, awaitingReview, overdue, completed] = await Promise.all([
    db.task.count({ where: buildWhere({ ...filters }, scope) }),
    db.task.count({ where: buildWhere({ ...filters, status: "PENDING" }, scope) }),
    db.task.count({ where: buildWhere({ ...filters, status: "IN_PROGRESS" }, scope) }),
    db.task.count({ where: buildWhere({ ...filters, status: "AWAITING_REVIEW" }, scope) }),
    db.task.count({ where: buildWhere({ ...filters, overdue: true }, scope) }),
    db.task.count({ where: buildWhere({ ...filters, status: "COMPLETED" }, scope) }),
  ]);

  return {
    ALL: all,
    PENDING: pending,
    IN_PROGRESS: inProgress,
    AWAITING_REVIEW: awaitingReview,
    OVERDUE: overdue,
    COMPLETED: completed,
  };
}

// ===== AUTO-MARK OVERDUE =====
export async function markOverdueTasks() {
  await db.task.updateMany({
    where: {
      status: { in: ["PENDING", "IN_PROGRESS"] },
      deadline: { lt: new Date() },
      deletedAt: null,
    },
    data: { status: "OVERDUE" },
  });
  return { success: true };
}
