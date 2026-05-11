import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { TwoFactorSection } from "@/components/settings/two-factor-section";
import { DevicesList } from "@/components/settings/devices-list";
import { SessionsList } from "@/components/settings/sessions-list";
import { LoginHistory } from "@/components/settings/login-history";
import { require2FA } from "@/lib/permissions";
import { ShieldAlert } from "lucide-react";

export default async function SecuritySettingsPage() {
  const user = await requireAuth();

  // Load tất cả data security của user
  const [devices, sessions, recentLogins, recentEvents] = await Promise.all([
    db.trustedDevice.findMany({
      where: { userId: user.id },
      orderBy: { lastSeenAt: "desc" },
      take: 20,
    }),
    db.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
    db.loginAttempt.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        success: true,
        failReason: true,
        createdAt: true,
      },
    }),
    db.securityEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const requires2FA = require2FA(user.role);

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Bảo mật tài khoản"
        description="Quản lý xác thực, thiết bị và phiên đăng nhập"
      />

      {requires2FA && !user.twoFactorEnabled && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-medium text-amber-900">Bắt buộc bật 2FA</div>
            <div className="text-amber-700 mt-0.5">
              Vai trò của bạn bắt buộc xác thực 2 yếu tố. Vui lòng bật ngay dưới đây để tiếp tục
              truy cập đầy đủ chức năng.
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Đổi mật khẩu</CardTitle>
          <CardDescription>Cập nhật mật khẩu mới + chống reuse 5 mật khẩu cũ</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Xác thực 2 yếu tố (TOTP)</CardTitle>
          <CardDescription>
            {user.twoFactorEnabled
              ? "Đã bật. Mỗi lần đăng nhập sẽ cần nhập mã 6 chữ số."
              : "Chưa bật. Bật để tăng cường bảo mật."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TwoFactorSection
            enabled={user.twoFactorEnabled}
            required={requires2FA}
            backupCodeCount={user.twoFactorBackupCodes.length}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thiết bị đã đăng nhập</CardTitle>
          <CardDescription>
            Danh sách thiết bị từng đăng nhập. Bạn có thể thu hồi thiết bị không nhận biết.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DevicesList devices={devices} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Phiên đăng nhập đang hoạt động</CardTitle>
          <CardDescription>
            Hết hạn sau 8 giờ hoặc 30 phút không hoạt động. Đăng xuất từ xa nếu cần.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SessionsList sessions={sessions} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lịch sử đăng nhập</CardTitle>
          <CardDescription>30 lần đăng nhập gần nhất (thành công + thất bại)</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginHistory attempts={recentLogins} events={recentEvents} />
        </CardContent>
      </Card>
    </div>
  );
}
