import { CheckCircle2, XCircle, Clock, WifiOff, HelpCircle } from "lucide-react";
import { formatRelative } from "@/lib/utils";
import type { KeyHealthRecord } from "@/lib/api-key-health";
import type { KeyStats } from "@/lib/api-key-usage";

interface Props {
  records: KeyHealthRecord[];
  stats: KeyStats[];
  model: string;
  /** API quota / rate limit nếu có (vd "60 RPM" cho Gemini free) */
  rateLimit?: string;
}

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    color: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  ok: {
    label: "Hoạt động",
    color: "bg-green-100 text-green-800 border-green-200",
    icon: CheckCircle2,
  },
  rate_limited: {
    label: "Hết quota",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    icon: Clock,
  },
  invalid: {
    label: "Key sai",
    color: "bg-red-100 text-red-800 border-red-200",
    icon: XCircle,
  },
  network_error: {
    label: "Lỗi mạng",
    color: "bg-orange-100 text-orange-800 border-orange-200",
    icon: WifiOff,
  },
  timeout: {
    label: "Timeout",
    color: "bg-orange-100 text-orange-800 border-orange-200",
    icon: Clock,
  },
  unknown: {
    label: "Không xác định",
    color: "bg-slate-100 text-slate-700 border-slate-200",
    icon: HelpCircle,
  },
};

function formatTokens(n: number): string {
  if (n === 0) return "0";
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0) + "K";
  return (n / 1_000_000).toFixed(1) + "M";
}

export function KeyHealthTable({ records, stats, model, rateLimit }: Props) {
  if (records.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Chưa có key nào được cấu hình hoặc chưa health check lần đầu.
      </p>
    );
  }

  // Map stats by keyIndex
  const statsByIndex = new Map(stats.map((s) => [s.keyIndex, s]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-2 pr-3">#</th>
            <th className="text-left py-2 pr-3">Key</th>
            <th className="text-left py-2 pr-3">Model</th>
            <th className="text-left py-2 pr-3">Trạng thái</th>
            <th className="text-right py-2 pr-3" title="Tổng số request 24h gần nhất">
              Requests 24h
            </th>
            <th className="text-right py-2 pr-3" title="Tổng tokens 24h gần nhất">
              Tokens 24h
            </th>
            <th className="text-right py-2 pr-3" title="Số lần bị rate-limit 24h">
              Limit hits
            </th>
            <th className="text-left py-2 pr-3">Check / Used</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.unknown;
            const Icon = cfg.icon;
            const s = statsByIndex.get(r.keyIndex);

            return (
              <tr key={r.id} className="border-b hover:bg-muted/30">
                <td className="py-2 pr-3 text-muted-foreground">{r.keyIndex + 1}</td>
                <td className="py-2 pr-3 font-mono">
                  {r.keyPrefix}
                  <span className="text-muted-foreground">••••</span>
                </td>
                <td className="py-2 pr-3 font-mono text-[10px] text-muted-foreground">
                  {model}
                </td>
                <td className="py-2 pr-3">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium ${cfg.color}`}
                  >
                    <Icon className="h-3 w-3" />
                    {cfg.label}
                    {r.httpStatus ? ` (${r.httpStatus})` : ""}
                  </span>
                  {r.errorMsg && (
                    <div
                      className="text-red-600 mt-0.5 max-w-[200px] truncate text-[10px]"
                      title={r.errorMsg}
                    >
                      {r.errorMsg}
                    </div>
                  )}
                </td>
                <td className="py-2 pr-3 text-right">
                  {s ? (
                    <span>
                      <span className="font-semibold">{s.totalRequests}</span>
                      {s.failedRequests > 0 && (
                        <span className="text-red-600 ml-1">
                          ({s.failedRequests} lỗi)
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right">
                  {s && s.totalTokens > 0 ? (
                    <span title={`prompt: ${s.totalPromptTokens} · completion: ${s.totalCompletionTokens}`}>
                      <span className="font-semibold">{formatTokens(s.totalTokens)}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right">
                  {s && s.rateLimitedRequests > 0 ? (
                    <span className="text-amber-700 font-semibold" title={`Bị rate-limit ${s.rateLimitedRequests} lần`}>
                      {s.rateLimitedRequests}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-muted-foreground text-[11px]">
                  <div title={`Health check: ${new Date(r.testedAt).toLocaleString("vi-VN")}`}>
                    Check: {formatRelative(new Date(r.testedAt))}
                  </div>
                  {s?.lastUsedAt && (
                    <div title={`Lần dùng cuối: ${new Date(s.lastUsedAt).toLocaleString("vi-VN")}`}>
                      Dùng: {formatRelative(new Date(s.lastUsedAt))}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rateLimit && (
        <p className="text-[11px] text-muted-foreground mt-2 italic">
          Provider limit: {rateLimit}
        </p>
      )}
    </div>
  );
}
