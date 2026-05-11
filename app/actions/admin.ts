"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { isSuperAdmin } from "@/lib/permissions";
import { hashPassword, generateTempPassword as genTempPw } from "@/lib/crypto/password";
import {
  setSetting,
  deleteSetting,
  getSetting,
  clearSettingsCache,
} from "@/lib/system-settings";
import { reloadRotators } from "@/lib/api-key-rotator";
import { runRiskScan } from "@/lib/ai-monitor/scanner";
import { checkAllProviders, checkProviderKeys, getAllKeys, type Provider } from "@/lib/api-key-health";
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

  // Auto-trigger health check provider tương ứng để có status ngay
  const provider: Provider | null = data.key.startsWith("GEMINI")
    ? "gemini"
    : data.key.startsWith("DEEPSEEK")
    ? "deepseek"
    : data.key.startsWith("ANTHROPIC")
    ? "anthropic"
    : null;
  if (provider) {
    // Run in background - không await để response nhanh
    checkProviderKeys(provider).catch((e) =>
      console.error(`[admin] auto health check fail:`, e?.message)
    );
  }

  await logAdminAction({
    adminId: admin.id,
    action: "settings:update-api-key",
    target: data.key,
    details: { keyLength: data.value.length },
  });

  revalidatePath("/admin/api-keys");
  return { success: true };
}

/**
 * APPEND mode: thêm 1 hoặc nhiều key mới vào pool hiện có.
 * Input value có thể chứa nhiều key (comma/semicolon/newline separated).
 * Dedupe với keys hiện có, save merged list vào setting.
 */
const apiKeyAppendSchema = z.object({
  provider: z.enum(["gemini", "deepseek", "anthropic"]),
  value: z.string().min(10).max(5000),
});

export async function appendApiKeys(input: z.infer<typeof apiKeyAppendSchema>): Promise<{
  success: boolean;
  added?: number;
  duplicates?: number;
  total?: number;
  error?: string;
}> {
  const admin = await requireSuperAdmin();
  const data = apiKeyAppendSchema.parse(input);

  // Parse keys mới từ input
  const newKeys = data.value
    .split(/[,;\n\r]+/)
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter((s) => s.length >= 10);

  if (newKeys.length === 0) {
    return { success: false, error: "Không tìm thấy key hợp lệ (tối thiểu 10 ký tự)" };
  }

  // Lấy keys hiện có
  const existing = await getAllKeys(data.provider);
  const existingSet = new Set(existing);

  // Dedupe
  const toAdd: string[] = [];
  let duplicates = 0;
  for (const k of newKeys) {
    if (existingSet.has(k)) {
      duplicates++;
    } else {
      toAdd.push(k);
      existingSet.add(k);
    }
  }

  if (toAdd.length === 0) {
    return { success: false, error: `Tất cả ${duplicates} key đều đã tồn tại trong pool`, duplicates };
  }

  // Save merged list vào setting tương ứng (PLURAL key cho multi-key support)
  const settingKey =
    data.provider === "gemini"
      ? "GEMINI_API_KEYS"
      : data.provider === "deepseek"
      ? "DEEPSEEK_API_KEYS"
      : "ANTHROPIC_API_KEYS";

  const merged = Array.from(existingSet);
  await setSetting(settingKey, merged.join(","), {
    updatedById: admin.id,
    isEncrypted: true,
    category: "ai-keys",
    description: `Pool ${merged.length} keys cho ${data.provider}`,
  });

  await reloadRotators();

  // Auto trigger health check provider để có status cho key mới
  checkProviderKeys(data.provider).catch((e) =>
    console.error(`[admin] auto health check fail:`, e?.message)
  );

  await logAdminAction({
    adminId: admin.id,
    action: "settings:append-api-keys",
    target: settingKey,
    details: { added: toAdd.length, duplicates, total: merged.length },
  });

  revalidatePath("/admin/api-keys");
  return { success: true, added: toAdd.length, duplicates, total: merged.length };
}

/**
 * Xóa 1 key khỏi pool theo keyIndex (vị trí trong danh sách hiện tại).
 * Nếu xóa hết key → setting cũng bị xóa (fallback về env).
 */
