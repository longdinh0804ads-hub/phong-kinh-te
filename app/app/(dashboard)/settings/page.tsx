import { requireAuth } from "@/lib/session";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChangePasswordForm } from "@/components/settings/change-password-form";

export default async function SettingsPage() {
  const user = await requireAuth();

  return (
    <div className="max-w-2xl">
      <PageHeader title="Cài đặt" description="Quản lý tài khoản và thông tin cá nhân" />

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
