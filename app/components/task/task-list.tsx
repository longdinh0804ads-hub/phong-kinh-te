"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, PriorityBadge } from "./status-badge";
import { formatDate, isOverdue } from "@/lib/utils";
import { Calendar, User, Users, AlertCircle } from "lucide-react";
import type { Task } from "@prisma/client";
import { cn } from "@/lib/utils";

type TaskWithRelations = Task & {
  assignee: { id: string; name: string; position: string } | null;
  taskGroup: { id: string; name: string; code: string } | null;
  creator: { id: string; name: string };
  _count: { subTasks: number; progressReports: number };
};

interface TaskListProps {
  tasks: TaskWithRelations[];
  emptyMessage?: string;
}

// Q4: Priority strip màu - giúp scan nhanh độ ưu tiên ngay từ ngoài
const PRIORITY_STRIPE: Record<string, string> = {
  KHAN_CAP: "before:bg-red-500",
  CAO: "before:bg-amber-500",
  THUONG: "before:bg-blue-400",
  THAP: "before:bg-slate-300",
};

export function TaskList({ tasks, emptyMessage = "Không có nhiệm vụ nào" }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <div className="flex flex-col items-center gap-2">
            <div className="text-4xl">📋</div>
            <div className="text-base">{emptyMessage}</div>
            <div className="text-xs">Sử dụng nút "Giao việc mới" ở phía trên để tạo nhiệm vụ đầu tiên</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => {
        const overdue = task.status !== "COMPLETED" && task.status !== "CANCELLED" && isOverdue(task.deadline);
        const stripeClass = PRIORITY_STRIPE[task.priority] || PRIORITY_STRIPE.THUONG;
        return (
          <Link key={task.id} href={`/tasks/${task.id}`}>
            <Card
              className={cn(
                "hover:shadow-md transition-shadow cursor-pointer relative overflow-hidden",
                // Q4: Priority strip 4px bên trái (pseudo-element)
                "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1",
                stripeClass,
                // Q4: bg tinted khi overdue để nổi bật cảnh báo
                overdue && "bg-red-50/50 border-red-200"
              )}
            >
              <CardContent className="pt-4 pl-5">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-base line-clamp-2">{task.title}</h3>
                      <PriorityBadge priority={task.priority} />
                    </div>
                    {task.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{task.description}</p>
                    )}
                    {/* Q9: Tăng touch target icon h-3 w-3 → h-4 w-4, gap-1.5 cho dễ đọc */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                      <StatusBadge status={overdue && task.status !== "OVERDUE" ? "OVERDUE" : task.status} />
                      <span className={cn("flex items-center gap-1.5", overdue && "text-red-700 font-semibold")}>
                        <Calendar className="h-4 w-4" />
                        {formatDate(task.deadline)}
                        {overdue && <AlertCircle className="h-4 w-4 text-red-600" />}
                      </span>
                      {task.assignee && (
                        <span className="flex items-center gap-1.5">
                          <User className="h-4 w-4" />
                          {task.assignee.name}
                        </span>
                      )}
                      {task.taskGroup && (
                        <span className="flex items-center gap-1.5">
                          <Users className="h-4 w-4" />
                          {task.taskGroup.name}
                        </span>
                      )}
                      {task._count.subTasks > 0 && <span>· {task._count.subTasks} việc con</span>}
                      {task._count.progressReports > 0 && <span>· {task._count.progressReports} báo cáo</span>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