export async function removeApiKeyByIndex(input: {
  provider: Provider;
  keyIndex: number;
}): Promise<{ success: boolean; remaining?: number; error?: string }> {
  const admin = await requireSuperAdmin();

  const existing = await getAllKeys(input.provider);
  if (input.keyIndex < 0 || input.keyIndex >= existing.length) {
    return { success: false, error: "Index không hợp lệ" };
  }

  const removed = existing[input.keyIndex];
  const remaining = existing.filter((_, i) => i !== input.keyIndex);

  const settingKey =
    input.provider === "gemini"
      ? "GEMINI_API_KEYS"
      : input.provider === "deepseek"
      ? "DEEPSEEK_API_KEYS"
      : "ANTHROPIC_API_KEYS";

  if (remaining.length === 0) {
    // Xóa setting → fallback về env nếu có
    await deleteSetting(settingKey);
  } else {
    await setSetting(settingKey, remaining.join(","), {
      updatedById: admin.id,
      isEncrypted: true,
      category: "ai-keys",
      description: `Pool ${remaining.length} keys cho ${input.provider}`,
    });
  }

  await reloadRotators();

  // Xóa health check + usage record của key đó
  const removedPrefix = removed.slice(0, 10);
  await db.apiKeyHealthCheck.deleteMany({
    where: { provider: input.provider, keyPrefix: removedPrefix },
  });

  // Re-check để update keyIndex của các key còn lại
  checkProviderKeys(input.provider).catch((e) =>
    console.error(`[admin] auto health check fail:`, e?.message)
  );

  await logAdminAction({
    adminId: admin.id,
    action: "settings:remove-api-key",
    target: settingKey,
    details: { keyIndex: input.keyIndex, removedPrefix, remaining: remaining.length },
  });

  revalidatePath("/admin/api-keys");
  return { success: true, remaining: remaining.length };
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
// API KEY HEALTH CHECK
// =====================================================

/** Trigger check tất cả keys (3 providers) ngay - super admin manual. */
export async function runAllKeyHealthCheck() {
  const admin = await requireSuperAdmin();
  const result = await checkAllProviders();
  await logAdminAction({
    adminId: admin.id,
    action: "settings:check-all-keys",
    details: {
      totalKeys: result.totalKeys,
      okKeys: result.okKeys,
      failedKeys: result.failedKeys,
      durationMs: result.durationMs,
    },
  });
  revalidatePath("/admin/api-keys");
  revalidatePath("/admin");
  return { success: true, ...result };
}

/** Trigger check 1 provider cụ thể. */
export async function runProviderHealthCheck(provider: Provider) {
  const admin = await requireSuperAdmin();
  const results = await checkProviderKeys(provider);
  await logAdminAction({
    adminId: admin.id,
    action: `settings:check-keys-${provider}`,
    details: { count: results.length },
  });
  revalidatePath("/admin/api-keys");
  return { success: true, results };
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

  // Tạo password tạm 16 ký tự đủ phức tạp + hash argon2id + pepper
  const newPassword = genTempPw(16);
  const hash = await hashPassword(newPassword);

  // Update password ở account Better Auth (provider="credential")
  // + ép user phải đổi password lần đăng nhập tiếp + reset lockout
  await db.$transaction([
    db.account.updateMany({
      where: { userId, providerId: "credential" },
      data: { password: hash },
    }),
    db.user.update({
      where: { id: userId },
      data: {
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        lockReason: null,
      },
    }),
    // Revoke tất cả session của user đó (buộc đăng nhập lại với password mới)
    db.session.deleteMany({ where: { userId } }),
  ]);

  await logAdminAction({
    adminId: admin.id,
    action: "user:reset-password",
    target: userId,
    details: { targetName: target.name },
  });

  return { success: true, newPassword };
}

/** Admin mở khóa tài khoản (sau khi user bị lock vì brute-force). */
export async function adminUnlockAccount(userId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const admin = await requireSuperAdmin();
  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, lockedUntil: true },
  });
  if (!target) return { success: false, error: "Không tìm thấy tài khoản" };

  await db.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null, lockReason: null },
  });

  await logAdminAction({
    adminId: admin.id,
    action: "user:unlock",
    target: userId,
    details: { targetName: target.name, previousLockedUntil: target.lockedUntil },
  });

  revalidatePath("/admin/users");
  return { success: true };
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

// Helper generateTempPassword đã chuyển sang lib/crypto/password.ts (genTempPw)
