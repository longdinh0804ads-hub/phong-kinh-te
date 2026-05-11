import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { Shield, ChevronRight } from "lucide-react";
import { require2FA } from "@/lib/permissions";

export default async function SettingsPage() {
  const user = await requireAuth();
  const requires2FA = require2FA(user.role);
  const needs2FA = requires2FA && !user.twoFactorEnabled;

  return (
    <div className="max-w-2xl space-y-4">
      <PageHeader title="Cài đặt" description="Quản lý tài khoản và thông tin cá nhân" />

      <Link href="/settings/security">
        <Card className={`hover:shadow-md transition-shadow cursor-pointer ${needs2FA ? "border-amber-300 bg-amber-50/40" : ""}`}>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Shield className={`h-5 w-5 mt-0.5 ${needs2FA ? "text-amber-600" : "text-primary"}`} />
              <div>
                <div className="font-medium">Bảo mật tài khoản</div>
                <div className="text-sm text-muted-foreground">
                  {user.twoFactorEnabled
                    ? "2FA đang bật • Quản lý thiết bị, phiên đăng nhập, lịch sử"
                    : needs2FA
                    ? "⚠ Cần bật 2FA bắt buộc"
                    : "Bật 2FA • Quản lý thiết bị, phiên đăng nhập, lịch sử"}
                </div>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Đổi mật khẩu</CardTitle>
          <CardDescription>Cập nhật mật khẩu mới để tăng cường bảo mật</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
