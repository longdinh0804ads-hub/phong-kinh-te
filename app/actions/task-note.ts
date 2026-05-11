"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import {
  isTopLeader,
  isDeptManager,
  getManagedDepartments,
} from "@/lib/permissions";
import {
  taskNoteCreateSchema,
  taskNoteUpdateSchema,
  type TaskNoteCreateInput,
  type TaskNoteUpdateInput,
} from "@/lib/validations/task-note";

/**
 * Helper: check user có quyền tạo note cho 1 task không.
 * - TP/PTP: tạo cho mọi task
 * - TRUONG_BO_PHAN: tạo cho task của người trong dept mình
 * - Others: KHÔNG được tạo
 */
async function canCreateNoteForTask(
  user: {
    id: string;
    role: any;
    department: any;
    managedDepartments: any[];
  },
  taskId: string
): Promise<{ ok: boolean; error?: string }> {
  if (isTopLeader(user.role)) return { ok: true };
  if (!isDeptManager(user.role)) {
    return {
      ok: false,
      error: "Chỉ Trưởng phòng / Phó TP / Trưởng bộ phận được gửi lời nhắn",
    };
  }

  // TBP: check task assignee thuộc dept managed
  const task = await db.task.findUnique({
    where: { id: taskId, deletedAt: null },
    include: { assignee: { select: { department: true } } },
  });
  if (!task) return { ok: false, error: "Không tìm thấy nhiệm vụ" };

  const managed = getManagedDepartments(user);
  if (task.assignee && managed.includes(task.assignee.department)) {
    return { ok: true };
  }
  return {
    ok: false,
    error: "Bạn chỉ được gửi lời nhắn cho nhiệm vụ trong bộ phận mình",
  };
}

// ===== CREATE =====
export async function createTaskNote(input: TaskNoteCreateInput) {
  const user = await requireAuth();
  const data = taskNoteCreateSchema.parse(input);

  const perm = await canCreateNoteForTask(user, data.taskId);
  if (!perm.ok) return { error: perm.error };

  // Chỉ TP được ghim
  const isPinned = isTopLeader(user.role) ? !!data.isPinned : false;

  const note = await db.taskNote.create({
    data: {
      taskId: data.taskId,
      authorId: user.id,
      content: data.content,
      authorName: user.name,
      authorPosition: user.position,
      authorRole: user.role,
      isPinned,
    },
  });

  // Notify assignee (nếu khác author)
  const task = await db.task.findUnique({
    where: { id: data.taskId },
    select: { title: true, assigneeId: true },
  });
  if (task?.assigneeId && task.assigneeId !== user.id) {
    await db.notification.create({
      data: {
        userId: task.assigneeId,
        type: "TASK_NOTE",
        title: "Lời nhắn mới",
        message: `${user.position} ${user.name} đã gửi lời nhắn về "${task.title}": ${data.content.slice(0, 100)}${data.content.length > 100 ? "..." : ""}`,
        link: `/tasks/${data.taskId}`,
      },
    });
  }

  revalidatePath(`/tasks/${data.taskId}`);
  return { success: true, noteId: note.id };
}

// ===== UPDATE =====
export async function updateTaskNote(input: TaskNoteUpdateInput) {
  const user = await requireAuth();
  const data = taskNoteUpdateSchema.parse(input);

  const note = await db.taskNote.findUnique({
    where: { id: data.id },
    include: { task: { select: { id: true, assigneeId: true, title: true } } },
  });
  if (!note) return { error: "Không tìm thấy lời nhắn" };

  // Chỉ author được sửa
  if (note.authorId !== user.id) {
    return { error: "Chỉ người tạo mới được sửa lời nhắn" };
  }

  await db.taskNote.update({
    where: { id: data.id },
    data: { content: data.content },
  });

  revalidatePath(`/tasks/${note.task.id}`);
  return { success: true };
}

// ===== DELETE =====
export async function deleteTaskNote(id: string) {
  const user = await requireAuth();

  const note = await db.taskNote.findUnique({
    where: { id },
    include: { task: { select: { id: true } } },
  });
  if (!note) return { error: "Không tìm thấy lời nhắn" };

  // Author hoặc TP được xóa
  const canDelete = note.authorId === user.id || user.role === "TRUONG_PHONG";
  if (!canDelete) {
    return { error: "Không có quyền xóa lời nhắn này" };
  }

  await db.taskNote.delete({ where: { id } });
  revalidatePath(`/tasks/${note.task.id}`);
  return { success: true };
}

// ===== TOGGLE PIN (TP only) =====
export async function toggleTaskNotePin(id: string) {
  const user = await requireAuth();
  if (user.role !== "TRUONG_PHONG") {
    return { error: "Chỉ Trưởng phòng được ghim lời nhắn" };
  }

  const note = await db.taskNote.findUnique({
    where: { id },
    include: { task: { select: { id: true } } },
  });
  if (!note) return { error: "Không tìm thấy lời nhắn" };

  await db.taskNote.update({
    where: { id },
    data: { isPinned: !note.isPinned },
  });

  revalidatePath(`/tasks/${note.task.id}`);
  return { success: true, isPinned: !note.isPinned };
}

// ===== GET NOTES FOR TASK =====
// Lưu ý: KHÔNG có scope check ở đây - chỉ trả về toàn bộ note.
// Caller (task detail page) đã có canView check để chặn user không thuộc task.
export async function getTaskNotes(taskId: string) {
  await requireAuth();
  return db.taskNote.findMany({
    where: { taskId },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}
