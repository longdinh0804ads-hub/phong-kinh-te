import { requirePermission } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { UBNDForm } from "@/components/ubnd/ubnd-form";

export default async function NewUBNDPage() {
  await requirePermission("ubnd:create");

  const users = await db.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, position: true, department: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return (
    <div>
      <PageHeader title="Tiếp nhận nhiệm vụ UBND" description="Nhập nhiệm vụ mới do UBND xã giao cho Phòng Kinh Tế" />
      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          <UBNDForm users={users} />
        </CardContent>
      </Card>
    </div>
  );
}
