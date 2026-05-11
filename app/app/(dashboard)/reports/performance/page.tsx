import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import {
  isTopLeader,
  isDeptManager,
  getManagedDepartments,
  ROLE_LABELS,
  DEPARTMENT_LABELS,
} from "@/lib/permissions";
import { EXCLUDE_SUPER_ADMIN } from "@/lib/user-filters";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { ExportCSVButton, PrintButton } from "@/components/reports/export-csv-button";

interface UserPerformance {
  id: string;
  name: string;
  position: string;
  role: string;
  teamGroupCode: string | null;
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  overdue: number;
  cancelled: number;
  completionRate: number;
  onTimeRate: number;
}

export default async function PerformanceReportPage() {
  const user = await requireAuth();
  // Chỉ TP/PTP/TRUONG_BO_PHAN xem báo cáo
  if (!isTopLeader(user.role) && !isDeptManager(user.role)) redirect("/");

  // TRUONG_BO_PHAN chỉ xem cán bộ BỘ PHẬN mình (không phải teamGroupCode!)
  const isFullScope = isTopLeader(user.role);
  const userWhere: any = { isActive: true, ...EXCLUDE_SUPER_ADMIN };
  const managedDepts = !isFullScope
    ? getManagedDepartments({
        role: user.role,
        department: user.department,
        managedDepartments: user.managedDepartments,
      })
    : [];
  if (!isFullScope) {
    userWhere.department = { in: managedDepts };
  }

  const now = new Date();

  // Lấy tất cả cán bộ + task của họ (assignee)
  const users = await db.user.findMany({
    where: userWhere,
    select: {
      id: true,
      name: true,
      position: true,
      role: true,
      teamGroupCode: true,
      assignedTasks: {
        where: { deletedAt: null },
        select: {
          id: true,
          status: true,
          deadline: true,
          completedAt: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  // Tính performance cho mỗi user
  const performance: UserPerformance[] = users.map((u) => {
    const tasks = u.assignedTasks;
    const total = tasks.length;
    const completed = tasks.filter((t) => t.status === "COMPLETED").length;
    const cancelled = tasks.filter((t) => t.status === "CANCELLED").length;
    const overdue = tasks.filter(
      (t) =>
        t.status === "OVERDUE" ||
        (t.status !== "COMPLETED" &&
          t.status !== "CANCELLED" &&
          t.deadline < now)
    ).length;
    const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
    const pending = tasks.filter(
      (t) => t.status === "PENDING" && t.deadline >= now
    ).length;

    // Tỷ lệ hoàn thành (không tính task đã hủy)
    const effective = total - cancelled;
    const completionRate = effective > 0 ? Math.round((completed / effective) * 100) : 0;

    // Tỷ lệ đúng hạn = completed đúng hạn (completedAt <= deadline) / completed
    const onTime = tasks.filter(
      (t) => t.status === "COMPLETED" && t.completedAt && t.completedAt <= t.deadline
    ).length;
    const onTimeRate = completed > 0 ? Math.round((onTime / completed) * 100) : 0;

    return {
      id: u.id,
      name: u.name,
      position: u.position,
      role: u.role,
      teamGroupCode: u.teamGroupCode,
      total,
      completed,
      inProgress,
      pending,
      overdue,
      cancelled,
      completionRate,
      onTimeRate,
    };
  });

  // Sort: hiệu suất cao xuống thấp (completionRate * onTimeRate / 100)
  performance.sort((a, b) => {
    const aScore = a.completionRate * (a.onTimeRate || 50) / 100;
    const bScore = b.completionRate * (b.onTimeRate || 50) / 100;
    if (Math.abs(aScore - bScore) < 0.5) return b.total - a.total;
    return bScore - aScore;
  });

  // CSV data
  const csvData = performance.map((p, i) => ({
    "STT": i + 1,
    "Họ tên": p.name,
    "Chức vụ": p.position,
    "Tổ": p.teamGroupCode === "to-1" ? "Tổ 1" : p.teamGroupCode === "to-2" ? "Tổ 2" : "—",
    "Tổng task": p.total,
    "Hoàn thành": p.completed,
    "Đang xử lý": p.inProgress,
    "Cần làm": p.pending,
    "Quá hạn": p.overdue,
    "Đã hủy": p.cancelled,
    "Tỷ lệ hoàn thành (%)": p.completionRate,
    "Tỷ lệ đúng hạn (%)": p.onTimeRate,
  }));

  // Summary
  const totalUsers = performance.length;
  const avgCompletion =
    totalUsers > 0
      ? Math.round(performance.reduce((s, p) => s + p.completionRate, 0) / totalUsers)
      : 0;
  const avgOnTime =
    totalUsers > 0
      ? Math.round(performance.reduce((s, p) => s + p.onTimeRate, 0) / totalUsers)
      : 0;
  const topPerformer = performance[0];
  const needsAttention = [...performance]
    .filter((p) => p.total > 0 && p.completionRate < 50)
    .slice(0, 3);

  return (
    <div>
      <Link
        href="/reports"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Báo cáo
      </Link>
      <PageHeader
        title="Báo cáo hiệu suất cán bộ"
        description={
          isFullScope
            ? `Tổng hợp hiệu suất ${totalUsers} cán bộ toàn phòng`
            : `Tổng hợp hiệu suất ${totalUsers} cán bộ ${managedDepts
                .map((d) => DEPARTMENT_LABELS[d as keyof typeof DEPARTMENT_LABELS])
                .join(", ")}`
        }
        actions={
          <div className="flex gap-2 flex-wrap">
            <ExportCSVButton
              data={csvData}
              filename={`hieu-suat-can-bo-${new Date().toISOString().slice(0, 10)}.csv`}
            />
            <PrintButton />
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground font-medium">Tỷ lệ hoàn thành TB</div>
            <div className="text-3xl font-bold mt-1 text-emerald-600">{avgCompletion}%</div>
            <p className="text-xs text-muted-foreground mt-1">trung bình toàn nhóm</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground font-medium">Tỷ lệ đúng hạn TB</div>
            <div className="text-3xl font-bold mt-1 text-blue-600">{avgOnTime}%</div>
            <p className="text-xs text-muted-foreground mt-1">task hoàn thành đúng hạn</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-xs text-muted-foreground font-medium">Cán bộ xuất sắc</div>
            <div className="text-lg font-bold mt-1 truncate">{topPerformer?.name || "—"}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {topPerformer
                ? `${topPerformer.completionRate}% hoàn thành · ${topPerformer.onTimeRate}% đúng hạn`
                : "Chưa có dữ liệu"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cảnh báo cần đôn đốc */}
      {needsAttention.length > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50/50">
          <CardContent className="pt-4 pb-4">
            <div className="font-semibold text-sm text-amber-900 mb-2">
              ⚠ Cần đôn đốc ({needsAttention.length} cán bộ tỷ lệ hoàn thành &lt; 50%)
            </div>
            <div className="flex flex-wrap gap-2">
              {needsAttention.map((p) => (
                <Badge key={p.id} variant="warning">
                  {p.name} ({p.completionRate}%)
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2 w-10">#</th>
                <th className="text-left py-2 px-2">Cán bộ</th>
                <th className="text-center py-2 px-2 hidden md:table-cell">Tổ</th>
                <th className="text-center py-2 px-2">Tổng</th>
                <th className="text-center py-2 px-2">Hoàn thành</th>
                <th className="text-center py-2 px-2 hidden md:table-cell">Đang xử lý</th>
                <th className="text-center py-2 px-2 hidden md:table-cell">Quá hạn</th>
                <th className="text-center py-2 px-2">Tỷ lệ HT</th>
                <th className="text-center py-2 px-2 hidden md:table-cell">Đúng hạn</th>
              </tr>
            </thead>
            <tbody>
              {performance.map((p, i) => {
                const isTop = i < 3 && p.total > 0;
                const isWorst = p.total > 0 && p.completionRate < 50;
                return (
                  <tr key={p.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-2 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 px-2">
                      <div className="font-medium flex items-center gap-1.5">
                        {isTop && <span title="Top 3">🏆</span>}
                        {p.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {p.position} · {ROLE_LABELS[p.role as keyof typeof ROLE_LABELS]}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center hidden md:table-cell">
                      {p.teamGroupCode === "to-1" ? (
                        <Badge variant="info">Tổ 1</Badge>
                      ) : p.teamGroupCode === "to-2" ? (
                        <Badge variant="info">Tổ 2</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-center font-medium">{p.total}</td>
                    <td className="py-2 px-2 text-center text-emerald-700 font-medium">{p.completed}</td>
                    <td className="py-2 px-2 text-center hidden md:table-cell">{p.inProgress}</td>
                    <td className="py-2 px-2 text-center hidden md:table-cell">
                      {p.overdue > 0 ? (
                        <span className="text-red-600 font-medium">{p.overdue}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {p.total === 0 ? (
                          <Minus className="h-3 w-3 text-muted-foreground" />
                        ) : isWorst ? (
                          <TrendingDown className="h-3 w-3 text-red-500" />
                        ) : p.completionRate >= 80 ? (
                          <TrendingUp className="h-3 w-3 text-emerald-600" />
                        ) : null}
                        <span
                          className={
                            p.total === 0
                              ? "text-muted-foreground"
                              : isWorst
                              ? "text-red-600 font-semibold"
                              : p.completionRate >= 80
                              ? "text-emerald-700 font-semibold"
                              : "font-medium"
                          }
                        >
                          {p.total === 0 ? "—" : `${p.completionRate}%`}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center hidden md:table-cell">
                      {p.completed === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={
                            p.onTimeRate >= 80
                              ? "text-emerald-700 font-medium"
                              : p.onTimeRate < 50
                              ? "text-red-600 font-medium"
                              : ""
                          }
                        >
                          {p.onTimeRate}%
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {performance.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              Chưa có dữ liệu cán bộ
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
