"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  updateTask,
  submitTaskForReview,
  confirmTaskCompletion,
  rejectTaskCompletion,
} from "@/actions/task";
import {
  Play,
  CheckCircle2,
  X,
  Loader2,
  ShieldCheck,
  Undo2,
  Send,
} from "lucide-react";
import type { Task, Role } from "@prisma/client";

interface Props {
  task: Pick<
    Task,
    "id" | "status" | "assigneeId" | "creatorId"
  >;
  user: { id: string; role: Role };
}

/**
 * Action buttons cho task detail page, hiển thị phụ thuộc:
 * - status hiện tại của task
 * - role của user và quan hệ với task (assignee / creator / TP/PTP)
 *
 * Quy tắc:
 * - "Bắt đầu" (PENDING → IN_PROGRESS): chỉ assignee
 * - "Gửi hoàn thành" (IN_PROGRESS/OVERDUE → AWAITING_REVIEW): chỉ assignee
 * - "Trưởng phòng xác nhận" (AWAITING_REVIEW → COMPLETED): chỉ TRUONG_PHONG / PHO_TP
 * - "Yêu cầu làm lại" (AWAITING_REVIEW → IN_PROGRESS): chỉ TRUONG_PHONG / PHO_TP (có thể nhập lý do)
 * - "Hủy" (→ CANCELLED): creator hoặc TP/PTP
 */
export function TaskStatusActions({ task, user }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const isAssignee = task.assigneeId === user.id;
  const isTopLeader = user.role === "TRUONG_PHONG" || user.role === "PHO_TP";
  const isCreator = task.creatorId === user.id;
  const canCancel = isCreator || isTopLeader;

  function handleError(err?: string) {
    if (err) {
      setErrMsg(err);
      setTimeout(() => setErrMsg(null), 5000);
    }
  }

  function handleStart() {
    startTransition(async () => {
      const r = await updateTask({ id: task.id, status: "IN_PROGRESS" });
      if (r.error) handleError(r.error);
      else router.refresh();
    });
  }

  function handleSubmitReview() {
    startTransition(async () => {
      const r = await submitTaskForReview(task.id);
      if (r.error) handleError(r.error);
      else router.refresh();
    });
  }

  function handleConfirmComplete() {
    startTransition(async () => {
      const r = await confirmTaskCompletion(task.id);
      if (r.error) handleError(r.error);
      else router.refresh();
    });
  }

  function handleReject() {
    startTransition(async () => {
      const r = await rejectTaskCompletion(task.id, rejectReason || null);
      if (r.error) handleError(r.error);
      else {
        setRejectOpen(false);
        setRejectReason("");
        router.refresh();
      }
    });
  }

  function handleCancel() {
    if (!confirm("Bạn chắc chắn muốn hủy nhiệm vụ này?")) return;
    startTransition(async () => {
      const r = await updateTask({ id: task.id, status: "CANCELLED" });
      if (r.error) handleError(r.error);
      else router.refresh();
    });
  }

  const showStart =
    isAssignee && task.status === "PENDING";
  const showSubmitReview =
    isAssignee &&
    (task.status === "IN_PROGRESS" || task.status === "OVERDUE");
  const showConfirm =
    isTopLeader && task.status === "AWAITING_REVIEW";
  const showReject =
    isTopLeader && task.status === "AWAITING_REVIEW";
  const showCancel =
    canCancel &&
    (task.status === "PENDING" ||
      task.status === "IN_PROGRESS" ||
      task.status === "OVERDUE" ||
      task.status === "AWAITING_REVIEW");

  const noActions = !showStart && !showSubmitReview && !showConfirm && !showReject && !showCancel;
  if (noActions) return null;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        {showStart && (
          <Button onClick={handleStart} disabled={isPending} variant="outline">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Bắt đầu
          </Button>
        )}
        {showSubmitReview && (
          <Button onClick={handleSubmitReview} disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Gửi hoàn thành
          </Button>
        )}
        {showConfirm && (
          <Button
            onClick={handleConfirmComplete}
            disabled={isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Trưởng phòng xác nhận
          </Button>
        )}
        {showReject && (
          <Button
            onClick={() => setRejectOpen(true)}
            disabled={isPending}
            variant="outline"
          >
            <Undo2 className="h-4 w-4" />
            Yêu cầu làm lại
          </Button>
        )}
        {showCancel && (
          <Button onClick={handleCancel} disabled={isPending} variant="ghost">
            <X className="h-4 w-4" />
            Hủy
          </Button>
        )}
      </div>
      {errMsg && (
        <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded px-2 py-1 max-w-xs">
          {errMsg}
        </div>
      )}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Yêu cầu làm lại</DialogTitle>
            <DialogDescription>
              Nhập lý do / nội dung cần chỉnh sửa để cán bộ làm lại. Nhiệm vụ sẽ chuyển về trạng thái "Đang xử lý".
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Ví dụ: thiếu biên bản kiểm tra, cần bổ sung ảnh hiện trường..."
            rows={4}
            maxLength={1000}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={isPending}>
              Đóng
            </Button>
            <Button onClick={handleReject} disabled={isPending}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
              Gửi yêu cầu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
