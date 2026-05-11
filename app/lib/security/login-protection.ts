/**
 * Login brute-force protection:
 *  - 5 fail liên tục trong 15 phút → lock 15 phút
 *  - 10 fail trong 1 giờ → lock đến khi admin unlock + email
 *  - 20 fail từ 1 IP trong 1 giờ → block IP 24h
 *  - Captcha required sau 2 fail
 *
 * Tất cả counter dùng DB (LoginAttempt + User.failedLoginCount + User.lockedUntil)
 * để hoạt động đúng trên multi-instance VPS sau này.
 */
import { db } from "@/lib/db";

export type LoginFailReason =
  | "wrong_password"
  | "user_not_found"
  | "locked"
  | "inactive"
  | "2fa_required"
  | "2fa_fail"
  | "unknown_device"
  | "captcha_fail"
  | "captcha_required"
  | "password_expired"
  | "must_change_password";

export interface LockoutState {
  locked: boolean;
  /** Đến thời điểm này thì hết lock (null = chưa lock) */
  lockedUntil: Date | null;
  /** Cần captcha không */
  requireCaptcha: boolean;
  /** Số lần fail liên tiếp gần nhất */
  recentFailCount: number;
}

const FAIL_WINDOW_SHORT_MS = 15 * 60 * 1000; // 15 phút
const FAIL_WINDOW_LONG_MS = 60 * 60 * 1000; // 1 giờ
const IP_BLOCK_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

const THRESHOLD_5_FAILS = 5;
const THRESHOLD_10_FAILS = 10;
const THRESHOLD_IP_20_FAILS = 20;
const CAPTCHA_AFTER_FAILS = 2;

const LOCK_DURATION_15M_MS = 15 * 60 * 1000;

/**
 * Check trạng thái lockout của user (theo email).
 * Gọi TRƯỚC khi verify password.
 */
export async function checkLockout(email: string, ipAddress: string): Promise<LockoutState> {
  const now = new Date();

  // 1. Check IP blocked (20 fail/IP/1h → block 24h)
  const ipFailCount = await db.loginAttempt.count({
    where: {
      ipAddress,
      success: false,
      createdAt: { gte: new Date(now.getTime() - FAIL_WINDOW_LONG_MS) },
    },
  });

  if (ipFailCount >= THRESHOLD_IP_20_FAILS) {
    // IP bị block 24h - check IP có request thành công nào trong 24h gần đây không
    const lastSuccess = await db.loginAttempt.findFirst({
      where: {
        ipAddress,
        success: true,
        createdAt: { gte: new Date(now.getTime() - IP_BLOCK_WINDOW_MS) },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!lastSuccess) {
      return {
        locked: true,
        lockedUntil: new Date(now.getTime() + IP_BLOCK_WINDOW_MS),
        requireCaptcha: true,
        recentFailCount: ipFailCount,
      };
    }
  }

  // 2. Check user-level lockout
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, lockedUntil: true, failedLoginCount: true },
  });

  if (user?.lockedUntil && user.lockedUntil > now) {
    return {
      locked: true,
      lockedUntil: user.lockedUntil,
      requireCaptcha: true,
      recentFailCount: user.failedLoginCount,
    };
  }

  // 3. Check fail gần đây cho user này → có cần captcha không
  const recentFails = user
    ? await db.loginAttempt.count({
        where: {
          userId: user.id,
          success: false,
          createdAt: { gte: new Date(now.getTime() - FAIL_WINDOW_SHORT_MS) },
        },
      })
    : await db.loginAttempt.count({
        where: {
          email,
          success: false,
          createdAt: { gte: new Date(now.getTime() - FAIL_WINDOW_SHORT_MS) },
        },
      });

  return {
    locked: false,
    lockedUntil: null,
    requireCaptcha: recentFails >= CAPTCHA_AFTER_FAILS,
    recentFailCount: recentFails,
  };
}

/**
 * Ghi nhận 1 lần login thất bại + apply lockout nếu vượt ngưỡng.
 */
export async function recordFailedLogin(params: {
  email: string;
  userId?: string | null;
  ipAddress: string;
  userAgent?: string | null;
  deviceId?: string | null;
  failReason: LoginFailReason;
}): Promise<{ accountLocked: boolean; lockedUntil: Date | null }> {
  const now = new Date();

  // Log attempt
  await db.loginAttempt.create({
    data: {
      email: params.email,
      userId: params.userId ?? null,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent ?? null,
      deviceId: params.deviceId ?? null,
      success: false,
      failReason: params.failReason,
    },
  });

  if (!params.userId) {
    return { accountLocked: false, lockedUntil: null };
  }

  // Count fail liên tục cho user
  const count15m = await db.loginAttempt.count({
    where: {
      userId: params.userId,
      success: false,
      createdAt: { gte: new Date(now.getTime() - FAIL_WINDOW_SHORT_MS) },
    },
  });

  const count1h = await db.loginAttempt.count({
    where: {
      userId: params.userId,
      success: false,
      createdAt: { gte: new Date(now.getTime() - FAIL_WINDOW_LONG_MS) },
    },
  });

  let lockedUntil: Date | null = null;
  let lockReason: string | null = null;

  if (count1h >= THRESHOLD_10_FAILS) {
    // Lock đến khi admin unlock (set xa 1 năm)
    lockedUntil = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    lockReason = `${THRESHOLD_10_FAILS}_FAILS_1H_ADMIN_UNLOCK`;
  } else if (count15m >= THRESHOLD_5_FAILS) {
    lockedUntil = new Date(now.getTime() + LOCK_DURATION_15M_MS);
    lockReason = `${THRESHOLD_5_FAILS}_FAILS_15M`;
  }

  await db.user.update({
    where: { id: params.userId },
    data: {
      failedLoginCount: { increment: 1 },
      ...(lockedUntil ? { lockedUntil, lockReason } : {}),
    },
  });

  return { accountLocked: !!lockedUntil, lockedUntil };
}

/**
 * Ghi nhận login thành công, reset fail counter.
 */
export async function recordSuccessfulLogin(params: {
  userId: string;
  email: string;
  ipAddress: string;
  userAgent?: string | null;
  deviceId?: string | null;
  geoCity?: string | null;
  geoCountry?: string | null;
}): Promise<void> {
  await db.$transaction([
    db.loginAttempt.create({
      data: {
        email: params.email,
        userId: params.userId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent ?? null,
        deviceId: params.deviceId ?? null,
        success: true,
        geoCity: params.geoCity ?? null,
        geoCountry: params.geoCountry ?? null,
      },
    }),
    db.user.update({
      where: { id: params.userId },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lockReason: null,
        lastActivityAt: new Date(),
      },
    }),
  ]);
}

/**
 * Admin unlock account thủ công.
 */
export async function adminUnlockUser(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lockReason: null,
    },
  });
}

/**
 * Cleanup login attempts cũ hơn 90 ngày (cron job).
 */
export async function cleanupOldLoginAttempts(): Promise<number> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const result = await db.loginAttempt.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
