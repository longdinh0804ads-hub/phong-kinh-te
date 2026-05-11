import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { db } from "@/lib/db";
import {
  isTopLeader,
  isDeptManager,
  isLeader,
  getManagedDepartments,
} from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatusBadge, PriorityBadge } from "@/components/task/status-badge";
import { ProgressReportForm } from "@/components/task/progress-report-form";
import { TaskStatusActions } from "@/components/task/task-status-actions";
import { TaskNotesPanel } from "@/components/task/task-notes-panel";
import { NewTaskDialog } from "@/components/task/new-task-dialog";
import { canAssignTask } from "@/lib/permissions";
import { formatDateTime, formatRelative, formatDate, isOverdue } from "@/lib/utils";
import { ArrowLeft, Calendar, User, Users, FileText, Clock, AlertCircle } from "lucide-react";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth();

  const task = await db.task.findUnique({
    where: { id, deletedAt: null },
    include: {
      assignee: { select: { id: true, name: true, position: true, email: true, department: true } },
      taskGroup: { select: { id: true, name: true, code: true } },
      creator: { select: { id: true, name: true, position: true, department: true } },
      confirmedBy: { select: { id: true, name: true, position: true } },
      progressReports: {
        orderBy: { createdAt: "desc" },
        include: { reporter: { select: { id: true, name: true } } },
        take: 50,
      },
      subTasks: {
        where: { deletedAt: null },
        include: {
          assignee: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!task) notFound();

  // Permission check theo role:
  // - TP/PTP: thấy all
  // - TRUONG_BO_PHAN: thấy task của người trong managedDepartments
  // - CV/NV: chỉ thấy task được giao trực tiếp hoặc mình tạo
  let canView = false;
  if (isTopLeader(user.role)) {
    canView = true;
  } else if (task.creatorId === user.id || task.assigneeId === user.id) {
    canView = true;
  } else if (isDeptManager(user.role)) {
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    if (
      (task.assignee && managed.includes(task.assignee.department)) ||
      (task.creator && managed.includes(task.creator.department))
    ) {
      canView = true;
    }
  }

  if (!canView) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Bạn không có quyền xem nhiệm vụ này.</p>
        <Link href="/tasks">
          <Button variant="outline" className="mt-4">Quay lại</Button>
        </Link>
      </div>
    );
  }

  // QUYỀN: Chỉ assignee mới được cập nhật tiến độ (TP/PTP cũng không).
  // Lãnh đạo chỉ review + xác nhận hoàn thành.
  const isAssignee = task.assigneeId === user.id;
  const canReport =
    isAssignee &&
    task.status !== "COMPLETED" &&
    task.status !== "CANCELLED" &&
    task.status !== "AWAITING_REVIEW";

  const latestProgress = task.progressReports[0]?.percentComplete ?? 0;
  const overdue = task.status !== "COMPLETED" && task.status !== "CANCELLED" && isOverdue(task.deadline);

  // Pre-load users + groups cho dialog "Sao chép task" nếu user có quyền giao việc.
  // TRUONG_BO_PHAN: chỉ user trong dept của mình.
  const canCopy = canAssignTask(user.role);
  let copyUsersWhere: any = { isActive: true };
  if (isDeptManager(user.role)) {
    const managed = getManagedDepartments({
      role: user.role,
      department: user.department,
      managedDepartments: user.managedDepartments,
    });
    copyUsersWhere = { isActive: true, department: { in: managed } };
  }
  const copyUsers = canCopy
    ? await db.user.findMany({
        where: copyUsersWhere,
        orderBy: [{ role: "asc" }, { name: "asc" }],
        select: { id: true, name: true, position: true, department: true, teamGroupCode: true },
      })
    : [];
  const copyGroups = canCopy && isTopLeader(user.role)
    ? await db.taskGroup.findMany({ select: { id: true, name: true, code: true } })
    : [];

  return (
    <div>
      <div className="mb-4">
        <Link href="/tasks" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" />
          Danh sách nhiệm vụ
        </Link>
      </div>

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <StatusBadge status={overdue && task.status !== "OVERDUE" ? "OVERDUE" : task.status} />
            <PriorityBadge priority={task.priority} />
          </div>
          <h1 className="text-2xl font-bold">{task.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Q16: Sao chép task - nhanh tạo task tương tự */}
          {canCopy && (
            <NewTaskDialog
              users={copyUsers}
              groups={copyGroups}
              triggerLabel="Sao chép"
              initialValues={{
                title: task.title,
                description: task.description || undefined,
                priority: task.priority,
                assigneeId: task.assigneeId || undefined,
                taskGroupId: task.taskGroupId || undefined,
              }}
            />
          )}
          <TaskStatusActions
            task={task}
            user={{ id: user.id, role: user.role }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mô tả</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap text-sm">
                {task.description || <span className="text-muted-foreground italic">Không có mô tả</span>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tiến độ thực hiện</CardTitle>
              <CardDescription>{latestProgress}% hoàn thành</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress value={latestProgress} />

              {/* Form cập nhật: CHỈ hiện cho assignee, khi task chưa đóng/chưa xét duyệt */}
              {canReport && <ProgressReportForm taskId={task.id} currentPercent={latestProgress} />}

              {/* Nếu user là assignee nhưng task đang AWAITING_REVIEW → thông báo */}
              {isAssignee && task.status === "AWAITING_REVIEW" && (
                <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded p-3">
                  ⏳ Bạn đã gửi nhiệm vụ này lên Trưởng phòng. Đang chờ TP/PTP xác nhận hoặc yêu cầu chỉnh sửa.
                </div>
              )}

              {/* Nếu user KHÔNG phải assignee → thông báo chỉ xem */}
              {!isAssignee && task.status !== "COMPLETED" && task.status !== "CANCELLED" && (
                <div className="text-xs bg-muted/60 border border-border rounded p-3 text-muted-foreground">
                  Chỉ {task.assignee?.name || "người được giao"} mới được cập nhật tiến độ.
                  {(user.role === "TRUONG_PHONG" || user.role === "PHO_TP") &&
                    task.status === "AWAITING_REVIEW" &&
                    " Hãy review báo cáo bên dưới và nhấn 'Trưởng phòng xác nhận' hoặc 'Yêu cầu làm lại'."}
                </div>
              )}

              {task.progressReports.length > 0 && (
                <div className="space-y-3 pt-3">
                  <div className="text-sm font-semibold">Lịch sử báo cáo:</div>
                  {task.progressReports.map((r) => (
                    <div key={r.id} className="flex gap-3 border-l-2 border-primary/30 pl-3">
                      <div className="flex-1">
                        <div className="text-sm">
                          <span className="font-medium">{r.reporter.name}</span>
                          <span className="text-muted-foreground"> · {formatRelative(r.createdAt)}</span>
                        </div>
                        <div className="text-sm mt-1">
                          <Badge>{r.percentComplete}%</Badge>
                          {r.notes && <p className="mt-1 text-muted-foreground">{r.notes}</p>}
                          {r.blockers && (
                            <p className="mt-1 text-amber-700 text-xs">⚠️ Khó khăn: {r.blockers}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Hiển thị xác nhận của TP khi đã COMPLETED */}
              {task.status === "COMPLETED" && task.confirmedBy && (
                <div className="border-t pt-3 mt-3">
                  <div className="text-xs bg-green-50 border border-green-200 text-green-900 rounded p-3">
                    ✅ <span className="font-semibold">{task.confirmedBy.name}</span> ({task.confirmedBy.position}) đã xác nhận hoàn thành
                    {task.confirmedAt && <span> · {formatRelative(task.confirmedAt)}</span>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Thông tin</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow icon={Calendar} label="Thời hạn">
                <span className={overdue ? "text-red-600 font-semibold" : ""}>
                  {formatDateTime(task.deadline)}
                </span>
                {overdue && <AlertCircle className="h-4 w-4 inline ml-1 text-red-600" />}
              </InfoRow>
              <InfoRow icon={Clock} label="Tạo lúc">
                {formatDateTime(task.createdAt)}
              </InfoRow>
              <InfoRow icon={User} label="Người giao">
                {task.creator.name}
                <div className="text-xs text-muted-foreground">{task.creator.position}</div>
              </InfoRow>
              {task.assignee && (
                <InfoRow icon={User} label="Người nhận">
                  {task.assignee.name}
                  <div className="text-xs text-muted-foreground">{task.assignee.position}</div>
                </InfoRow>
              )}
              {task.taskGroup && (
                <InfoRow icon={Users} label="Nhóm">
                  {task.taskGroup.name}
                </InfoRow>
              )}
              {task.legalReferences.length > 0 && (
                <InfoRow icon={FileText} label="Văn bản tham chiếu">
                  <ul className="list-disc list-inside">
                    {task.legalReferences.map((ref, i) => (
                      <li key={i} className="text-xs">{ref}</li>
                    ))}
                  </ul>
                </InfoRow>
              )}
            </CardContent>
          </Card>

          {/* Lời nhắn / nhắc nhở */}
          <TaskNotesPanel
            task={{
              id: task.id,
              status: task.status,
              assigneeId: task.assigneeId,
              assignee: task.assignee
                ? { department: task.assignee.department }
                : null,
            }}
            user={{
              id: user.id,
              name: user.name,
              role: user.role,
              position: user.position,
              department: user.department,
              managedDepartments: user.managedDepartments,
            }}
          />

          {task.subTasks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Task con ({task.subTasks.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {task.subTasks.map((s) => (
                  <Link key={s.id} href={`/tasks/${s.id}`} className="block">
                    <div className="flex items-center gap-2 text-sm hover:bg-accent p-2 rounded">
                      <StatusBadge status={s.status} />
                      <span className="flex-1 truncate">{s.title}</span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block px-2 py-0.5 bg-primary/10 text-primary text-xs rounded font-semibold">
      {children}
    </span>
  );
}
