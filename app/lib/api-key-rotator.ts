// Round-robin API key rotator với failure tracking & cooldown.
// Tự động skip key bị rate limit / invalid, chỉ dùng key khả dụng.
// Hỗ trợ multi-key per provider để load balance + tránh quota.

interface FailureRecord {
  until: number; // Unix timestamp - hết cooldown thì available trở lại
  reason: string;
  httpStatus?: number;
}

export class APIKeyRotator {
  private name: string;
  private keys: string[] = [];
  private cursor = 0;
  private failures = new Map<string, FailureRecord>();

  constructor(name: string, envValues: Array<string | undefined>) {
    this.name = name;
    const collected: string[] = [];
    for (const val of envValues) {
      if (!val) continue;
      // Hỗ trợ phân cách bằng comma, semicolon, newline, whitespace
      const parts = val
        .split(/[,;\n\r]+/)
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter((s) => s.length > 0);
      collected.push(...parts);
    }
    // Dedupe
    this.keys = Array.from(new Set(collected));
  }

  hasAnyKey(): boolean {
    return this.keys.length > 0;
  }

  hasAvailableKey(): boolean {
    return this.getAvailableKeys().length > 0;
  }

  /** Tổng số key đã cấu hình (kể cả key đang cooldown). */
  getKeyCount(): number {
    return this.keys.length;
  }

  /** Số key sẵn sàng dùng ngay (loại bỏ cái đang cooldown). */
  getAvailableKeyCount(): number {
    return this.getAvailableKeys().length;
  }

  private getAvailableKeys(): string[] {
    const now = Date.now();
    return this.keys.filter((k) => {
      const f = this.failures.get(k);
      return !f || f.until <= now;
    });
  }

  /**
   * Lấy key tiếp theo theo round-robin trong các key khả dụng.
   * Trả null nếu tất cả key đều đang failed.
   */
  getNext(): string | null {
    const available = this.getAvailableKeys();
    if (available.length === 0) return null;
    const key = available[this.cursor % available.length];
    this.cursor = (this.cursor + 1) % available.length;
    return key;
  }

  markFailure(key: string, opts: { httpStatus?: number; message?: string } = {}) {
    const status = opts.httpStatus || 0;
    const msg = opts.message || "";

    let cooldownMs: number;
    if (status === 429 || /\brate.{0,5}limit|quota|too.{0,3}many/i.test(msg)) {
      cooldownMs = 5 * 60_000; // Rate limit: chờ 5 phút
    } else if (status === 401 || status === 403 || /unauthorized|invalid.{0,5}key|api[_\s-]?key|forbidden/i.test(msg)) {
      cooldownMs = 24 * 60 * 60_000; // Key invalid: skip 24h (admin cần fix)
    } else if (status >= 500) {
      cooldownMs = 30_000; // Server lỗi: thử lại sau 30s
    } else {
      cooldownMs = 60_000; // Lỗi khác: 1 phút
    }

    this.failures.set(key, {
      until: Date.now() + cooldownMs,
      reason: msg.slice(0, 200) || `HTTP ${status}`,
      httpStatus: status,
    });
  }

  markSuccess(key: string) {
    // Reset failure record khi thành công
    this.failures.delete(key);
  }

  /**
   * Chạy operation với auto-retry trên các key khác nhau.
   * Trả về kết quả của lần thành công đầu tiên, hoặc throw error nếu tất cả thất bại.
   */
  async runWithRotation<T>(
    op: (key: string) => Promise<T>,
    maxAttempts?: number
  ): Promise<T> {
    if (this.keys.length === 0) {
      throw new Error(`${this.name}: chưa cấu hình API key nào`);
    }

    const tried = new Set<string>();
    const limit = Math.min(maxAttempts ?? this.keys.length, this.keys.length);
    let lastError: any;

    for (let i = 0; i < limit; i++) {
      const key = this.getNext();
      if (!key) break; // Hết key khả dụng
      if (tried.has(key)) continue;
      tried.add(key);

      try {
        const result = await op(key);
        this.markSuccess(key);
        return result;
      } catch (e: any) {
        lastError = e;
        const status =
          e?.status ||
          e?.response?.status ||
          extractStatusCode(e?.message) ||
          0;
        this.markFailure(key, {
          httpStatus: status,
          message: e?.message,
        });
        // Tiếp tục thử key khác
      }
    }

    throw lastError || new Error(`${this.name}: tất cả ${this.keys.length} key đều thất bại`);
  }

  /** Trạng thái hiện tại của rotator (cho admin/debug). */
  status() {
    const now = Date.now();
    const failures: Array<{ keyPrefix: string; reason: string; remainingSec: number }> = [];
    for (const [key, f] of this.failures) {
      if (f.until > now) {
        failures.push({
          keyPrefix: key.slice(0, 6) + "...",
          reason: f.reason,
          remainingSec: Math.ceil((f.until - now) / 1000),
        });
      }
    }
    return {
      provider: this.name,
      totalKeys: this.keys.length,
      availableKeys: this.getAvailableKeys().length,
      failures,
    };
  }
}

