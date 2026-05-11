"use server";

/**
 * Server action wrapper cho login flow với:
 *  - Lockout check trước khi verify password
 *  - LoginAttempt log
 *  - Captcha verification (Turnstile) khi cần
 *  - SecurityEvent logging
 *
 * Lý do wrap thay vì gọi authClient.signIn.email trực tiếp:
 *  - Chèn captcha + lockout vào pipeline
 *  - Kiểm soát fingerprint binding
 *  - Đồng nhất xử lý lỗi với UI Vietnamese
 */
import { headers, cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  checkLockout,
  recordFailedLogin,
  recordSuccessfulLogin,
} from "@/lib/security/login-protection";
import {
  getFingerprint,
  describeDevice,
} from "@/lib/security/request-fingerprint";
import { logSecurityEvent } from "@/lib/security/security-events";
import { verifyCaptcha } from "@/lib/security/captcha";
import { recordDeviceLogin, detectAnomaliesAndAlert } from "@/lib/security/device-tracking";
import { sendAccountLockedAlert } from "@/lib/security/email-alerts";

export interface LoginActionResult {
  ok: boolean;
  error?: string;
  /** Nếu true, UI phải hiển thị widget captcha */
  requireCaptcha?: boolean;
  /** Nếu true, redirect tới /login/2fa */
  require2FA?: boolean;
  /** Nếu true, redirect tới /change-password */
  mustChangePassword?: boolean;
  /** Nếu lock, hiển thị countdown */
  lockedUntil?: string;
}

