// Admin Dashboard - Health overview
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Database,
  Cpu,
  Mail,
  Clock,
  Users,
  AlertCircle,
} from "lucide-react";
import { getSettings } from "@/lib/system-settings";
import {
  getGeminiRotatorAsync,
  getDeepSeekRotatorAsync,
  getAnthropicRotatorAsync,
} from "@/lib/api-key-rotator";
import { getKeyHealthSummary } from "@/lib/api-key-health";
import { formatRelative } from "@/lib/utils";

export default async function AdminDashboardPage() {
  // Check DB health
  let dbOk = true;
  let dbLatency = 0;
  try {
    const t = Date.now();
    await db.$queryRawUnsafe(`SELECT 1`);
    dbLatency = Date.now() - t;
  } catch (e: any) {
    dbOk = false;
  }

  // Check AI provider status từ rotator + health summary từ DB
  const [gemini, deepseek, anthropic, keyHealth] = await Promise.all([
    getGeminiRotatorAsync(),
    getDeepSeekRotatorAsync(),
    getAnthropicRotatorAsync(),
    getKeyHealthSummary(),
  ]);
  const aiStatus = {
    gemini: gemini.status(),
    deepseek: deepseek.status(),
    anthropic: anthropic.status(),
  };

  // SMTP configured?
  const smtp = await getSettings(["SMTP_HOST", "SMTP_USER", "SMTP_PASS"]);
  const smtpConfigured = !!(smtp.SMTP_HOST && smtp.SMTP_USER && smtp.SMTP_PASS);

  // Last cron run (risk-scan từ AIAuditLog)
  const lastScan = await db.aIAuditLog.findFirst({
    where: { action: "monitor:risk-scan" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, success: true, duration: true, errorMsg: true },
  });

  // Stats
  const [userCount, activeUserCount, errorCount24h] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { isActive: true } }),
    db.aIAuditLog.count({
      where: {
        success: false,
        createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
      },
    }),
  ]);

  // Recent admin actions
  const recentAdminActions = await db.adminAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { admin: { select: { name: true } } },
  });

  // Recent errors (AIAuditLog)
  const recentErrors = await db.aIAuditLog.findMany({
    where: { success: false, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { user: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tổng quan hệ thống</h1>
        <p className="text-sm text-muted-foreground">Health check + lỗi 24h gần nhất</p>
      </div>

      {/* API Key Health Banner - prominent nếu có vấn đề */}
      {keyHealth.totalKeys > 0 && (
        <div
          className={`rounded-lg border px-4 py-3 flex items-center justify-between gap-3 ${
            keyHealth.failedKeys === 0
              ? "bg-green-50 border-green-200 text-green-900"
              : keyHealth.invalid > 0
              ? "bg-red-50 border-red-200 text-red-900"
              : "bg-amber-50 border-amber-200 text-amber-900"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="text-2xl shrink-0">
              {keyHealth.failedKeys === 0 ? "✅" : keyHealth.invalid > 0 ? "🚨" : "⚠️"}
            </div>
            <div>
              <div className="font-semibold text-sm">
                {keyHealth.failedKeys === 0
                  ? `Tất cả ${keyHealth.totalKeys} API keys hoạt động bình thường`
                  : `${keyHealth.okKeys}/${keyHealth.totalKeys} keys OK · ${keyHealth.failedKeys} keys có vấn đề`}
              </div>
              <div className="text-xs mt-0.5">
                {keyHealth.invalid > 0 && `${keyHealth.invalid} key invalid · `}
                {keyHealth.rateLimited > 0 && `${keyHealth.rateLimited} hết quota · `}
                {keyHealth.errored > 0 && `${keyHealth.errored} lỗi mạng · `}
                {keyHealth.lastCheckAt
                  ? `Check lần cuối ${formatRelative(keyHealth.lastCheckAt)}`
                  : "Chưa health check"}
                {keyHealth.staleness === "stale" && " (đã cũ - nên check lại)"}
              </div>
            </div>
          </div>
          <a
            href="/admin/api-keys"
            className="text-xs font-semibold underline shrink-0 hover:no-underline"
          >
            Xem chi tiết →
          </a>
        </div>
      )}

      {/* Health cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <HealthCard
          label="Database"
          icon={Database}
          status={dbOk ? "ok" : "error"}
          detail={dbOk ? `${dbLatency}ms` : "Lỗi kết nối"}
        />
        <HealthCard
          label="Gemini AI"
          icon={Cpu}
          status={aiStatus.gemini.availableKeys > 0 ? "ok" : "error"}
          detail={`${aiStatus.gemini.availableKeys}/${aiStatus.gemini.totalKeys} keys`}
        />
        <HealthCard
          label="DeepSeek AI"
          icon={Cpu}
          status={
            aiStatus.deepseek.availableKeys > 0
              ? "ok"
              : aiStatus.deepseek.totalKeys > 0
              ? "warn"
              : "off"
          }
          detail={`${aiStatus.deepseek.availableKeys}/${aiStatus.deepseek.totalKeys} keys`}
        />
        <HealthCard
          label="SMTP Email"
          icon={Mail}
          status={smtpConfigured ? "ok" : "off"}
          detail={smtpConfigured ? "Đã cấu hình" : "Chưa cấu hình"}
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Tổng tài khoản"
          value={userCount}
          icon={Users}
          subtitle={`${activeUserCount} đang hoạt động`}
        />
        <StatCard
          label="Lỗi 24h gần nhất"
          value={errorCount24h}
          icon={AlertCircle}
          subtitle={errorCount24h === 0 ? "Hệ thống ổn định" : "Cần kiểm tra"}
          highlight={errorCount24h > 0}
        />
        <StatCard
          label="Lần scan cuối"
          value={lastScan ? formatRelative(lastScan.createdAt) : "Chưa chạy"}
          icon={Clock}
          subtitle={
            lastScan
              ? lastScan.success
                ? `OK (${lastScan.duration}ms)`
                : "Lỗi"
              : "—"
          }
        />
        <StatCard
          label="API key Gemini"
          value={`${aiStatus.gemini.availableKeys}/${aiStatus.gemini.totalKeys}`}
          icon={Cpu}
          subtitle="khả dụng / tổng"
        />
      </div>

      {/* Recent errors */}
      {recentErrors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-4 w-4" />
              Lỗi gần nhất ({recentErrors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentErrors.map((e) => (
                <div
                  key={e.id}
                  className="text-xs border-l-2 border-red-400 pl-3 py-1"
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{e.user?.name || "—"}</span>
                    <span className="text-muted-foreground">
                      {formatRelative(e.createdAt)}
                    </span>
                  </div>
                  <div className="text-muted-foreground">{e.action}</div>
                  {e.errorMsg && (
                    <div className="text-red-700 mt-0.5">{e.errorMsg}</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent admin actions */}
      {recentAdminActions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hành động quản trị gần nhất</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {recentAdminActions.map((a) => (
                <div key={a.id} className="text-xs flex gap-2 justify-between">
                  <span>
                    <span className="font-medium">{a.admin?.name}</span>
                    <span className="text-muted-foreground"> · {a.action}</span>
                    {a.target && (
                      <span className="text-muted-foreground"> → {a.target}</span>
                    )}
                  </span>
                  <span className="text-muted-foreground">{formatRelative(a.createdAt)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function HealthCard({
  label,
  icon: Icon,
  status,
  detail,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  status: "ok" | "warn" | "error" | "off";
  detail: string;
}) {
  const colors = {
    ok: { bg: "bg-green-50 border-green-200", iconColor: "text-green-600", badge: "success" as const },
    warn: { bg: "bg-amber-50 border-amber-200", iconColor: "text-amber-600", badge: "warning" as const },
    error: { bg: "bg-red-50 border-red-200", iconColor: "text-red-600", badge: "destructive" as const },
    off: { bg: "bg-slate-50 border-slate-200", iconColor: "text-slate-400", badge: "secondary" as const },
  };
  const c = colors[status];
  const StatusIcon =
    status === "ok" ? CheckCircle2 : status === "error" ? XCircle : AlertTriangle;
  return (
    <Card className={c.bg}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={`h-4 w-4 ${c.iconColor}`} />
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <StatusIcon className={`h-4 w-4 ml-auto ${c.iconColor}`} />
        </div>
        <div className="text-sm font-semibold">{detail}</div>
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  subtitle,
  highlight,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  subtitle: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-amber-300 bg-amber-50/60" : ""}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
        </div>
        <div className="text-xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
      </CardContent>
    </Card>
  );
}
