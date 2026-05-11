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
import { getWeekNumber } from "@/lib/utils";

const scheduleSchema = z.object({
  userId: z.string().optional(),
  title: z.string().min(3).max(200),
  description: z.string().optional().nullable(),
  scheduleDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  location: z.string().optional().nullable(),
  isAllDay: z.boolean().default(false),
});

export async function createSchedule(input: z.infer<typeof scheduleSchema>) {
  const user = await requireAuth();
  const data = scheduleSchema.parse(input);

  const targetUserId = data.userId || user.id;

  // Permission: own schedule luôn được; manage:all → tạo cho ai cũng được;
  // manage:dept → chỉ tạo cho người trong dept mình; còn lại từ chối.
  if (targetUserId !== user.id) {
    if (isTopLeader(user.role) || hasPermission(user.role, "schedule:manage:all")) {
      // OK
    } else if (
      isDeptManager(user.role) ||
      hasPermission(user.role, "schedule:manage:dept")
    ) {
      const managed = getManagedDepartments({
        role: user.role,
        department: user.department,
        managedDepartments: user.managedDepartments,
      });
      const target = await db.user.findUnique({
        where: { id: targetUserId },
        select: { department: true },
      });
      if (!target || !managed.includes(target.department)) {
        return { error: "Chỉ được tạo lịch cho cán bộ thuộc bộ phận của bạn" };
      }
    } else {
      return { error: "Không có quyền tạo lịch cho người khác" };
    }
  }

  const date = new Date(data.scheduleDate);
  const item = await db.workSchedule.create({
    data: {
      userId: targetUserId,
      title: data.title,
      description: data.description,
      scheduleDate: data.scheduleDate,
      endDate: data.endDate,
      location: data.location,
      isAllDay: data.isAllDay,
      year: date.getFullYear(),
      monthNumber: date.getMonth() + 1,
      weekNumber: getWeekNumber(date),
    },
  });

  revalidatePath("/schedule");
  return { success: true, id: item.id };
}

export async function deleteSchedule(id: string) {
  const user = await requireAuth();
  const item = await db.workSchedule.findUnique({
    where: { id },
    include: { user: { select: { department: true } } },
  });
  if (!item) return { error: "Không tìm thấy" };

  // Own: ok. manage:all: ok. manage:dept: chỉ trong dept.
  if (item.userId === user.id) {
    // OK
  } else if (isTopLeader(user.role) || hasPermission(user.role, "schedule:manage:all")) {
    // OK
  } else if (
    isDeptManager(user.role) ||
    hasPermission(user.role, "schedule:manage:dept")
  ) {
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    if (!item.user || !managed.includes(item.user.department)) {
      return { error: "Không có quyền" };
    }
  } else {
    return { error: "Không có quyền" };
  }

  await db.workSchedule.delete({ where: { id } });
  revalidatePath("/schedule");
  return { success: true };
}

export async function getSchedules(params: { weekNumber?: number; year?: number; userId?: string } = {}) {
  const user = await requireAuth();
  const where: any = {};

  if (params.weekNumber) where.weekNumber = params.weekNumber;
  if (params.year) where.year = params.year;
  if (params.userId) where.userId = params.userId;

  // Scope filter theo role
  if (isTopLeader(user.role) || hasPermission(user.role, "schedule:manage:all")) {
    // TP/PTP: xem all (no extra filter)
  } else if (
    isDeptManager(user.role) ||
    hasPermission(user.role, "schedule:manage:dept")
  ) {
    // TRUONG_BO_PHAN: xem lịch của người trong dept + của chính mình
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    // Nếu caller đã filter userId → giữ nguyên (đã check ở trên).
    // Nếu chưa → giới hạn trong dept.
    if (!params.userId) {
      where.OR = [
        { userId: user.id },
        { user: { department: { in: managed } } },
      ];
    }
  } else {
    // CHUYEN_VIEN / NHAN_VIEN: chỉ lịch của mình
    where.userId = user.id;
  }

  return db.workSchedule.findMany({
    where,
    include: { user: { select: { id: true, name: true, position: true } } },
    orderBy: { scheduleDate: "asc" },
  });
}
