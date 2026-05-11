"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Loader2, Pin } from "lucide-react";
import { createTaskNote } from "@/actions/task-note";

interface Props {
  taskId: string;
  /** Người dùng có quyền ghim không (chỉ TRUONG_PHONG) */
  canPin: boolean;
  /** Label hiển thị: vd "Lời nhắn của Trưởng phòng Vũ Văn Tuấn" */
  authorLabel: string;
}

export function TaskNoteForm({ taskId, canPin, authorLabel }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (content.trim().length < 2) return;
    setError(null);
    startTransition(async () => {
      const r = await createTaskNote({
        taskId,
        content: content.trim(),
        isPinned,
      });
      if (r.error) {
        setError(r.error);
      } else {
        setContent("");
        setIsPinned(false);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="text-xs text-muted-foreground">{authorLabel}</div>
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Nhập lời nhắn / nhắc nhở cho cán bộ thực hiện..."
        rows={3}
        maxLength={2000}
        disabled={isPending}
        className="text-sm"
      />
      <div className="flex items-center justify-between gap-2">
        {canPin && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={(e) => setIsPinned(e.target.checked)}
              className="rounded"
            />
            <Pin className="h-3 w-3" />
            Ghim
          </label>
        )}
        <Button
          type="submit"
          size="sm"
          disabled={isPending || content.trim().length < 2}
          className="ml-auto"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Gửi nhắn
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
          {error}
        </p>
      )}
    </form>
  );
}
