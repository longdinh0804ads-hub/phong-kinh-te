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

const ubndCreateSchema = z.object({
  documentNo: z.string().optional().nullable(),
  title: z.string().min(3).max(300),
  content: z.string().max(10000).optional().nullable(),
  issuedBy: z.string().default("UBND Xã Trần Phú"),
  issuedDate: z.coerce.date(),
  deadline: z.coerce.date(),
  assigneeId: z.string().optional().nullable(),
  attachments: z.array(z.string()).default([]),
});

const ubndResponseSchema = z.object({
  id: z.string(),
  phongResponse: z.string().min(10).max(10000),
  status: z.enum(["IN_PROGRESS", "COMPLETED"]).default("COMPLETED"),
});

export async function createUBNDDirective(input: z.infer<typeof ubndCreateSchema>) {
  const user = await requireAuth();
  if (!hasPermission(user.role, "ubnd:create") && !hasPermission(user.role, "ubnd:assign")) {
    return { error: "Không có quyền tạo nhiệm vụ UBND" };
  }
  const data = ubndCreateSchema.parse(input);

  const directive = await db.uBNDDirective.create({
    data: {
      ...data,
      assigneeId: data.assigneeId || null,
      receivedDate: new Date(),
    },
  });

  if (data.assigneeId) {
    await db.notification.create({
      data: {
        userId: data.assigneeId,
        type: "UBND_NEW",
        title: "Nhiệm vụ UBND mới",
        message: `${user.name} đã giao bạn xử lý: ${data.title}`,
        link: `/ubnd/${directive.id}`,
      },
    });
  }

  revalidatePath("/ubnd");
  revalidatePath("/");
  return { success: true, id: directive.id };
}

export async function submitUBNDResponse(input: z.infer<typeof ubndResponseSchema>) {
  const user = await requireAuth();
  const data = ubndResponseSchema.parse(input);

  const directive = await db.uBNDDirective.findUnique({ where: { id: data.id } });
  if (!directive) return { error: "Không tìm thấy nhiệm vụ" };

  // Authorization: chỉ assignee hoặc người có quyền quản lý UBND mới được phản hồi
  const isAssignee = directive.assigneeId === user.id;
  const isManager =
    hasPermission(user.role, "ubnd:assign") || hasPermission(user.role, "ubnd:create");
  if (!isAssignee && !isManager) {
    return { error: "Không có quyền phản hồi nhiệm vụ này" };
  }

  await db.uBNDDirective.update({
    where: { id: data.id },
    data: {
      phongResponse: data.phongResponse,
      status: data.status,
      responseDate: new Date(),
    },
  });

  revalidatePath(`/ubnd/${data.id}`);
  revalidatePath("/ubnd");
  return { success: true };
}

export async function getUBNDDirectives() {
  const user = await requireAuth();

  // Scope filter theo role
  let where: any = { deletedAt: null };

  if (isTopLeader(user.role) || hasPermission(user.role, "ubnd:view:all")) {
    // TP/PTP: xem all
  } else if (
    isDeptManager(user.role) ||
    hasPermission(user.role, "ubnd:view:dept")
  ) {
    // TRUONG_BO_PHAN: xem nhiệm vụ giao vào dept của mình + giao trực tiếp cho mình
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
  } else if (hasPermission(user.role, "ubnd:view:own")) {
    // CHUYEN_VIEN/NHAN_VIEN: chỉ thấy mục giao cho mình
    where = {
      deletedAt: null,
      assigneeId: user.id,
    };
  } else {
    return [];
  }

  return db.uBNDDirective.findMany({
    where,
    include: { assignee: { select: { id: true, name: true, position: true } } },
    orderBy: [{ status: "asc" }, { deadline: "asc" }],
    take: 100,
  });
}

/** Check user có thể xem 1 UBND directive cụ thể không (cho detail page) */
export async function canViewUBNDDirective(
  user: { id: string; role: any; department: any; managedDepartments?: any[] },
  directiveId: string
): Promise<boolean> {
  if (isTopLeader(user.role)) return true;
  const d = await db.uBNDDirective.findUnique({
    where: { id: directiveId },
    select: { assigneeId: true, assignee: { select: { department: true } } },
  });
  if (!d) return false;
  if (d.assigneeId === user.id) return true;
  if (isDeptManager(user.role) && d.assignee) {
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    return managed.includes(d.assignee.department);
  }
  return false;
}
