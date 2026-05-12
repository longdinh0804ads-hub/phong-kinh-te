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
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StatusBadge, PriorityBadge, STATUS_LABELS, PRIORITY_LABELS } from "@/components/task/status-badge";
import { formatDate } from "@/lib/utils";
import { ExportCSVButton, PrintButton } from "@/components/reports/export-csv-button";
import { TaskReportFilterBar } from "@/components/reports/task-report-filter-bar";
import { TaskReportWizard, type TaskReportRow } from "@/components/reports/task-report-wizard";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import { parseDateRangeParams } from "@/lib/date-range";

export default async function TaskReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    assigneeId?: string;
    range?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const user = await requireAuth();
  // Chỉ TP/PTP/TRUONG_BO_PHAN xem báo cáo
  if (!isTopLeader(user.role) && !isDeptManager(user.role)) redirect("/");

  const params = await searchParams;
  const { range: dateRange } = parseDateRangeParams(params);

  // TRUONG_BO_PHAN chỉ xem task của BỘ PHẬN mình
  const isFullScope = isTopLeader(user.role);
  const taskWhere: any = { deletedAt: null };

  if (!isFullScope) {
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    taskWhere.OR = [
      { assignee: { department: { in: managed } } },
      { creator: { department: { in: managed } } },
    ];
  }

  // Apply filters
  if (params.status && params.status !== "ALL") {
    if (params.status === "OVERDUE") {
      taskWhere.deadline = { lt: new Date() };
      taskWhere.status = { notIn: ["COMPLETED", "CANCELLED"] };
    } else {
      taskWhere.status = params.status;
    }
  }
  if (params.priority && params.priority !== "ALL") {
    taskWhere.priority = params.priority;
  }
  if (params.assigneeId) {
    taskWhere.assigneeId = params.assigneeId;
  }
  if (dateRange) {
    taskWhere.deadline = {
      ...(taskWhere.deadline || {}),
      gte: dateRange.from,
      lte: dateRange.to,
    };
  }

  const tasks = await db.task.findMany({
    where: taskWhere,
    include: {
      assignee: { select: { name: true, position: true, department: true } },
      taskGroup: { select: { name: true } },
      creator: { select: { name: true, position: true, department: true } },
    },
    orderBy: [{ status: "asc" }, { deadline: "asc" }],
    take: 1000,
  });

  // User list cho filter dropdown
  const users = await db.user.findMany({
    where: {
      isActive: true,
      ...EXCLUDE_SUPER_ADMIN,
      ...(isFullScope
        ? {}
        : {
            department: {
              in: getManagedDepartments({
                role: user.role,
                department: user.department,
                managedDepartments: user.managedDepartments,
              }),
            },
          }),
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, position: true },
  });

  // CSV data (giữ format cũ - simple)
  const csvData = tasks.map((t) => ({
    "Tiêu đề": t.title,
    "Trạng thái": STATUS_LABELS[t.status],
    "Ưu tiên": PRIORITY_LABELS[t.priority],
    "Thời hạn": formatDate(t.deadline),
    "Người giao": t.creator.name,
    "Người nhận": t.assignee?.name || t.taskGroup?.name || "",
    "Loại nguồn": t.sourceType,
    "Ngày tạo": formatDate(t.createdAt),
  }));

  // Report rows (10 cột giống template hành chính)
  const reportRows: TaskReportRow[] = tasks.map((t) => {
    const docNo = t.sourceType === "UBND_DIRECTIVE" && t.sourceId
      ? `UBND-${t.sourceId.slice(-8)}`
      : t.sourceType === "IHANOI" && t.sourceId
      ? `iHanoi-${t.sourceId.slice(-8)}`
      : `NV-${t.id.slice(-8)}`;
    const issuingDept = t.creator.department
      ? DEPARTMENT_LABELS[t.creator.department as keyof typeof DEPARTMENT_LABELS] || t.creator.department
      : "";
    const assigneeDept = t.assignee?.department
      ? DEPARTMENT_LABELS[t.assignee.department as keyof typeof DEPARTMENT_LABELS] || t.assignee.department
      : t.taskGroup?.name || "";
    const assigneeInfo = t.assignee
      ? `${t.assignee.name}${t.assignee.position ? " - " + t.assignee.position : ""}`
      : t.taskGroup?.name || "Chưa giao";
    return {
      documentNo: docNo,
      taskTitle: t.title,
      issuingDept: t.creator.name + (issuingDept ? ` (${issuingDept})` : ""),
      issuedDate: formatDate(t.createdAt),
      deadline: formatDate(t.deadline),
      assigneeDept,
      content: t.description ? t.description.slice(0, 300) : t.title,
      status: STATUS_LABELS[t.status] + (t.completedAt ? ` (${formatDate(t.completedAt)})` : ""),
      assigneeInfo,
    };
  });

  return (
    <div>
      <Link
        href="/reports"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Báo cáo
      </Link>
      <PageHeader
        title="Báo cáo công việc"
        description={`Tổng số ${tasks.length} nhiệm vụ${
          isFullScope ? "" : " - phạm vi bộ phận"
        }`}
        actions={
          <div className="flex gap-2 flex-wrap">
            <ExportCSVButton
              data={csvData}
              filename={`bao-cao-cong-viec-${new Date().toISOString().slice(0, 10)}.csv`}
            />
            <PrintButton />
            <TaskReportWizard rows={reportRows} totalFiltered={tasks.length} />
          </div>
        }
      />

      {/* Filter Card: thời gian + bộ lọc khác */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-4 space-y-3">
          <DateRangeFilter />
          {dateRange && (
            <p className="text-xs text-muted-foreground">
              Lọc theo hạn nhiệm vụ:{" "}
              <span className="font-semibold">{dateRange.label}</span>
            </p>
          )}
          <div className="border-t pt-3">
            <TaskReportFilterBar users={users} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Không có nhiệm vụ nào khớp với bộ lọc hiện tại.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">#</th>
                  <th className="text-left py-2 px-2">Tiêu đề</th>
                  <th className="text-left py-2 px-2">Trạng thái</th>
                  <th className="text-left py-2 px-2">Ưu tiên</th>
                  <th className="text-left py-2 px-2">Hạn</th>
                  <th className="text-left py-2 px-2">Người nhận</th>
                  <th className="text-left py-2 px-2">Người giao</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t, i) => (
                  <tr key={t.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-2">{i + 1}</td>
                    <td className="py-2 px-2 font-medium">
                      <Link href={`/tasks/${t.id}`} className="hover:underline">
                        {t.title}
                      </Link>
                    </td>
                    <td className="py-2 px-2">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="py-2 px-2">
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className="py-2 px-2">{formatDate(t.deadline)}</td>
                    <td className="py-2 px-2">
                      {t.assignee?.name || t.taskGroup?.name || "-"}
                    </td>
                    <td className="py-2 px-2">{t.creator.name}</td>
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
