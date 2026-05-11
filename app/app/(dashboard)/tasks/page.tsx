import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import { getTasks, getTaskCounts, type TaskSort } from "@/actions/task";
import {
  canAssignTask,
  isTopLeader,
  isDeptManager,
  getManagedDepartments,
} from "@/lib/permissions";
import { PageHeader } from "@/components/layout/page-header";
import { TaskList } from "@/components/task/task-list";
import { NewTaskDialog } from "@/components/task/new-task-dialog";
import { DateRangeFilter } from "@/components/filters/date-range-filter";
import { TaskFilterBar } from "@/components/task/task-filter-bar";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { parseDateRangeParams } from "@/lib/date-range";

const STATUS_TABS = [
  { key: "ALL", label: "Tất cả", countKey: "ALL" as const },
  { key: "PENDING", label: "Cần thực hiện", countKey: "PENDING" as const },
  { key: "IN_PROGRESS", label: "Đang xử lý", countKey: "IN_PROGRESS" as const },
  { key: "AWAITING_REVIEW", label: "Chờ TP xác nhận", countKey: "AWAITING_REVIEW" as const },
  { key: "OVERDUE", label: "Quá hạn", countKey: "OVERDUE" as const, filter: { overdue: "1" } },
  { key: "COMPLETED", label: "Hoàn thành", countKey: "COMPLETED" as const },
];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    overdue?: string;
    search?: string;
    range?: string;
    from?: string;
    to?: string;
    priority?: string;
    assigneeId?: string;
    sort?: string;
  }>;
}) {
  const user = await requireAuth();
  const params = await searchParams;

  const { range: dateRange } = parseDateRangeParams(params);

  const filters = {
    status: params.status && params.status !== "ALL" ? params.status : undefined,
    overdue: params.overdue === "1",
    search: params.search,
    dateFrom: dateRange?.from,
    dateTo: dateRange?.to,
    priority: params.priority,
    assigneeId: params.assigneeId,
    sort: (params.sort as TaskSort) || undefined,
  };

  // Tasks list (apply tất cả filter)
  const tasksPromise = getTasks(filters);

  // Counts (KHÔNG áp dụng status/overdue, để mỗi tab có count riêng)
  // Áp dụng filter ngoài: search, date, priority, assignee
  const countsPromise = getTaskCounts({
    search: filters.search,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    priority: filters.priority,
    assigneeId: filters.assigneeId,
  });

  const [tasks, counts] = await Promise.all([tasksPromise, countsPromise]);

  // User dropdown cho dialog "Giao việc mới":
  // - TP/PTP: tất cả user active
  // - TRUONG_BO_PHAN: chỉ user trong dept (kể cả managedDepartments)
  // - CHUYEN_VIEN/NHAN_VIEN: không có dropdown (không được tạo task)
  let usersWhere: any = { isActive: true };
  if (isDeptManager(user.role)) {
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    usersWhere = { isActive: true, department: { in: managed } };
  }
  const users = canAssignTask(user.role)
    ? await db.user.findMany({
        where: usersWhere,
        orderBy: [{ role: "asc" }, { name: "asc" }],
        select: { id: true, name: true, position: true, department: true, teamGroupCode: true },
      })
    : [];

  // Task groups: TP/PTP thấy tất cả; TRUONG_BO_PHAN thấy tổ có thành viên thuộc dept mình
  const groups = isTopLeader(user.role)
    ? await db.taskGroup.findMany({ select: { id: true, name: true, code: true } })
    : isDeptManager(user.role)
    ? await (async () => {
        const managed = getManagedDepartments({
          role: user.role,
          department: user.department,
          managedDepartments: user.managedDepartments,
        });
        const allGroups = await db.taskGroup.findMany({ select: { id: true, name: true, code: true } });
        // Filter: chỉ giữ group có member thuộc managed dept
        const result: typeof allGroups = [];
        for (const g of allGroups) {
          const member = await db.user.findFirst({
            where: { teamGroupCode: g.code, department: { in: managed }, isActive: true },
            select: { id: true },
          });
          if (member) result.push(g);
        }
        return result;
      })()
    : [];

  const currentTab = params.overdue === "1" ? "OVERDUE" : params.status || "ALL";

  return (
    <div>
      <PageHeader
        title="Quản lý công việc"
        description={
          isTopLeader(user.role)
            ? "Toàn bộ nhiệm vụ đang triển khai trong phòng"
            : isDeptManager(user.role)
            ? "Nhiệm vụ trong bộ phận của bạn"
            : "Nhiệm vụ được giao cho bạn"
        }
        actions={
          canAssignTask(user.role) && <NewTaskDialog users={users} groups={groups} />
        }
      />

      {/* Filter Thời gian + Search + Lọc + Sort (Q1, Q2, Q19) */}
      <Card className="mb-3">
        <CardContent className="pt-4 pb-4 space-y-3">
          <DateRangeFilter />
          {dateRange && (
            <p className="text-xs text-muted-foreground">
              Đang lọc: nhiệm vụ có hạn trong <span className="font-semibold">{dateRange.label}</span>
            </p>
          )}
          <TaskFilterBar
            users={users.map((u) => ({ id: u.id, name: u.name, position: u.position }))}
            showAssigneeFilter={isTopLeader(user.role) || isDeptManager(user.role)}
          />
        </CardContent>
      </Card>

      {/* Tabs với counts */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-1.5 overflow-x-auto -mx-2 px-2">
            {STATUS_TABS.map((tab) => {
              const count = counts[tab.countKey] ?? 0;
              const href = buildTabHref(tab, params);
              const active = currentTab === tab.key;
              return (
                <Link
                  key={tab.key}
                  href={href}
                  className={cn(
                    "px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors inline-flex items-center gap-2",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      "inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full text-xs font-semibold",
                      active
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : tab.key === "OVERDUE" && count > 0
                        ? "bg-red-100 text-red-700"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {count}
                  </span>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <TaskList tasks={tasks as any} />

      {/* Q5: FAB mobile chỉ hiện cho user có quyền giao việc */}
      {canAssignTask(user.role) && (
        <NewTaskDialog users={users} groups={groups} variant="fab" />
      )}
    </div>
  );
}

function buildTabHref(
  tab: { key: string; filter?: Record<string, string> },
  currentParams: {
    range?: string;
    from?: string;
    to?: string;
    search?: string;
    priority?: string;
    assigneeId?: string;
    sort?: string;
  }
): string {
  const params = new URLSearchParams();

  // Tab-specific filter (status/overdue)
  if (tab.filter) {
    Object.entries(tab.filter).forEach(([k, v]) => params.set(k, v));
  } else if (tab.key !== "ALL") {
    params.set("status", tab.key);
  }

  // Preserve mọi filter ngoài (date, search, priority, assignee, sort)
  if (currentParams.range) params.set("range", currentParams.range);
  if (currentParams.from) params.set("from", currentParams.from);
  if (currentParams.to) params.set("to", currentParams.to);
  if (currentParams.search) params.set("search", currentParams.search);
  if (currentParams.priority) params.set("priority", currentParams.priority);
  if (currentParams.assigneeId) params.set("assigneeId", currentParams.assigneeId);
  if (currentParams.sort) params.set("sort", currentParams.sort);

  return `/tasks${params.toString() ? "?" + params.toString() : ""}`;
}
