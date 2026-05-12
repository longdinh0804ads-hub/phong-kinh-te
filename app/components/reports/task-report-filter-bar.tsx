"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Filter, X } from "lucide-react";
import { STATUS_LABELS, PRIORITY_LABELS } from "@/components/task/status-badge";

const STATUS_OPTIONS = [
  { value: "ALL", label: "Tất cả" },
  { value: "PENDING", label: STATUS_LABELS.PENDING },
  { value: "IN_PROGRESS", label: STATUS_LABELS.IN_PROGRESS },
  { value: "AWAITING_REVIEW", label: STATUS_LABELS.AWAITING_REVIEW },
  { value: "OVERDUE", label: STATUS_LABELS.OVERDUE },
  { value: "COMPLETED", label: STATUS_LABELS.COMPLETED },
];

const PRIORITY_OPTIONS = [
  { value: "ALL", label: "Tất cả" },
  { value: "KHAN_CAP", label: PRIORITY_LABELS.KHAN_CAP },
  { value: "CAO", label: PRIORITY_LABELS.CAO },
  { value: "THUONG", label: PRIORITY_LABELS.THUONG },
  { value: "THAP", label: PRIORITY_LABELS.THAP },
];

interface UserOpt {
  id: string;
  name: string;
  position: string;
}

export function TaskReportFilterBar({ users }: { users: UserOpt[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentStatus = searchParams.get("status") || "ALL";
  const currentPriority = searchParams.get("priority") || "ALL";
  const currentAssignee = searchParams.get("assigneeId") || "";

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "ALL") params.delete(key);
    else params.set(key, value);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function clearAll() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("status");
    params.delete("priority");
    params.delete("assigneeId");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  const hasActiveFilter =
    currentStatus !== "ALL" || currentPriority !== "ALL" || !!currentAssignee;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5 font-medium">
          <Filter className="h-4 w-4" /> Bộ lọc:
        </span>

        {/* Status pills */}
        <div className="flex gap-1 flex-wrap">
          {STATUS_OPTIONS.map((s) => {
            const active = currentStatus === s.value;
            return (
              <button
                key={s.value}
                onClick={() => updateParam("status", s.value)}
                disabled={isPending}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md border transition-colors whitespace-nowrap",
                  active
                    ? "bg-primary text-primary-foreground border-primary font-semibold"
                    : "hover:bg-accent border-input"
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Priority + Assignee */}
      <div className="flex items-center gap-3 flex-wrap text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Ưu tiên:</span>
          <select
            value={currentPriority}
            onChange={(e) => updateParam("priority", e.target.value)}
            disabled={isPending}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Người nhận:</span>
          <select
            value={currentAssignee}
            onChange={(e) => updateParam("assigneeId", e.target.value || null)}
            disabled={isPending}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs min-w-[200px]"
          >
            <option value="">Tất cả cán bộ</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.position ? ` - ${u.position}` : ""}
              </option>
            ))}
          </select>
        </div>

        {hasActiveFilter && (
          <button
            onClick={clearAll}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            title="Xóa bộ lọc"
          >
            <X className="h-3 w-3" /> Xóa lọc
          </button>
        )}
      </div>
    </div>
  );
}
