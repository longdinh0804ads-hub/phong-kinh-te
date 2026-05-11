"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  trustDevice as trustDeviceCore,
  revokeDevice as revokeDeviceCore,
} from "@/lib/security/device-tracking";

/**
 * User đánh dấu thiết bị tin cậy (từ /settings/security).
 */
export async function trustDeviceAction(deviceId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Chưa đăng nhập" };

  const r = await trustDeviceCore(user.id, deviceId);
  if (r.ok) revalidatePath("/settings/security");
  return r;
}

/**
 * User thu hồi thiết bị (xóa khỏi trusted + revoke session từ device đó).
 */
export async function revokeDeviceAction(deviceId: string): Promise<{
  ok: boolean;
  revokedSessions?: number;
}> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const r = await revokeDeviceCore(user.id, deviceId);
  revalidatePath("/settings/security");
  return r;
}

/**
 * User đăng xuất từ xa 1 session cụ thể.
 */
export async function revokeSessionAction(sessionId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  // Chỉ cho phép xóa session của chính user (không cross-user)
  const session = await db.session.findUnique({
    where: { id: sessionId },
    select: { userId: true },
  });
  if (!session || session.userId !== user.id) return { ok: false };

  await db.session.delete({ where: { id: sessionId } });
  revalidatePath("/settings/security");
  return { ok: true };
}
