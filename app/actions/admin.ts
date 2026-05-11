"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { isSuperAdmin } from "@/lib/permissions";
import {
  setSetting,
  deleteSetting,
  getSetting,
  clearSettingsCache,
} from "@/lib/system-settings";
import { reloadRotators } from "@/lib/api-key-rotator";
import { runRiskScan } from "@/lib/ai-monitor/scanner";
import { headers } from "next/headers";

// =====================================================
// Helper - chỉ super admin được gọi
// =====================================================
async function requireSuperAdmin() {
  const user = await requireAuth();
  if (!isSuperAdmin(user.role)) {
    throw new Error("Forbidden: chỉ Super Admin");
  }
  return user;
}

/** Log admin action vào AdminAuditLog */
async function logAdminAction(opts: {
  adminId: string;
  action: string;
  target?: string;
  details?: any;
}) {
  try {
    const hdrs = await headers();
    await db.adminAuditLog.create({
      data: {
        adminId: opts.adminId,
        action: opts.action,
        target: opts.target,
        details: opts.details as any,
        ipAddress: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() || hdrs.get("x-real-ip") || null,
        userAgent: hdrs.get("user-agent") || null,
      },
    });
  } catch (e: any) {
    console.error("[admin-audit] Failed:", e?.message);
  }
}

// =====================================================
// API KEYS MANAGEMENT
// =====================================================
const apiKeySchema = z.object({
  key: z.enum([
    "GEMINI_API_KEYS",
    "GEMINI_API_KEY",
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_API_KEYS",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_API_KEYS",
  ]),
  value: z.string().min(10, "API key tối thiểu 10 ký tự").max(5000),
});

export async function updateApiKey(input: z.infer<typeof apiKeySchema>) {
  const admin = await requireSuperAdmin();
  const data = apiKeySchema.parse(input);

  await setSetting(data.key, data.value, {
    updatedById: admin.id,
    isEncrypted: true,
    category: "ai-keys",
    description: `API key cho ${data.key.split("_")[0]}`,
  });

  // Force reload rotators để key mới có hiệu lực ngay
  await reloadRotators();

  await logAdminAction({
    adminId: admin.id,
    action: "settings:update-api-key",
    target: data.key,
    details: { keyLength: data.value.length },
  });

  revalidatePath("/admin/api-keys");
  return { success: true };
}

export async function deleteApiKey(key: string) {
  const admin = await requireSuperAdmin();
  await deleteSetting(key);
  await reloadRotators();
  await logAdminAction({
    adminId: admin.id,
    action: "settings:delete-api-key",
    target: key,
  });
  revalidatePath("/admin/api-keys");
  return { success: true };
}

/** Test API key thật sự work bằng cách gọi 1 request mẫu nhỏ */
export async function testApiKey(provider: "gemini" | "deepseek" | "anthropic"): Promise<{
  success: boolean;
  message: string;
  latencyMs?: number;
}> {
  await requireSuperAdmin();
  const t0 = Date.now();

  try {
    if (provider === "gemini") {
      const key = await getSetting("GEMINI_API_KEYS");
      if (!key) return { success: false, message: "Chưa cấu hình GEMINI_API_KEYS" };
      // Lấy key đầu nếu có nhiều
      const firstKey = key.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)[0];
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${firstKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: "ping" }] }],
            generationConfig: { maxOutputTokens: 5 },
          }),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        return {
          success: false,
          message: `HTTP ${res.status}: ${err.slice(0, 200)}`,
          latencyMs: Date.now() - t0,
        };
      }
      return { success: true, message: "OK", latencyMs: Date.now() - t0 };
    }

    if (provider === "deepseek") {
      const key = await getSetting("DEEPSEEK_API_KEY");
      if (!key) return { success: false, message: "Chưa cấu hình DEEPSEEK_API_KEY" };
      const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        return {
          success: false,
          message: `HTTP ${res.status}: ${err.slice(0, 200)}`,
          latencyMs: Date.now() - t0,
        };
      }
      return { success: true, message: "OK", latencyMs: Date.now() - t0 };
    }

    if (provider === "anthropic") {
      const key = await getSetting("ANTHROPIC_API_KEY");
      if (!key) return { success: false, message: "Chưa cấu hình ANTHROPIC_API_KEY" };
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 5,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        return {
          success: false,
          message: `HTTP ${res.status}: ${err.slice(0, 200)}`,
          latencyMs: Date.now() - t0,
        };
      }
      return { success: true, message: "OK", latencyMs: Date.now() - t0 };
    }

    return { success: false, message: "Provider không hợp lệ" };
  } catch (e: any) {
    return {
      success: false,
      message: e?.message || "Lỗi không xác định",
      latencyMs: Date.now() - t0,
    };
  }
}

