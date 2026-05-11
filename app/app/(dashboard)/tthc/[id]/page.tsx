import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { canViewTTHCRecord } from "@/actions/tthc";
import { hasPermission } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TTHCStatusActions } from "@/components/tthc/tthc-status-actions";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, Calendar, User, Phone, MapPin } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; variant: any }> = {
  RECEIVED: { label: "Tiếp nhận", variant: "warning" },
  PROCESSING: { label: "Đang xử lý", variant: "info" },
  COMPLETED: { label: "Hoàn thành", variant: "success" },
  RETURNED: { label: "Trả lại", variant: "destructive" },
};

export default async function TTHCDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();

  // Scope check: phải có quyền view (all/dept/own) + scope khớp với record
  const allowed = await canViewTTHCRecord(
    {
      id: user.id,
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    },
    id
  );
  if (!allowed) notFound();

  const r = await db.tTHCRecord.findUnique({
    where: { id, deletedAt: null },
    include: { handler: { select: { id: true, name: true, position: true } } },
  });
  if (!r) notFound();

  const cfg = STATUS_LABELS[r.status];
  const canEdit = r.handlerId === user.id || hasPermission(user.role, "tthc:create");

  return (
    <div>
      <Link href="/tthc" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="h-4 w-4" /> Danh sách hồ sơ
      </Link>

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={cfg.variant}>{cfg.label}</Badge>
            <Badge variant="outline">{r.procedureCode}</Badge>
          </div>
          <h1 className="text-2xl font-bold">{r.procedureName}</h1>
        </div>
        {canEdit && <TTHCStatusActions id={r.id} status={r.status} />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {r.notes && (
            <Card>
              <CardHeader><CardTitle className="text-base">Ghi chú</CardTitle></CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{r.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Thông tin</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row icon={User} label="Người nộp">{r.applicantName}</Row>
            {r.applicantPhone && <Row icon={Phone} label="Điện thoại">{r.applicantPhone}</Row>}
            <Row icon={Calendar} label="Tiếp nhận">{formatDate(r.receivedDate)}</Row>
            <Row icon={Calendar} label="Hạn xử lý">{formatDate(r.deadline)}</Row>
            {r.area && <Row icon={MapPin} label="Địa bàn">{r.area}</Row>}
            {r.handler && <Row icon={User} label="Cán bộ xử lý">{r.handler.name}</Row>}
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
