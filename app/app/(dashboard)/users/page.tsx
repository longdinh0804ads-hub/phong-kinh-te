import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import {
  ROLE_LABELS,
  DEPARTMENT_LABELS,
  hasPermission,
  isTopLeader,
  isDeptManager,
  getManagedDepartments,
} from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";
import { Mail, Phone } from "lucide-react";

export default async function UsersPage() {
  const user = await requireAuth();

  // Quyền xem: TP/PTP (view:all) hoặc TRUONG_BO_PHAN (view:dept). CHUYEN_VIEN/NHAN_VIEN: 404
  const canViewAll = hasPermission(user.role, "user:view:all");
  const canViewDept = hasPermission(user.role, "user:view:dept");
  if (!canViewAll && !canViewDept) {
    notFound();
  }

  // Scope where
  let where: any = { isActive: true };
  if (!canViewAll && canViewDept) {
    // TRUONG_BO_PHAN: chỉ user trong dept của mình (kể cả managedDepartments)
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    where = { isActive: true, department: { in: managed } };
  }

  const users = await db.user.findMany({
    where,
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  // Group by department
  const grouped = users.reduce((acc, u) => {
    if (!acc[u.department]) acc[u.department] = [];
    acc[u.department].push(u);
    return acc;
  }, {} as Record<string, typeof users>);

  const scopeLabel = canViewAll
    ? `Tổng số ${users.length} cán bộ đang hoạt động`
    : `${users.length} cán bộ trong bộ phận của bạn`;

  return (
    <div>
      <PageHeader title="Cán bộ phòng" description={scopeLabel} />

      {Object.entries(grouped).map(([dept, list]) => (
        <div key={dept} className="mb-6">
          <h2 className="text-lg font-bold mb-3">{DEPARTMENT_LABELS[dept as keyof typeof DEPARTMENT_LABELS]}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {list.map((u) => (
              <Card key={u.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Avatar>
                      <AvatarFallback>{getInitials(u.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold">{u.name}</div>
                      <div className="text-xs text-muted-foreground">{u.position}</div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        <Badge variant="info" className="text-xs">{ROLE_LABELS[u.role]}</Badge>
                        {u.isTeamLeader && <Badge variant="warning" className="text-xs">Tổ trưởng</Badge>}
                        {u.teamGroupCode && (
                          <Badge variant="outline" className="text-xs">{u.teamGroupCode === "to-1" ? "Tổ 1" : "Tổ 2"}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2 truncate">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{u.email}</span>
                      </div>
                      {u.phone && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3 shrink-0" />
                          {u.phone}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
