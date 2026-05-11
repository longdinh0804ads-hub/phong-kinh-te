import { requirePermission } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { IHanoiForm } from "@/components/ihanoi/ihanoi-form";

export default async function NewIHanoiPage() {
  await requirePermission("ihanoi:assign");

  const users = await db.user.findMany({
    where: { isActive: true, role: { notIn: ["NHAN_VIEN", "SUPER_ADMIN"] } },
    select: { id: true, name: true, position: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return (
    <div>
      <PageHeader title="Tiếp nhận phản ánh iHanoi" description="Nhập thông tin phản ánh và phân công cán bộ xử lý" />
      <Card className="max-w-2xl">
        <CardContent className="pt-6">
          <IHanoiForm users={users} />
        </CardContent>
      </Card>
    </div>
  );
}
