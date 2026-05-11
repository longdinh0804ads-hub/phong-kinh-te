import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { canViewIHanoiComplaint } from "@/actions/ihanoi";
import { hasPermission } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/task/status-badge";
import { IHanoiResolveForm } from "@/components/ihanoi/ihanoi-resolve-form";
import { formatDate, formatDateTime } from "@/lib/utils";
import { ArrowLeft, Calendar, User, Phone, MapPin } from "lucide-react";

export default async function IHanoiDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();

  // Scope check: phải có quyền view (all/dept/own) + scope khớp với complaint
  const allowed = await canViewIHanoiComplaint(
    {
      id: user.id,
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    },
    id
  );
  if (!allowed) notFound();

  const c = await db.iHanoiComplaint.findUnique({
    where: { id, deletedAt: null },
    include: { assignee: { select: { id: true, name: true, position: true } } },
  });
  if (!c) notFound();

  const canResolve = c.assigneeId === user.id || hasPermission(user.role, "ihanoi:assign");

  return (
    <div>
      <Link href="/ihanoi" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="h-4 w-4" /> Danh sách phản ánh
      </Link>

      <div className="flex items-center gap-2 mb-2">
        <StatusBadge status={c.status} />
        <Badge variant="outline">{c.ticketCode}</Badge>
      </div>
      <h1 className="text-2xl font-bold mb-6">Phản ánh iHanoi</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Nội dung phản ánh</CardTitle></CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{c.content}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Kết quả xử lý</CardTitle></CardHeader>
            <CardContent>
              {c.resolution ? (
                <div>
                  <p className="whitespace-pre-wrap text-sm mb-2">{c.resolution}</p>
                  {c.resolvedDate && <p className="text-xs text-muted-foreground">Xử lý xong: {formatDateTime(c.resolvedDate)}</p>}
                </div>
              ) : canResolve ? (
                <IHanoiResolveForm id={c.id} initial="" />
              ) : (
                <p className="text-muted-foreground italic">Chưa có kết quả</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Thông tin</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row icon={Calendar} label="Tiếp nhận">{formatDate(c.receivedDate)}</Row>
            {c.deadline && <Row icon={Calendar} label="Hạn xử lý">{formatDate(c.deadline)}</Row>}
            {c.citizenName && <Row icon={User} label="Người dân">{c.citizenName}</Row>}
            {c.citizenPhone && <Row icon={Phone} label="Điện thoại">{c.citizenPhone}</Row>}
            {c.citizenAddress && <Row icon={MapPin} label="Địa chỉ">{c.citizenAddress}</Row>}
            {c.assignee && (
              <Row icon={User} label="Cán bộ xử lý">
                {c.assignee.name}
                <div className="text-xs text-muted-foreground">{c.assignee.position}</div>
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
