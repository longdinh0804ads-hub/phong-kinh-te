import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import {
  isTopLeader,
  isDeptManager,
  getManagedDepartments,
} from "@/lib/permissions";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ExportCSVButton, PrintButton } from "@/components/reports/export-csv-button";
import { formatDate, isOverdue } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ xử lý",
  IN_PROGRESS: "Đang xử lý",
  COMPLETED: "Hoàn thành",
  OVERDUE: "Quá hạn",
  CANCELLED: "Đã hủy",
};

const STATUS_VARIANT: Record<string, "info" | "warning" | "success" | "destructive" | "outline"> = {
  PENDING: "warning",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  OVERDUE: "destructive",
  CANCELLED: "outline",
};

export default async function UBNDReportPage() {
  const user = await requireAuth();
  if (!isTopLeader(user.role) && !isDeptManager(user.role)) redirect("/");

  // TRUONG_BO_PHAN: chỉ xem UBND đã giao cho cán bộ BỘ PHẬN mình (không phải teamGroupCode!)
  const isFullScope = isTopLeader(user.role);
  const where: any = { deletedAt: null };
  if (!isFullScope) {
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    where.assignee = { department: { in: managed } };
  }

  const directives = await db.uBNDDirective.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true, position: true } },
    },
    orderBy: [{ status: "asc" }, { deadline: "asc" }],
    take: 1000,
  });

  // Statistics
  const total = directives.length;
  const pending = directives.filter((d) => d.status === "PENDING").length;
  const inProgress = directives.filter((d) => d.status === "IN_PROGRESS").length;
  const completed = directives.filter((d) => d.status === "COMPLETED").length;
  const overdue = directives.filter(
    (d) =>
      d.status === "OVERDUE" ||
      (d.status !== "COMPLETED" && d.status !== "CANCELLED" && isOverdue(d.deadline))
  ).length;
  const cancelled = directives.filter((d) => d.status === "CANCELLED").length;
  const completionRate =
    total - cancelled > 0 ? Math.round((completed / (total - cancelled)) * 100) : 0;

  const csvData = directives.map((d, i) => ({
    "STT": i + 1,
    "Số văn bản": d.documentNo || "",
    "Tiêu đề": d.title,
    "Ban hành bởi": d.issuedBy,
    "Ngày ban hành": formatDate(d.issuedDate),
    "Hạn xử lý": formatDate(d.deadline),
    "Trạng thái": STATUS_LABEL[d.status] || d.status,
    "Người được giao": d.assignee?.name || "—",
    "Phản hồi": d.phongResponse || "",
    "Ngày phản hồi": d.responseDate ? formatDate(d.responseDate) : "",
  }));

  return (
    <div>
      <Link
        href="/reports"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Báo cáo
      </Link>
      <PageHeader
        title="Báo cáo nhiệm vụ UBND"
        description={`Tổng số ${total} nhiệm vụ${isFullScope ? "" : " — Tổ của bạn"}`}
        actions={
          <div className="flex gap-2 flex-wrap">
            <ExportCSVButton
              data={csvData}
              filename={`bao-cao-ubnd-${new Date().toISOString().slice(0, 10)}.csv`}
            />
            <PrintButton />
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatBox label="Chờ xử lý" value={pending} color="text-amber-700" bg="bg-amber-50" />
        <StatBox label="Đang xử lý" value={inProgress} color="text-blue-700" bg="bg-blue-50" />
        <StatBox label="Hoàn thành" value={completed} color="text-emerald-700" bg="bg-emerald-50" />
        <StatBox label="Quá hạn" value={overdue} color="text-red-700" bg="bg-red-50" />
        <StatBox label="Tỷ lệ HT" value={`${completionRate}%`} color="text-primary" bg="bg-primary/5" />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          {directives.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <div className="text-4xl mb-2">🏛️</div>
              <p>Chưa có nhiệm vụ UBND nào</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 w-10">#</th>
                  <th className="text-left py-2 px-2 hidden md:table-cell">Số văn bản</th>
                  <th className="text-left py-2 px-2">Nhiệm vụ</th>
                  <th className="text-left py-2 px-2">Hạn xử lý</th>
                  <th className="text-left py-2 px-2">Trạng thái</th>
                  <th className="text-left py-2 px-2 hidden lg:table-cell">Người nhận</th>
                </tr>
              </thead>
              <tbody>
                {directives.map((d, i) => {
                  const showOverdueBadge =
                    d.status !== "COMPLETED" &&
                    d.status !== "CANCELLED" &&
                    isOverdue(d.deadline);
                  return (
                    <tr key={d.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 px-2 hidden md:table-cell text-xs text-muted-foreground">
                        {d.documentNo || "—"}
                      </td>
                      <td className="py-2 px-2 font-medium">
                        <Link href={`/ubnd/${d.id}`} className="hover:underline">
                          {d.title}
                        </Link>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Ban hành: {formatDate(d.issuedDate)} · {d.issuedBy}
                        </div>
                      </td>
                      <td className={`py-2 px-2 ${showOverdueBadge ? "text-red-700 font-semibold" : ""}`}>
                        {formatDate(d.deadline)}
                      </td>
                      <td className="py-2 px-2">
                        <Badge variant={STATUS_VARIANT[showOverdueBadge ? "OVERDUE" : d.status]}>
                          {STATUS_LABEL[showOverdueBadge ? "OVERDUE" : d.status]}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 hidden lg:table-cell">
                        {d.assignee?.name || <span className="text-muted-foreground italic">Chưa giao</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatBox({
  label,
  value,
  color,
  bg,
}: {
  label: string;
  value: number | string;
  color: string;
  bg: string;
}) {
  return (
    <div className={`rounded-lg border ${bg} p-3`}>
      <div className="text-xs text-muted-foreground font-medium">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
    </div>
  );
}
