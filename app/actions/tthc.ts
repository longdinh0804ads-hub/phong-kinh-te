"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import {
  hasPermission,
  isTopLeader,
  isDeptManager,
  getManagedDepartments,
} from "@/lib/permissions";

const tthcCreateSchema = z.object({
  procedureCode: z.string().min(2).max(50),
  procedureName: z.string().min(3).max(300),
  applicantName: z.string().min(2).max(200),
  applicantPhone: z.string().optional().nullable(),
  receivedDate: z.coerce.date(),
  deadline: z.coerce.date(),
  area: z.string().optional().nullable(),
  handlerId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const tthcUpdateSchema = z.object({
  id: z.string(),
  status: z.enum(["RECEIVED", "PROCESSING", "COMPLETED", "RETURNED"]).optional(),
  handlerId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function createTTHC(input: z.infer<typeof tthcCreateSchema>) {
  const user = await requireAuth();
  if (!hasPermission(user.role, "tthc:create")) {
    return { error: "Không có quyền tạo hồ sơ TTHC" };
  }

  const data = tthcCreateSchema.parse(input);

  // TRUONG_BO_PHAN chỉ được gán handler thuộc dept mình
  if (data.handlerId && isDeptManager(user.role) && !isTopLeader(user.role)) {
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    const handler = await db.user.findUnique({
      where: { id: data.handlerId },
      select: { department: true },
    });
    if (!handler || !managed.includes(handler.department)) {
      return { error: "Chỉ được gán cho cán bộ thuộc bộ phận của bạn" };
    }
  }

  const r = await db.tTHCRecord.create({ data: { ...data, handlerId: data.handlerId || null } });

  if (data.handlerId) {
    await db.notification.create({
      data: {
        userId: data.handlerId,
        type: "TASK_ASSIGNED",
        title: "Hồ sơ TTHC mới",
        message: `${data.applicantName} - ${data.procedureName}`,
        link: `/tthc/${r.id}`,
      },
    });
  }

  revalidatePath("/tthc");
  return { success: true, id: r.id };
}

export async function updateTTHC(input: z.infer<typeof tthcUpdateSchema>) {
  const user = await requireAuth();
  const data = tthcUpdateSchema.parse(input);

  const record = await db.tTHCRecord.findUnique({ where: { id: data.id } });
  if (!record) return { error: "Không tìm thấy hồ sơ" };

  await db.tTHCRecord.update({
    where: { id: data.id },
    data: {
      ...(data.status !== undefined && { status: data.status }),
      ...(data.handlerId !== undefined && { handlerId: data.handlerId }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  });

  revalidatePath(`/tthc/${data.id}`);
  revalidatePath("/tthc");
  return { success: true };
}

export async function getTTHCRecords() {
  const user = await requireAuth();

  // Scope filter theo role
  let where: any = { deletedAt: null };

  if (isTopLeader(user.role) || hasPermission(user.role, "tthc:view:all")) {
    // TP/PTP: xem all
  } else if (
    isDeptManager(user.role) ||
    hasPermission(user.role, "tthc:view:dept")
  ) {
    // TRUONG_BO_PHAN: hồ sơ giao handler thuộc dept + handler là chính mình
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    where = {
      deletedAt: null,
      OR: [
        { handlerId: user.id },
        { handler: { department: { in: managed } } },
      ],
    };
  } else if (hasPermission(user.role, "tthc:view:own")) {
    // CHUYEN_VIEN: chỉ thấy hồ sơ mình đang xử lý
    where = {
      deletedAt: null,
      handlerId: user.id,
    };
  } else {
    // NHAN_VIEN: không có quyền
    return [];
  }

  return db.tTHCRecord.findMany({
    where,
    include: { handler: { select: { id: true, name: true, position: true } } },
    orderBy: [{ status: "asc" }, { deadline: "asc" }],
    take: 200,
  });
}

/** Check user có thể xem 1 TTHC record cụ thể không (cho detail page) */
export async function canViewTTHCRecord(
  user: { id: string; role: any; department: any; managedDepartments?: any[] },
  recordId: string
): Promise<boolean> {
  if (isTopLeader(user.role)) return true;
  if (!hasPermission(user.role, "tthc:view:all") &&
      !hasPermission(user.role, "tthc:view:dept") &&
      !hasPermission(user.role, "tthc:view:own")) {
    return false;
  }
  const r = await db.tTHCRecord.findUnique({
    where: { id: recordId },
    select: { handlerId: true, handler: { select: { department: true } } },
  });
  if (!r) return false;
  if (hasPermission(user.role, "tthc:view:all")) return true;
  if (r.handlerId === user.id) return true;
  if (isDeptManager(user.role) && r.handler) {
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    return managed.includes(r.handler.department);
  }
  return false;
}
