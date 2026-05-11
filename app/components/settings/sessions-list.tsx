"use client";

import { useState } from "react";
import type { Session } from "@prisma/client";
import { revokeSessionAction } from "@/actions/security";
import { Button } from "@/components/ui/button";
import { Monitor, Loader2, LogOut } from "lucide-react";

export function SessionsList({ sessions }: { sessions: Session[] }) {
  const [busy, setBusy] = useState<string | null>(null);

  if (sessions.length === 0) {
    return <p className="text-sm text-muted-foreground">Không có session active.</p>;
  }

  async function handleRevoke(id: string) {
    if (!confirm("Đăng xuất phiên này?")) return;
    setBusy(id);
    await revokeSessionAction(id);
    setBusy(null);
    window.location.reload();
  }

  return (
    <ul className="space-y-2">
      {sessions.map((s) => {
        const isCurrent = s.lastActivityAt && Date.now() - new Date(s.lastActivityAt).getTime() < 60_000;
        return (
          <li
            key={s.id}
            className="flex items-center justify-between gap-3 p-3 border rounded-md hover:bg-muted/30"
          >
            <div className="flex items-start gap-3 min-w-0">
              <Monitor className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="font-medium text-sm flex items-center gap-2">
                  {s.deviceName || "Thiết bị không xác định"}
                  {isCurrent && (
                    <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                      Đang hoạt động
                    </span>
                  )}
                  {s.twoFactorVerified && (
                    <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                      2FA ✓
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 space-x-3">
                  <span>IP: {s.ipAddress || "-"}</span>
                  <span>Đăng nhập: {new Date(s.createdAt).toLocaleString("vi-VN")}</span>
                  <span>Hết hạn: {new Date(s.expiresAt).toLocaleString("vi-VN")}</span>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRevoke(s.id)}
              disabled={busy === s.id || isCurrent || false}
              className="text-destructive hover:text-destructive"
            >
              {busy === s.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              Đăng xuất
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
