// System settings storage - DB-backed với encryption.
// Dùng cho API keys, SMTP config, runtime thresholds - tránh phải redeploy khi đổi.
//
// Load order:
//   1. Đọc từ DB SystemSetting (decrypt nếu isEncrypted=true)
//   2. Fallback process.env.<KEY>
// Cache 5 phút (in-memory) để không hit DB mỗi request.
//
// Encryption: AES-256-GCM. Key derive từ BETTER_AUTH_SECRET (đảm bảo nếu DB leak,
// attacker vẫn cần Vercel env để decrypt).

import crypto from "crypto";
import { db } from "./db";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 phút
const cache: Map<string, { value: string | null; expiresAt: number }> = new Map();

// =============== ENCRYPTION ===============

function deriveKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET không được cấu hình");
  }
  // SHA-256 cho deterministic 32-byte key từ secret
  return crypto.createHash("sha256").update(secret).digest();
}

/** AES-256-GCM encrypt → base64(iv + tag + ciphertext) */
export function encryptValue(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(12); // 96-bit IV cho GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv (12) + tag (16) + ciphertext
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

/** Decrypt base64(iv + tag + ciphertext) → plaintext */
export function decryptValue(encoded: string): string {
  const key = deriveKey();
  const buf = Buffer.from(encoded, "base64");
  if (buf.length < 12 + 16) throw new Error("Ciphertext quá ngắn");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// =============== PUBLIC API ===============

/**
 * Lấy giá trị setting theo key.
 * - Đọc cache trước (5 phút)
 * - Cache miss → query DB SystemSetting, decrypt nếu cần
 * - DB không có → fallback process.env[key]
 * - Cuối cùng null
 */
export async function getSetting(key: string): Promise<string | null> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  let value: string | null = null;
  try {
    const row = await db.systemSetting.findUnique({ where: { key } });
    if (row) {
      value = row.isEncrypted ? decryptValue(row.value) : row.value;
    }
  } catch (e: any) {
    // DB query fail → silent, fallback env
    console.error(`[system-settings] DB read fail for ${key}:`, e?.message);
  }

  if (value === null) {
    value = process.env[key] || null;
  }

  cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  return value;
}

/**
 * Lấy nhiều settings 1 lúc - tối ưu hơn gọi getSetting nhiều lần.
 */
export async function getSettings(keys: string[]): Promise<Record<string, string | null>> {
  const result: Record<string, string | null> = {};
  // Lọc key chưa có trong cache
  const now = Date.now();
  const toFetch: string[] = [];
  for (const k of keys) {
    const c = cache.get(k);
    if (c && c.expiresAt > now) result[k] = c.value;
    else toFetch.push(k);
  }

  if (toFetch.length > 0) {
    try {
      const rows = await db.systemSetting.findMany({
        where: { key: { in: toFetch } },
      });
      const rowMap = new Map(rows.map((r) => [r.key, r]));
      for (const k of toFetch) {
        const row = rowMap.get(k);
        let value: string | null = null;
        if (row) {
          value = row.isEncrypted ? decryptValue(row.value) : row.value;
        } else {
          value = process.env[k] || null;
        }
        cache.set(k, { value, expiresAt: now + CACHE_TTL_MS });
        result[k] = value;
      }
    } catch (e: any) {
      console.error(`[system-settings] DB batch fail:`, e?.message);
      // Fallback env cho keys chưa fetch được
      for (const k of toFetch) {
        result[k] = process.env[k] || null;
      }
    }
  }

  return result;
}

/**
 * Ghi setting (encrypt mặc định).
 * Caller phải verify quyền admin trước khi gọi.
 */
export async function setSetting(
  key: string,
  value: string,
  opts: {
    updatedById: string;
    isEncrypted?: boolean;
    description?: string;
    category?: string;
  }
): Promise<void> {
  const encrypted = opts.isEncrypted !== false;
  const storedValue = encrypted ? encryptValue(value) : value;

  await db.systemSetting.upsert({
    where: { key },
    update: {
      value: storedValue,
      isEncrypted: encrypted,
      description: opts.description,
      category: opts.category,
      updatedById: opts.updatedById,
    },
    create: {
      key,
      value: storedValue,
      isEncrypted: encrypted,
      description: opts.description,
      category: opts.category,
      updatedById: opts.updatedById,
    },
  });

  // Invalidate cache
  cache.delete(key);
}

/**
 * Xóa setting (sẽ fallback về process.env nếu có).
 */
export async function deleteSetting(key: string): Promise<void> {
  await db.systemSetting.deleteMany({ where: { key } });
  cache.delete(key);
}

/**
 * Liệt kê settings (KHÔNG decrypt value - chỉ metadata).
 * Dùng cho admin UI hiển thị danh sách.
 */
export async function listSettings(category?: string) {
  return db.systemSetting.findMany({
    where: category ? { category } : undefined,
    select: {
      id: true,
      key: true,
      isEncrypted: true,
      description: true,
      category: true,
      updatedAt: true,
      updatedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ category: "asc" }, { key: "asc" }],
  });
}

/**
 * Lấy setting đã decrypted để display (mask phần lớn ký tự cho UI).
 * Ví dụ Gemini key "AIzaSyA7Rr...K5AI" → "AIza••••••5AI"
 */
export function maskSecretValue(value: string): string {
  if (value.length <= 8) return "••••••";
  return value.slice(0, 4) + "••••••" + value.slice(-4);
}

/** Clear toàn bộ cache - gọi khi cần force reload (sau bulk update) */
export function clearSettingsCache(): void {
  cache.clear();
}
