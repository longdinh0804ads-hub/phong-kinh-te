import { requireAuth } from "@/lib/session";
import { redirect } from "next/navigation";
import { isSuperAdmin } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getPgvSettings } from "@/actions/pgv-settings";
import { PgvSettingsClient } from "./client";

export default async function PgvSettingsPage() {
  const user = await requireAuth();
  if (!isSuperAdmin(user.role)) redirect("/?error=forbidden");

  const settings = await getPgvSettings();

  return (
    <div className="max-w-3xl space-y-4">
      <PageHeader
        title="Cấu hình Phiếu giao việc"
        description="Người ký + chữ ký scan dùng cho mọi phiếu giao việc tự sinh"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Người ký phiếu</CardTitle>
          <CardDescription>
            Cố định cho mọi phiếu - thường là Trưởng phòng. Có thể đổi khi luân chuyển vị trí.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PgvSettingsClient initial={settings} />
        </CardContent>
      </Card>
    </div>
  );
}
