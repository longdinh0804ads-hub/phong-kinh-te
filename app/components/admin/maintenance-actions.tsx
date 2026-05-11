"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Play, RefreshCw, LogOut } from "lucide-react";
import { triggerRiskScan, clearCaches, forceLogoutAll } from "@/actions/admin";

interface Props {
  action: "trigger-scan" | "clear-cache" | "force-logout";
}

export function MaintenanceActions({ action }: Props) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  function handleAction() {
    if (action === "force-logout") {
      if (
        !confirm(
          "Force logout TẤT CẢ user (trừ bạn)? Toàn bộ session bị revoke, mọi người phải login lại."
        )
      )
        return;
    }
    setResult(null);
    startTransition(async () => {
      try {
        if (action === "trigger-scan") {
          const r = await triggerRiskScan();
          setResult({
            ok: true,
            text: `Scan xong ${r.result.durationMs}ms · ${r.result.notificationsCreated} notification mới · ${r.result.errors.length} lỗi`,
          });
        } else if (action === "clear-cache") {
          await clearCaches();
          setResult({ ok: true, text: "Đã xóa cache + reload rotators." });
        } else if (action === "force-logout") {
          const r = await forceLogoutAll();
          setResult({ ok: true, text: `Đã revoke ${r.count} sessions.` });
        }
      } catch (e: any) {
        setResult({ ok: false, text: e?.message || "Lỗi" });
      }
    });
  }

  const config = {
    "trigger-scan": { icon: Play, label: "Chạy scan ngay" },
    "clear-cache": { icon: RefreshCw, label: "Xóa cache" },
    "force-logout": { icon: LogOut, label: "Force logout all" },
  }[action];
  const Icon = config.icon;

  return (
    <div className="space-y-2">
      <Button
        onClick={handleAction}
        disabled={isPending}
        variant={action === "force-logout" ? "destructive" : "default"}
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        {config.label}
      </Button>
      {result && (
        <div
          className={`text-xs px-2 py-1.5 rounded flex items-start gap-2 ${
            result.ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          }`}
        >
          {!result.ok && <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
          <span>{result.text}</span>
        </div>
      )}
    </div>
  );
}
