import { Badge } from "@/components/ui/badge";
import type { TaskStatus, Priority } from "@prisma/client";

const STATUS_CONFIG: Record<TaskStatus, { label: string; variant: any }> = {
  PENDING: { label: "Cần thực hiện", variant: "warning" },
  IN_PROGRESS: { label: "Đang xử lý", variant: "info" },
  AWAITING_REVIEW: { label: "Chờ TP xác nhận", variant: "warning" },
  COMPLETED: { label: "Hoàn thành", variant: "success" },
  OVERDUE: { label: "Quá hạn", variant: "destructive" },
  CANCELLED: { label: "Đã hủy", variant: "secondary" },
};

const PRIORITY_CONFIG: Record<Priority, { label: string; variant: any }> = {
  KHAN_CAP: { label: "Khẩn cấp", variant: "destructive" },
  CAO: { label: "Cao", variant: "warning" },
  THUONG: { label: "Thường", variant: "secondary" },
  THAP: { label: "Thấp", variant: "outline" },
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const cfg = STATUS_CONFIG[status];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export const STATUS_LABELS = Object.fromEntries(
  Object.entries(STATUS_CONFIG).map(([k, v]) => [k, v.label])
) as Record<TaskStatus, string>;

export const PRIORITY_LABELS = Object.fromEntries(
  Object.entries(PRIORITY_CONFIG).map(([k, v]) => [k, v.label])
) as Record<Priority, string>;
