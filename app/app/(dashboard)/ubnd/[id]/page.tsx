import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { canViewUBNDDirective } from "@/actions/ubnd";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/task/status-badge";
import { UBNDResponseForm } from "@/components/ubnd/ubnd-response-form";
import { formatDate, formatDateTime, isOverdue } from "@/lib/utils";
import { ArrowLeft, Calendar, User, FileText, Building, AlertCircle } from "lucide-react";

export default async function UBNDDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();
  const ok = await canViewUBNDDirective(user, id);
  if (!ok) notFound();

  const directive = await db.uBNDDirective.findUnique({
    where: { id, deletedAt: null },
    include: { assignee: { select: { id: true, name: true, position: true } } },
  });
  if (!directive) notFound();

  const canRespond =
    hasPermission(user.role, "ubnd:assign") ||
    directive.assigneeId === user.id;

  const overdue = directive.status !== "COMPLETED" && directive.status !== "CANCELLED" && isOverdue(directive.deadline);

  return (
    <div>
      <Link href="/ubnd" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="h-4 w-4" /> Danh sách UBND
      </Link>

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <StatusBadge status={directive.status} />
            {directive.documentNo && <Badge variant="outline">{directive.documentNo}</Badge>}
          </div>
          <h1 className="text-2xl font-bold">{directive.title}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {directive.content && (
            <Card>
              <CardHeader><CardTitle className="text-base">Nội dung</CardTitle></CardHeader>
              <CardContent>
                <div className="whitespace-pre-wrap text-sm">{directive.content}</div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Phản hồi của Phòng Kinh Tế</CardTitle>
            </CardHeader>
            <CardContent>
              {directive.phongResponse ? (
                <div>
                  <div className="whitespace-pre-wrap text-sm mb-2">{directive.phongResponse}</div>
                  {directive.responseDate && (
                    <p className="text-xs text-muted-foreground">Phản hồi lúc: {formatDateTime(directive.responseDate)}</p>
                  )}
                  {canRespond && directive.status !== "COMPLETED" && (
                    <div className="mt-4 pt-4 border-t">
                      <UBNDResponseForm id={directive.id} initial={directive.phongResponse} />
                    </div>
                  )}
                </div>
              ) : canRespond ? (
                <UBNDResponseForm id={directive.id} initial="" />
              ) : (
                <p className="text-muted-foreground italic">Chưa có phản hồi</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Thông tin</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row icon={Building} label="Cơ quan ban hành">{directive.issuedBy}</Row>
            <Row icon={Calendar} label="Ngày ban hành">{formatDate(directive.issuedDate)}</Row>
            <Row icon={Calendar} label="Ngày tiếp nhận">{formatDate(directive.receivedDate)}</Row>
            <Row icon={Calendar} label="Hạn xử lý">
              <span className={overdue ? "text-red-600 font-semibold" : ""}>
                {formatDate(directive.deadline)}
              </span>
              {overdue && <AlertCircle className="h-4 w-4 inline ml-1 text-red-600" />}
            </Row>
            {directive.assignee && (
              <Row icon={User} label="Người phụ trách">
                {directive.assignee.name}
                <div className="text-xs text-muted-foreground">{directive.assignee.position}</div>
              </Row>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-medium">{children}</div>
      </div>
    </div>
  );
}
