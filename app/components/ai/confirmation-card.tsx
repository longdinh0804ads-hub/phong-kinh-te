"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PendingAction {
  id: string;
  tool: string;
  kind: string;
  input: any;
  preview: string;
  details: Array<{ label: string; value: string }>;
}

type CardStatus = "pending" | "confirming" | "confirmed" | "cancelled" | "error";

const KIND_LABEL: Record<string, { icon: string; label: string }> = {
  "create-task": { icon: "📋", label: "Tạo nhiệm vụ mới" },
  "update-status": { icon: "🔄", label: "Cập nhật trạng thái" },
  "report-progress": { icon: "📊", label: "Báo cáo tiến độ" },
  "create-reminder": { icon: "🔔", label: "Tạo lịch nhắc" },
  "add-note": { icon: "💬", label: "Gửi lời nhắn" },
};

interface ConfirmationCardProps {
  action: PendingAction;
  onComplete?: (success: boolean, message: string) => void;
  initialStatus?: CardStatus;
}

export function ConfirmationCard({
  action,
  onComplete,
  initialStatus = "pending",
}: ConfirmationCardProps) {
  const [status, setStatus] = useState<CardStatus>(initialStatus);
  const [resultMessage, setResultMessage] = useState<string>("");

  const meta = KIND_LABEL[action.kind] || { icon: "✏️", label: "Thao tác" };

  async function handleConfirm() {
    setStatus("confirming");
    try {
      const res = await fetch("/api/ai/confirm-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: action.tool,
          input: action.input,
          confirm: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus("confirmed");
        setResultMessage(data.message);
        onComplete?.(true, data.message);
      } else {
        setStatus("error");
        setResultMessage(data.message || data.error || "Lỗi không xác định");
        onComplete?.(false, data.message || "Lỗi");
      }
    } catch (e: any) {
      setStatus("error");
      setResultMessage(e?.message || "Không thể kết nối");
      onComplete?.(false, "Lỗi mạng");
    }
  }

  async function handleCancel() {
    setStatus("cancelled");
    setResultMessage("Đã hủy thao tác.");
    onComplete?.(false, "cancelled");
  }

  const isDone = status === "confirmed" || status === "cancelled" || status === "error";

  return (
    <div
      className={cn(
        "mt-2 rounded-lg border bg-background p-3 max-w-md",
        status === "confirmed" && "border-green-500/50 bg-green-50/50 dark:bg-green-950/20",
        status === "cancelled" && "border-muted bg-muted/30",
        status === "error" && "border-red-500/50 bg-red-50/50 dark:bg-red-950/20",
        status === "pending" && "border-primary/40"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base" aria-hidden>
          {meta.icon}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {meta.label}
        </span>
        {status === "confirmed" && (
          <CheckCircle2 className="h-4 w-4 text-green-600 ml-auto" />
        )}
        {(status === "cancelled" || status === "error") && (
          <XCircle
            className={cn(
              "h-4 w-4 ml-auto",
              status === "error" ? "text-red-600" : "text-muted-foreground"
            )}
          />
        )}
      </div>

      {/* Details */}
      <div className="space-y-1 mb-3">
        {action.details.map((d, i) => (
          <div key={i} className="flex text-xs gap-2">
            <span className="text-muted-foreground min-w-[80px]">{d.label}:</span>
            <span className="font-medium flex-1 break-words">{d.value}</span>
          </div>
        ))}
      </div>

      {/* Status feedback */}
      {isDone && (
        <div
          className={cn(
            "text-xs px-2 py-1.5 rounded mb-2",
            status === "confirmed" && "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
            status === "error" && "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
            status === "cancelled" && "bg-muted text-muted-foreground"
          )}
        >
          {resultMessage}
        </div>
      )}

      {/* Action buttons */}
      {status === "pending" && (
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleConfirm}
            className="flex-1 h-8"
          >
            <Check className="h-3.5 w-3.5 mr-1" />
            Xác nhận
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCancel}
            className="flex-1 h-8"
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Hủy
          </Button>
        </div>
      )}

      {status === "confirming" && (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Đang xử lý...
        </div>
      )}
    </div>
  );
}
