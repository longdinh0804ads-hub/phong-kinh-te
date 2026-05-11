"use server";

/**
 * Đổi mật khẩu user với:
 *  - Verify password hiện tại
 *  - Validate policy (min 12, complexity, common pw, name/email check)
 *  - Check history 5 password gần nhất (chống reuse)
 *  - Hash argon2id + pepper, lưu PasswordHistory
 *  - Revoke tất cả session khác (giữ session hiện tại)
 *  - Log SecurityEvent
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/crypto/password";
import {
  checkPasswordStrength,
  PASSWORD_HISTORY_KEEP,
} from "@/lib/crypto/password-policy";
import { getCurrentUser } from "@/lib/session";
import { logSecurityEvent } from "@/lib/security/security-events";
import { getFingerprint } from "@/lib/security/request-fingerprint";

export interface ChangePasswordResult {
  ok: boolean;
  error?: string;
  errors?: string[];
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<ChangePasswordResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Chưa đăng nhập" };

  if (!currentPassword || !newPassword) {
    return { ok: false, error: "Vui lòng nhập đầy đủ thông tin" };
  }

  // 1. Verify current password (lấy hash từ Account table - Better Auth lưu ở đó)
  const account = await db.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });
  if (!account?.password) {
    return { ok: false, error: "Không tìm thấy thông tin xác thực" };
  }

  const verifyRes = await verifyPassword(currentPassword, account.password);
  if (!verifyRes.valid) {
    return { ok: false, error: "Mật khẩu hiện tại không đúng" };
  }

  // 2. Check policy
  const policy = checkPasswordStrength(newPassword, {
    email: user.email,
    name: user.name,
  });
  if (!policy.ok) {
    return { ok: false, error: "Mật khẩu mới không đạt yêu cầu", errors: policy.errors };
  }

  if (newPassword === currentPassword) {
    return { ok: false, error: "Mật khẩu mới phải khác mật khẩu hiện tại" };
  }

  // 3. Check history (5 password gần nhất)
  const history = await db.passwordHistory.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: PASSWORD_HISTORY_KEEP,
  });

  for (const h of history) {
    const r = await verifyPassword(newPassword, h.passwordHash);
    if (r.valid) {
      return {
        ok: false,
        error: `Mật khẩu mới phải khác ${PASSWORD_HISTORY_KEEP} mật khẩu gần nhất`,
      };
    }
  }

  // Cũng check current để tránh đặt lại y hệt (đã verify ở trên nhưng đảm bảo)
  // 4. Hash mới + cập nhật
  const newHash = await hashPassword(newPassword);

  const fp = getFingerprint(await headers());

  await db.$transaction([
    db.account.update({
      where: { id: account.id },
      data: { password: newHash, updatedAt: new Date() },
    }),
    db.passwordHistory.create({
      data: { userId: user.id, passwordHash: account.password }, // lưu hash CŨ vào history
    }),
    db.user.update({
      where: { id: user.id },
      data: {
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
        lockReason: null,
      },
    }),
  ]);

  // Cleanup history quá 5 record
  const toDelete = await db.passwordHistory.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    skip: PASSWORD_HISTORY_KEEP,
    select: { id: true },
  });
  if (toDelete.length > 0) {
    await db.passwordHistory.deleteMany({
      where: { id: { in: toDelete.map((h) => h.id) } },
    });
  }

  // Revoke tất cả session khác (giữ session hiện tại bằng cách giữ token cookie)
  // Better Auth có thể có session token trong DB - revoke all rồi để Better Auth tạo lại session mới khi need
  // Đơn giản: revoke all session khác user (giữ session mới nhất - session hiện tại)
  const currentSession = await db.session.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (currentSession) {
    await db.session.deleteMany({
      where: { userId: user.id, id: { not: currentSession.id } },
    });
  }

  // Log event
  await logSecurityEvent({
    userId: user.id,
    eventType: "PASSWORD_CHANGED",
    severity: "info",
    description: "Mật khẩu đã được thay đổi thành công",
    ipAddress: fp.ipAddress,
    userAgent: fp.userAgent,
  });

  revalidatePath("/settings");
  return { ok: true };
}
