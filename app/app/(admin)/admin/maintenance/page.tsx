import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MaintenanceActions } from "@/components/admin/maintenance-actions";

export default function MaintenancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bảo trì hệ thống</h1>
        <p className="text-sm text-muted-foreground">
          Các thao tác bảo trì khẩn cấp. Mọi hành động đều ghi log audit.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Risk Scanner (Cron)</CardTitle>
          <CardDescription>
            Cron tự chạy 00:00 mỗi ngày. Bấm nút để trigger thủ công ngay (vd: sau khi sửa data và muốn re-scan).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MaintenanceActions action="trigger-scan" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cache & Settings</CardTitle>
          <CardDescription>
            Xóa cache in-memory (system settings + API key rotator). Cần khi vừa update DB trực tiếp mà không qua admin UI.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MaintenanceActions action="clear-cache" />
        </CardContent>
      </Card>

      <Card className="border-red-300">
        <CardHeader>
          <CardTitle className="text-base text-red-700">⚠ Force Logout All</CardTitle>
          <CardDescription>
            Revoke tất cả session đang đăng nhập (trừ chính bạn). Mọi user phải login lại. Dùng khi nghi ngờ session leak hoặc cần force re-auth toàn bộ.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MaintenanceActions action="force-logout" />
        </CardContent>
      </Card>
    </div>
  );
}
