import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelative, formatDateTime } from "@/lib/utils";

export default async function AuditPage() {
  // Lấy 100 entries gần nhất, kết hợp 2 nguồn: AdminAuditLog + AIAuditLog
  const [adminLogs, aiLogs] = await Promise.all([
    db.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { admin: { select: { name: true } } },
    }),
    db.aIAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { name: true, role: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Lịch sử hoạt động</h1>
        <p className="text-sm text-muted-foreground">
          50 hành động quản trị gần nhất + 50 AI tool calls gần nhất
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hành động Super Admin ({adminLogs.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {adminLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Chưa có hành động nào</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Thời điểm</th>
                  <th className="text-left py-2">Admin</th>
                  <th className="text-left py-2">Action</th>
                  <th className="text-left py-2">Target</th>
                  <th className="text-left py-2">IP</th>
                </tr>
              </thead>
              <tbody>
                {adminLogs.map((l) => (
                  <tr key={l.id} className="border-b hover:bg-muted/30">
                    <td className="py-1.5 pr-2 whitespace-nowrap">
                      <div>{formatRelative(l.createdAt)}</div>
                      <div className="text-[10px] text-muted-foreground">{formatDateTime(l.createdAt)}</div>
                    </td>
                    <td className="py-1.5 pr-2">{l.admin?.name}</td>
                    <td className="py-1.5 pr-2 font-mono">{l.action}</td>
                    <td className="py-1.5 pr-2 font-mono text-muted-foreground">{l.target || "—"}</td>
                    <td className="py-1.5 text-muted-foreground">{l.ipAddress || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Tool Calls ({aiLogs.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {aiLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Chưa có hoạt động AI</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Thời điểm</th>
                  <th className="text-left py-2">User</th>
                  <th className="text-left py-2">Action</th>
                  <th className="text-right py-2">Latency</th>
                  <th className="text-left py-2 pl-2">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {aiLogs.map((l) => (
                  <tr key={l.id} className="border-b hover:bg-muted/30">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{formatRelative(l.createdAt)}</td>
                    <td className="py-1.5 pr-2">{l.user?.name || "—"}</td>
                    <td className="py-1.5 pr-2 font-mono">{l.action}</td>
                    <td className="py-1.5 pr-2 text-right">{l.duration ?? "—"}ms</td>
                    <td className="py-1.5 pl-2">
                      {l.success ? (
                        <Badge variant="success">OK</Badge>
                      ) : (
                        <>
                          <Badge variant="destructive">Lỗi</Badge>
                          {l.errorMsg && (
                            <div className="text-red-600 mt-0.5 max-w-md truncate">{l.errorMsg}</div>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