// =====================================================
// USER MANAGEMENT (super admin only)
// =====================================================

export async function resetUserPassword(userId: string): Promise<{
  success: boolean;
  error?: string;
  newPassword?: string;
}> {
  const admin = await requireSuperAdmin();
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { success: false, error: "Không tìm thấy tài khoản" };

  // Tạo password tạm 12 ký tự
  const newPassword = generateTempPassword();
  const hash = await bcrypt.hash(newPassword, 10);

  // Update password ở account của Better Auth (provider="credential")
  await db.account.updateMany({
    where: { userId, providerId: "credential" },
    data: { password: hash },
  });

  await logAdminAction({
    adminId: admin.id,
    action: "user:reset-password",
    target: userId,
    details: { targetName: target.name, targetEmail: target.email },
  });

  return { success: true, newPassword };
}

export async function setUserActive(userId: string, isActive: boolean) {
  const admin = await requireSuperAdmin();
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { success: false, error: "Không tìm thấy" };

  // Không cho phép disable chính mình
  if (target.id === admin.id) {
    return { success: false, error: "Không thể tự vô hiệu hóa tài khoản của mình" };
  }

  await db.user.update({
    where: { id: userId },
    data: { isActive },
  });

  // Nếu deactivate → revoke tất cả session của user đó
  if (!isActive) {
    await db.session.deleteMany({ where: { userId } });
  }

  await logAdminAction({
    adminId: admin.id,
    action: isActive ? "user:activate" : "user:deactivate",
    target: userId,
    details: { targetName: target.name },
  });

  revalidatePath("/admin/users");
  return { success: true };
}

// =====================================================
// MAINTENANCE
// =====================================================

/** Manually trigger risk scan (không chờ cron) */
export async function triggerRiskScan() {
  const admin = await requireSuperAdmin();
  const result = await runRiskScan();
  await logAdminAction({
    adminId: admin.id,
    action: "maintenance:trigger-risk-scan",
    details: result as any,
  });
  return { success: true, result };
}

/** Clear in-memory caches (system settings + rotators) */
export async function clearCaches() {
  const admin = await requireSuperAdmin();
  clearSettingsCache();
  await reloadRotators();
  await logAdminAction({
    adminId: admin.id,
    action: "maintenance:clear-cache",
  });
  return { success: true };
}

/** Force logout tất cả user (revoke all sessions trừ super admin gọi) */
export async function forceLogoutAll() {
  const admin = await requireSuperAdmin();
  const result = await db.session.deleteMany({
    where: { userId: { not: admin.id } },
  });
  await logAdminAction({
    adminId: admin.id,
    action: "maintenance:force-logout-all",
    details: { sessionsDeleted: result.count },
  });
  return { success: true, count: result.count };
}

// =====================================================
// Helpers
// =====================================================

function generateTempPassword(): string {
  // 12 ký tự: letters + digits + 1 special
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let pw = "";
  for (let i = 0; i < 11; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  pw += "!"; // đảm bảo có ký tự đặc biệt cho password policy
  return pw;
}
