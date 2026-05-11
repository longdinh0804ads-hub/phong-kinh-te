// Track usage của từng API key (số request + tokens) qua thời gian.
// Mỗi lần gọi LLM API ghi 1 record. Dùng cho admin UI thống kê.

import { db } from "./db";

export type Provider = "gemini" | "deepseek" | "anthropic";

export interface UsageRecordInput {
  provider: Provider;
  keyPrefix: string; // mask 10 ký tự đầu
  keyIndex?: number; // optional - tìm từ ApiKeyHealthCheck nếu không truyền
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  success: boolean;
  errorType?: "rate_limited" | "invalid" | "network" | "timeout" | "other";
  latencyMs?: number;
}

/**
 * Record 1 lần gọi LLM. Best-effort - không throw để không break flow chính.
 * Caller chỉ cần biết keyPrefix (mask). keyIndex được map từ ApiKeyHealthCheck.
 */
export async function recordUsage(input: UsageRecordInput): Promise<void> {
  try {
    let keyIndex = input.keyIndex;
    if (keyIndex === undefined) {
      const hc = await db.apiKeyHealthCheck.findFirst({
        where: { provider: input.provider, keyPrefix: input.keyPrefix },
        select: { keyIndex: true },
      });
      keyIndex = hc?.keyIndex ?? -1;
    }
    await db.apiKeyUsage.create({
      data: {
        provider: input.provider,
        keyIndex,
        keyPrefix: input.keyPrefix,
        model: input.model,
        promptTokens: input.promptTokens || 0,
        completionTokens: input.completionTokens || 0,
        totalTokens: input.totalTokens || 0,
        success: input.success,
        errorType: input.errorType,
        latencyMs: input.latencyMs,
      },
    });
  } catch (e: any) {
    console.error("[api-key-usage] record fail:", e?.message);
  }
}

export interface KeyStats {
  keyIndex: number;
  keyPrefix: string;
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  rateLimitedRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  avgLatencyMs: number | null;
  lastUsedAt: Date | null;
}

/**
 * Aggregate stats theo từng key (tách bởi keyIndex) cho 1 provider trong period.
 * periodHours: 24 (mặc định), 168 (7 ngày), 720 (30 ngày)
 */
export async function getProviderKeyStats(
  provider: Provider,
  periodHours: number = 24
): Promise<KeyStats[]> {
  const since = new Date(Date.now() - periodHours * 3600_000);
  const rows = await db.apiKeyUsage.findMany({
    where: {
      provider,
      createdAt: { gte: since },
    },
    select: {
      keyIndex: true,
      keyPrefix: true,
      promptTokens: true,
      completionTokens: true,
      totalTokens: true,
      success: true,
      errorType: true,
      latencyMs: true,
      createdAt: true,
    },
  });

  // Group by keyIndex
  const grouped = new Map<number, KeyStats>();
  for (const r of rows) {
    let s = grouped.get(r.keyIndex);
    if (!s) {
      s = {
        keyIndex: r.keyIndex,
        keyPrefix: r.keyPrefix,
        totalRequests: 0,
        successRequests: 0,
        failedRequests: 0,
        rateLimitedRequests: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
        avgLatencyMs: null,
        lastUsedAt: null,
      };
      grouped.set(r.keyIndex, s);
    }
    s.totalRequests++;
    if (r.success) s.successRequests++;
    else s.failedRequests++;
    if (r.errorType === "rate_limited") s.rateLimitedRequests++;
    s.totalPromptTokens += r.promptTokens;
    s.totalCompletionTokens += r.completionTokens;
    s.totalTokens += r.totalTokens;
    if (!s.lastUsedAt || r.createdAt > s.lastUsedAt) s.lastUsedAt = r.createdAt;
  }

  // Calculate avg latency
  const latByKey = new Map<number, number[]>();
  for (const r of rows) {
    if (r.latencyMs !== null) {
      let arr = latByKey.get(r.keyIndex);
      if (!arr) {
        arr = [];
        latByKey.set(r.keyIndex, arr);
      }
      arr.push(r.latencyMs);
    }
  }
  for (const [k, arr] of latByKey) {
    const s = grouped.get(k);
    if (s && arr.length > 0) {
      s.avgLatencyMs = Math.round(arr.reduce((x, y) => x + y, 0) / arr.length);
    }
  }

  return Array.from(grouped.values()).sort((a, b) => a.keyIndex - b.keyIndex);
}

/** Stats tổng cho 1 provider (gộp tất cả key) - period mặc định 24h */
export async function getProviderTotalStats(
  provider: Provider,
  periodHours: number = 24
): Promise<{
  totalRequests: number;
  successRequests: number;
  totalTokens: number;
  avgLatencyMs: number | null;
}> {
  const since = new Date(Date.now() - periodHours * 3600_000);
  const rows = await db.apiKeyUsage.findMany({
    where: { provider, createdAt: { gte: since } },
    select: {
      success: true,
      totalTokens: true,
      latencyMs: true,
    },
  });
  const total = rows.length;
  const succ = rows.filter((r) => r.success).length;
  const totalTokens = rows.reduce((s, r) => s + r.totalTokens, 0);
  const latencies = rows.filter((r) => r.latencyMs !== null).map((r) => r.latencyMs!);
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((x, y) => x + y, 0) / latencies.length) : null;
  return {
    totalRequests: total,
    successRequests: succ,
    totalTokens,
    avgLatencyMs: avgLatency,
  };
}

/** Auto-cleanup records cũ hơn 30 ngày. Gọi từ cron hoặc maintenance action. */
export async function cleanupOldUsage(daysOld: number = 30): Promise<number> {
  const cutoff = new Date(Date.now() - daysOld * 86400_000);
  const r = await db.apiKeyUsage.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return r.count;
}
