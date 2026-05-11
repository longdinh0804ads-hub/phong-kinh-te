import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle, Clock, WifiOff, HelpCircle } from "lucide-react";
import { formatRelative } from "@/lib/utils";
import type { KeyHealthRecord } from "@/lib/api-key-health";

interface Props {
  records: KeyHealthRecord[];
  provider: "gemini" | "deepseek" | "anthropic";
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
    label: "Hết quota / Rate limit",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    icon: Clock,
  },
  invalid: {
    label: "Key sai / Bị revoke",
    color: "bg-red-100 text-red-800 border-red-200",
    icon: XCircle,
  },
  network_error: {
    label: "Lỗi kết nối",
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

export function KeyHealthTable({ records, provider }: Props) {
  if (records.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Chưa có key nào được cấu hình hoặc chưa health check lần đầu.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-2 pr-3">#</th>
            <th className="text-left py-2 pr-3">Key prefix</th>
            <th className="text-left py-2 pr-3">Trạng thái</th>
            <th className="text-right py-2 pr-3">Latency</th>
            <th className="text-left py-2 pr-3">Check lúc</th>
            <th className="text-left py-2">Lỗi</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.unknown;
            const Icon = cfg.icon;
            return (
              <tr key={r.id} className="border-b hover:bg-muted/30">
                <td className="py-2 pr-3 text-muted-foreground">{r.keyIndex + 1}</td>
                <td className="py-2 pr-3 font-mono">
                  {r.keyPrefix}
                  <span className="text-muted-foreground">••••</span>
                </td>
                <td className="py-2 pr-3">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium ${cfg.color}`}
                  >
                    <Icon className="h-3 w-3" />
                    {cfg.label}
                    {r.httpStatus ? ` (${r.httpStatus})` : ""}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right">
                  {r.latencyMs !== null ? `${r.latencyMs}ms` : "—"}
                </td>
                <td className="py-2 pr-3 text-muted-foreground">
                  {formatRelative(new Date(r.testedAt))}
                </td>
                <td className="py-2 text-red-700 max-w-xs truncate" title={r.errorMsg || ""}>
                  {r.errorMsg || ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
