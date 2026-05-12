import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import {
  isTopLeader,
  isDeptManager,
  getManagedDepartments,
  DEPARTMENT_LABELS,
} from "@/lib/permissions";
import { EXCLUDE_SUPER_ADMIN } from "@/lib/user-filters";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileBarChart, Calendar, Users, ClipboardList, Sparkles } from "lucide-react";

export default async function ReportsPage() {
  const user = await requireAuth();
  // Chỉ TP / PTP / TRUONG_BO_PHAN xem báo cáo
  if (!isTopLeader(user.role) && !isDeptManager(user.role)) redirect("/");

  // TRUONG_BO_PHAN chỉ xem báo cáo dept của mình. TP/PTP xem all.
  const isFullScope = isTopLeader(user.role);
  const managedDepts = !isFullScope
    ? getManagedDepartments({
        role: user.role,
        department: user.department,
        managedDepartments: user.managedDepartments,
      })
    : [];

  // Filter scope cho task: TRUONG_BO_PHAN chỉ thấy task assigned/created by người trong dept mình
  const taskWhere: any = { deletedAt: null };
  const userWhere: any = { isActive: true, ...EXCLUDE_SUPER_ADMIN };
  if (!isFullScope && managedDepts.length > 0) {
    taskWhere.OR = [
      { assignee: { department: { in: managedDepts } } },
      { creator: { department: { in: managedDepts } } },
    ];
    userWhere.department = { in: managedDepts };
  }

  // UBND, iHanoi, TTHC: scope theo assignee.department / handler.department cho TRUONG_BO_PHAN
  const assigneeScopeWhere: any = { deletedAt: null };
  const handlerScopeWhere: any = { deletedAt: null };
  if (!isFullScope && managedDepts.length > 0) {
    assigneeScopeWhere.assignee = { department: { in: managedDepts } };
    handlerScopeWhere.handler = { department: { in: managedDepts } };
  }

  // Aggregate stats
  const [taskStats, userStats, ubndStats, ihanoiStats, tthcStats] = await Promise.all([
    db.task.groupBy({ by: ["status"], _count: true, where: taskWhere }),
    db.user.count({ where: userWhere }),
    db.uBNDDirective.groupBy({ by: ["status"], _count: true, where: assigneeScopeWhere }),
    db.iHanoiComplaint.groupBy({ by: ["status"], _count: true, where: assigneeScopeWhere }),
    db.tTHCRecord.groupBy({ by: ["status"], _count: true, where: handlerScopeWhere }),
  ]);

  const statusMap = (arr: { status: string; _count: number }[]) =>
    arr.reduce((acc, x) => ({ ...acc, [x.status]: x._count }), {} as Record<string, number>);

  const taskMap = statusMap(taskStats as any);
  const ubndMap = statusMap(ubndStats as any);
  const ihanoiMap = statusMap(ihanoiStats as any);
  const tthcMap = statusMap(tthcStats as any);

  const totalTasks = taskStats.reduce((s, t) => s + t._count, 0);

  return (
    <div>
      <PageHeader
        title="Báo cáo & Thống kê"
        description={
          isFullScope
            ? "Tổng hợp tình hình thực hiện nhiệm vụ — toàn phòng"
            : `Tổng hợp tình hình thực hiện nhiệm vụ — ${managedDepts
                .map((d) => DEPARTMENT_LABELS[d as keyof typeof DEPARTMENT_LABELS])
                .join(", ")}`
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <ReportCard
          title="Báo cáo công việc"
          description="Thống kê tiến độ thực hiện theo cán bộ/nhóm/lĩnh vực"
          icon={ClipboardList}
          href="/reports/tasks"
        />
        <ReportCard
          title="Báo cáo lịch công tác tuần"
          description="Lịch tuần đầy đủ của phòng để xuất file"
          icon={Calendar}
          href="/reports/schedule"
        />
        <ReportCard
          title="Báo cáo hiệu suất cán bộ"
          description="Đánh giá thi đua khen thưởng theo kết quả công việc"
          icon={Users}
          href="/reports/performance"
        />
        <ReportCard
          title="Báo cáo nhiệm vụ UBND"
          description="Tổng hợp xử lý nhiệm vụ UBND xã giao"
          icon={FileBarChart}
          href="/reports/ubnd"
        />
        {isFullScope && (
          <ReportCard
            title="Đề xuất nhắc nhở (AI)"
            description="AI phát hiện cán bộ làm việc kém hiệu quả, TP duyệt nhắc nhở"
            icon={Sparkles}
            href="/reports/proposals"
          />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tổng quan toàn phòng</CardTitle>
          <CardDescription>Số liệu tổng hợp tại thời điểm hiện tại</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Tổng công việc" value={totalTasks} sub={`${taskMap.COMPLETED || 0} hoàn thành`} />
            <Stat label="Cán bộ" value={userStats} sub="đang hoạt động" />
            <Stat label="Nhiệm vụ UBND" value={Object.values(ubndMap).reduce((a, b) => a + (b as number), 0)} sub={`${ubndMap.PENDING || 0} chờ xử lý`} />
            <Stat label="iHanoi" value={Object.values(ihanoiMap).reduce((a, b) => a + (b as number), 0)} sub={`${ihanoiMap.COMPLETED || 0} đã giải quyết`} />
            <Stat label="Hồ sơ TTHC" value={Object.values(tthcMap).reduce((a, b) => a + (b as number), 0)} sub={`${tthcMap.COMPLETED || 0} hoàn thành`} />
            <Stat label="Đang xử lý" value={taskMap.IN_PROGRESS || 0} sub="công việc" />
            <Stat label="Quá hạn" value={taskMap.OVERDUE || 0} sub="cần đôn đốc" />
            <Stat label="Tỷ lệ hoàn thành" value={totalTasks > 0 ? Math.round(((taskMap.COMPLETED || 0) / totalTasks) * 100) + "%" : "0%"} sub="công việc" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReportCard({ title, description, icon: Icon, href }: { title: string; description: string; icon: any; href: string }) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <CardDescription>{description}</CardDescription>
        </CardContent>
      </Card>
    </Link>
  );
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
