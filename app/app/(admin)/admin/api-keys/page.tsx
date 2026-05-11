import { db } from "@/lib/db";
import { getSetting, maskSecretValue } from "@/lib/system-settings";
import { getKeyHealthList } from "@/lib/api-key-health";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ApiKeyForm } from "@/components/admin/api-key-form";
import { KeyHealthTable } from "@/components/admin/key-health-table";
import { HealthCheckButton } from "@/components/admin/health-check-button";
import { formatRelative } from "@/lib/utils";

export default async function ApiKeysPage() {
  const [geminiKeys, deepseekKey, anthropicKey, allHealth] = await Promise.all([
    getSetting("GEMINI_API_KEYS"),
    getSetting("DEEPSEEK_API_KEY"),
    getSetting("ANTHROPIC_API_KEY"),
    getKeyHealthList(),
  ]);

  // Tìm record settings để biết source
  const dbSettings = await db.systemSetting.findMany({
    where: { key: { in: ["GEMINI_API_KEYS", "DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY"] } },
    select: { key: true, updatedAt: true, updatedBy: { select: { name: true } } },
  });
  const dbMap = new Map(dbSettings.map((s) => [s.key, s]));

  // Group health records by provider
  const geminiHealth = allHealth.filter((r) => r.provider === "gemini");
  const deepseekHealth = allHealth.filter((r) => r.provider === "deepseek");
  const anthropicHealth = allHealth.filter((r) => r.provider === "anthropic");

  // Last check time across all
  const lastCheck = allHealth.length > 0
    ? allHealth.reduce((m, r) => (r.testedAt > m ? r.testedAt : m), allHealth[0].testedAt)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Quản lý API Keys</h1>
          <p className="text-sm text-muted-foreground">
            Update key có hiệu lực ngay (rotator auto-reload). Health check tự chạy mỗi ngày cùng cron + có thể trigger thủ công.
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
        description="Multi-key (phân cách bằng dấu phẩy) cho round-robin rotation. Lấy từ https://aistudio.google.com/apikey"
        currentValue={geminiKeys}
        dbRecord={dbMap.get("GEMINI_API_KEYS")}
        healthRecords={geminiHealth}
      />

      <ProviderCard
        title="DeepSeek"
        keyName="DEEPSEEK_API_KEY"
        provider="deepseek"
        description="Single key. Fallback khi Gemini quota hết. Lấy từ https://platform.deepseek.com/api_keys"
        currentValue={deepseekKey}
        dbRecord={dbMap.get("DEEPSEEK_API_KEY")}
        healthRecords={deepseekHealth}
      />

      <ProviderCard
        title="Anthropic (Claude)"
        keyName="ANTHROPIC_API_KEY"
        provider="anthropic"
        description="Optional. Dùng cho high-quality task. Lấy từ https://console.anthropic.com"
        currentValue={anthropicKey}
        dbRecord={dbMap.get("ANTHROPIC_API_KEY")}
        healthRecords={anthropicHealth}
      />
    </div>
  );
}

function ProviderCard({
  title,
  keyName,
  provider,
  description,
  currentValue,
  dbRecord,
  healthRecords,
}: {
  title: string;
  keyName: "GEMINI_API_KEYS" | "DEEPSEEK_API_KEY" | "ANTHROPIC_API_KEY";
  provider: "gemini" | "deepseek" | "anthropic";
  description: string;
  currentValue: string | null;
  dbRecord?: { key: string; updatedAt: Date; updatedBy: { name: string } | null };
  healthRecords: any[];
}) {
  const isFromDb = !!dbRecord;
  const isFromEnv = !isFromDb && !!currentValue;
  const masked = currentValue ? maskSecretValue(currentValue.split(",")[0]) : null;

  // Status summary
  const okCount = healthRecords.filter((r) => r.status === "ok").length;
  const totalCount = healthRecords.length;
  const hasIssue = totalCount > 0 && okCount < totalCount;

  return (
    <Card className={hasIssue ? "border-amber-300" : ""}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
          {totalCount > 0 && (
            <div
              className={`text-xs px-2 py-1 rounded font-medium shrink-0 ${
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
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Source info */}
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

        {/* Health table */}
        {totalCount > 0 && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2">
              Trạng thái từng key:
            </div>
            <KeyHealthTable records={healthRecords} provider={provider} />
          </div>
        )}

        {/* Update form */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2">Update key mới:</div>
          <ApiKeyForm keyName={keyName} provider={provider} />
        </div>
      </CardContent>
    </Card>
  );
}
