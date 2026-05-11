import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { getTTHCRecords } from "@/actions/tthc";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, isOverdue } from "@/lib/utils";
import { Plus, Calendar, User, FileText, AlertCircle } from "lucide-react";

const TTHC_STATUS_LABELS = {
  RECEIVED: { label: "Tiếp nhận", variant: "warning" as const },
  PROCESSING: { label: "Đang xử lý", variant: "info" as const },
  COMPLETED: { label: "Hoàn thành", variant: "success" as const },
  RETURNED: { label: "Trả lại", variant: "destructive" as const },
};

export default async function TTHCPage() {
  const user = await requireAuth();
  const records = await getTTHCRecords();

  return (
    <div>
      <PageHeader
        title="Hồ sơ TTHC"
        description="Theo dõi tiến độ xử lý các thủ tục hành chính"
        actions={
          hasPermission(user.role, "tthc:create") && (
            <Link href="/tthc/new">
              <Button><Plus className="h-4 w-4" /> Tiếp nhận hồ sơ</Button>
            </Link>
          )
        }
      />

      {records.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
            Chưa có hồ sơ nào
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {records.map((r) => {
            const cfg = TTHC_STATUS_LABELS[r.status];
            const overdue = r.status !== "COMPLETED" && r.status !== "RETURNED" && isOverdue(r.deadline);
            return (
              <Link key={r.id} href={`/tthc/${r.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                          <Badge variant="outline">{r.procedureCode}</Badge>
                          {r.area && <Badge variant="secondary">{r.area}</Badge>}
                        </div>
                        <h3 className="font-semibold text-base">{r.procedureName}</h3>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {r.applicantName}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Hạn: <span className={overdue ? "text-red-600 font-semibold" : ""}>{formatDate(r.deadline)}</span>
                        {overdue && <AlertCircle className="h-3 w-3 text-red-600" />}
                      </span>
                      {r.handler && <span>Xử lý: {r.handler.name}</span>}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
