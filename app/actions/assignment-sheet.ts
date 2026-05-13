"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { isTopLeader } from "@/lib/permissions";
import {
  createAssignmentSheet as createSheetCore,
  type CreateSheetInput,
} from "@/lib/assignment-sheet";

const editSchema = z.object({
  sheetId: z.string(),
  basisDocument: z.string().max(2000).optional(),
  workContent: z.string().max(2000).optional(),
  deliverable: z.string().max(2000).optional(),
  assignmentNote: z.string().max(2000).optional(),
  recipientChuTich: z.boolean().optional(),
  recipientPCT: z.boolean().optional(),
  recipientHDND: z.boolean().optional(),
  recipientCustom: z.array(z.string().max(200)).max(10).optional(),
});

/** Cập nhật phiếu (TP/PTP edit) */
export async function updateAssignmentSheet(
  input: z.infer<typeof editSchema>
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireAuth();
  if (!isTopLeader(user.role)) {
    return { ok: false, error: "Chỉ TP/PTP được chỉnh phiếu giao việc" };
  }

  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Dữ liệu không hợp lệ" };
  }

  const sheet = await db.assignmentSheet.findUnique({
    where: { id: parsed.data.sheetId },
    select: { id: true, taskId: true },
  });
  if (!sheet) return { ok: false, error: "Phiếu không tồn tại" };

  const { sheetId, ...updates } = parsed.data;
  await db.assignmentSheet.update({
    where: { id: sheetId },
    data: updates,
  });

  revalidatePath(`/tasks/${sheet.taskId}`);
  revalidatePath(`/tasks/${sheet.taskId}/phieu-giao-viec`);
  return { ok: true };
}

/** Tạo phiếu thủ công cho task đã có (vd task cũ chưa có phiếu) */
export async function createSheetForTask(
  input: CreateSheetInput
): Promise<{ ok: boolean; error?: string; number?: number; year?: number }> {
  const user = await requireAuth();
  if (!isTopLeader(user.role)) {
    return { ok: false, error: "Chỉ TP/PTP được tạo phiếu" };
  }

  // Check task chưa có sheet
  const existing = await db.assignmentSheet.findUnique({
    where: { taskId: input.taskId },
  });
  if (existing) return { ok: false, error: "Phiếu đã tồn tại cho nhiệm vụ này" };

  try {
    const result = await createSheetCore(input);
    revalidatePath(`/tasks/${input.taskId}`);
    return { ok: true, number: result.number, year: result.year };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Lỗi tạo phiếu" };
  }
}

/** Xóa phiếu (TP) */
export async function deleteAssignmentSheet(
  sheetId: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireAuth();
  if (!isTopLeader(user.role)) {
    return { ok: false, error: "Chỉ TP/PTP được xóa phiếu" };
  }

  const sheet = await db.assignmentSheet.findUnique({
    where: { id: sheetId },
    select: { taskId: true },
  });
  if (!sheet) return { ok: false, error: "Phiếu không tồn tại" };

  await db.assignmentSheet.delete({ where: { id: sheetId } });
  revalidatePath(`/tasks/${sheet.taskId}`);
  return { ok: true };
}
