// API key health checking - test từng key (multi-key support) + lưu kết quả vào DB.
// Status:
//   ok            - key hoạt động bình thường
//   rate_limited  - HTTP 429 hoặc quota exceeded
//   invalid       - HTTP 401/403 (key sai/bị revoke)
//   network_error - không kết nối được provider
//   timeout       - request timeout (>10s)

import { db } from "./db";
import { getSetting } from "./system-settings";

export type ApiKeyStatus =
  | "ok"
  | "rate_limited"
  | "invalid"
  | "network_error"
  | "timeout"
  | "unknown";

export type Provider = "gemini" | "deepseek" | "anthropic";

export interface KeyHealthRecord {
  id: string;
  provider: string;
  keyIndex: number;
  keyPrefix: string;
  status: string;
  latencyMs: number | null;
  errorMsg: string | null;
  httpStatus: number | null;
  testedAt: Date;
}

const PROVIDER_SETTINGS: Record<Provider, string[]> = {
  // Theo thứ tự ưu tiên - rotator dedupe
  gemini: ["GEMINI_API_KEYS", "GEMINI_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEYS", "DEEPSEEK_API_KEY"],
  anthropic: ["ANTHROPIC_API_KEYS", "ANTHROPIC_API_KEY"],
};

const TIMEOUT_MS = 10_000;

/**
 * Parse multi-key value (comma/semicolon/newline separated) → array of keys.
 * Dedupe + remove quotes.
 */
function parseKeys(values: Array<string | null>): string[] {
  const collected: string[] = [];
  for (const v of values) {
    if (!v) continue;
    const parts = v
      .split(/[,;\n\r]+/)
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter((s) => s.length > 0);
    collected.push(...parts);
  }
  return Array.from(new Set(collected));
}

/** Lấy toàn bộ keys của 1 provider (từ DB SystemSetting + env fallback). */
export async function getAllKeys(provider: Provider): Promise<string[]> {
  const settingKeys = PROVIDER_SETTINGS[provider];
  const values = await Promise.all(settingKeys.map((k) => getSetting(k)));
  return parseKeys(values);
}

/** Mask key để hiển thị: "AIzaSyA7Rr" (10 ký tự đầu) */
export function maskKey(key: string): string {
  if (key.length <= 10) return "••••••";
  return key.slice(0, 10);
}

// =====================================================
// Provider-specific test functions
// =====================================================

async function testGemini(key: string): Promise<{
  status: ApiKeyStatus;
  httpStatus?: number;
  errorMsg?: string;
}> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 5, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: ctrl.signal,
      }
    );
    clearTimeout(timer);

    if (res.ok) return { status: "ok", httpStatus: res.status };
    const body = (await res.text()).slice(0, 400);
    if (res.status === 429 || /quota|rate.*limit/i.test(body))
      return { status: "rate_limited", httpStatus: res.status, errorMsg: body.slice(0, 200) };
    if (res.status === 401 || res.status === 403 || /api[\s_-]?key|unauthorized|forbidden/i.test(body))
      return { status: "invalid", httpStatus: res.status, errorMsg: body.slice(0, 200) };
    return { status: "unknown", httpStatus: res.status, errorMsg: body.slice(0, 200) };
  } catch (e: any) {
    if (e?.name === "AbortError") return { status: "timeout", errorMsg: "Request > 10s" };
    return { status: "network_error", errorMsg: e?.message?.slice(0, 200) || "Unknown" };
  }
}

async function testDeepSeek(key: string): Promise<{
  status: ApiKeyStatus;
  httpStatus?: number;
  errorMsg?: string;
}> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) return { status: "ok", httpStatus: res.status };
    const body = (await res.text()).slice(0, 400);
    if (res.status === 429 || /rate.*limit|quota/i.test(body))
      return { status: "rate_limited", httpStatus: res.status, errorMsg: body.slice(0, 200) };
    if (res.status === 401 || res.status === 403)
      return { status: "invalid", httpStatus: res.status, errorMsg: body.slice(0, 200) };
    return { status: "unknown", httpStatus: res.status, errorMsg: body.slice(0, 200) };
  } catch (e: any) {
    if (e?.name === "AbortError") return { status: "timeout", errorMsg: "Request > 10s" };
    return { status: "network_error", errorMsg: e?.message?.slice(0, 200) || "Unknown" };
  }
}

