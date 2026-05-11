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

const ihanoiCreateSchema = z.object({
  ticketCode: z.string().min(3).max(50),
  content: z.string().min(10).max(5000),
  citizenName: z.string().optional().nullable(),
  citizenPhone: z.string().optional().nullable(),
  citizenAddress: z.string().optional().nullable(),
  receivedDate: z.coerce.date().default(() => new Date()),
  deadline: z.coerce.date().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
});

const resolveSchema = z.object({
  id: z.string(),
  resolution: z.string().min(10).max(5000),
  status: z.enum(["IN_PROGRESS", "COMPLETED"]).default("COMPLETED"),
});

export async function createIHanoiComplaint(input: z.infer<typeof ihanoiCreateSchema>) {
  const user = await requireAuth();
  if (!hasPermission(user.role, "ihanoi:assign")) {
    return { error: "Không có quyền tiếp nhận phản ánh" };
  }
  const data = ihanoiCreateSchema.parse(input);

  // TRUONG_BO_PHAN chỉ được gán cho người trong dept mình quản lý
  if (data.assigneeId && isDeptManager(user.role) && !isTopLeader(user.role)) {
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    const assignee = await db.user.findUnique({
      where: { id: data.assigneeId },
      select: { department: true },
    });
    if (!assignee || !managed.includes(assignee.department)) {
      return { error: "Chỉ được gán cho cán bộ thuộc bộ phận của bạn" };
    }
  }

  const exists = await db.iHanoiComplaint.findUnique({ where: { ticketCode: data.ticketCode } });
  if (exists) return { error: "Mã phản ánh đã tồn tại" };

  const c = await db.iHanoiComplaint.create({ data: { ...data, assigneeId: data.assigneeId || null } });

  if (data.assigneeId) {
    await db.notification.create({
      data: {
        userId: data.assigneeId,
        type: "TASK_ASSIGNED",
        title: "Phản ánh iHanoi cần xử lý",
        message: `Phản ánh ${data.ticketCode}: ${data.content.slice(0, 100)}`,
        link: `/ihanoi/${c.id}`,
      },
    });
  }

  revalidatePath("/ihanoi");
  return { success: true, id: c.id };
}

export async function resolveIHanoi(input: z.infer<typeof resolveSchema>) {
  const user = await requireAuth();
  const data = resolveSchema.parse(input);

  const c = await db.iHanoiComplaint.findUnique({ where: { id: data.id } });
  if (!c) return { error: "Không tìm thấy phản ánh" };
  // Người được giao (assignee) hoặc người có quyền handle/assign mới được resolve
  const canResolve =
    c.assigneeId === user.id ||
    hasPermission(user.role, "ihanoi:handle") ||
    hasPermission(user.role, "ihanoi:assign");
  if (!canResolve) {
    return { error: "Không có quyền xử lý phản ánh này" };
  }

  await db.iHanoiComplaint.update({
    where: { id: data.id },
    data: {
      resolution: data.resolution,
      status: data.status,
      resolvedDate: data.status === "COMPLETED" ? new Date() : null,
    },
  });

  revalidatePath(`/ihanoi/${data.id}`);
  revalidatePath("/ihanoi");
  return { success: true };
}

export async function getIHanoiList() {
  const user = await requireAuth();

  // Scope filter theo role
  let where: any = { deletedAt: null };

  if (isTopLeader(user.role) || hasPermission(user.role, "ihanoi:view:all")) {
    // TP/PTP: xem all
  } else if (
    isDeptManager(user.role) ||
    hasPermission(user.role, "ihanoi:view:dept")
  ) {
    // TRUONG_BO_PHAN: phản ánh giao cho người trong dept + giao trực tiếp cho mình
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    where = {
      deletedAt: null,
      OR: [
        { assigneeId: user.id },
        { assignee: { department: { in: managed } } },
      ],
    };
  } else if (hasPermission(user.role, "ihanoi:view:own")) {
    // CHUYEN_VIEN: chỉ thấy phản ánh giao cho mình
    where = {
      deletedAt: null,
      assigneeId: user.id,
    };
  } else {
    // NHAN_VIEN: không có quyền
    return [];
  }

  return db.iHanoiComplaint.findMany({
    where,
    include: { assignee: { select: { id: true, name: true, position: true } } },
    orderBy: [{ status: "asc" }, { receivedDate: "desc" }],
    take: 100,
  });
}

/** Check user có thể xem 1 iHanoi complaint cụ thể không (cho detail page) */
export async function canViewIHanoiComplaint(
  user: { id: string; role: any; department: any; managedDepartments?: any[] },
  complaintId: string
): Promise<boolean> {
  if (isTopLeader(user.role)) return true;
  if (!hasPermission(user.role, "ihanoi:view:all") &&
      !hasPermission(user.role, "ihanoi:view:dept") &&
      !hasPermission(user.role, "ihanoi:view:own")) {
    return false;
  }
  const c = await db.iHanoiComplaint.findUnique({
    where: { id: complaintId },
    select: { assigneeId: true, assignee: { select: { department: true } } },
  });
  if (!c) return false;
  if (hasPermission(user.role, "ihanoi:view:all")) return true;
  if (c.assigneeId === user.id) return true;
  if (isDeptManager(user.role) && c.assignee) {
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    return managed.includes(c.assignee.department);
  }
  return false;
}
