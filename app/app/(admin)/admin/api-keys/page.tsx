import { db } from "@/lib/db";
import { getSetting, maskSecretValue } from "@/lib/system-settings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ApiKeyForm } from "@/components/admin/api-key-form";

export default async function ApiKeysPage() {
  // Lấy current values (decrypted) để hiển thị mask
  const [geminiKeys, deepseekKey, anthropicKey] = await Promise.all([
    getSetting("GEMINI_API_KEYS"),
    getSetting("DEEPSEEK_API_KEY"),
    getSetting("ANTHROPIC_API_KEY"),
  ]);

  // Tìm record để biết source (DB vs env)
  const dbSettings = await db.systemSetting.findMany({
    where: { key: { in: ["GEMINI_API_KEYS", "DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY"] } },
    select: { key: true, updatedAt: true, updatedBy: { select: { name: true } } },
  });
  const dbMap = new Map(dbSettings.map((s) => [s.key, s]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Quản lý API Keys</h1>
        <p className="text-sm text-muted-foreground">
          Update key có hiệu lực ngay sau 5 phút (cache TTL) hoặc bấm{" "}
          <span className="font-medium">Xóa cache</span> để force reload. Key được mã hóa AES-256-GCM trong DB.
        </p>
      </div>

      <ProviderCard
        title="Gemini (Google AI)"
        keyName="GEMINI_API_KEYS"
        provider="gemini"
        description="Multi-key (phân cách bằng dấu phẩy) cho round-robin rotation. Lấy từ https://aistudio.google.com/apikey"
        currentValue={geminiKeys}
        dbRecord={dbMap.get("GEMINI_API_KEYS")}
      />

      <ProviderCard
        title="DeepSeek"
        keyName="DEEPSEEK_API_KEY"
        provider="deepseek"
        description="Single key. Fallback khi Gemini quota hết. Lấy từ https://platform.deepseek.com/api_keys"
        currentValue={deepseekKey}
        dbRecord={dbMap.get("DEEPSEEK_API_KEY")}
      />

      <ProviderCard
        title="Anthropic (Claude)"
        keyName="ANTHROPIC_API_KEY"
        provider="anthropic"
        description="Optional. Dùng cho high-quality task. Lấy từ https://console.anthropic.com"
        currentValue={anthropicKey}
        dbRecord={dbMap.get("ANTHROPIC_API_KEY")}
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
}: {
  title: string;
  keyName: "GEMINI_API_KEYS" | "DEEPSEEK_API_KEY" | "ANTHROPIC_API_KEY";
  provider: "gemini" | "deepseek" | "anthropic";
  description: string;
  currentValue: string | null;
  dbRecord?: { key: string; updatedAt: Date; updatedBy: { name: string } | null };
}) {
  const isFromDb = !!dbRecord;
  const isFromEnv = !isFromDb && !!currentValue;
  const masked = currentValue ? maskSecretValue(currentValue.split(",")[0]) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs">
          <div className="text-muted-foreground">Trạng thái hiện tại:</div>
          {currentValue ? (
            <div className="mt-1">
              <span className="font-mono">{masked}</span>
              <span className="ml-2 text-muted-foreground">
                ({isFromDb ? `Từ DB · ${dbRecord!.updatedBy?.name} · ${new Date(dbRecord!.updatedAt).toLocaleString("vi-VN")}` : isFromEnv ? "Từ Vercel env vars" : ""})
              </span>
            </div>
          ) : (
            <div className="mt-1 text-amber-600">Chưa cấu hình</div>
          )}
        </div>
        <ApiKeyForm keyName={keyName} provider={provider} />
      </CardContent>
    </Card>
  );
}
