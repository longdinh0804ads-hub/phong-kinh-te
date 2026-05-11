import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ROLE_LABELS,
  DEPARTMENT_LABELS,
  isTopLeader,
  isDeptManager,
  getManagedDepartments,
} from "@/lib/permissions";
import { ClipboardList, Clock, CheckCircle2, AlertTriangle, Users, Building, ArrowRight } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await requireAuth();

  // Phân chia scope dashboard theo role:
  // - TP/PTP: toàn phòng
  // - TRUONG_BO_PHAN: bộ phận mình (qua managedDepartments)
  // - CHUYEN_VIEN/NHAN_VIEN: chỉ task của mình
  const isTop = isTopLeader(user.role);
  const isDept = isDeptManager(user.role);

  let taskFilter: any;
  if (isTop) {
    taskFilter = {};
  } else if (isDept) {
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    taskFilter = {
      OR: [
        { assigneeId: user.id },
        { assignee: { department: { in: managed } } },
        { creator: { department: { in: managed } } },
      ],
    };
  } else {
    taskFilter = { assigneeId: user.id };
  }

  const [pending, inProgress, completed, overdue] = await Promise.all([
    db.task.count({ where: { ...taskFilter, status: "PENDING", deletedAt: null } }),
    db.task.count({ where: { ...taskFilter, status: "IN_PROGRESS", deletedAt: null } }),
    db.task.count({ where: { ...taskFilter, status: "COMPLETED", deletedAt: null } }),
    db.task.count({
      where: { ...taskFilter, status: { notIn: ["COMPLETED", "CANCELLED"] }, deadline: { lt: new Date() }, deletedAt: null },
    }),
  ]);

  // totalUsers: TP/PTP all, TRUONG_BO_PHAN trong dept, staff không thấy
  const totalUsers = isTop
    ? await db.user.count({ where: { isActive: true } })
    : isDept
    ? await db.user.count({
        where: {
          isActive: true,
          department: {
            in: getManagedDepartments({
              role: user.role,
              department: user.department,
              managedDepartments: user.managedDepartments,
            }),
          },
        },
      })
    : null;

  // ubndPending: chỉ TP/PTP thấy stat toàn phòng; TRUONG_BO_PHAN xem trong dept; staff không thấy
  const ubndPending = isTop
    ? await db.uBNDDirective.count({ where: { status: "PENDING", deletedAt: null } })
    : isDept
    ? await db.uBNDDirective.count({
        where: {
          status: "PENDING",
          deletedAt: null,
          assignee: {
            department: {
              in: getManagedDepartments({
                role: user.role,
                department: user.department,
                managedDepartments: user.managedDepartments,
              }),
            },
          },
        },
      })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1>Xin chào, {user.name}</h1>
          <p className="text-muted-foreground">
            {user.position} · {DEPARTMENT_LABELS[user.department]}
          </p>
        </div>
        <Badge variant="info" className="self-start text-sm py-1.5 px-3">
          {ROLE_LABELS[user.role]}
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Cần thực hiện"
          value={pending}
          icon={Clock}
          color="text-amber-600"
          iconBg="bg-amber-50"
          href="/tasks?status=PENDING"
        />
        <StatCard
          label="Đang xử lý"
          value={inProgress}
          icon={ClipboardList}
          color="text-blue-600"
          iconBg="bg-blue-50"
          href="/tasks?status=IN_PROGRESS"
        />
        <StatCard
          label="Hoàn thành"
          value={completed}
          icon={CheckCircle2}
          color="text-emerald-600"
          iconBg="bg-emerald-50"
          href="/tasks?status=COMPLETED"
        />
        <StatCard
          label="Quá hạn"
          value={overdue}
          icon={AlertTriangle}
          color="text-red-600"
          iconBg="bg-red-50"
          href="/tasks?overdue=1"
        />
      </div>

      {(isTop || isDept) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LinkedCard
            title="Cán bộ phòng"
            value={totalUsers ?? 0}
            description="Cán bộ đang hoạt động"
            icon={Users}
            href="/users"
            ariaLabel="Xem danh sách cán bộ phòng"
          />
          <LinkedCard
            title="Nhiệm vụ UBND"
            value={ubndPending ?? 0}
            description="Đang chờ xử lý"
            icon={Building}
            href="/ubnd?status=PENDING"
            ariaLabel="Xem nhiệm vụ UBND đang chờ"
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Trách nhiệm phụ trách</CardTitle>
          <CardDescription>
            {user.fields.length > 0 ? "Lĩnh vực và địa bàn được phân công" : "Chưa được phân công"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {user.fields.length > 0 && (
            <div>
              <div className="text-sm font-medium mb-1.5">Lĩnh vực:</div>
              <div className="flex flex-wrap gap-1.5">
                {user.fields.map((f) => (
                  <Badge key={f} variant="secondary">{f}</Badge>
                ))}
              </div>
            </div>
          )}
          {user.areas.length > 0 && (
            <div>
              <div className="text-sm font-medium mb-1.5">Địa bàn:</div>
              <div className="flex flex-wrap gap-1.5">
                {user.areas.map((a) => (
                  <Badge key={a} variant="info">{a}</Badge>
                ))}
              </div>
            </div>
          )}
          {user.responsibilities && (
            <div>
              <div className="text-sm font-medium mb-1.5">Mô tả:</div>
              <p className="text-sm text-muted-foreground leading-relaxed">{user.responsibilities}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  iconBg,
  href,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  iconBg?: string;
  href: string;
}) {
  return (
    <Link href={href} aria-label={`${label}: ${value} - bấm để xem chi tiết`}>
      <Card className="hover-lift card-interactive cursor-pointer active:scale-[0.98] overflow-hidden relative">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-muted-foreground font-medium">{label}</p>
              <p className="text-2xl md:text-3xl font-bold mt-1 tracking-tight">{value}</p>
            </div>
            <div
              className={`h-12 w-12 md:h-14 md:w-14 rounded-xl flex items-center justify-center shrink-0 ${iconBg || "bg-primary/10"}`}
            >
              <Icon className={`h-6 w-6 md:h-7 md:w-7 ${color}`} />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function LinkedCard({
  title,
  value,
  description,
  icon: Icon,
  href,
  ariaLabel,
}: {
  title: string;
  value: number;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  ariaLabel?: string;
}) {
  return (
    <Link href={href} aria-label={ariaLabel || `${title}: ${value} - bấm để xem chi tiết`}>
      <Card className="hover:shadow-md hover:border-primary/30 transition-all cursor-pointer active:scale-[0.98] group">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <Icon className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="flex items-end justify-between">
            <div>
              <div className="text-3xl font-bold">{value}</div>
              <CardDescription>{description}</CardDescription>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
