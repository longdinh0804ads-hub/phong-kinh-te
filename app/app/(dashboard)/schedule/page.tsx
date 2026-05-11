import { requireAuth } from "@/lib/session";
import { getSchedules } from "@/actions/schedule";
import {
  isTopLeader,
  isDeptManager,
  getManagedDepartments,
} from "@/lib/permissions";
import { EXCLUDE_SUPER_ADMIN } from "@/lib/user-filters";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduleForm } from "@/components/schedule/schedule-form";
import { ScheduleItem } from "@/components/schedule/schedule-item";
import { getWeekNumber } from "@/lib/utils";
import { CalendarDays } from "lucide-react";
import { db } from "@/lib/db";

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; year?: string; user?: string }>;
}) {
  const user = await requireAuth();
  const params = await searchParams;

  const now = new Date();
  const weekNumber = parseInt(params.week ?? "") || getWeekNumber(now);
  const year = parseInt(params.year ?? "") || now.getFullYear();
  const userId = params.user;

  const items = await getSchedules({ weekNumber, year, userId });

  // User dropdown cho "Thêm lịch cho cán bộ":
  // - TP/PTP: list toàn phòng (loại trừ chính mình - vì có default "Chính tôi")
  // - TRUONG_BO_PHAN: chỉ user trong managedDepartments
  //   → KHÔNG bao gồm TP/PTP (họ thuộc dept BAN_LANH_DAO, không trong managed)
  // - Staff: empty (KHÔNG hiển thị dropdown)
  let users: { id: string; name: string; position: string }[] = [];
  if (isTopLeader(user.role)) {
    users = await db.user.findMany({
      where: { isActive: true, id: { not: user.id }, ...EXCLUDE_SUPER_ADMIN },
      select: { id: true, name: true, position: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
  } else if (isDeptManager(user.role)) {
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    users = await db.user.findMany({
      where: {
        isActive: true,
        id: { not: user.id },
        ...EXCLUDE_SUPER_ADMIN,
        department: { in: managed },
      },
      select: { id: true, name: true, position: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
  }
  // CHUYEN_VIEN / NHAN_VIEN: users = [] → form sẽ ẩn dropdown (canManageOthers=false)
  const canManageOthers = isTopLeader(user.role) || isDeptManager(user.role);

  return (
    <div>
      <PageHeader
        title="Lịch công tác"
        description={`Tuần ${weekNumber} - Năm ${year}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {items.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-muted-foreground">
                <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
                Không có lịch nào trong tuần
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {items.map((item) => <ScheduleItem key={item.id} item={item} />)}
            </div>
          )}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Thêm lịch công tác</CardTitle></CardHeader>
          <CardContent>
            <ScheduleForm users={users} canManageOthers={canManageOthers} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
