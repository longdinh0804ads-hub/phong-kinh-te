import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { getUBNDDirectives } from "@/actions/ubnd";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/task/status-badge";
import { formatDate, isOverdue } from "@/lib/utils";
import { Plus, Calendar, User, AlertCircle } from "lucide-react";

export default async function UBNDPage() {
  const user = await requireAuth();
  const directives = await getUBNDDirectives();

  return (
    <div>
      <PageHeader
        title="Nhiệm vụ từ UBND"
        description="Tổng hợp các nhiệm vụ UBND xã giao cho Phòng Kinh Tế"
        actions={
          hasPermission(user.role, "ubnd:create") && (
            <Link href="/ubnd/new">
              <Button>
                <Plus className="h-4 w-4" />
                Tiếp nhận nhiệm vụ
              </Button>
            </Link>
          )
        }
      />

      {directives.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Chưa có nhiệm vụ UBND nào
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {directives.map((d) => {
            const overdue = d.status !== "COMPLETED" && d.status !== "CANCELLED" && isOverdue(d.deadline);
            return (
              <Link key={d.id} href={`/ubnd/${d.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <StatusBadge status={d.status} />
                          {d.documentNo && <Badge variant="outline">{d.documentNo}</Badge>}
                        </div>
                        <h3 className="font-semibold text-base">{d.title}</h3>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Hạn: <span className={overdue ? "text-red-600 font-semibold" : ""}>{formatDate(d.deadline)}</span>
                        {overdue && <AlertCircle className="h-3 w-3 text-red-600" />}
                      </span>
                      {d.assignee && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {d.assignee.name}
                        </span>
                      )}
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