export async function loginAction(
  email: string,
  password: string,
  captchaToken?: string,
  deviceId?: string
): Promise<LoginActionResult> {
  // 1. Sanitize input
  email = String(email || "").trim().toLowerCase();
  if (!email || !password) {
    return { ok: false, error: "Vui lòng nhập email và mật khẩu" };
  }

  const hdr = await headers();
  const fp = getFingerprint(hdr);
  if (deviceId) fp.deviceId = deviceId;

  // 2. Check lockout
  const lockout = await checkLockout(email, fp.ipAddress);
  if (lockout.locked && lockout.lockedUntil) {
    return {
      ok: false,
      error:
        "Tài khoản hoặc IP này đã bị tạm khóa do nhiều lần đăng nhập sai. Vui lòng thử lại sau.",
      lockedUntil: lockout.lockedUntil.toISOString(),
      requireCaptcha: true,
    };
  }

  // 3. Captcha required khi recentFails >= 2
  if (lockout.requireCaptcha) {
    if (!captchaToken) {
      return {
        ok: false,
        error: "Vui lòng xác nhận bạn không phải robot",
        requireCaptcha: true,
      };
    }
    const captchaOk = await verifyCaptcha(captchaToken, fp.ipAddress);
    if (!captchaOk) {
      await recordFailedLogin({
        email,
        ipAddress: fp.ipAddress,
        userAgent: fp.userAgent,
        deviceId: fp.deviceId,
        failReason: "captcha_fail",
      });
      return {
        ok: false,
        error: "Xác minh captcha thất bại, vui lòng thử lại",
        requireCaptcha: true,
      };
    }
  }

  // 4. Tìm user (để log đúng userId nếu fail)
  const userForLog = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      isActive: true,
      mustChangePassword: true,
      role: true,
      twoFactorEnabled: true,
    },
  });

  // 5. Gọi Better Auth signIn - nó verify password qua password.verify (đã setup argon2)
  let signInOk = false;
  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: hdr,
      asResponse: false,
    });
    signInOk = true;
  } catch (err: any) {
    signInOk = false;
  }

  if (!signInOk) {
    const result = await recordFailedLogin({
      email,
      userId: userForLog?.id ?? null,
      ipAddress: fp.ipAddress,
      userAgent: fp.userAgent,
      deviceId: fp.deviceId,
      failReason: userForLog ? "wrong_password" : "user_not_found",
    });

    if (result.accountLocked && userForLog) {
      await logSecurityEvent({
        userId: userForLog.id,
        eventType: "ACCOUNT_LOCKED",
        severity: "warning",
        description: `Tài khoản bị khóa do nhiều lần đăng nhập sai (IP ${fp.ipAddress}).`,
        ipAddress: fp.ipAddress,
        userAgent: fp.userAgent,
        metadata: { reason: "auto_brute_force", deviceId: fp.deviceId },
      });

      // Email alert (best-effort)
      try {
        const fullUser = await db.user.findUnique({
          where: { id: userForLog.id },
          select: { email: true, name: true },
        });
        if (fullUser) {
          sendAccountLockedAlert({
            email: fullUser.email,
            userName: fullUser.name,
            ipAddress: fp.ipAddress,
            attemptCount: 5,
            unlockAt: result.lockedUntil || undefined,
          }).catch(() => {});
        }
      } catch {}

      return {
        ok: false,
        error: "Tài khoản đã bị khóa do nhiều lần đăng nhập sai. Vui lòng liên hệ quản trị viên.",
        lockedUntil: result.lockedUntil?.toISOString(),
        requireCaptcha: true,
      };
    }

    // Re-check captcha requirement sau fail mới
    const newLockout = await checkLockout(email, fp.ipAddress);
    return {
      ok: false,
      error: "Email hoặc mật khẩu không đúng",
      requireCaptcha: newLockout.requireCaptcha,
    };
  }

  // 6. Tài khoản inactive?
  if (userForLog && !userForLog.isActive) {
    // Better Auth đã tạo session - revoke ngay
    await db.session.deleteMany({ where: { userId: userForLog.id } });
    const cookieStore = await cookies();
    cookieStore.delete("pkt.session_token");
    cookieStore.delete("pkt.session_data");

    await recordFailedLogin({
      email,
      userId: userForLog.id,
      ipAddress: fp.ipAddress,
      userAgent: fp.userAgent,
      deviceId: fp.deviceId,
      failReason: "inactive",
    });
    return { ok: false, error: "Tài khoản đã bị vô hiệu hóa" };
  }

  // 7. Login thành công - record + update session với fingerprint
  if (userForLog) {
    await recordSuccessfulLogin({
      userId: userForLog.id,
      email,
      ipAddress: fp.ipAddress,
      userAgent: fp.userAgent,
      deviceId: fp.deviceId,
    });

    // Lazy migration bcrypt → argon2id (sau khi verify thành công bằng password gốc).
    // Tránh re-run nếu hash đã argon2.
    try {
      const acct = await db.account.findFirst({
        where: { userId: userForLog.id, providerId: "credential" },
        select: { id: true, password: true },
      });
      if (acct?.password && acct.password.startsWith("$2")) {
        const { hashPassword } = await import("@/lib/crypto/password");
        const newHash = await hashPassword(password);
        await db.account.update({
          where: { id: acct.id },
          data: { password: newHash, updatedAt: new Date() },
        });
      }
    } catch (e) {
      console.error("[loginAction] bcrypt→argon2 rehash failed:", e);
      // Không block login
    }

    // Resolve EXACTLY session vừa tạo qua getSession (đảm bảo đúng session từ cookie hiện tại)
    const newSession = await auth.api.getSession({ headers: hdr });
    if (newSession?.session?.id) {
      await db.session
        .update({
          where: { id: newSession.session.id },
          data: {
            ipSubnet: fp.ipSubnet,
            userAgentHash: fp.userAgentHash,
            deviceId: fp.deviceId ?? null,
            deviceName: describeDevice(fp.userAgent),
            lastActivityAt: new Date(),
            twoFactorVerified: false,
          },
        })
        .catch(() => {});
    }

    // Device tracking + anomaly detection (best-effort, không block login)
    if (fp.deviceId) {
      try {
        const userFull = await db.user.findUnique({
          where: { id: userForLog.id },
          select: { email: true, name: true },
        });
        const deviceResult = await recordDeviceLogin(userForLog.id, {
          deviceId: fp.deviceId,
          deviceName: describeDevice(fp.userAgent),
          ipAddress: fp.ipAddress,
          userAgent: fp.userAgent,
        });
        if (userFull) {
          await detectAnomaliesAndAlert({
            userId: userForLog.id,
            userEmail: userFull.email,
            userName: userFull.name,
            device: {
              deviceId: fp.deviceId,
              deviceName: describeDevice(fp.userAgent),
              isNew: deviceResult.isNew,
            },
            ipAddress: fp.ipAddress,
            userAgent: fp.userAgent,
          });
        }
      } catch (e) {
        console.error("[loginAction] device tracking failed:", e);
      }
    }

    if (userForLog.mustChangePassword) {
      return { ok: true, mustChangePassword: true };
    }

    // Nếu user đã bật 2FA → bắt sang trang nhập code
    if (userForLog.twoFactorEnabled) {
      return { ok: true, require2FA: true };
    }
  }

  return { ok: true };
}

/**
 * Logout: revoke session hiện tại + clear cookies.
 */
export async function logoutAction(): Promise<void> {
  const hdr = await headers();
  try {
    await auth.api.signOut({ headers: hdr });
  } catch {
    // ignore
  }
  const cookieStore = await cookies();
  cookieStore.delete("pkt.session_token");
  cookieStore.delete("pkt.session_data");
}