function extractStatusCode(msg: string | undefined): number | undefined {
  if (!msg) return undefined;
  const m =
    msg.match(/\[(\d{3})\b/) ||
    msg.match(/HTTP[\s:]+(\d{3})/i) ||
    msg.match(/status[\s:]+(\d{3})/i) ||
    msg.match(/\b(4\d{2}|5\d{2})\b/);
  return m ? parseInt(m[1]) : undefined;
}

// =====================================================
// Singleton rotators per provider
// =====================================================
//
// Mỗi rotator có 2 source thứ tự ưu tiên:
//   1. SystemSetting (DB-backed, super admin update qua UI) — encrypted
//   2. process.env.<KEY> (Vercel env vars, fallback)
//
// Rotator được rebuild khi cache settings expire (5 phút) hoặc khi admin
// force reload qua reloadRotators().

import { getSetting } from "./system-settings";

let geminiRotator: APIKeyRotator | null = null;
let anthropicRotator: APIKeyRotator | null = null;
let deepseekRotator: APIKeyRotator | null = null;
let rotatorsLoadedAt = 0;
const ROTATOR_TTL_MS = 5 * 60 * 1000; // align với system-settings cache

/** Build/rebuild rotators từ DB settings + env fallback */
async function ensureRotators(): Promise<void> {
  const now = Date.now();
  if (geminiRotator && now - rotatorsLoadedAt < ROTATOR_TTL_MS) return;

  // Đọc settings từ DB (fallback env tự xử lý trong getSetting)
  const [geminiKeys, geminiKey, anthropicKeys, anthropicKey, deepseekKeys, deepseekKey] =
    await Promise.all([
      getSetting("GEMINI_API_KEYS"),
      getSetting("GEMINI_API_KEY"),
      getSetting("ANTHROPIC_API_KEYS"),
      getSetting("ANTHROPIC_API_KEY"),
      getSetting("DEEPSEEK_API_KEYS"),
      getSetting("DEEPSEEK_API_KEY"),
    ]);

  geminiRotator = new APIKeyRotator("Gemini", [
    geminiKeys || undefined,
    geminiKey || undefined,
  ]);
  anthropicRotator = new APIKeyRotator("Anthropic", [
    anthropicKeys || undefined,
    anthropicKey || undefined,
  ]);
  deepseekRotator = new APIKeyRotator("DeepSeek", [
    deepseekKeys || undefined,
    deepseekKey || undefined,
  ]);
  rotatorsLoadedAt = now;
}

/**
 * SYNCHRONOUS getter - dùng cho code path hiện hữu (vd ai.ts streamChat).
 * Lazy init: lần đầu gọi sẽ dùng ENV ONLY (vì DB load async).
 * Background sẽ rebuild với DB values sau khi route async-trigger ensureRotators.
 *
 * Pattern khuyến nghị: gọi ensureRotators() ở đầu API route trước, rồi
 * sync getter sẽ trả rotator đã được populate từ DB.
 */
export function getGeminiRotator(): APIKeyRotator {
  if (!geminiRotator) {
    geminiRotator = new APIKeyRotator("Gemini", [
      process.env.GEMINI_API_KEYS,
      process.env.GEMINI_API_KEY,
    ]);
  }
  return geminiRotator;
}

export function getAnthropicRotator(): APIKeyRotator {
  if (!anthropicRotator) {
    anthropicRotator = new APIKeyRotator("Anthropic", [
      process.env.ANTHROPIC_API_KEYS,
      process.env.ANTHROPIC_API_KEY,
    ]);
  }
  return anthropicRotator;
}

export function getDeepSeekRotator(): APIKeyRotator {
  if (!deepseekRotator) {
    deepseekRotator = new APIKeyRotator("DeepSeek", [
      process.env.DEEPSEEK_API_KEYS,
      process.env.DEEPSEEK_API_KEY,
    ]);
  }
  return deepseekRotator;
}

/** Async getter - đảm bảo rotator đã được load từ DB. Khuyến nghị dùng trong API routes. */
export async function getGeminiRotatorAsync(): Promise<APIKeyRotator> {
  await ensureRotators();
  return geminiRotator!;
}
export async function getAnthropicRotatorAsync(): Promise<APIKeyRotator> {
  await ensureRotators();
  return anthropicRotator!;
}
export async function getDeepSeekRotatorAsync(): Promise<APIKeyRotator> {
  await ensureRotators();
  return deepseekRotator!;
}

/** Force reload rotators từ DB ngay (admin gọi sau khi update key). */
export async function reloadRotators(): Promise<void> {
  rotatorsLoadedAt = 0;
  geminiRotator = null;
  anthropicRotator = null;
  deepseekRotator = null;
  await ensureRotators();
}

/** Reset singletons (cho testing). */
export function resetRotators() {
  geminiRotator = null;
  anthropicRotator = null;
  deepseekRotator = null;
  rotatorsLoadedAt = 0;
}
