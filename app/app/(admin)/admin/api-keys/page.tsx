import { db } from "@/lib/db";
import { getSetting, maskSecretValue } from "@/lib/system-settings";
import { getKeyHealthList } from "@/lib/api-key-health";
import { getProviderKeyStats, getProviderTotalStats } from "@/lib/api-key-usage";
import { AI_MODELS } from "@/lib/ai";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ApiKeyForm } from "@/components/admin/api-key-form";
import { KeyHealthTable } from "@/components/admin/key-health-table";
import { HealthCheckButton } from "@/components/admin/health-check-button";
import { formatRelative } from "@/lib/utils";

export default async function ApiKeysPage() {
  const [
    geminiKeys,
    deepseekKey,
    anthropicKey,
    allHealth,
    geminiStats,
    deepseekStats,
    anthropicStats,
    geminiTotal,
    deepseekTotal,
    anthropicTotal,
  ] = await Promise.all([
    getSetting("GEMINI_API_KEYS"),
    getSetting("DEEPSEEK_API_KEY"),
    getSetting("ANTHROPIC_API_KEY"),
    getKeyHealthList(),
    getProviderKeyStats("gemini", 24),
    getProviderKeyStats("deepseek", 24),
    getProviderKeyStats("anthropic", 24),
    getProviderTotalStats("gemini", 24),
    getProviderTotalStats("deepseek", 24),
    getProviderTotalStats("anthropic", 24),
  ]);

  const dbSettings = await db.systemSetting.findMany({
    where: { key: { in: ["GEMINI_API_KEYS", "DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY"] } },
    select: { key: true, updatedAt: true, updatedBy: { select: { name: true } } },
  });
  const dbMap = new Map(dbSettings.map((s) => [s.key, s]));

  const geminiHealth = allHealth.filter((r) => r.provider === "gemini");
  const deepseekHealth = allHealth.filter((r) => r.provider === "deepseek");
  const anthropicHealth = allHealth.filter((r) => r.provider === "anthropic");

  const lastCheck =
    allHealth.length > 0
      ? allHealth.reduce((m, r) => (r.testedAt > m ? r.testedAt : m), allHealth[0].testedAt)
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Quản lý API Keys</h1>
          <p className="text-sm text-muted-foreground">
            Update key có hiệu lực ngay (rotator auto-reload). Health check tự chạy mỗi ngày + thống kê usage 24h.
          </p>
          {lastCheck && (
            <p className="text-xs text-muted-foreground mt-1">
              Health check lần cuối: {formatRelative(new Date(lastCheck))}
            </p>
          )}
        </div>
        <HealthCheckButton />
      </div>

      <ProviderCard
        title="Gemini (Google AI)"
        keyName="GEMINI_API_KEYS"
        provider="gemini"
        model={AI_MODELS.gemini.model}
        rateLimit="Free tier: 10 RPM / 250 RPD (Gemini 2.5 Flash)"
        description="Multi-key (phân cách dấu phẩy) cho round-robin rotation. Lấy từ https://aistudio.google.com/apikey"
        currentValue={geminiKeys}
        dbRecord={dbMap.get("GEMINI_API_KEYS")}
        healthRecords={geminiHealth}
        stats={geminiStats}
        total={geminiTotal}
      />

      <ProviderCard
        title="DeepSeek"
        keyName="DEEPSEEK_API_KEY"
        provider="deepseek"
        model={AI_MODELS.deepseek.model}
        rateLimit="Pay-as-you-go (không có rate limit nghiêm)"
        description="Single key. Fallback khi Gemini quota hết. Lấy từ https://platform.deepseek.com/api_keys"
        currentValue={deepseekKey}
        dbRecord={dbMap.get("DEEPSEEK_API_KEY")}
        healthRecords={deepseekHealth}
        stats={deepseekStats}
        total={deepseekTotal}
      />

      <ProviderCard
        title="Anthropic (Claude)"
        keyName="ANTHROPIC_API_KEY"
        provider="anthropic"
        model={AI_MODELS.anthropic.model}
        rateLimit="Tier-based (50-4000 RPM tùy tier)"
        description="Optional. Dùng cho high-quality task. Lấy từ https://console.anthropic.com"
        currentValue={anthropicKey}
        dbRecord={dbMap.get("ANTHROPIC_API_KEY")}
        healthRecords={anthropicHealth}
        stats={anthropicStats}
        total={anthropicTotal}
      />
    </div>
  );
}

function ProviderCard({
  title,
  keyName,
  provider,
  model,
  rateLimit,
  description,
  currentValue,
  dbRecord,
  healthRecords,
  stats,
  total,
}: any) {
  const isFromDb = !!dbRecord;
  const isFromEnv = !isFromDb && !!currentValue;
  const masked = currentValue ? maskSecretValue(currentValue.split(",")[0]) : null;

  const okCount = healthRecords.filter((r: any) => r.status === "ok").length;
  const totalCount = healthRecords.length;
  const hasIssue = totalCount > 0 && okCount < totalCount;

  function formatTokens(n: number): string {
    if (n === 0) return "0";
    if (n < 1000) return n.toString();
    if (n < 1_000_000) return (n / 1000).toFixed(1) + "K";
    return (n / 1_000_000).toFixed(2) + "M";
  }

  return (
    <Card className={hasIssue ? "border-amber-300" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="mt-1">
              Model: <span className="font-mono">{model}</span>
              <br />
              {description}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {totalCount > 0 && (
              <div
                className={`text-xs px-2 py-1 rounded font-medium ${
                  okCount === totalCount
                    ? "bg-green-100 text-green-800"
                    : okCount === 0
                    ? "bg-red-100 text-red-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {okCount}/{totalCount} OK
              </div>
            )}
            {total.totalRequests > 0 && (
              <div className="text-[11px] text-muted-foreground text-right">
                <div>{total.totalRequests} requests 24h</div>
                <div>{formatTokens(total.totalTokens)} tokens</div>
                {total.avgLatencyMs && <div>avg {total.avgLatencyMs}ms</div>}
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs">
          <div className="text-muted-foreground">Trạng thái cấu hình:</div>
          {currentValue ? (
            <div className="mt-1">
              <span className="font-mono">{masked}</span>
              <span className="ml-2 text-muted-foreground">
                ({isFromDb
                  ? `Từ DB · ${dbRecord!.updatedBy?.name} · ${new Date(dbRecord!.updatedAt).toLocaleString("vi-VN")}`
                  : isFromEnv
                  ? "Từ Vercel env vars (chưa override qua DB)"
                  : ""})
              </span>
            </div>
          ) : (
            <div className="mt-1 text-amber-600">Chưa cấu hình</div>
          )}
        </div>

        {totalCount > 0 && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2">
              Trạng thái + usage 24h từng key:
            </div>
            <KeyHealthTable
              records={healthRecords}
              stats={stats}
              model={model}
              rateLimit={rateLimit}
            />
          </div>
        )}

        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2">Update key mới:</div>
          <ApiKeyForm keyName={keyName} provider={provider} />
        </div>
      </CardContent>
    </Card>
  );
}
