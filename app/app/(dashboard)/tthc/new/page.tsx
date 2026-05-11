import { requirePermission } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { TTHCForm } from "@/components/tthc/tthc-form";

export default async function NewTTHCPage() {
  await requirePermission("tthc:create");

  const users = await db.user.findMany({
    where: { isActive: true, department: { in: ["NONG_NGHIEP_MOI_TRUONG", "XAY_DUNG_CONG_THUONG", "TAI_CHINH_KE_HOACH"] } },
    select: { id: true, name: true, position: true, areas: true },
    orderBy: [{ name: "asc" }],
  });

  return (
    <div>
      <PageHeader title="Tiếp nhận hồ sơ TTHC" description="Nhập thông tin hồ sơ và phân công cán bộ xử lý" />
      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          <TTHCForm users={users} />
        </CardContent>
      </Card>
    </div>
  );
}
