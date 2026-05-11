import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import {
  isTopLeader,
  isDeptManager,
  getManagedDepartments,
  ROLE_LABELS,
} from "@/lib/permissions";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StatusBadge, PriorityBadge, STATUS_LABELS, PRIORITY_LABELS } from "@/components/task/status-badge";
import { formatDate } from "@/lib/utils";
import { ExportCSVButton, PrintButton } from "@/components/reports/export-csv-button";

export default async function TaskReportPage() {
  const user = await requireAuth();
  // Chỉ TP/PTP/TRUONG_BO_PHAN xem báo cáo
  if (!isTopLeader(user.role) && !isDeptManager(user.role)) redirect("/");

  // TRUONG_BO_PHAN chỉ xem task của BỘ PHẬN mình (không phải teamGroupCode!)
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

  const tasks = await db.task.findMany({
    where: taskWhere,
    include: {
      assignee: { select: { name: true, position: true } },
      taskGroup: { select: { name: true } },
      creator: { select: { name: true } },
    },
    orderBy: [{ status: "asc" }, { deadline: "asc" }],
    take: 1000,
  });

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

  return (
    <div>
      <Link href="/reports" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4">
        <ArrowLeft className="h-4 w-4" /> Báo cáo
      </Link>
      <PageHeader
        title="Báo cáo công việc"
        description={`Tổng số ${tasks.length} nhiệm vụ`}
        actions={
          <div className="flex gap-2">
            <ExportCSVButton data={csvData} filename={`bao-cao-cong-viec-${new Date().toISOString().slice(0, 10)}.csv`} />
            <PrintButton />
          </div>
        }
      />

      <Card>
        <CardContent className="pt-6 overflow-x-auto">
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
                    <Link href={`/tasks/${t.id}`} className="hover:underline">{t.title}</Link>
                  </td>
                  <td className="py-2 px-2"><StatusBadge status={t.status} /></td>
                  <td className="py-2 px-2"><PriorityBadge priority={t.priority} /></td>
                  <td className="py-2 px-2">{formatDate(t.deadline)}</td>
                  <td className="py-2 px-2">{t.assignee?.name || t.taskGroup?.name || "-"}</td>
                  <td className="py-2 px-2">{t.creator.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
