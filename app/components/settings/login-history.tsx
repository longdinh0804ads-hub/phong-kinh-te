"use client";

import type { SecurityEvent } from "@prisma/client";
import { CheckCircle2, XCircle, AlertCircle, Shield } from "lucide-react";

interface Attempt {
  id: string;
  ipAddress: string;
  userAgent: string | null;
  success: boolean;
  failReason: string | null;
  createdAt: Date;
}

const FAIL_REASON_LABELS: Record<string, string> = {
  wrong_password: "Sai mật khẩu",
  user_not_found: "Email không tồn tại",
  locked: "Tài khoản bị khóa",
  inactive: "Tài khoản vô hiệu",
  "2fa_required": "Yêu cầu 2FA",
  "2fa_fail": "Mã 2FA sai",
  unknown_device: "Thiết bị không xác định",
  captcha_fail: "Captcha sai",
  captcha_required: "Yêu cầu captcha",
  password_expired: "Mật khẩu hết hạn",
};

const EVENT_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  NEW_DEVICE: { label: "Thiết bị mới", icon: AlertCircle, color: "text-amber-600" },
  NEW_LOCATION: { label: "Khu vực mới", icon: AlertCircle, color: "text-amber-600" },
  ACCOUNT_LOCKED: { label: "Tài khoản bị khóa", icon: Shield, color: "text-red-600" },
  PASSWORD_CHANGED: { label: "Đổi mật khẩu", icon: CheckCircle2, color: "text-emerald-600" },
  "2FA_ENABLED": { label: "Bật 2FA", icon: Shield, color: "text-emerald-600" },
  "2FA_DISABLED": { label: "Tắt 2FA", icon: Shield, color: "text-amber-600" },
  "2FA_BACKUP_USED": { label: "Dùng mã backup 2FA", icon: AlertCircle, color: "text-amber-600" },
  SESSION_REVOKED: { label: "Thu hồi phiên", icon: CheckCircle2, color: "text-muted-foreground" },
  SUSPICIOUS_LOGIN: { label: "Đăng nhập đáng ngờ", icon: AlertCircle, color: "text-red-600" },
  IMPOSSIBLE_TRAVEL: { label: "Di chuyển bất khả thi", icon: AlertCircle, color: "text-red-600" },
  LOGIN_OFFHOURS: { label: "Đăng nhập ngoài giờ", icon: AlertCircle, color: "text-amber-600" },
  DEVICE_TRUSTED: { label: "Đánh dấu tin cậy", icon: CheckCircle2, color: "text-emerald-600" },
};

export function LoginHistory({
  attempts,
  events,
}: {
  attempts: Attempt[];
  events: SecurityEvent[];
}) {
  if (attempts.length === 0 && events.length === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có hoạt động.</p>;
  }

  return (
    <div className="space-y-4">
      {events.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Sự kiện bảo mật</h4>
          <ul className="space-y-1">
            {events.slice(0, 10).map((ev) => {
              const meta = EVENT_LABELS[ev.eventType] || {
                label: ev.eventType,
                icon: AlertCircle,
                color: "text-muted-foreground",
              };
              const Icon = meta.icon;
              return (
                <li key={ev.id} className="flex items-start gap-2 text-sm">
                  <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${meta.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{meta.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(ev.createdAt).toLocaleString("vi-VN")}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {ev.description}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium mb-2">Lịch sử đăng nhập</h4>
        <ul className="space-y-1">
          {attempts.map((a) => (
            <li key={a.id} className="flex items-start gap-2 text-sm">
              {a.success ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={a.success ? "text-emerald-700" : "text-destructive"}>
                    {a.success ? "Thành công" : FAIL_REASON_LABELS[a.failReason || ""] || "Thất bại"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString("vi-VN")}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">IP: {a.ipAddress}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
