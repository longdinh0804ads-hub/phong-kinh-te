import { db } from "@/lib/db";
import { ROLE_LABELS, DEPARTMENT_LABELS } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAdminActions } from "@/components/admin/user-admin-actions";

export default async function AdminUsersPage() {
  const users = await db.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      position: true,
      department: true,
      isActive: true,
      teamGroupCode: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Quản lý tài khoản</h1>
        <p className="text-sm text-muted-foreground">
          {users.length} tài khoản · Reset password (sinh password mới 12 ký tự) · Vô hiệu hóa khi cần
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2">#</th>
                <th className="text-left py-2 px-2">Họ tên · Email</th>
                <th className="text-left py-2 px-2">Vai trò</th>
                <th className="text-left py-2 px-2">Bộ phận</th>
                <th className="text-left py-2 px-2">Trạng thái</th>
                <th className="text-right py-2 px-2">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className="border-b hover:bg-muted/30">
                  <td className="py-2 px-2 text-muted-foreground">{i + 1}</td>
                  <td className="py-2 px-2">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </td>
                  <td className="py-2 px-2">
                    <Badge variant={u.role === "SUPER_ADMIN" ? "destructive" : "info"}>
                      {ROLE_LABELS[u.role]}
                    </Badge>
                  </td>
                  <td className="py-2 px-2 text-xs">
                    {DEPARTMENT_LABELS[u.department as keyof typeof DEPARTMENT_LABELS]}
                    {u.teamGroupCode && (
                      <Badge variant="outline" className="ml-1 text-[10px]">
                        {u.teamGroupCode === "to-1" ? "Tổ 1" : "Tổ 2"}
                      </Badge>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    {u.isActive ? (
                      <Badge variant="success">Đang hoạt động</Badge>
                    ) : (
                      <Badge variant="secondary">Vô hiệu hóa</Badge>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <UserAdminActions
                      userId={u.id}
                      userName={u.name}
                      isActive={u.isActive}
                      isSuperAdminTarget={u.role === "SUPER_ADMIN"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