async function testAnthropic(key: string): Promise<{
  status: ApiKeyStatus;
  httpStatus?: number;
  errorMsg?: string;
}> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
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
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) return { status: "ok", httpStatus: res.status };
    const body = (await res.text()).slice(0, 400);
    if (res.status === 429 || /rate.*limit|quota/i.test(body))
      return { status: "rate_limited", httpStatus: res.status, errorMsg: body.slice(0, 200) };
    if (res.status === 401 || res.status === 403)
      return { status: "invalid", httpStatus: res.status, errorMsg: body.slice(0, 200) };
    return { status: "unknown", httpStatus: res.status, errorMsg: body.slice(0, 200) };
  } catch (e: any) {
    if (e?.name === "AbortError") return { status: "timeout", errorMsg: "Request > 10s" };
    return { status: "network_error", errorMsg: e?.message?.slice(0, 200) || "Unknown" };
  }
}

const TESTERS: Record<Provider, (key: string) => Promise<{ status: ApiKeyStatus; httpStatus?: number; errorMsg?: string }>> = {
  gemini: testGemini,
  deepseek: testDeepSeek,
  anthropic: testAnthropic,
};

// =====================================================
// Public API
// =====================================================

/** Check 1 provider - test tất cả keys, upsert DB, trả về kết quả. */
export async function checkProviderKeys(provider: Provider): Promise<KeyHealthRecord[]> {
  const keys = await getAllKeys(provider);
  if (keys.length === 0) {
    // Xóa records cũ nếu provider không còn key
    await db.apiKeyHealthCheck.deleteMany({ where: { provider } });
    return [];
  }

  const tester = TESTERS[provider];
  const results: KeyHealthRecord[] = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const t0 = Date.now();
    const r = await tester(key);
    const latencyMs = Date.now() - t0;
    const prefix = maskKey(key);

    const row = await db.apiKeyHealthCheck.upsert({
      where: { provider_keyIndex: { provider, keyIndex: i } },
      update: {
        keyPrefix: prefix,
        status: r.status,
        latencyMs,
        errorMsg: r.errorMsg || null,
        httpStatus: r.httpStatus || null,
        testedAt: new Date(),
      },
      create: {
        provider,
        keyIndex: i,
        keyPrefix: prefix,
        status: r.status,
        latencyMs,
        errorMsg: r.errorMsg || null,
        httpStatus: r.httpStatus || null,
      },
    });
    results.push(row);
  }

  // Xóa records của keyIndex > số key hiện tại (key đã bị xóa)
  await db.apiKeyHealthCheck.deleteMany({
    where: { provider, keyIndex: { gte: keys.length } },
  });

  return results;
}

/** Check tất cả 3 providers song song */
export async function checkAllProviders(): Promise<{
  gemini: KeyHealthRecord[];
  deepseek: KeyHealthRecord[];
  anthropic: KeyHealthRecord[];
  totalKeys: number;
  okKeys: number;
  failedKeys: number;
  durationMs: number;
}> {
  const t0 = Date.now();
  const [gemini, deepseek, anthropic] = await Promise.all([
    checkProviderKeys("gemini"),
    checkProviderKeys("deepseek"),
    checkProviderKeys("anthropic"),
  ]);
  const all = [...gemini, ...deepseek, ...anthropic];
  return {
    gemini,
    deepseek,
    anthropic,
    totalKeys: all.length,
    okKeys: all.filter((r) => r.status === "ok").length,
    failedKeys: all.filter((r) => r.status !== "ok").length,
    durationMs: Date.now() - t0,
  };
}

/** Read-only: lấy status mới nhất của tất cả keys từ DB (không trigger test). */
export async function getKeyHealthList(provider?: Provider): Promise<KeyHealthRecord[]> {
  return db.apiKeyHealthCheck.findMany({
    where: provider ? { provider } : undefined,
    orderBy: [{ provider: "asc" }, { keyIndex: "asc" }],
  });
}

/** Status summary cho dashboard - count theo status. */
export async function getKeyHealthSummary(): Promise<{
  totalKeys: number;
  okKeys: number;
  failedKeys: number;
  rateLimited: number;
  invalid: number;
  errored: number;
  lastCheckAt: Date | null;
  staleness: "fresh" | "stale" | "never"; // fresh < 1h, stale > 1h, never = chưa check
}> {
  const all = await db.apiKeyHealthCheck.findMany();
  const lastCheckAt = all.length > 0
    ? all.reduce((max, r) => (r.testedAt > max ? r.testedAt : max), all[0].testedAt)
    : null;

  let staleness: "fresh" | "stale" | "never" = "never";
  if (lastCheckAt) {
    const ageMs = Date.now() - lastCheckAt.getTime();
    staleness = ageMs < 3600_000 ? "fresh" : "stale";
  }

  const okKeys = all.filter((r) => r.status === "ok").length;
  return {
    totalKeys: all.length,
    okKeys,
    failedKeys: all.length - okKeys,
    rateLimited: all.filter((r) => r.status === "rate_limited").length,
    invalid: all.filter((r) => r.status === "invalid").length,
    errored: all.filter((r) => ["network_error", "timeout", "unknown"].includes(r.status)).length,
    lastCheckAt,
    staleness,
  };
}
