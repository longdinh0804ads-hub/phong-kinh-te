"use client";

import { useState } from "react";
import type { TrustedDevice } from "@prisma/client";
import { revokeDeviceAction, trustDeviceAction } from "@/actions/security";
import { Button } from "@/components/ui/button";
import { Smartphone, MapPin, ShieldCheck, ShieldOff, Loader2, Trash2, CheckCircle2 } from "lucide-react";

export function DevicesList({ devices }: { devices: TrustedDevice[] }) {
  const [busy, setBusy] = useState<string | null>(null);

  if (devices.length === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có thiết bị nào.</p>;
  }

  async function handleRevoke(deviceId: string) {
    if (!confirm("Thu hồi thiết bị này? Phiên đăng nhập từ thiết bị này sẽ bị đóng.")) return;
    setBusy(deviceId);
    await revokeDeviceAction(deviceId);
    setBusy(null);
    window.location.reload();
  }

  async function handleTrust(deviceId: string) {
    setBusy(deviceId);
    await trustDeviceAction(deviceId);
    setBusy(null);
    window.location.reload();
  }

  return (
    <ul className="space-y-2">
      {devices.map((d) => (
        <li
          key={d.id}
          className="flex items-center justify-between gap-3 p-3 border rounded-md hover:bg-muted/30"
        >
          <div className="flex items-start gap-3 min-w-0">
            <Smartphone className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                {d.deviceName}
                {d.trusted ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    <ShieldCheck className="h-3 w-3" /> Tin cậy
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                    <ShieldOff className="h-3 w-3" /> Chưa xác nhận
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                <span>
                  <MapPin className="h-3 w-3 inline" /> {d.ipAddress}
                  {d.geoCity ? ` · ${d.geoCity}` : ""}
                </span>
                <span>
                  Lần cuối: {new Date(d.lastSeenAt).toLocaleString("vi-VN")}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            {!d.trusted && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleTrust(d.deviceId)}
                disabled={busy === d.deviceId}
              >
                {busy === d.deviceId ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Tin cậy
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRevoke(d.deviceId)}
              disabled={busy === d.deviceId}
              className="text-destructive hover:text-destructive"
            >
              {busy === d.deviceId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Thu hồi
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
