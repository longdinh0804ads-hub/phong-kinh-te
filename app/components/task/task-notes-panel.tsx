import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare } from "lucide-react";
import {
  isTopLeader,
  isDeptManager,
  getManagedDepartments,
  ROLE_LABELS,
} from "@/lib/permissions";
import { getTaskNotes } from "@/actions/task-note";
import { TaskNoteForm } from "./task-note-form";
import { TaskNoteItem, type TaskNoteItemData } from "./task-note-item";
import type { Role, Department } from "@prisma/client";

interface TaskInfo {
  id: string;
  status: string;
  assigneeId: string | null;
  assignee: { department: Department } | null;
}

interface UserInfo {
  id: string;
  name: string;
  role: Role;
  position: string;
  department: Department;
  managedDepartments: Department[];
}

interface Props {
  task: TaskInfo;
  user: UserInfo;
}

/**
 * Panel hiển thị + nhập lời nhắn cho 1 task.
 *
 * Hiển thị logic:
 * - Leader có quyền tạo note cho task này → hiện form + list
 * - Assignee (CV/NV) → chỉ hiện list (read-only). Ẩn card nếu chưa có note.
 * - Người khác (vd CV ngoài dept của TBP) → không hiện (caller đã chặn ở canView)
 */
export async function TaskNotesPanel({ task, user }: Props) {
  // Đã đóng → không cho thêm note mới (nhưng vẫn xem note cũ)
  const taskClosed = task.status === "COMPLETED" || task.status === "CANCELLED";

  // Check quyền tạo note
  let canCreate = false;
  if (!taskClosed) {
    if (isTopLeader(user.role)) {
      canCreate = true;
    } else if (isDeptManager(user.role) && task.assignee) {
      const managed = getManagedDepartments(user);
      canCreate = managed.includes(task.assignee.department);
    }
  }

  const isAssignee = task.assigneeId === user.id;
  const notes = (await getTaskNotes(task.id)) as TaskNoteItemData[];

  // Assignee không có note + không phải leader → ẩn luôn
  if (!canCreate && notes.length === 0) {
    return null;
  }

  const authorLabel = `Lời nhắn của ${user.position} ${user.name}`;
  const headerLabel = canCreate
    ? notes.length > 0
      ? `Lời nhắn (${notes.length})`
      : "Lời nhắn"
    : isAssignee
    ? `Lời nhắn dành cho bạn (${notes.length})`
    : `Lời nhắn (${notes.length})`;

  return (
    <Card id="notes">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          {headerLabel}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Form tạo note - chỉ leader */}
        {canCreate && (
          <div className="rounded-lg border border-dashed p-3 bg-muted/30">
            <TaskNoteForm
              taskId={task.id}
              canPin={user.role === "TRUONG_PHONG"}
              authorLabel={authorLabel}
            />
          </div>
        )}

        {/* Empty state cho leader */}
        {canCreate && notes.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            Chưa có lời nhắn nào. Thêm nhắc nhở cho cán bộ thực hiện.
          </p>
        )}

        {/* List notes */}
        {notes.length > 0 && (
          <div className="space-y-2">
            {notes.map((note) => (
              <TaskNoteItem
                key={note.id}
                note={note}
                currentUserId={user.id}
                currentUserRole={user.role}
              />
            ))}
          </div>
        )}

        {/* Note: task đã đóng - không cho thêm mới */}
        {taskClosed && isTopLeader(user.role) && (
          <p className="text-xs text-muted-foreground italic">
            Nhiệm vụ đã đóng, không thể thêm lời nhắn mới.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
