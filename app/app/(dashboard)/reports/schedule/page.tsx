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
import Link from "next/link";
import { ArrowLeft, MapPin, Clock } from "lucide-react";
import { ExportCSVButton, PrintButton } from "@/components/reports/export-csv-button";
import { Badge } from "@/components/ui/badge";

// Lấy số tuần ISO của 1 ngày
function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

// Lấy ngày đầu tuần (Thứ Hai) của tuần ISO
function getMondayOfWeek(year: number, week: number): Date {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay();
  const monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return monday;
}

const DAY_LABELS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];

function formatVN(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}
function formatTimeVN(d: Date): string {
  // d đã được lưu UTC, convert sang VN +7
  const vn = new Date(d.getTime() + 7 * 3600_000);
  return `${String(vn.getUTCHours()).padStart(2, "0")}:${String(vn.getUTCMinutes()).padStart(2, "0")}`;
}

export default async function ScheduleReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; week?: string }>;
}) {
  const user = await requireAuth();
  if (!isTopLeader(user.role) && !isDeptManager(user.role)) redirect("/");

  const params = await searchParams;

  const now = new Date();
  const { year: nowYear, week: nowWeek } = getISOWeek(now);
  const year = params.year ? parseInt(params.year) : nowYear;
  const week = params.week ? parseInt(params.week) : nowWeek;

  const isFullScope = isTopLeader(user.role);

  const where: any = { year, weekNumber: week };
  if (!isFullScope) {
    // TRUONG_BO_PHAN: scope theo BỘ PHẬN
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    where.user = { department: { in: managed } };
  }

  const schedules = await db.workSchedule.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, position: true, teamGroupCode: true } },
    },
    orderBy: [{ scheduleDate: "asc" }, { user: { name: "asc" } }],
  });

  // Group theo ngày trong tuần
  const monday = getMondayOfWeek(year, week);
  const days: Array<{ date: Date; label: string; events: typeof schedules }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    days.push({
      date: d,
      label: DAY_LABELS[i],
      events: schedules.filter((s) => {
        const sd = new Date(s.scheduleDate);
        const vnSd = new Date(sd.getTime() + 7 * 3600_000);
        return (
          vnSd.getUTCDate() === d.getUTCDate() &&
          vnSd.getUTCMonth() === d.getUTCMonth() &&
          vnSd.getUTCFullYear() === d.getUTCFullYear()
        );
      }),
    });
  }

  const csvData = schedules.map((s) => ({
    "Ngày": formatVN(new Date(s.scheduleDate)),
    "Giờ": s.isAllDay ? "Cả ngày" : formatTimeVN(new Date(s.scheduleDate)),
    "Cán bộ": s.user.name,
    "Chức vụ": s.user.position,
    "Nội dung": s.title,
    "Địa điểm": s.location || "",
    "Mô tả": s.description || "",
  }));

  const prevWeek = week > 1 ? { year, week: week - 1 } : { year: year - 1, week: 52 };
  const nextWeek = week < 52 ? { year, week: week + 1 } : { year: year + 1, week: 1 };

  return (
    <div>
      <Link
        href="/reports"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Báo cáo
      </Link>
      <PageHeader
        title="Báo cáo lịch công tác tuần"
        description={`Tuần ${week}/${year} (${formatVN(monday)} - ${formatVN(days[6].date)}) · ${schedules.length} sự kiện`}
        actions={
          <div className="flex gap-2 flex-wrap">
            <Link
              href={`/reports/schedule?year=${prevWeek.year}&week=${prevWeek.week}`}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background h-9 px-3 text-sm font-medium hover:bg-accent transition-colors"
            >
              ← Tuần trước
            </Link>
            <Link
              href={`/reports/schedule?year=${nextWeek.year}&week=${nextWeek.week}`}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background h-9 px-3 text-sm font-medium hover:bg-accent transition-colors"
            >
              Tuần sau →
            </Link>
            <ExportCSVButton
              data={csvData}
              filename={`lich-cong-tac-tuan-${week}-${year}.csv`}
            />
            <PrintButton />
          </div>
        }
      />

      {schedules.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <div className="text-4xl mb-2">📅</div>
            <p>Chưa có lịch công tác nào trong tuần {week}/{year}</p>
            <p className="text-xs mt-1">Cán bộ có thể tạo lịch ở trang Lịch công tác</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {days.map((day) => (
            <Card key={day.date.toISOString()}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-baseline justify-between mb-3 pb-2 border-b">
                  <h3 className="font-semibold text-base">
                    {day.label}
                    <span className="text-muted-foreground font-normal ml-2 text-sm">
                      {formatVN(day.date)}
                    </span>
                  </h3>
                  <Badge variant={day.events.length > 0 ? "info" : "outline"}>
                    {day.events.length} sự kiện
                  </Badge>
                </div>
                {day.events.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">Không có lịch</p>
                ) : (
                  <div className="space-y-2">
                    {day.events.map((e) => (
                      <div
                        key={e.id}
                        className="flex flex-col md:flex-row md:items-start gap-2 md:gap-3 p-2 rounded-md hover:bg-muted/40"
                      >
                        <div className="text-xs md:text-sm font-mono text-muted-foreground shrink-0 md:w-16 flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {e.isAllDay ? "Cả ngày" : formatTimeVN(new Date(e.scheduleDate))}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{e.title}</div>
                          {e.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {e.description}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground/80">{e.user.name}</span>
                            {e.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {e.location}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
