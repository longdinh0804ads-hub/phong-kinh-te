import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./db";
import type { Role, User } from "@prisma/client";
import { hasPermission, require2FA as roleRequires2FA, type Permission } from "./permissions";
import { getFingerprint, compareFingerprints } from "./security/request-fingerprint";
import { logSecurityEvent } from "./security/security-events";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 phút không hoạt động → revoke
const ABSOLUTE_LIFETIME_MS = 8 * 60 * 60 * 1000; // 8 giờ tuyệt đối

type RevokeReason = "idle" | "expired" | "device_changed" | "inactive";

/**
 * Resolve session + enforce security checks. Internal helper, trả full info.
 */
async function resolveSession(): Promise<{
  user: User | null;
  revokeReason?: RevokeReason | null;
}> {
  const hdr = await headers();
  const session = await auth.api.getSession({ headers: hdr });
  if (!session?.user || !session?.session?.id) return { user: null };

  // Resolve EXACTLY session đang dùng (qua session.id của Better Auth),
  // KHÔNG phải session mới nhất của user (user có thể có nhiều session đồng thời).
  const dbSession = await db.session.findUnique({
    where: { id: session.session.id },
  });

  if (!dbSession) {
    return { user: null };
  }

  const now = Date.now();

  // 1. Absolute lifetime (8h từ createdAt)
  const sessionAge = now - new Date(dbSession.createdAt).getTime();
  if (sessionAge > ABSOLUTE_LIFETIME_MS) {
    await db.session.delete({ where: { id: dbSession.id } }).catch(() => {});
    return { user: null, revokeReason: "expired" };
  }

  // 2. Idle timeout (30 phút) - skip nếu chưa có lastActivityAt
  if (dbSession.lastActivityAt) {
    const idleMs = now - new Date(dbSession.lastActivityAt).getTime();
    if (idleMs > IDLE_TIMEOUT_MS) {
      await db.session.delete({ where: { id: dbSession.id } }).catch(() => {});
      return { user: null, revokeReason: "idle" };
    }
  }

  // 3. Session binding check (chỉ enforce nếu session đã có fingerprint - tránh phá user cũ)
  if (dbSession.userAgentHash || dbSession.ipSubnet) {
    const fp = getFingerprint(hdr);
    const { mismatchScore, reasons } = compareFingerprints(
      {
        ipSubnet: dbSession.ipSubnet,
        userAgentHash: dbSession.userAgentHash,
        deviceId: dbSession.deviceId,
      },
      fp
    );
    if (mismatchScore >= 2) {
      await db.session.delete({ where: { id: dbSession.id } }).catch(() => {});
      logSecurityEvent({
        userId: session.user.id,
        eventType: "SUSPICIOUS_LOGIN",
        severity: "warning",
        description: `Session bị thu hồi do thay đổi thiết bị/IP đáng ngờ: ${reasons.join(", ")}`,
        ipAddress: fp.ipAddress,
        userAgent: fp.userAgent,
        metadata: { mismatchScore, reasons, sessionId: dbSession.id },
      }).catch(() => {});
      return { user: null, revokeReason: "device_changed" };
    }
  }

  // 4. Throttle update lastActivityAt (30s)
  if (
    !dbSession.lastActivityAt ||
    now - new Date(dbSession.lastActivityAt).getTime() > 30_000
  ) {
    db.session
      .update({
        where: { id: dbSession.id },
        data: { lastActivityAt: new Date() },
      })
      .catch(() => {});
  }

  // 5. Load full user
  const user = await db.user.findUnique({ where: { id: session.user.id } });

  if (user && !user.isActive) {
    await db.session.delete({ where: { id: dbSession.id } }).catch(() => {});
    return { user: null, revokeReason: "inactive" };
  }

  return { user };
}

/**
 * Lấy user hiện tại. Trả về null nếu chưa đăng nhập hoặc session bị revoke.
 * (BACKWARD COMPAT: cùng signature với phiên bản cũ).
 */
export async function getCurrentUser(): Promise<User | null> {
  const { user } = await resolveSession();
  return user;
}

/**
 * Trang được phép truy cập KHI session chưa pass 2FA hoặc đang phải đổi mật khẩu.
 * (Tránh redirect loop khi user đang ở chính các trang này)
 */
const ALLOWED_WITHOUT_2FA = new Set([
  "/login/2fa",
  "/change-password",
  "/api/auth",
  "/api/profile/avatar", // user có thể upload avatar trên trang đổi mật khẩu? - không, để false
]);

export async function requireAuth(opts?: { skip2FACheck?: boolean }) {
  const { user, revokeReason } = await resolveSession();
  if (!user) {
    const params = new URLSearchParams();
    if (revokeReason === "idle" || revokeReason === "expired") {
      params.set("error", "session_expired");
    } else if (revokeReason === "device_changed") {
      params.set("error", "device_changed");
    } else if (revokeReason === "inactive") {
      params.set("error", "inactive");
    }
    redirect(`/login${params.toString() ? "?" + params.toString() : ""}`);
  }

  // mustChangePassword → ép sang /change-password
  if (user.mustChangePassword) {
    redirect("/change-password?required=1");
  }

  // Nếu user bật 2FA và session chưa verified → ép sang /login/2fa
  if (!opts?.skip2FACheck && user.twoFactorEnabled) {
    const hdr = await headers();
    const session = await auth.api.getSession({ headers: hdr });
    if (session?.session?.id) {
      const dbSession = await db.session.findUnique({
        where: { id: session.session.id },
        select: { twoFactorVerified: true },
      });
      if (dbSession && !dbSession.twoFactorVerified) {
        redirect("/login/2fa");
      }
    }
  }

  return user;
}

/** Wrapper export cho roleRequires2FA (tránh shadow tên). */
export { roleRequires2FA };

export async function requireRole(...allowed: Role[]) {
  const user = await requireAuth();
  if (!allowed.includes(user.role)) {
    redirect("/?error=forbidden");
  }
  return user;
}

export async function requirePermission(permission: Permission) {
  const user = await requireAuth();
  if (!hasPermission(user.role, permission)) {
    redirect("/?error=forbidden");
  }
  return user;
}
