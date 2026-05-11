"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createTask } from "@/actions/task";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

interface UserOption {
  id: string;
  name: string;
  position: string;
  department: string;
  teamGroupCode: string | null;
}

interface GroupOption {
  id: string;
  name: string;
  code: string;
}

interface InitialValues {
  title?: string;
  description?: string;
  priority?: string;
  assigneeId?: string;
  taskGroupId?: string;
}

interface TaskFormProps {
  users: UserOption[];
  groups: GroupOption[];
  onClose?: () => void;
  defaultParentTaskId?: string;
  /** Q16: Pre-fill khi sao chép từ task có sẵn */
  initialValues?: InitialValues;
}

export function TaskForm({ users, groups, onClose, defaultParentTaskId, initialValues }: TaskFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initialValues?.title || "");
  const [description, setDescription] = useState(initialValues?.description || "");
  const [priority, setPriority] = useState<"KHAN_CAP" | "CAO" | "THUONG" | "THAP">(
    (initialValues?.priority as any) || "THUONG"
  );
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return format(d, "yyyy-MM-dd'T'HH:mm");
  });
  const [assignmentType, setAssignmentType] = useState<"individual" | "group">(
    initialValues?.taskGroupId ? "group" : "individual"
  );
  const [assigneeId, setAssigneeId] = useState<string>(initialValues?.assigneeId || "");
  const [taskGroupId, setTaskGroupId] = useState<string>(initialValues?.taskGroupId || "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createTask({
        title,
        description: description || null,
        priority,
        deadline: new Date(deadline),
        assigneeId: assignmentType === "individual" ? assigneeId : null,
        taskGroupId: assignmentType === "group" ? taskGroupId : null,
        parentTaskId: defaultParentTaskId,
        legalReferences: [],
        attachments: [],
        sourceType: "INTERNAL",
      });

      if (result.error) {
        setError(result.error);
      } else {
        router.refresh();
        onClose?.();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Tiêu đề nhiệm vụ *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          maxLength={200}
          placeholder="Ví dụ: Kiểm tra vi phạm đất đai thôn Văn Sơn"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Mô tả chi tiết</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="Nội dung công việc, yêu cầu cụ thể, văn bản tham chiếu..."
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="priority">Mức độ ưu tiên</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
            <SelectTrigger id="priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="KHAN_CAP">Khẩn cấp</SelectItem>
              <SelectItem value="CAO">Cao</SelectItem>
              <SelectItem value="THUONG">Thường</SelectItem>
              <SelectItem value="THAP">Thấp</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="deadline">Thời hạn *</Label>
          <Input
            id="deadline"
            type="datetime-local"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Giao cho</Label>
        <div className="flex gap-2 mb-2">
          <Button
            type="button"
            variant={assignmentType === "individual" ? "default" : "outline"}
            size="sm"
            onClick={() => setAssignmentType("individual")}
          >
            Cá nhân
          </Button>
          <Button
            type="button"
            variant={assignmentType === "group" ? "default" : "outline"}
            size="sm"
            onClick={() => setAssignmentType("group")}
          >
            Nhóm/Tổ
          </Button>
        </div>

        {assignmentType === "individual" ? (
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn cán bộ..." />
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name} - {u.position}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Select value={taskGroupId} onValueChange={setTaskGroupId}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn tổ..." />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Hủy
          </Button>
        )}
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="animate-spin h-4 w-4" />}
          {isPending ? "Đang tạo..." : "Tạo nhiệm vụ"}
        </Button>
      </div>
    </form>
  );
}
