"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";

export async function markAsRead(id: string) {
  const user = await requireAuth();
  await db.notification.updateMany({
    where: { id, userId: user.id },
    data: { isRead: true, readAt: new Date() },
  });
  revalidatePath("/notifications");
  return { success: true };
}

export async function markAllAsRead() {
  const user = await requireAuth();
  await db.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  revalidatePath("/notifications");
  return { success: true };
}

export async function getNotifications(unreadOnly = false) {
  const user = await requireAuth();
  return db.notification.findMany({
    where: { userId: user.id, ...(unreadOnly && { isRead: false }) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
