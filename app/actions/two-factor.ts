"use server";

/**
 * 2FA server actions:
 *  - setup2FA: sinh secret + QR, chưa kích hoạt (user phải verify code đầu tiên)
 *  - enable2FA: user nhập code lần đầu để confirm setup → activate
 *  - disable2FA: user nhập password để confirm tắt 2FA
 *  - verify2FA: dùng trong login flow để verify code (sau khi password đã pass)
 *  - useBackupCode: trường hợp mất authenticator
 */
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import {
  generateTotpSecret,
  verifyTotp,
  encryptTotpSecret,
  decryptTotpSecret,
  generateBackupCodes,
  verifyBackupCode,
} from "@/lib/security/totp";
import { verifyPassword } from "@/lib/crypto/password";
import { logSecurityEvent } from "@/lib/security/security-events";
import { getFingerprint } from "@/lib/security/request-fingerprint";
import { require2FA } from "@/lib/permissions";

export interface Setup2FAResult {
  ok: boolean;
  error?: string;
  /** Base32 secret để user lưu lại (manual entry nếu không quét QR) */
  secret?: string;
  /** QR data URL để render */
  qrDataUrl?: string;
}

/**
 * Bước 1: Sinh secret + QR (chưa lưu DB).
 * UI hiển thị QR cho user quét → nhập code → gọi enable2FA(code, secret).
 */
export async function setup2FA(): Promise<Setup2FAResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Chưa đăng nhập" };
  if (user.twoFactorEnabled) {
    return { ok: false, error: "2FA đã được bật. Vô hiệu trước nếu muốn cấu hình lại." };
  }

  const { secret, qrDataUrl } = await generateTotpSecret(user.email);
  return { ok: true, secret, qrDataUrl };
}

/**
 * Bước 2: User nhập code đầu tiên + secret (echo lại từ bước 1) để confirm.
 */
export async function enable2FA(
  secret: string,
  code: string
): Promise<{
  ok: boolean;
  error?: string;
  backupCodes?: string[];
}> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Chưa đăng nhập" };
  if (user.twoFactorEnabled) {
    return { ok: false, error: "2FA đã được bật" };
  }
  if (!secret || !code) return { ok: false, error: "Thiếu thông tin" };

  if (!verifyTotp(secret, code)) {
    return { ok: false, error: "Mã xác thực sai. Vui lòng kiểm tra lại đồng hồ thiết bị + thử lại." };
  }

  // Sinh backup codes
  const { plain, hashed } = generateBackupCodes(8);

  // Encrypt secret trước khi lưu
  const encrypted = encryptTotpSecret(secret);

  await db.user.update({
    where: { id: user.id },
    data: {
      twoFactorSecret: encrypted,
      twoFactorEnabled: true,
      twoFactorBackupCodes: hashed,
    },
  });

  const fp = getFingerprint(await headers());
  await logSecurityEvent({
    userId: user.id,
    eventType: "2FA_ENABLED",
    severity: "info",
    description: "Đã bật xác thực 2 yếu tố (TOTP)",
    ipAddress: fp.ipAddress,
    userAgent: fp.userAgent,
  });

  revalidatePath("/settings/security");
  return { ok: true, backupCodes: plain };
}

/**
 * Tắt 2FA. Yêu cầu password để xác nhận.
 * KHÔNG cho phép tắt nếu role bắt buộc 2FA (TP/PTP/TBP/SUPER_ADMIN).
 */
export async function disable2FA(currentPassword: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Chưa đăng nhập" };
  if (!user.twoFactorEnabled) return { ok: false, error: "2FA chưa được bật" };

  // Chặn role bắt buộc
  if (require2FA(user.role)) {
    return {
      ok: false,
      error: "Vai trò của bạn bắt buộc 2FA, không thể tắt. Liên hệ quản trị viên nếu cần hỗ trợ.",
    };
  }

  // Verify password
  const acct = await db.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });
  if (!acct?.password) return { ok: false, error: "Không tìm thấy thông tin xác thực" };
  const v = await verifyPassword(currentPassword, acct.password);
  if (!v.valid) return { ok: false, error: "Mật khẩu không đúng" };

  await db.user.update({
    where: { id: user.id },
    data: {
      twoFactorSecret: null,
      twoFactorEnabled: false,
      twoFactorBackupCodes: [],
    },
  });

  const fp = getFingerprint(await headers());
  await logSecurityEvent({
    userId: user.id,
    eventType: "2FA_DISABLED",
    severity: "warning",
    description: "Đã tắt xác thực 2 yếu tố",
    ipAddress: fp.ipAddress,
    userAgent: fp.userAgent,
  });

  revalidatePath("/settings/security");
  return { ok: true };
}

/**
 * Verify TOTP code trong login flow (sau khi password đã pass).
 * Dùng cho /login/2fa page.
 *
 * Đánh dấu session.twoFactorVerified=true → các requireAuth() sau hoạt động bình thường.
 */
export async function verify2FA(code: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const hdr = await headers();
  const session = await auth.api.getSession({ headers: hdr });
  if (!session?.user || !session?.session?.id) {
    return { ok: false, error: "Chưa đăng nhập" };
  }

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { ok: false, error: "User không tồn tại" };
  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    return { ok: false, error: "Tài khoản chưa bật 2FA" };
  }

  const secret = decryptTotpSecret(user.twoFactorSecret);
  const codeCleaned = (code || "").trim();

  // Try TOTP first
  if (verifyTotp(secret, codeCleaned)) {
    await db.session.update({
      where: { id: session.session.id },
      data: { twoFactorVerified: true },
    });
    return { ok: true };
  }

  // Try backup code
  const idx = verifyBackupCode(codeCleaned, user.twoFactorBackupCodes);
  if (idx >= 0) {
    const remaining = [...user.twoFactorBackupCodes];
    remaining.splice(idx, 1); // dùng 1 lần

    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { twoFactorBackupCodes: remaining },
      }),
      db.session.update({
        where: { id: session.session.id },
        data: { twoFactorVerified: true },
      }),
    ]);

    const fp = getFingerprint(hdr);
    await logSecurityEvent({
      userId: user.id,
      eventType: "2FA_BACKUP_USED",
      severity: "warning",
      description: `Đã dùng 1 mã backup 2FA. Còn ${remaining.length} mã.`,
      ipAddress: fp.ipAddress,
      userAgent: fp.userAgent,
    });

    return { ok: true };
  }

  return { ok: false, error: "Mã xác thực không đúng" };
}

/**
 * Sinh lại backup codes (hủy bộ cũ).
 * Cần password để confirm.
 */
export async function regenerateBackupCodes(currentPassword: string): Promise<{
  ok: boolean;
  error?: string;
  backupCodes?: string[];
}> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Chưa đăng nhập" };
  if (!user.twoFactorEnabled) return { ok: false, error: "2FA chưa được bật" };

  const acct = await db.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });
  if (!acct?.password) return { ok: false, error: "Không tìm thấy thông tin xác thực" };
  const v = await verifyPassword(currentPassword, acct.password);
  if (!v.valid) return { ok: false, error: "Mật khẩu không đúng" };

  const { plain, hashed } = generateBackupCodes(8);

  await db.user.update({
    where: { id: user.id },
    data: { twoFactorBackupCodes: hashed },
  });

  return { ok: true, backupCodes: plain };
}
